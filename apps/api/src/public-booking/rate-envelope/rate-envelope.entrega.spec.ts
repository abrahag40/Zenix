import { createServer, type Server } from 'http'
import { AddressInfo } from 'net'
import { WebhookDispatcherService } from '../webhooks/webhook-dispatcher.service'
import { verificar } from './rate-envelope'

/**
 * La entrega, de punta a punta — con un receptor HTTP DE VERDAD.
 *
 * ── POR QUÉ NO BASTA PROBAR `firmar()` ────────────────────────────────────
 * Las pruebas de `rate-envelope.spec.ts` verifican la función de firma contra
 * sí misma. Eso no dice nada sobre si el despachador **manda la cabecera**, ni
 * si el cuerpo que firma es el mismo que envía. Ese hueco es exactamente donde
 * viven los fallos de integración: dos piezas correctas, mal conectadas.
 *
 * Aquí se levanta un servidor, se entrega de verdad, y el servidor verifica con
 * la MISMA función que usará el receptor del hotel. Si el despachador firmara
 * un cuerpo y enviara otro —por ejemplo, reserializando el JSON— esta prueba
 * lo caza y la unitaria no.
 *
 * No hace falta base de datos: Prisma va mockeado. Lo real es el HTTP.
 */
describe('Entrega del sobre — contra un receptor real', () => {
  const SECRETO = 'secreto-de-entrega'
  let servidor: Server
  let url: string
  let recibido: { cuerpo: string; cabeceras: Record<string, string | string[] | undefined> }[]
  let respuesta = 200

  beforeAll(async () => {
    recibido = []
    servidor = createServer((req, res) => {
      const trozos: Buffer[] = []
      req.on('data', (c: Buffer) => trozos.push(c))
      req.on('end', () => {
        recibido.push({ cuerpo: Buffer.concat(trozos).toString('utf8'), cabeceras: req.headers })
        res.writeHead(respuesta).end('ok')
      })
    })
    await new Promise<void>((r) => servidor.listen(0, '127.0.0.1', r))
    url = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}/receptor`
  })

  afterAll(async () => {
    await new Promise<void>((r) => servidor.close(() => r()))
  })

  const despachar = async (payload: Record<string, unknown>) => {
    recibido = []
    const prisma: any = {
      webhookDelivery: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'd1', status: 'PENDING', attempts: 0, event: 'rates.envelope',
          payload,
          subscription: { id: 's1', url, secret: SECRETO, active: true, disabledAt: null, failureCount: 0 },
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      webhookSubscription: { update: jest.fn().mockResolvedValue({}) },
    }
    const dispatcher = new WebhookDispatcherService(prisma)
    await dispatcher.attemptDelivery('d1')
    return { prisma }
  }

  const sobre = {
    event: 'rates.envelope',
    propertyId: 'prop-1',
    data: {
      schemaVersion: 1, envelopeId: 'zzz-001',
      issuedAt: '2026-09-23T12:00:00.000Z', validUntil: '2026-09-24T12:00:00.000Z',
      propertySlug: 'hotel-demo', currency: 'MXN',
      roomTypes: [{ id: 'rt-1', code: 'BUNGALOW_MAR', name: 'Bungalow Mar', maxOccupancy: 2,
        from: { net: 286885, taxes: 63115, total: 350000 } }],
    },
    sentAt: '2026-09-23T12:00:00.000Z',
  }

  it('🔴 el receptor verifica la firma del cuerpo QUE REALMENTE LLEGÓ', async () => {
    await despachar(sobre)
    expect(recibido).toHaveLength(1)
    const { cuerpo, cabeceras } = recibido[0]
    const cabecera = cabeceras['x-zenix-signature-v2'] as string
    expect(cabecera).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/)
    expect(verificar({ secreto: SECRETO, cuerpoCrudo: cuerpo, cabecera })).toEqual({ ok: true })
  })

  it('el cuerpo entregado contiene el sobre íntegro, con sus centavos', async () => {
    await despachar(sobre)
    const cuerpo = JSON.parse(recibido[0].cuerpo)
    expect(cuerpo.event).toBe('rates.envelope')
    expect(cuerpo.data.roomTypes[0].from).toEqual({ net: 286885, taxes: 63115, total: 350000 })
  })

  it('🔴 con OTRO secreto el receptor rechaza — la firma no es decorativa', async () => {
    await despachar(sobre)
    const { cuerpo, cabeceras } = recibido[0]
    const r = verificar({
      secreto: 'secreto-equivocado',
      cuerpoCrudo: cuerpo,
      cabecera: cabeceras['x-zenix-signature-v2'] as string,
    })
    expect(r).toEqual({ ok: false, motivo: 'firma inválida' })
  })

  it('🔴 si un intermediario altera UN byte, el receptor lo caza', async () => {
    await despachar(sobre)
    const { cuerpo, cabeceras } = recibido[0]
    const alterado = cuerpo.replace('350000', '250000')
    const r = verificar({
      secreto: SECRETO, cuerpoCrudo: alterado,
      cabecera: cabeceras['x-zenix-signature-v2'] as string,
    })
    expect(r.ok).toBe(false)
  })

  it('sigue mandando la firma vieja, para no romper a quien ya la verifique', async () => {
    await despachar(sobre)
    expect(recibido[0].cabeceras['x-zenix-signature']).toMatch(/^sha256=[0-9a-f]{64}$/)
  })

  it('una entrega aceptada se marca DELIVERED y limpia el contador de fallos', async () => {
    const { prisma } = await despachar(sobre)
    expect(prisma.webhookDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'DELIVERED' }) }),
    )
    expect(prisma.webhookSubscription.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ failureCount: 0 }) }),
    )
  })

  it('un receptor que contesta 500 NO se marca entregado', async () => {
    respuesta = 500
    const { prisma } = await despachar(sobre)
    respuesta = 200
    const llamadas = prisma.webhookDelivery.update.mock.calls.map((c: any[]) => c[0]?.data?.status)
    expect(llamadas).not.toContain('DELIVERED')
  })
})
