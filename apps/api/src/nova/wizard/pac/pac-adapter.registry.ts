/**
 * PacAdapterRegistry — DI registry de adapters PAC per país (Day 19).
 *
 * Pattern análogo a §111 IFxAdapter Strategy (FX-LATAM plan).
 * Mismo @Injectable, mismo OnModuleInit auto-discovery.
 *
 * Uso:
 *   const adapter = registry.get('MX_FACTURAMA')
 *   const result = await adapter.healthCheck(credentials)
 *
 * Auto-discovery: cada adapter NestJS @Injectable se registra en el
 * constructor del registry (DI inject array). Agregar país nuevo =
 * 1 archivo + 1 línea en este constructor + 1 línea en wizard.module.ts.
 */
import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import type { IPacAdapter, PacAdapterMetadata } from './pac-adapter.interface'
import { MxFacturamaAdapter } from './mx-facturama.adapter'
import { MxSwSapienAdapter } from './mx-sw-sapien.adapter'

@Injectable()
export class PacAdapterRegistry {
  private readonly logger = new Logger(PacAdapterRegistry.name)
  private readonly adapters = new Map<string, IPacAdapter>()

  constructor(
    facturama: MxFacturamaAdapter,
    swSapien: MxSwSapienAdapter,
    // Day 20+ agregar: CoDianAdapter, CrHaciendaAdapter, PeSunatAdapter
  ) {
    this.register(facturama)
    this.register(swSapien)
    this.logger.log(
      `[PacAdapterRegistry] Registered ${this.adapters.size} adapters: ${Array.from(this.adapters.keys()).join(', ')}`,
    )
  }

  private register(adapter: IPacAdapter): void {
    const meta = adapter.metadata()
    this.adapters.set(meta.id, adapter)
  }

  /**
   * Devuelve adapter por id (e.g. 'MX_FACTURAMA').
   * Throws NotFoundException si no existe — fail-fast para evitar typos
   * silent en config de LegalEntity.
   */
  get(id: string): IPacAdapter {
    const adapter = this.adapters.get(id)
    if (!adapter) {
      throw new NotFoundException(
        `PAC adapter "${id}" no registrado. Adapters disponibles: ${Array.from(this.adapters.keys()).join(', ')}`,
      )
    }
    return adapter
  }

  /** Lookup silent — null si no existe. Útil para health checks tolerantes. */
  find(id: string): IPacAdapter | null {
    return this.adapters.get(id) ?? null
  }

  /** Lista todos los adapters disponibles — útil para UI dropdown. */
  list(): PacAdapterMetadata[] {
    return Array.from(this.adapters.values()).map((a) => a.metadata())
  }

  /** Lista solo adapters de un país — UI filtra opciones per countryCode. */
  listByCountry(countryCode: string): PacAdapterMetadata[] {
    return this.list().filter((m) => m.countryCode === countryCode)
  }
}
