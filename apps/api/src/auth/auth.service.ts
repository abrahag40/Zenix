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
    const staff = await this.prisma.housekeepingStaff.findUnique({
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

    const staff = await this.prisma.housekeepingStaff.findUnique({
      where: { id: actor.sub },
      select: { id: true, name: true, email: true, role: true, department: true },
    })
    if (!staff) throw new UnauthorizedException('Staff not found')

    const payload: JwtPayload = {
      sub: staff.id,
      email: staff.email,
      role: staff.role as any,
      department: staff.department as any,
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
