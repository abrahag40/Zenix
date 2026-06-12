import { Injectable, Logger } from '@nestjs/common'
import * as bcrypt from 'bcrypt'
import { randomBytes } from 'crypto'
import { PrismaService } from '../prisma/prisma.service'

/**
 * BookingSystemStaffService — BOOKING-ENGINE B2.
 *
 * Sentinel "system user" por property usado como `checkedInById` en las
 * GuestStays creadas desde la API pública (DIRECT_WEB). Mismo patrón que
 * ChannexSystemStaffService (§): `GuestStay.checkedInById` es NOT NULL y una
 * reserva web no tiene recepcionista humano. Atribución distinta ("Zenix
 * Booking") para que reports/audit diferencien web-direct de channel manager.
 * Email determinista → @unique previene duplicados cross-pod. Nunca autentica.
 */
@Injectable()
export class BookingSystemStaffService {
  private readonly logger = new Logger(BookingSystemStaffService.name)
  private readonly cache = new Map<string, string>()

  constructor(private readonly prisma: PrismaService) {}

  async getOrCreate(propertyId: string, organizationId: string | null): Promise<string> {
    const cached = this.cache.get(propertyId)
    if (cached) return cached

    const email = `booking-engine@${propertyId}.zenix.internal`
    const existing = await this.prisma.staff.findUnique({
      where: { email },
      select: { id: true },
    })
    if (existing) {
      this.cache.set(propertyId, existing.id)
      return existing.id
    }

    // Password aleatorio impredecible — este Staff NUNCA autentica (es sólo
    // referencia FK para checkedInById). Antes era determinista
    // (`booking-engine-${propertyId}`) → riesgo teórico de login. randomBytes lo cierra.
    const hash = await bcrypt.hash(randomBytes(32).toString('hex'), 10)
    const created = await this.prisma.staff.create({
      data: {
        propertyId,
        organizationId,
        name: 'Zenix Booking',
        email,
        passwordHash: hash,
        role: 'RECEPTIONIST',
        department: 'RECEPTION',
        level: 'COLLABORATOR',
      },
      select: { id: true },
    })
    this.logger.log(`[BookingEngine] system staff creado property=${propertyId} staff=${created.id}`)
    this.cache.set(propertyId, created.id)
    return created.id
  }
}
