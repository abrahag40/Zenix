import { ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import * as bcrypt from 'bcrypt'
import { AuthResponse, JwtPayload } from '@zenix/shared'
import { PrismaService } from '../prisma/prisma.service'
import { AccessControlService } from '../nova/access-control/access-control.service'
import { LoginDto } from './dto/login.dto'

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private acl: AccessControlService,
  ) {}

  async login(dto: LoginDto): Promise<AuthResponse> {
    const emailLower = dto.email.toLowerCase()

    // ── Path 1: legacy Staff (backwards-compat, primary path en v1.0.0) ──
    const staff = await this.prisma.staff.findUnique({
      where: { email: emailLower },
      include: {
        // Include the property so the client knows which operational model
        // to render (HOTEL → "habitación" everywhere; HOSTAL → mixed
        // PRIVATE/SHARED rooms; VACATION_RENTAL → listing-driven UX).
        // CLAUDE.md §35-D7 + RoomCategory (PRIVATE | SHARED) drive unit-
        // level decisions; PropertyType drives property-level UX hints.
        property: { select: { id: true, name: true, type: true } },
      },
    })

    if (staff) {
      if (!staff.active) throw new UnauthorizedException('Invalid credentials')

      const passwordMatch = await bcrypt.compare(dto.password, staff.passwordHash)
      if (!passwordMatch) throw new UnauthorizedException('Invalid credentials')

      // Legacy staff = tier ORG_STAFF (default). Sin partnerMember linking.
      const aclResult = this.acl.resolveLegacyStaff()

      const payload: JwtPayload = {
        sub: staff.id,
        email: staff.email,
        role: staff.role as any,
        department: staff.department as any,
        // Sprint 9 G1 — level en JWT habilita @RequiresLevel guards.
        level: staff.level as any,
        propertyId: staff.propertyId,
        organizationId: staff.organizationId ?? '',
        // Nova foundation Day 3 (§169 D-NOVA-11)
        actorTier: aclResult.tier,
        // assignedOrgIds = [] para tier ORG_STAFF — omitido para keep JWT small
      }

      return {
        accessToken: this.jwtService.sign(payload),
        user: {
          id: staff.id,
          name: staff.name,
          email: staff.email,
          role: staff.role as any,
          department: staff.department as any,
          propertyId: staff.propertyId,
          propertyName: staff.property?.name ?? null,
          propertyType: (staff.property?.type as any) ?? null,
        },
      }
    }

    // ── Path 2: Nova User (PLATFORM_ADMIN / PARTNER_* / ORG_OWNER) ──────
    // Fallback cuando email no encontró Staff. Aplica a usuarios creados via
    // Nova foundation seed o via Wizard Zenix Activate Step 8 (cliente
    // ORG_OWNER recibe credenciales).
    const user = await this.prisma.user.findUnique({
      where: { email: emailLower },
    })

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials')
    }

    const userPasswordMatch = await bcrypt.compare(dto.password, user.passwordHash)
    if (!userPasswordMatch) throw new UnauthorizedException('Invalid credentials')

    const aclResult = await this.acl.resolveActor(user.id)

    // Resolve propertyId para tiers consultor (no aplica, queda vacío) y
    // para ORG_OWNER (toma el primer property de su org como default).
    let propertyId = ''
    let propertyName: string | null = null
    let propertyType: string | null = null
    if (user.organizationId) {
      const firstProperty = await this.prisma.property.findFirst({
        where: { organizationId: user.organizationId },
        select: { id: true, name: true, type: true },
        orderBy: { name: 'asc' },
      })
      if (firstProperty) {
        propertyId = firstProperty.id
        propertyName = firstProperty.name
        propertyType = firstProperty.type as any
      }
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.systemRole as any,
      propertyId,
      organizationId: user.organizationId ?? '',
      actorTier: aclResult.tier,
      partnerMemberId: aclResult.partnerMemberId ?? undefined,
      assignedOrgIds: this.acl.trimAssignedOrgsForJwt(aclResult.assignedOrgIds) ?? undefined,
    }

    return {
      accessToken: this.jwtService.sign(payload),
      user: {
        id: user.id,
        name: `${user.firstName} ${user.lastName}`.trim(),
        email: user.email,
        role: user.systemRole as any,
        department: 'RECEPTION' as any, // placeholder — Nova users no tienen department legacy
        propertyId,
        propertyName,
        propertyType: propertyType as any,
        // Day 9 — exponer Nova fields al frontend para drivear shell UX
        actorTier: aclResult.tier,
        partnerMemberId: aclResult.partnerMemberId ?? undefined,
        assignedOrgIds: this.acl.trimAssignedOrgsForJwt(aclResult.assignedOrgIds) ?? undefined,
        organizationId: user.organizationId ?? null,
      },
    }
  }

  /** Returns all properties in the same organization as the requesting staff. */
  async listProperties(actor: JwtPayload) {
    const properties = await this.prisma.property.findMany({
      where: { organizationId: actor.organizationId },
      select: { id: true, name: true, type: true },
      orderBy: { name: 'asc' },
    })
    return properties.map((p) => ({
      id: p.id,
      name: p.name,
      type: p.type,
      isCurrent: p.id === actor.propertyId,
    }))
  }

  /**
   * Issues a new JWT scoped to a different property within the same org.
   * HOUSEKEEPER role is excluded — they are property-bound by design (CLAUDE.md §D5).
   */
  async switchProperty(actor: JwtPayload, targetPropertyId: string): Promise<AuthResponse> {
    if (actor.role === 'HOUSEKEEPER') {
      throw new ForbiddenException('Las recamaristas no pueden cambiar de sucursal')
    }

    const property = await this.prisma.property.findFirst({
      where: { id: targetPropertyId, organizationId: actor.organizationId },
      select: { id: true, name: true, type: true },
    })
    if (!property) throw new NotFoundException('Sucursal no encontrada o sin acceso')

    const staff = await this.prisma.staff.findUnique({
      where: { id: actor.sub },
      select: { id: true, name: true, email: true, role: true, department: true, level: true, userId: true, propertyId: true },
    })
    if (!staff) throw new UnauthorizedException('Staff not found')

    // SEC-α MT-3 — Authorization gate: validar pivot UserPropertyRole.
    // Bug 2026-05-13 punteado como "no aplica en schema actual" — la auditoría
    // estaba mal: UserPropertyRole model SÍ existe (schema.prisma:468) y es el
    // mecanismo para autorizar acceso multi-propiedad de un mismo User. Sin
    // este guard, cualquier supervisor en una org puede switch a CUALQUIER
    // propiedad de esa org — violación de OWASP API5:2023 (BFLA, Broken
    // Function Level Authorization) + OWASP API1:2023 (BOLA si el target
    // contiene PII de otra propiedad).
    //
    // Casos:
    //  (a) Staff con userId vinculado a User → exigir UserPropertyRole row
    //  (b) Staff sin userId (legacy) → solo permitir mismo propertyId (no-op
    //      switch) hasta que la migración a User+pivot esté completa (v1.1)
    //  (c) Switch al propio propertyId siempre permitido (idempotent)
    if (targetPropertyId !== staff.propertyId) {
      if (staff.userId) {
        const grant = await this.prisma.userPropertyRole.findFirst({
          where: { userId: staff.userId, propertyId: targetPropertyId },
          select: { id: true },
        })
        if (!grant) {
          throw new ForbiddenException(
            'No tienes acceso autorizado a esta sucursal. Solicita asignación al administrador.',
          )
        }
      } else {
        // Legacy staff sin User vinculado — no soporta multi-propiedad.
        // Convención v1.0: si el seed/admin no creó la pivot, el switch
        // a otra propiedad NO está autorizado.
        throw new ForbiddenException(
          'Cuenta legacy sin permisos multi-sucursal. Pide al administrador vincular tu cuenta a User para acceso multi-propiedad.',
        )
      }
    }

    const payload: JwtPayload = {
      sub: staff.id,
      email: staff.email,
      role: staff.role as any,
      department: staff.department as any,
      level: staff.level as any,
      propertyId: property.id,
      organizationId: actor.organizationId,
    }

    return {
      accessToken: this.jwtService.sign(payload),
      user: {
        id: staff.id,
        name: staff.name,
        email: staff.email,
        role: staff.role as any,
        department: staff.department as any,
        propertyId: property.id,
        propertyName: property.name,
        propertyType: property.type as any,
      },
    }
  }
}
