import { CATALOGO_MX, CATALOGO_POR_ESTADO } from './tax-catalog'
import { resolveFiscalPolicyForProfile } from './fiscal-policies'
import { calculateTaxes } from './tax-calculator'

/**
 * EL GUARDIÁN DEL CATÁLOGO.
 *
 * No prueba aritmética: prueba que **nadie pueda embarcar una tasa sin decir de
 * dónde la sacó**. Es una *fitness function* en el sentido de Ford, Parsons y
 * Kua: una característica arquitectónica —«toda cifra fiscal es auditable»— que
 * deja de depender de la disciplina de quien edita el archivo y pasa a
 * verificarse sola en cada commit.
 *
 * El defecto que esto habría cazado: el ISH al 6% para un hotel llevaba meses
 * en el código sin una sola línea que dijera de qué artículo salía.
 */
describe('Catálogo fiscal — el guardián', () => {
  const todas = CATALOGO_MX.flatMap((j) => j.rules.map((r) => ({ j, r })))

  it('están las 32 entidades federativas, sin repetir', () => {
    expect(CATALOGO_MX).toHaveLength(32)
    expect(CATALOGO_POR_ESTADO.size).toBe(32)
  })

  it('🔴 ninguna regla se embarca sin fundamento legal, fuente y fecha de verificación', () => {
    for (const { j, r } of todas) {
      const donde = `${j.stateCode}/${r.rule.code}`
      expect(r.provenance.legalBasis.length).toBeGreaterThan(20)
      expect(r.provenance.sourceUrl).toMatch(/^https:\/\//)
      expect(r.provenance.verifiedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(new Date(r.provenance.verifiedOn).getTime()).toBeLessThanOrEqual(Date.now())
      expect(donde && r.validFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })

  it('🔴 un impuesto local NUNCA va en el nodo federal del CFDI, ni al revés', () => {
    // CFDI 4.0: los estatales y municipales van en el Complemento de Impuestos
    // Locales. Si esto se mezcla, el día que Zenix facture hay que migrar.
    for (const { r } of todas) {
      if (r.scope === 'FEDERAL') expect(r.cfdiNode).toBe('IMPUESTOS')
      else expect(r.cfdiNode).toBe('IMPUESTOS_LOCALES')
    }
  })

  it('una jurisdicción VERIFICADA tiene al menos una regla estatal; una SIN_VERIFICAR dice qué falta', () => {
    for (const j of CATALOGO_MX) {
      if (j.estado === 'VERIFICADO') {
        expect(j.rules.some((r) => r.scope === 'STATE')).toBe(true)
      } else {
        expect(j.pendiente && j.pendiente.length).toBeGreaterThan(30)
      }
    }
  })

  it('🔴 no hay dos reglas igual de específicas compitiendo por el mismo código', () => {
    // Si dos reglas empatan en especificidad para el mismo impuesto, el
    // resultado dependería del ORDEN del arreglo. Un precio no puede depender
    // de en qué línea del archivo quedó una constante.
    for (const j of CATALOGO_MX) {
      const vistas = new Map<string, number>()
      for (const r of j.rules) {
        for (const kind of r.lodgingKinds) {
          const esp = (r.requiresOptIn ? 2 : 0) + (r.onlyInMunicipalities ? 1 : 0)
          const clave = `${r.rule.code}|${kind}|${esp}`
          vistas.set(clave, (vistas.get(clave) ?? 0) + 1)
        }
      }
      for (const [clave, n] of vistas) {
        expect(`${j.stateCode} ${clave} ×${n}`).toBe(`${j.stateCode} ${clave} ×1`)
      }
    }
  })
})

describe('Resolución por jurisdicción, fecha y régimen', () => {
  const perfil = (over: Partial<Parameters<typeof resolveFiscalPolicyForProfile>[0]> = {}) =>
    resolveFiscalPolicyForProfile({
      countryCode: 'MX', stateCode: 'ROO', municipality: 'Tulum',
      lodgingKind: 'HOTEL', on: new Date('2026-06-15T00:00:00Z'), ...over,
    })

  it('un hotel en Tulum: IVA 16% + ISH 5%', () => {
    const p = perfil()
    expect(p.verified).toBe(true)
    expect(p.rules.map((r) => [r.code, r.kind === 'PERCENT_OF_BASE' ? r.rateBp : null])).toEqual([
      ['IVA', 1600], ['ISH', 500],
    ])
  })

  it('🔴 el MISMO estado, otro municipio y con el aviso dado de alta: IVA 8%', () => {
    const p = perfil({ municipality: 'Othón P. Blanco', optIns: ['IVA_REGION_FRONTERIZA_SUR'] })
    expect(p.rules.find((r) => r.code === 'IVA')!.kind === 'PERCENT_OF_BASE' && p.rules.find((r) => r.code === 'IVA')).toMatchObject({ rateBp: 800 })
    // El ISH estatal no cambia: es del estado, no del municipio.
    expect(p.rules.find((r) => r.code === 'ISH')).toMatchObject({ rateBp: 500 })
  })

  it('🔴 mismo municipio SIN el aviso ante el SAT: IVA 16% — no lo da la geografía', () => {
    const p = perfil({ municipality: 'Othón P. Blanco' })
    expect(p.rules.find((r) => r.code === 'IVA')).toMatchObject({ rateBp: 1600 })
    expect(p.descartadas.some((d) => d.code === 'IVA' && /no declara/.test(d.motivo))).toBe(true)
  })

  it('🔴 el estímulo CADUCA: el 1-ene-2027 el mismo hotel vuelve al 16%', () => {
    const p = perfil({
      municipality: 'Othón P. Blanco',
      optIns: ['IVA_REGION_FRONTERIZA_SUR'],
      on: new Date('2027-01-01T00:00:00Z'),
    })
    expect(p.rules.find((r) => r.code === 'IVA')).toMatchObject({ rateBp: 1600 })
    expect(p.descartadas.some((d) => /fuera de vigencia/.test(d.motivo))).toBe(true)
  })

  it('una villa particular en el mismo estado paga 6%, un hotel 5%', () => {
    expect(perfil({ lodgingKind: 'PRIVATE_RENTAL' }).rules.find((r) => r.code === 'ISH')).toMatchObject({ rateBp: 600 })
    expect(perfil({ lodgingKind: 'HOTEL' }).rules.find((r) => r.code === 'ISH')).toMatchObject({ rateBp: 500 })
  })

  it('🔴 un estado SIN VERIFICAR no publica un total plausible: lo dice', () => {
    const p = perfil({ stateCode: 'CMX', municipality: 'Cuauhtémoc' })
    expect(p.verified).toBe(false)
    expect(p.rules.map((r) => r.code)).toEqual(['IVA'])  // el federal sí está verificado
    expect(p.note).toMatch(/SIN VERIFICAR/)
    expect(p.note).toMatch(/Gaceta Oficial/)
  })

  it('sin estado configurado y sin ciudad conocida, se niega a calcular', () => {
    const p = resolveFiscalPolicyForProfile({
      countryCode: 'MX', stateCode: null, municipality: null, city: 'Guadalajara', lodgingKind: 'HOTEL',
    })
    expect(p.rules).toHaveLength(0)
    expect(p.note).toMatch(/no tiene estado fiscal configurado/i)
  })

  it('la ruta vieja (deducir por ciudad) sigue viva pero se DECLARA como deducida', () => {
    const p = resolveFiscalPolicyForProfile({
      countryCode: 'MX', stateCode: null, municipality: null, city: 'Tulum', lodgingKind: 'HOTEL',
    })
    expect(p.inferred).toBe(true)
    expect(p.verified).toBe(true)
    expect(p.note).toMatch(/se dedujo del nombre de la ciudad/i)
  })

  it('🔴 Chetumal deducido por ciudad resuelve su municipio real — el defecto que originó todo esto', () => {
    const p = resolveFiscalPolicyForProfile({
      countryCode: 'MX', stateCode: null, municipality: null, city: 'Chetumal',
      lodgingKind: 'HOTEL', optIns: ['IVA_REGION_FRONTERIZA_SUR'], on: new Date('2026-06-15T00:00:00Z'),
    })
    expect(p.rules.find((r) => r.code === 'IVA')).toMatchObject({ rateBp: 800 })
  })
})

describe('De punta a punta: el precio cambia con la jurisdicción', () => {
  const calcular = (over: Parameters<typeof resolveFiscalPolicyForProfile>[0]) =>
    calculateTaxes({
      lodgingCents: 100_000, mode: 'EXCLUSIVE', nights: 1, occupants: 2, currency: 'MXN',
      policy: resolveFiscalPolicyForProfile(over),
    })

  const comun = { countryCode: 'MX', lodgingKind: 'HOTEL' as const, on: new Date('2026-06-15T00:00:00Z') }

  it('$1,000 netos dan tres totales distintos según dónde y cómo esté dado de alta el hotel', () => {
    const tulum = calcular({ ...comun, stateCode: 'ROO', municipality: 'Tulum' })
    const chetumalSinAviso = calcular({ ...comun, stateCode: 'ROO', municipality: 'Othón P. Blanco' })
    const chetumalConAviso = calcular({ ...comun, stateCode: 'ROO', municipality: 'Othón P. Blanco', optIns: ['IVA_REGION_FRONTERIZA_SUR'] })

    expect(tulum.totalCents).toBe(121_000)              // 16% + 5%
    expect(chetumalSinAviso.totalCents).toBe(121_000)   // 16% + 5%
    expect(chetumalConAviso.totalCents).toBe(113_000)   // 8% + 5%
    expect(chetumalConAviso.configured).toBe(true)
  })
})
