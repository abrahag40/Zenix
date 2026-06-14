/**
 * GenericCsvAdapter (D-MIG7) — el motor base. No pre-mapea nada: el consultor
 * mapea las columnas con el wizard. Cubre CUALQUIER origen (un PMS sin adapter
 * dedicado, o un Excel casero exportado a CSV). Es lo que elimina la objeción
 * "¿puedo migrar?" para todos.
 */
import { Injectable } from '@nestjs/common'
import { MigrationSource } from '@zenix/shared'
import type { MigrationColumnMapping } from '@zenix/shared'
import type { ISourcePmsAdapter } from './source-pms-adapter.interface'

@Injectable()
export class GenericCsvAdapter implements ISourcePmsAdapter {
  readonly id = MigrationSource.GENERIC_CSV
  readonly label = 'CSV genérico (mapeo manual)'

  /** Sin pre-mapeo → el wizard debe proveer el mapping. */
  defaultMapping(): MigrationColumnMapping | null {
    return null
  }
}
