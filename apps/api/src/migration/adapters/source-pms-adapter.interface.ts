/**
 * ISourcePmsAdapter — Strategy por PMS de origen (D-MIG1). Mismo patrón que
 * IPacAdapter (§89) / IFiscalAdapter / IFxAdapter.
 *
 * El parseo CSV + el mapeo a DTO canónico son compartidos (csv-parser +
 * reservation-mapper); un adapter solo aporta su IDENTIDAD y su MAPEO de
 * columnas pre-definido. El GenericCsvAdapter (D-MIG7) devuelve `null` →
 * el consultor mapea a mano con el wizard. Los dedicados (Cloudbeds…)
 * devuelven el pre-mapeo para que no haya que mapear.
 */
import type { MigrationColumnMapping, MigrationSource } from '@zenix/shared'

export interface ISourcePmsAdapter {
  readonly id: MigrationSource
  /** Nombre legible (para UI). */
  readonly label: string
  /**
   * Mapeo de columnas pre-definido para este PMS, o `null` si el origen es
   * genérico/desconocido (el wizard de mapeo lo provee en runtime).
   */
  defaultMapping(): MigrationColumnMapping | null
}
