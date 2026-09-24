import { ServiceUnavailableException } from '@nestjs/common'
import { RegistroDePasarelas } from './registro-de-pasarelas.service'

/**
 * Quién cobra, y con qué comisión. Mirado por quien quiere que el dinero
 * acabe en otra cuenta.
 */
function hacer(cfg: Record<string, unknown> | null, over: { stripeOk?: boolean; banorteOk?: boolean } = {}) {
  const prisma: any = { bookingEngineConfig: { findUnique: jest.fn().mockResolvedValue(cfg) } }
  const stripe: any = { nombre: 'stripe', disponible: async () => over.stripeOk ?? true }
  const banorte: any = { nombre: 'banorte-payworks', disponible: async () => over.banorteOk ?? false }
  return { reg: new RegistroDePasarelas(prisma, stripe, banorte), stripe, banorte }
}

describe('qué pasarela cobra', () => {
  it('sin configuración, cobra Stripe — es la prioridad de Zenix', async () => {
    const { reg, stripe } = hacer(null)
    expect((await reg.para('p1')).pasarela).toBe(stripe)
  })

  it('con `stripe` explícito, cobra Stripe', async () => {
    const { reg, stripe } = hacer({ paymentGateway: 'stripe' })
    expect((await reg.para('p1')).pasarela).toBe(stripe)
  })

  it('con `banorte-payworks`, cobra Banorte — si estuviera disponible', async () => {
    const { reg, banorte } = hacer({ paymentGateway: 'banorte-payworks' }, { banorteOk: true })
    expect((await reg.para('p1')).pasarela).toBe(banorte)
  })

  it('🔴 un nombre desconocido NO cae a Stripe en silencio', async () => {
    // Cobrar por una pasarela que el hotel no eligió es meter su dinero en una
    // cuenta que no es la suya. Fail-safe: se para.
    const { reg } = hacer({ paymentGateway: 'inventada' })
    await expect(reg.para('p1')).rejects.toBeInstanceOf(ServiceUnavailableException)
  })

  it('🔴 una pasarela elegida pero NO configurada tampoco cae a Stripe', async () => {
    const { reg } = hacer({ paymentGateway: 'banorte-payworks' }, { banorteOk: false })
    await expect(reg.para('p1')).rejects.toBeInstanceOf(ServiceUnavailableException)
  })

  it('devuelve la cuenta destino y la comisión junto con la pasarela', async () => {
    const { reg } = hacer({
      paymentGateway: 'stripe',
      stripeConnectedAccountId: 'acct_hotel',
      platformFeeBps: 350,
    })
    const r = await reg.para('p1')
    expect(r.cuentaDestino).toBe('acct_hotel')
    expect(r.comisionBps).toBe(350)
  })
})

describe('la comisión en centavos', () => {
  const { reg } = hacer(null)

  it('3.5 % de 6 879.00 son 240.76', () => {
    // 687900 × 350 / 10000 = 24076.5 → 24076
    expect(reg.comisionEnCentavos(687900, 350)).toBe(24076)
  })

  it('🔴 redondea a la BAJA: ante la duda, el hotel cobra un centavo de más', () => {
    // El error de redondeo en contra del cliente acaba en una llamada; el que
    // va a su favor, no.
    expect(reg.comisionEnCentavos(100, 150)).toBe(1) // 1.5 → 1
  })

  it('sin comisión configurada, no hay comisión', () => {
    expect(reg.comisionEnCentavos(687900, undefined)).toBeUndefined()
    expect(reg.comisionEnCentavos(687900, 0)).toBeUndefined()
  })

  it('🔴 nunca se queda con más de lo que vale la reserva', () => {
    // La cota dura está en la base (CHECK ≤ 10000). Aquí se comprueba que,
    // incluso en el tope, la comisión es como mucho el importe entero.
    expect(reg.comisionEnCentavos(687900, 10000)).toBe(687900)
  })
})
