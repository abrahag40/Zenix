import { ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import * as bcrypt from 'bcrypt'
import { AuthResponse, JwtPayload } from '@zenix/shared'
import { PrismaService } from '../prisma/prisma.service'
import { LoginDto } from './dto/login.dto'

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async login(dto: LoginDto): Promise<AuthResponse> {
    const staff = await this.prisma.staff.findUnique({
      where: { email: dto.email.toLowerCase() },
      include: {
        // Include the property so the client knows which operational model
        // to render (HOTEL → "habitación" everywhere; HOSTAL → mixed
        // PRIVATE/SHARED rooms; VACATION_RENTAL → listing-driven UX).
        // CLAUDE.md §35-D7 + RoomCategory (PRIVATE | SHARED) drive unit-
        // level decisions; PropertyType drives property-level UX hints.
        property: { select: { id: true, name: true, type: true } },
      },
    })

    if (!staff || !staff.active) throw new UnauthorizedException('Invalid credentials')

    const passwordMatch = await bcrypt.compare(dto.password, staff.passwordHash)
    if (!passwordMatch) throw new UnauthorizedException('Invalid credentials')

    const payload: JwtPayload = {
      sub: staff.id,
      email: staff.email,
      role: staff.role as any,
      department: staff.department as any,
      // Sprint 9 G1 — level en JWT habilita @RequiresLevel guards.
      level: staff.level as any,
      propertyId: staff.propertyId,
      organizationId: staff.organizationId ?? '',
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
