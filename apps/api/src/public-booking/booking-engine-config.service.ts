import { Injectable, NotFoundException } from '@nestjs/common'
import { buildUniqueSlug, slugifyPropertyName } from '@zenix/shared'
import { PrismaService } from '../prisma/prisma.service'

export interface UpsertConfigInput {
  slug?: string
  branding?: { logoUrl?: string; primaryColor?: string; accentColor?: string; fontFamily?: string }
  heroTitle?: string
  heroSubtitle?: string
  termsUrl?: string
  defaultLanguage?: string
  displayCurrency?: string
  marketplaceListingEnabled?: boolean
}

/**
 * BookingEngineConfigService — BOOKING-ENGINE B4.
 *
 * Gestión consultor-led de la config de "Zenix Booking" por property. Lo consume
 * el panel de Nova (controller `/v1/nova/booking-engine`). Opción B: paymentPolicy
 * queda fijo en PAY_AT_HOTEL (no editable hasta PAY-CORE). El servicio es OPCIONAL
 * por property: si no hay config → motor apagado (la API pública responde 404).
 */
@Injectable()
export class BookingEngineConfigService {
  constructor(private readonly prisma: PrismaService) {}

  /** Lista todas las properties de la org con su estado de motor (para el panel). */
  async listForOrg(organizationId: string) {
    const properties = await this.prisma.property.findMany({
      where: { organizationId, deletedAt: null },
      select: { id: true, name: true, city: true, bookingEngineConfig: { select: { slug: true, enabled: true } } },
      orderBy: { name: 'asc' },
    })
    return properties.map((p) => ({
      propertyId: p.id,
      propertyName: p.name,
      city: p.city,
      configured: !!p.bookingEngineConfig,
      enabled: p.bookingEngineConfig?.enabled ?? false,
      slug: p.bookingEngineConfig?.slug ?? null,
    }))
  }

  /** Estado del motor para el panel: config + llaves (sin secreto) + webhooks. */
  async getForProperty(propertyId: string) {
    const config = await this.prisma.bookingEngineConfig.findUnique({ where: { propertyId } })
    const [apiKeys, webhooks, property] = await Promise.all([
      this.prisma.bookingApiKey.findMany({
        where: { propertyId, revokedAt: null },
        select: { id: true, keyPrefix: true, label: true, environment: true, allowedOrigins: true, lastUsedAt: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.webhookSubscription.findMany({
        where: { propertyId },
        select: { id: true, url: true, events: true, active: true, failureCount: true, lastDeliveryAt: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.property.findUnique({ where: { id: propertyId }, select: { name: true } }),
    ])

    return {
      propertyId,
      propertyName: property?.name ?? null,
      enabled: config?.enabled ?? false,
      configured: !!config,
      config: config
        ? {
            slug: config.slug,
            paymentPolicy: config.paymentPolicy,
            heroTitle: config.heroTitle,
            heroSubtitle: config.heroSubtitle,
            termsUrl: config.termsUrl,
            defaultLanguage: config.defaultLanguage,
            displayCurrency: config.displayCurrency,
            marketplaceListingEnabled: config.marketplaceListingEnabled,
            branding: {
              logoUrl: config.logoUrl,
              primaryColor: config.primaryColor,
              accentColor: config.accentColor,
              fontFamily: config.fontFamily,
            },
            publicUrl: `https://book.zenix.com/${config.slug}`,
          }
        : null,
      apiKeys,
      webhooks,
    }
  }

  /** Crea o actualiza la config. Si no existe, genera un slug del nombre. */
  async upsert(propertyId: string, input: UpsertConfigInput) {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: { id: true, name: true },
    })
    if (!property) throw new NotFoundException('Property no encontrada')

    const existing = await this.prisma.bookingEngineConfig.findUnique({ where: { propertyId } })

    // Resolver slug: el provisto (validado único) o el existente o uno nuevo.
    let slug = existing?.slug
    if (input.slug && input.slug !== existing?.slug) {
      const candidate = slugifyPropertyName(input.slug)
      slug = await buildUniqueSlug(candidate, (s) => this.slugTaken(s, propertyId))
    } else if (!slug) {
      slug = await buildUniqueSlug(property.name, (s) => this.slugTaken(s, propertyId))
    }

    const data = {
      heroTitle: input.heroTitle,
      heroSubtitle: input.heroSubtitle,
      termsUrl: input.termsUrl,
      defaultLanguage: input.defaultLanguage,
      displayCurrency: input.displayCurrency,
      marketplaceListingEnabled: input.marketplaceListingEnabled,
      logoUrl: input.branding?.logoUrl,
      primaryColor: input.branding?.primaryColor,
      accentColor: input.branding?.accentColor,
      fontFamily: input.branding?.fontFamily,
    }

    const config = await this.prisma.bookingEngineConfig.upsert({
      where: { propertyId },
      update: { slug, ...data },
      create: { propertyId, slug: slug!, paymentPolicy: 'PAY_AT_HOTEL', ...data },
    })
    return this.getForProperty(config.propertyId)
  }

  /**
   * Activa/desactiva el motor desde el panel (no requiere wizard). Si se activa y
   * no había config, la crea con un slug derivado del nombre.
   */
  async toggle(propertyId: string, enabled: boolean) {
    const existing = await this.prisma.bookingEngineConfig.findUnique({ where: { propertyId } })
    if (!existing) {
      if (!enabled) return this.getForProperty(propertyId) // nada que apagar
      const property = await this.prisma.property.findUnique({
        where: { id: propertyId },
        select: { name: true },
      })
      if (!property) throw new NotFoundException('Property no encontrada')
      const slug = await buildUniqueSlug(property.name, (s) => this.slugTaken(s, propertyId))
      await this.prisma.bookingEngineConfig.create({
        data: { propertyId, slug, enabled: true, paymentPolicy: 'PAY_AT_HOTEL', publishedAt: new Date() },
      })
    } else {
      await this.prisma.bookingEngineConfig.update({
        where: { propertyId },
        data: { enabled, publishedAt: enabled && !existing.publishedAt ? new Date() : existing.publishedAt },
      })
    }
    return this.getForProperty(propertyId)
  }

  private async slugTaken(slug: string, propertyId: string): Promise<boolean> {
    const row = await this.prisma.bookingEngineConfig.findUnique({ where: { slug }, select: { propertyId: true } })
    return !!row && row.propertyId !== propertyId
  }
}
