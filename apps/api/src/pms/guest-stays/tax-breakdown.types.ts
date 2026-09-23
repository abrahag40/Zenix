/**
 * Contrato de respuesta del desglose fiscal, tal como lo consume la UI.
 * Vive aparte del servicio para que el tipo no arrastre a Nest ni a Prisma.
 */
export interface TaxLineItem {
  code: string
  label: string
  calculation: 'PERCENT_OF_BASE' | 'FIXED_PER_ROOM_NIGHT' | 'FIXED_PER_PERSON_NIGHT' | 'UMA_MULTIPLIER'
  /** Fracción decimal: 0.16 = 16%. 0 para cuotas fijas. */
  rate: number
  amount: number
  detail?: string
}

export interface TaxBreakdown {
  jurisdiction: {
    country: string
    countryName: string
    state: string | null
    stateName: string | null
    city: string | null
  }
  currency: string
  base: number
  lineItems: TaxLineItem[]
  totalTaxes: number
  total: number
  /** false = jurisdicción sin configurar; la UI muestra `note` en lugar del total. */
  configured: boolean
  note?: string
  /** Fundamento normativo del desglose, para que sea auditable. */
  legalBasis?: string
}
