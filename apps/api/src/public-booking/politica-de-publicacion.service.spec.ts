import { BadRequestException } from '@nestjs/common'
import { PoliticaDePublicacionService } from './politica-de-publicacion.service'
import { PublicPricingService } from './public-pricing.service'

/**
 * Control de publicación — la pantalla donde el hotel decide qué impuestos
 * lleva su tarifa y ve, en el momento, el número que verá el huésped.
 *
 * 🔴 LA PRUEBA QUE IMPORTA ES LA DE MORDIDA (*bite test*, criterio 9 de
 * `docs/vision/20`): que `publicable` de la vista previa y `firm` del puerto
 * público sean SIEMPRE el mismo booleano. Si divergieran, el hotel leería
 * «se publicará 7 199.50» y su web diría «Consultar» — y nadie sabría por qué.
 * Por eso no se comprueba contra una constante: se comprueba contra el otro
 * servicio, ejecutándolo.
 */
describe('PoliticaDePublicacionService', () => {
  const propBase = {
    id: 'prop-1',
    city: 'Tulum',
    regionCode: 'MX-ROO',
    taxMunicipality: 'Tulum',
    lodgingKind: 'HOTEL',
    taxOptIns: [] as string[],
    legalEntity: { countryCode: 'MX', baseCurrency: 'MXN' },
    bookingEngineConfig: { ratesIncludeTaxes: false, displayCurrency: 'MXN' },
  }

  const arma = (parche: Partial<typeof propBase> = {}) => {
    const prisma: any = {
      property: {
        findUnique: jest.fn().mockResolvedValue({ ...propBase, ...parche }),
        update: jest.fn().mockResolvedValue({}),
      },
      bookingEngineConfig: { update: jest.fn().mockResolvedValue({}) },
    }
    return { prisma, service: new PoliticaDePublicacionService(prisma) }
  }

  // ── Lo que la pantalla ofrece ─────────────────────────────────────────────
  it('ofrece las líneas de la jurisdicción con su fundamento, no una lista suelta', async () => {
    const { service } = arma()
    const pol = await service.leer('prop-1')

    expect(pol.verificada).toBe(true)
    expect(pol.jurisdiccion).toMatchObject({ estado: 'ROO', nombreEstado: expect.any(String) })

    const activas = pol.lineas.filter((l) => l.activa).map((l) => `${l.code}@${l.rate}`)
    expect(activas.sort()).toEqual(['IVA@0.16', 'ISH@0.05'].sort())
    // 5 %, no 6 %: el 6 % es de «departamentos, casas y villas particulares»
    // (art. 4 fr. V), no de un hotel. Cobrarlo de más sería cobrarle de más al huésped.
    expect(pol.lineas.every((l) => l.fundamento)).toBe(true)
  })

  it('un hotel de Tulum NO ve la casilla del estímulo fronterizo: no puede activarla', async () => {
    const { service } = arma()
    const pol = await service.leer('prop-1')
    expect(pol.lineas.some((l) => l.requiereAlta)).toBe(false)
  })

  it('uno de Chetumal SÍ la ve, apagada y con la nota de que exige alta ante el SAT', async () => {
    const { service } = arma({ city: 'Chetumal', taxMunicipality: 'Othón P. Blanco' })
    const pol = await service.leer('prop-1')

    const fronteriza = pol.lineas.find((l) => l.requiereAlta)
    expect(fronteriza).toBeDefined()
    expect(fronteriza!.rate).toBe(0.08)
    expect(fronteriza!.activa).toBe(false)
    expect(fronteriza!.vigenteHasta).toBe('2026-12-31')
    // Dos IVA en la misma pantalla: sin clave propia se pisarían al renderizar.
    const ids = pol.lineas.map((l) => l.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('declarado el régimen, la tasa activa pasa a 8 % — y el total baja', async () => {
    const { service } = arma({
      city: 'Chetumal',
      taxMunicipality: 'Othón P. Blanco',
      taxOptIns: ['IVA_REGION_FRONTERIZA_SUR'],
    })
    const pol = await service.leer('prop-1')
    const ivaActivo = pol.lineas.find((l) => l.code === 'IVA' && l.activa)
    expect(ivaActivo!.rate).toBe(0.08)
  })

  // ── La vista previa: el mecanismo entero ──────────────────────────────────
  it('🔑 enseña el total que verá el huésped ANTES de guardar', async () => {
    const { service } = arma()
    // 5 950.00 sin impuestos dentro · IVA 16 % · ISH 5 % → 7 199.50
    const v = await service.previsualizar('prop-1', 595000, { tarifaIncluyeImpuestos: false })

    expect(v.netoCentavos).toBe(595000)
    expect(v.impuestosCentavos).toBe(124950)
    expect(v.totalCentavos).toBe(719950)
    expect(v.publicable).toBe(true)
    expect(v.desglose.map((d) => d.code).sort()).toEqual(['ISH', 'IVA'])
  })

  it('la misma tarifa marcada «ya incluye impuestos» publica 5 950, no 7 199.50', async () => {
    const { service } = arma()
    const v = await service.previsualizar('prop-1', 595000, { tarifaIncluyeImpuestos: true })

    expect(v.totalCentavos).toBe(595000)
    expect(v.netoCentavos).toBeLessThan(595000)
    // El invariante del cálculo fiscal: el total cuadra al centavo.
    expect(v.netoCentavos + v.impuestosCentavos).toBe(v.totalCentavos)
  })

  it('el invariante aguanta un barrido, en los dos modos', async () => {
    const { service } = arma()
    for (const incluye of [true, false]) {
      for (let cent = 10_000; cent <= 900_000; cent += 7_317) {
        const v = await service.previsualizar('prop-1', cent, { tarifaIncluyeImpuestos: incluye })
        expect(v.netoCentavos + v.impuestosCentavos).toBe(v.totalCentavos)
      }
    }
  })

  it('el lote resuelve la jurisdicción UNA vez, no una por fila', async () => {
    const { prisma, service } = arma()
    const previas = await service.previsualizarVarios('prop-1', [595000, 545000, 430000], {
      tarifaIncluyeImpuestos: false,
    })

    expect(previas).toHaveLength(3)
    expect(previas.map((v) => v.totalCentavos)).toEqual([719950, 659450, 520300])
    // Cinco tipos de habitación eran cinco lecturas idénticas de la misma
    // propiedad: el N+1 clásico, escondido en «una llamada por fila».
    expect(prisma.property.findUnique).toHaveBeenCalledTimes(1)
  })

  it('la configuración tentativa NO toca la base de datos', async () => {
    const { prisma, service } = arma()
    await service.previsualizar('prop-1', 595000, { regimenes: ['IVA_REGION_FRONTERIZA_SUR'] })
    expect(prisma.property.update).not.toHaveBeenCalled()
    expect(prisma.bookingEngineConfig.update).not.toHaveBeenCalled()
  })

  // ── 🔴 La prueba de mordida ───────────────────────────────────────────────
  it('🔴 `publicable` coincide SIEMPRE con el `firm` del puerto público', async () => {
    const pricing = new PublicPricingService({
      ratePlan: { findMany: jest.fn(), findFirst: jest.fn() },
      rateOverride: { findMany: jest.fn() },
    } as any)

    const escenarios = [
      { nombre: 'Tulum verificado', parche: {} },
      { nombre: 'estado sin verificar', parche: { regionCode: 'MX-JAL', city: 'Puerto Vallarta', taxMunicipality: 'Puerto Vallarta' } },
      { nombre: 'sin jurisdicción', parche: { regionCode: null, city: null, taxMunicipality: null } },
      { nombre: 'país fuera del catálogo', parche: { legalEntity: { countryCode: 'CO', baseCurrency: 'COP' } } },
    ]

    for (const esc of escenarios) {
      for (const incluye of [true, false]) {
        const prop = { ...propBase, ...(esc.parche as any) }
        const { service } = arma(esc.parche as any)
        const v = await service.previsualizar('prop-1', 595000, { tarifaIncluyeImpuestos: incluye })

        const p = pricing.price({
          checkIn: new Date('2026-12-24T00:00:00Z'),
          checkOut: new Date('2026-12-25T00:00:00Z'),
          occupants: 2,
          currency: 'MXN',
          bar: 5950,
          roomTypeId: 'rt-1',
          ratesIncludeTaxes: incluye,
          jurisdiction: {
            countryCode: prop.legalEntity?.countryCode ?? 'MX',
            stateCode: prop.regionCode?.split('-').pop() ?? null,
            municipality: prop.taxMunicipality,
            city: prop.city,
            lodgingKind: 'HOTEL',
            optIns: prop.taxOptIns ?? [],
          },
          ctx: null,
        })

        expect({ escenario: esc.nombre, incluye, publicable: v.publicable })
          .toEqual({ escenario: esc.nombre, incluye, publicable: p.firm })
      }
    }
  })

  it('cuando no es publicable dice por qué, en el idioma del hotel', async () => {
    const { service } = arma({ regionCode: 'MX-JAL', city: 'Puerto Vallarta', taxMunicipality: 'Puerto Vallarta' })
    const v = await service.previsualizar('prop-1', 595000)
    expect(v.publicable).toBe(false)
    expect(v.motivo).toMatch(/no está verificado/)
  })

  // ── Guardar ───────────────────────────────────────────────────────────────
  it('guardar persiste régimen y modo, y devuelve la política ya releída', async () => {
    const { prisma, service } = arma()
    const pol = await service.guardar('prop-1', {
      tarifaIncluyeImpuestos: true,
      regimenes: ['IVA_REGION_FRONTERIZA_SUR'],
      municipio: 'Othón P. Blanco',
    })

    expect(prisma.property.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          taxMunicipality: 'Othón P. Blanco',
          taxOptIns: ['IVA_REGION_FRONTERIZA_SUR'],
        }),
      }),
    )
    expect(prisma.bookingEngineConfig.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { ratesIncludeTaxes: true } }),
    )
    expect(pol.propertyId).toBe('prop-1')
  })

  it('sin motor de reservas, falla claro en vez de inventarle un slug público', async () => {
    const { prisma, service } = arma({ bookingEngineConfig: null as any })
    await expect(service.guardar('prop-1', { tarifaIncluyeImpuestos: true })).rejects.toBeInstanceOf(
      BadRequestException,
    )
    expect(prisma.bookingEngineConfig.update).not.toHaveBeenCalled()
  })
})
