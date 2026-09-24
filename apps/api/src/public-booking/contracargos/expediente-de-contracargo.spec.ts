import { NotFoundException } from '@nestjs/common'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ExpedienteDeContracargoService } from './expediente-de-contracargo.service'

/**
 * El expediente, mirado desde el caso que de verdad duele: el huésped se
 * hospedó, todo bien, y al volver dice que no reconoce el cargo.
 */

const estancia = (over: Record<string, unknown> = {}) => ({
  bookingRef: 'MX-W-1',
  guestName: 'María González',
  guestEmail: 'maria@ejemplo.com',
  guestPhone: '+52984...',
  documentType: 'INE',
  documentNumber: 'GOMA800101HDF',
  checkinAt: new Date('2026-10-05T15:00:00Z'),
  actualCheckin: new Date('2026-10-05T16:12:00Z'),
  actualCheckout: new Date('2026-10-07T11:04:00Z'),
  scheduledCheckout: new Date('2026-10-07T12:00:00Z'),
  checkinSignatureUrl: 'https://archivos/firma.png',
  checkinSignedAt: new Date('2026-10-05T16:14:00Z'),
  purchaseIp: '187.190.1.1',
  totalAmount: '8323.59',
  amountPaid: '8323.59',
  currency: 'MXN',
  paymentStatus: 'PAID',
  source: 'DIRECT_WEB',
  cancelledAt: null,
  createdAt: new Date('2026-09-20T10:00:00Z'),
  ...over,
})

const hacer = (e: unknown) => {
  const prisma: any = { guestStay: { findFirst: jest.fn().mockResolvedValue(e) } }
  return new ExpedienteDeContracargoService(prisma)
}
const args = { propertyId: 'p1', bookingRef: 'MX-W-1' }

describe('el expediente completo', () => {
  it('reúne las cuatro piezas que Stripe llama evidencia convincente', async () => {
    const exp = await hacer(estancia()).armar(args)
    expect(exp.solidez).toBe(100)
    expect(exp.faltantes).toEqual([])
    // Los nombres son los de la API de Stripe: se mandan tal cual.
    expect(exp.evidencia.service_date).toBe('2026-10-05')
    expect(exp.evidencia.customer_name).toBe('María González')
    expect(exp.evidencia.customer_purchase_ip).toBe('187.190.1.1')
    expect(exp.evidencia.customer_signature).toMatch(/Firma del huésped/)
    expect(exp.evidencia.service_documentation).toMatch(/2 noche/)
  })

  it('🔴 usa el check-in REAL, no el previsto', async () => {
    // Lo que hay que probar es que el huésped VINO, no que se le esperaba.
    const exp = await hacer(estancia({
      checkinAt: new Date('2026-10-01T15:00:00Z'),
      actualCheckin: new Date('2026-10-05T16:12:00Z'),
    })).armar(args)
    expect(exp.evidencia.service_date).toBe('2026-10-05')
  })

  it('🔴 NO vuelca el número de identificación completo', async () => {
    // Para la disputa basta acreditar que se presentó y se registró. Volcarlo
    // entero sería repartir un dato personal en un expediente que va al banco.
    const exp = await hacer(estancia()).armar(args)
    expect(exp.evidencia.customer_signature).not.toContain('GOMA800101HDF')
    expect(exp.evidencia.customer_signature).toContain('1HDF')
  })

  it('el argumento cuenta una cronología, sin enlaces ni promesas', async () => {
    const exp = await hacer(estancia()).armar(args)
    const t = exp.evidencia.uncategorized_text!
    expect(t).toMatch(/se registró el 2026-10-05/)
    expect(t).toMatch(/Ocupó la habitación 2 noche/)
    // Stripe es explícito: los bancos no abren enlaces ni archivos externos.
    expect(t).not.toMatch(/http|www\.|llámanos|escríbenos/i)
  })
})

describe('lo que FALTA, que es lo más útil', () => {
  it('🔴 sin firma del registro lo dice en mayúsculas y baja la solidez', async () => {
    const exp = await hacer(estancia({ checkinSignatureUrl: null, checkinSignedAt: null })).armar(args)
    expect(exp.faltantes.join(' ')).toMatch(/FALTA LA FIRMA DEL REGISTRO/)
    expect(exp.solidez).toBeLessThan(100)
  })

  it('sin check-in registrado avisa de que no se puede probar que llegó', async () => {
    const exp = await hacer(estancia({ actualCheckin: null })).armar(args)
    expect(exp.evidencia.service_date).toBeUndefined()
    expect(exp.faltantes.join(' ')).toMatch(/no se puede probar que el huésped llegó/)
  })

  it('sin IP de compra lo dice', async () => {
    const exp = await hacer(estancia({ purchaseIp: null })).armar(args)
    expect(exp.faltantes.join(' ')).toMatch(/IP desde la que reservó/)
  })

  it('una estancia sin nada de evidencia da 25 % y cuatro faltantes', async () => {
    const exp = await hacer(estancia({
      actualCheckin: null, actualCheckout: null, checkinSignatureUrl: null,
      documentType: null, documentNumber: null, purchaseIp: null, guestEmail: null,
    })).armar(args)
    expect(exp.solidez).toBe(20) // sólo `service_documentation`, que siempre se puede escribir
    expect(exp.faltantes.length).toBeGreaterThanOrEqual(4)
  })

  it('una reserva que no existe no inventa un expediente', async () => {
    await expect(hacer(null).armar(args)).rejects.toBeInstanceOf(NotFoundException)
  })
})

describe('funciones de aptitud', () => {
  it('🔴 los nombres de la evidencia son EXACTAMENTE los de la API de Stripe', async () => {
    // Si alguien los traduce al español «por coherencia», el envío falla en
    // silencio: Stripe ignora los campos que no reconoce.
    const exp = await hacer(estancia()).armar(args)
    const validos = [
      'service_date', 'service_documentation', 'customer_name',
      'customer_email_address', 'customer_purchase_ip', 'customer_signature',
      'customer_communication', 'uncategorized_text',
    ]
    for (const k of Object.keys(exp.evidencia)) expect(validos).toContain(k)
  })

  it('🔴 el webhook atiende `charge.dispute.created`', () => {
    const w = readFileSync(
      join(__dirname, '..', '..', 'billing', 'webhook-handler.service.ts'), 'utf8',
    )
    expect(w).toContain("case 'charge.dispute.created':")
    // 🔴 Y el aviso de la SOLICITUD DE INFORMACIÓN vive en el oyente, no en el
    // webhook. Esta prueba miraba el archivo equivocado y lo dijo: en México
    // esa fase previa es la habitual, y responderla evita la comisión y que
    // escale a un caso imposible de ganar.
    const l = readFileSync(join(__dirname, 'contracargo.listener.ts'), 'utf8')
    expect(l).toContain("estado.startsWith('warning')")
    expect(l).toMatch(/SOLICITUD DE INFORMACIÓN/)
  })
})
