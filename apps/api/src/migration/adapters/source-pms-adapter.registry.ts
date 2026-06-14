/**
 * SourcePmsAdapterRegistry — resuelve el adapter por MigrationSource (Strategy,
 * patrón PacAdapterRegistry §181). Agregar un PMS = 1 clase + 1 línea aquí.
 */
import { Injectable, NotFoundException } from '@nestjs/common'
import type { MigrationSource } from '@zenix/shared'
import type { ISourcePmsAdapter } from './source-pms-adapter.interface'
import { GenericCsvAdapter } from './generic-csv.adapter'
import { CloudbedsAdapter } from './cloudbeds.adapter'

@Injectable()
export class SourcePmsAdapterRegistry {
  private readonly adapters: ISourcePmsAdapter[]

  constructor(
    generic: GenericCsvAdapter,
    cloudbeds: CloudbedsAdapter,
  ) {
    // Orden de construcción: genérico (motor) → dedicados (pre-mapeos).
    this.adapters = [generic, cloudbeds]
  }

  get(source: MigrationSource | string): ISourcePmsAdapter {
    const a = this.adapters.find((x) => x.id === source)
    if (!a) {
      throw new NotFoundException(
        `PMS de origen "${source}" no soportado. Disponibles: ${this.adapters.map((x) => x.id).join(', ')}`,
      )
    }
    return a
  }

  list(): Array<{ id: string; label: string; hasDefaultMapping: boolean }> {
    return this.adapters.map((a) => ({
      id: a.id,
      label: a.label,
      hasDefaultMapping: a.defaultMapping() !== null,
    }))
  }
}
