/**
 * Tabla de casos del TaxCalculator.
 *
 * Antes de este archivo había **0 pruebas** sobre la única aritmética fiscal
 * del producto — y es la aritmética que va a publicar el precio en el sitio
 * del hotel. La prueba que manda es la primera: el barrido exhaustivo.
 * Las demás son las reglas de la ley, una por una.
 */
import {
  calculateTaxes,
  TaxCalculationError,
  type FiscalPolicy,
  type TaxRule,
} from './tax-calculator'
import { resolveFiscalPolicy } from './fiscal-policies'

const politicaQR = (kind: 'HOTEL' | 'PRIVATE_RENTAL' = 'HOTEL') =>
  resolveFiscalPolicy({ countryCode: 'MX', city: 'Tulum', lodgingKind: kind })

const bases = { nights: 1, occupants: 2, currency: 'MXN' as const }

describe('TaxCalculator — el invariante que no se negocia', () => {
  // ─── La prueba de mordida ────────────────────────────────────────────────
  // El cálculo anterior fallaba esto en el 31.1% de los casos. No se prueban
  // seis ejemplos bonitos: se barre el rango entero.
  it('INCLUSIVE: el desglose SIEMPRE suma exactamente lo cobrado ($100 a $50,000)', () => {
    const policy = politicaQR('HOTEL')
    let descuadres = 0
    for (let cents = 10_000; cents <= 5_000_000; cents++) {
      const r = calculateTaxes({ ...bases, lodgingCents: cents, mode: 'INCLUSIVE', policy })
      if (r.totalCents !== cents) descuadres++
    }
    expect(descuadres).toBe(0)
  })

  it('EXCLUSIVE: el total es exactamente base + suma de renglones', () => {
    const policy = politicaQR('HOTEL')
    let descuadres = 0
    for (let cents = 10_000; cents <= 5_000_000; cents += 7) {
      const r = calculateTaxes({ ...bases, lodgingCents: cents, mode: 'EXCLUSIVE', policy })
      const suma = r.lodgingBaseCents + r.ancillaryBaseCents + r.totalTaxesCents
      if (r.totalCents !== suma || r.lodgingBaseCents !== cents) descuadres++
    }
    expect(descuadres).toBe(0)
  })

  it('el residuo del redondeo nunca pasa de un centavo, y cae en el renglón mayor', () => {
    const policy = politicaQR('HOTEL')
    let desvioMaximo = 0
    for (let cents = 10_000; cents <= 60_000; cents++) {
      const r = calculateTaxes({ ...bases, lodgingCents: cents, mode: 'INCLUSIVE', policy })
      const [iva, ish] = r.lines
      // IVA (16%) siempre supera a ISH (5%): el ajuste vive ahí, no repartido.
      desvioMaximo = Math.max(
        desvioMaximo,
        Math.abs(iva.amountCents - Math.round((r.lodgingBaseCents * 1600) / 10000)),
      )
      expect(ish.amountCents).toBe(Math.round((r.lodgingBaseCents * 500) / 10000))
    }
    expect(desvioMaximo).toBeLessThanOrEqual(1)
  })
})

describe('Las tasas, según la ley', () => {
  it('🔴 un HOTEL paga 5% de ISH — art. 8 ¶1', () => {
    const r = calculateTaxes({
      ...bases, lodgingCents: 100_000, mode: 'EXCLUSIVE', policy: politicaQR('HOTEL'),
    })
    expect(r.lines.find((l) => l.code === 'ISH')!.rateBp).toBe(500)
    expect(r.lines.find((l) => l.code === 'ISH')!.amountCents).toBe(5_000)
  })

  it('🔴 una casa o villa particular paga 6% — art. 8 ¶2, fracción V', () => {
    const r = calculateTaxes({
      ...bases, lodgingCents: 100_000, mode: 'EXCLUSIVE', policy: politicaQR('PRIVATE_RENTAL'),
    })
    expect(r.lines.find((l) => l.code === 'ISH')!.rateBp).toBe(600)
  })

  it('🔴 el CANAL no mueve la tasa de un hotel: directo y plataforma pagan igual', () => {
    const comun = { ...bases, lodgingCents: 250_000, mode: 'EXCLUSIVE' as const, policy: politicaQR('HOTEL') }
    const directo = calculateTaxes({ ...comun, collectedBy: 'DIRECT' })
    const plataforma = calculateTaxes({ ...comun, collectedBy: 'PLATFORM' })
    expect(plataforma.totalCents).toBe(directo.totalCents)
    // Lo único que cambia es quién retiene y entera — art. 4, último párrafo.
    expect(directo.withholding).toBe('PROPERTY')
    expect(plataforma.withholding).toBe('PLATFORM')
  })

  it('el IVA es 16% sobre todo; el ISH excluye alimentos y servicios — art. 4', () => {
    const r = calculateTaxes({
      ...bases,
      lodgingCents: 100_000,
      ancillaryCents: 50_000,
      mode: 'EXCLUSIVE',
      policy: politicaQR('HOTEL'),
    })
    expect(r.lines.find((l) => l.code === 'IVA')!.amountCents).toBe(24_000) // 16% de 150,000
    expect(r.lines.find((l) => l.code === 'ISH')!.amountCents).toBe(5_000)  // 5% de 100,000 y no de 150,000
    expect(r.totalCents).toBe(179_000)
  })

  it('el desglose lleva su fundamento legal, para que sea auditable', () => {
    const r = calculateTaxes({ ...bases, lodgingCents: 100_000, mode: 'EXCLUSIVE', policy: politicaQR() })
    expect(r.legalBasis).toContain('art. 8')
    expect(r.legalBasis).toContain('16-dic-2025')
  })
})

describe('Lo que se niega a inventar', () => {
  it('fuera de México devuelve configured=false y no aplica tasas mexicanas', () => {
    const policy = resolveFiscalPolicy({ countryCode: 'CR', city: 'Tamarindo', lodgingKind: 'HOTEL' })
    const r = calculateTaxes({ ...bases, lodgingCents: 100_000, mode: 'EXCLUSIVE', policy })
    expect(r.configured).toBe(false)
    expect(r.totalTaxesCents).toBe(0)
    expect(r.totalCents).toBe(100_000)
    expect(r.note).toMatch(/sin cargar/i)
  })

  // 🔄 CAMBIO DE COMPORTAMIENTO DELIBERADO (catálogo nacional).
  // Antes, una ciudad mexicana desconocida publicaba «IVA 16% y falta el ISH».
  // Eso escondía un supuesto falso: sin saber el MUNICIPIO no se puede afirmar
  // que el IVA sea 16% — en región fronteriza es 8%. Publicar 16% «porque es
  // México» es el mismo error que aplicar las tasas de Quintana Roo fuera de
  // Quintana Roo. Ahora se niega a calcular y pide configuración.
  it('una ciudad mexicana sin jurisdicción configurada NO publica un IVA supuesto', () => {
    const policy = resolveFiscalPolicy({ countryCode: 'MX', city: 'Guadalajara', lodgingKind: 'HOTEL' })
    const r = calculateTaxes({ ...bases, lodgingCents: 100_000, mode: 'EXCLUSIVE', policy })
    expect(r.configured).toBe(false)
    expect(r.lines).toHaveLength(0)
    expect(r.totalCents).toBe(100_000)
    expect(r.note).toMatch(/no tiene estado fiscal configurado/i)
  })

  it('la política de QR advierte que el DSA no está incluido', () => {
    expect(politicaQR().note).toMatch(/Saneamiento Ambiental/i)
  })

  it('INCLUSIVE con servicios aparte se RECHAZA: el sistema es indeterminado', () => {
    expect(() =>
      calculateTaxes({
        ...bases, lodgingCents: 100_000, ancillaryCents: 1, mode: 'INCLUSIVE', policy: politicaQR(),
      }),
    ).toThrow(TaxCalculationError)
  })

  it('rechaza importes que no sean centavos enteros', () => {
    for (const malo of [100.5, -1, NaN]) {
      expect(() =>
        calculateTaxes({ ...bases, lodgingCents: malo, mode: 'EXCLUSIVE', policy: politicaQR() }),
      ).toThrow(TaxCalculationError)
    }
  })

  it('rechaza 0 noches y 0 ocupantes', () => {
    const comun = { lodgingCents: 100_000, mode: 'EXCLUSIVE' as const, policy: politicaQR(), currency: 'MXN' }
    expect(() => calculateTaxes({ ...comun, nights: 0, occupants: 1 })).toThrow(TaxCalculationError)
    expect(() => calculateTaxes({ ...comun, nights: 1, occupants: 0 })).toThrow(TaxCalculationError)
  })
})

describe('Cuotas fijas por persona y noche (la forma del DSA)', () => {
  const DSA: TaxRule = {
    code: 'DSA',
    label: 'Derecho de Saneamiento Ambiental',
    kind: 'FIXED_PER_PERSON_NIGHT',
    unitCents: 11_731,                       // UMA 2026 = MXN 117.31
    scaleBpByOccupant: [3000, 2000, 1500, 1000],
    beyondScale: 'UNSUPPORTED',
  }
  const conDsa = (rules: TaxRule[]): FiscalPolicy => ({
    ...politicaQR('HOTEL'),
    rules: [...politicaQR('HOTEL').rules, ...rules],
  })

  it('escala por ocupante y multiplica por noches', () => {
    const r = calculateTaxes({
      lodgingCents: 500_000, mode: 'EXCLUSIVE', nights: 3, occupants: 2,
      currency: 'MXN', policy: conDsa([DSA]),
    })
    // 30% de 11,731 = 3,519 · 20% = 2,346 → 5,865 por noche × 3 = 17,595
    expect(r.lines.find((l) => l.code === 'DSA')!.amountCents).toBe(17_595)
  })

  it('🔴 si se pasa de la escala configurada, NO inventa la cuota siguiente', () => {
    const r = calculateTaxes({
      lodgingCents: 500_000, mode: 'EXCLUSIVE', nights: 1, occupants: 5,
      currency: 'MXN', policy: conDsa([DSA]),
    })
    expect(r.configured).toBe(false)
    expect(r.note).toMatch(/no se inventa/i)
  })

  it('INCLUSIVE: la cuota fija sale del total ANTES de derivar la base, y cuadra', () => {
    const policy = conDsa([DSA])
    for (let cents = 100_000; cents <= 140_000; cents++) {
      const r = calculateTaxes({
        lodgingCents: cents, mode: 'INCLUSIVE', nights: 1, occupants: 2, currency: 'MXN', policy,
      })
      expect(r.totalCents).toBe(cents)
    }
  })
})
