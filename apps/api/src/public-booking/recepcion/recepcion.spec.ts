import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { RecepcionService } from './recepcion.service'
import { generarCodigo } from './codigo-corto'

/**
 * La tableta de recepción, atacada por los dos de siempre: el empleado curioso
 * que prueba códigos y el que adivina el código de un solo uso.
 */

const estancia = (over: Record<string, unknown> = {}) => ({
  id: 'gs1', bookingRef: 'MX-W-1', shortCode: 'ABC23X',
  guestName: 'María González', guestEmail: 'maria@ejemplo.com', guestPhone: '+529841234567',
  documentType: 'INE', documentNumber: 'GOMA800101HDF',
  checkinAt: new Date('2026-10-05T15:00:00Z'), scheduledCheckout: new Date('2026-10-07T12:00:00Z'),
  actualCheckin: null, totalAmount: '8323.59', currency: 'MXN', paymentStatus: 'PAID',
  registrationRecord: null,
  ...over,
})

function hacer(encontrada: unknown = estancia()) {
  const prisma: any = {
    guestStay: {
      findFirst: jest.fn().mockResolvedValue(encontrada),
      update: jest.fn().mockResolvedValue({}),
    },
  }
  return { svc: new RecepcionService(prisma), prisma }
}

describe('buscar por código', () => {
  const args = { propertyId: 'p1', sesionId: 's1' }

  it('🔴 un código mal formado NI SE CONSULTA en la base', async () => {
    const { svc, prisma } = hacer()
    await expect(svc.buscar({ ...args, tecleado: 'AAAAAA' }))
      .rejects.toBeInstanceOf(BadRequestException)
    expect(prisma.guestStay.findFirst).not.toHaveBeenCalled()
  })

  it('🔴 la propiedad sale de la SESIÓN, no de lo tecleado', async () => {
    const { svc, prisma } = hacer()
    await svc.buscar({ ...args, tecleado: generarCodigo() })
    expect(prisma.guestStay.findFirst.mock.calls[0][0].where.propertyId).toBe('p1')
  })

  it('no devuelve reservas canceladas', async () => {
    const { svc, prisma } = hacer()
    await svc.buscar({ ...args, tecleado: generarCodigo() })
    expect(prisma.guestStay.findFirst.mock.calls[0][0].where.cancelledAt).toBeNull()
  })

  it('🔴 enmascara los datos: el recepcionista CONFIRMA, no transcribe', async () => {
    const { svc } = hacer()
    const r = await svc.buscar({ ...args, tecleado: generarCodigo() })
    expect(r.huesped.correo).toBe('ma•••@ejemplo.com')
    expect(r.huesped.telefono).toBe('••••4567')
    expect(r.huesped.identificacion).toBe('INE ••••1HDF')
    // Y nada del número completo, en ninguna parte de la respuesta.
    expect(JSON.stringify(r)).not.toContain('GOMA800101HDF')
  })

  it('si ya hay carta firmada lo dice, para no firmar dos', async () => {
    const firmadoEn = new Date('2026-10-05T16:14:00Z')
    const { svc } = hacer(estancia({ registrationRecord: { id: 'rr1', firmadoEn } }))
    expect((await svc.buscar({ ...args, tecleado: generarCodigo() })).cartaFirmadaEn).toBe(firmadoEn)
  })

  it('🔴 diez búsquedas sin resultado y se corta la sesión', async () => {
    // El atacante más probable no es remoto: es el empleado curioso probando
    // códigos válidos desde la propia tableta.
    const { svc } = hacer(null)
    for (let i = 0; i < 10; i++) {
      await expect(svc.buscar({ ...args, tecleado: generarCodigo() }))
        .rejects.toBeInstanceOf(NotFoundException)
    }
    await expect(svc.buscar({ ...args, tecleado: generarCodigo() }))
      .rejects.toBeInstanceOf(ForbiddenException)
  })

  it('un acierto limpia el contador de fallos', async () => {
    const prisma: any = { guestStay: { findFirst: jest.fn(), update: jest.fn() } }
    const svc = new RecepcionService(prisma)
    prisma.guestStay.findFirst.mockResolvedValue(null)
    for (let i = 0; i < 9; i++) {
      await svc.buscar({ ...args, tecleado: generarCodigo() }).catch(() => {})
    }
    prisma.guestStay.findFirst.mockResolvedValue(estancia())
    await svc.buscar({ ...args, tecleado: generarCodigo() })
    prisma.guestStay.findFirst.mockResolvedValue(null)
    // Si el contador no se hubiera limpiado, el siguiente fallo cortaría.
    await expect(svc.buscar({ ...args, tecleado: generarCodigo() }))
      .rejects.toBeInstanceOf(NotFoundException)
  })
})

describe('el código de un solo uso', () => {
  it('🔴 se guarda el HASH, no el código', async () => {
    const { svc } = hacer()
    const codigo = await svc.emitirOtp({ estanciaId: 'gs1', canal: 'correo' })
    const dentro = JSON.stringify([...(svc as never as { otps: Map<string, unknown> }).otps])
    expect(dentro).not.toContain(codigo)
  })

  it('seis dígitos', async () => {
    const { svc } = hacer()
    expect(await svc.emitirOtp({ estanciaId: 'gs1', canal: 'correo' })).toMatch(/^\d{6}$/)
  })

  it('el correcto valida una vez y sólo una', async () => {
    const { svc } = hacer()
    const c = await svc.emitirOtp({ estanciaId: 'gs1', canal: 'correo' })
    expect(svc.verificarOtp('gs1', c)).toEqual({ ok: true, canal: 'correo' })
    // Reusarlo no vale: es de UN solo uso.
    expect(svc.verificarOtp('gs1', c).ok).toBe(false)
  })

  it('🔴 se quema al tercer fallo', async () => {
    // Sin esto, seis dígitos son adivinables con paciencia.
    const { svc } = hacer()
    const c = await svc.emitirOtp({ estanciaId: 'gs1', canal: 'correo' })
    for (let i = 0; i < 3; i++) expect(svc.verificarOtp('gs1', '000000').ok).toBe(false)
    expect(svc.verificarOtp('gs1', c).ok).toBe(false) // ya ni el bueno sirve
  })

  it('caduca a los diez minutos', async () => {
    const { svc } = hacer()
    const c = await svc.emitirOtp({ estanciaId: 'gs1', canal: 'correo' })
    const m = (svc as never as { otps: Map<string, { expiraEn: number }> }).otps
    m.get('gs1')!.expiraEn = Date.now() - 1
    expect(svc.verificarOtp('gs1', c).ok).toBe(false)
  })

  it('una estancia sin código emitido no valida nada', () => {
    const { svc } = hacer()
    expect(svc.verificarOtp('gs-inexistente', '123456').ok).toBe(false)
  })
})

describe('asignar código', () => {
  it('reintenta si colisiona y acaba asignando', async () => {
    const prisma: any = { guestStay: { findFirst: jest.fn(), update: jest.fn().mockResolvedValue({}) } }
    prisma.guestStay.findFirst
      .mockResolvedValueOnce({ id: 'otra' })
      .mockResolvedValueOnce({ id: 'otra' })
      .mockResolvedValue(null)
    const svc = new RecepcionService(prisma)
    const c = await svc.asignarCodigo({ propertyId: 'p1', guestStayId: 'gs1' })
    expect(c).toHaveLength(6)
    expect(prisma.guestStay.update).toHaveBeenCalledTimes(1)
  })

  it('🔴 doce colisiones seguidas no se reintentan en bucle: se grita', async () => {
    // Con 29^5 combinaciones esto no debería pasar nunca. Si pasa, el
    // generador dejó de ser aleatorio y hay que enterarse.
    const prisma: any = {
      guestStay: { findFirst: jest.fn().mockResolvedValue({ id: 'otra' }), update: jest.fn() },
    }
    const svc = new RecepcionService(prisma)
    await expect(svc.asignarCodigo({ propertyId: 'p1', guestStayId: 'gs1' }))
      .rejects.toBeInstanceOf(BadRequestException)
    expect(prisma.guestStay.update).not.toHaveBeenCalled()
  })
})
