import { Injectable, Logger } from '@nestjs/common'
import * as bcrypt from 'bcrypt'
import { PrismaService } from '../../../prisma/prisma.service'

/**
 * ChannexSystemStaffService — sentinel "system user" per property used as
 * `checkedInById` on GuestStays created from Channex webhooks.
 *
 * Why this exists:
 *   `GuestStay.checkedInById` is NOT NULL in the schema (manual flows always
 *   have a recepcionista). OTA-originated stays have no human actor — they
 *   arrive via webhook. We need a deterministic Staff row to attribute them
 *   to, so the relational integrity holds AND reports/audit trails clearly
 *   distinguish "channex-system" entries.
 *
 * Pattern: lazy get-or-create. First webhook in a property creates the
 * sentinel Staff. Subsequent calls return the cached id. Email is deterministic
 * (`channex-system@<propertyId>.zenix.internal`) so the @unique constraint
 * prevents accidental duplicates across pods.
 *
 * Cloudbeds / Mews use the same pattern internally for "channel manager
 * created" reservations. The Staff row never authenticates (random hash
 * password) — it's purely a reference target.
 */
@Injectable()
export class ChannexSystemStaffService {
  private readonly logger = new Logger(ChannexSystemStaffService.name)
  private readonly cache = new Map<string, string>() // propertyId → staffId

  constructor(private readonly prisma: PrismaService) {}

  async getOrCreate(propertyId: string, organizationId: string | null): Promise<string> {
    const cached = this.cache.get(propertyId)
    if (cached) return cached

    const email = `channex-system@${propertyId}.zenix.internal`

    const existing = await this.prisma.staff.findUnique({
      where: { email },
      select: { id: true },
    })
    if (existing) {
      this.cache.set(propertyId, existing.id)
      return existing.id
    }

    // Random unloginable password (bcrypt rejects 72+ byte input → random 64).
    const hash = await bcrypt.hash(`channex-system-${propertyId}-${Date.now()}`, 10)

    const created = await this.prisma.staff.create({
      data: {
        propertyId,
        organizationId,
        name: 'Channex System',
        email,
        passwordHash: hash,
        role: 'RECEPTIONIST', // closest existing role; bookings are receptionist-created in manual flow
        department: 'RECEPTION',
        level: 'COLLABORATOR',
      },
      select: { id: true },
    })
    this.logger.log(`[Channex] system staff created for property=${propertyId} staff=${created.id}`)
    this.cache.set(propertyId, created.id)
    return created.id
  }

  /** Test helper — bust the cache between tests. */
  clearCache(): void {
    this.cache.clear()
  }
}
