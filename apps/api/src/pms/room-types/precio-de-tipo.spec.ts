import { NotFoundException } from '@nestjs/common'
import { validateSync } from 'class-validator'
import { plainToInstance } from 'class-transformer'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PrecioDeTipoDto } from './precio-de-tipo.dto'
import { PrecioDeTipoService } from './precio-de-tipo.service'
import { TARIFA_CAMBIADA } from '../../public-booking/rate-envelope/rate-envelope.listener'

/**
 * El cambio de precio, mirado por quien quiere tocar el de otro hotel —o el
 * suyo sin que quede rastro.
 */

function hacer(over: { tipo?: any } = {}) {
  const update = jest.fn().mockResolvedValue({})
  const escribir = jest.fn().mockResolvedValue({ id: 'a1' })
  const emit = jest.fn()
  const prisma: any = {
    rateChangeLog: { create: escribir },
    roomType: {
      findFirst: jest.fn().mockResolvedValue(
        'tipo' in over
          ? over.tipo
          : { id: 'rt1', name: 'Bungalow Mar', baseRate: 4000, currency: 'MXN' },
      ),
      update,
    },
  }
  const svc = new PrecioDeTipoService(prisma, { emit } as never)
  return { svc, prisma, update, escribir, emit }
}

const base = { roomTypeId: 'rt1', organizationId: 'o1', propertyId: 'p1', actorId: 'st1' }

describe('el DTO', () => {
  const val = (v: unknown) =>
    validateSync(plainToInstance(PrecioDeTipoDto, v as object), {
      whitelist: true,
      forbidNonWhitelisted: true,
    })

  it('acepta un precio en centavos enteros', () => {
    expect(val({ tarifaCentavos: 400000 })).toHaveLength(0)
  })

  it('🔴 rechaza decimales: el dinero no va en coma flotante', () => {
    expect(val({ tarifaCentavos: 4161.795 })).not.toHaveLength(0)
  })

  it('🔴 rechaza cero — «gratis» no es un precio, es un dato que falta', () => {
    expect(val({ tarifaCentavos: 0 })).not.toHaveLength(0)
  })

  it('🔴 rechaza el dedo gordo: dos ceros de más', () => {
    // 4 000 pesos → 400000 centavos. Con dos ceros de más son 40 millones de
    // pesos por noche. El límite existe para que eso no llegue a publicarse.
    expect(val({ tarifaCentavos: 40000000000 })).not.toHaveLength(0)
  })

  it('🔴 rechaza cualquier campo de más — no se edita nada que no sea el precio', () => {
    const errs = val({ tarifaCentavos: 400000, name: 'Otro nombre', maxOccupancy: 99 })
    expect(errs.map((e) => e.property).sort()).toEqual(['maxOccupancy', 'name'])
  })
})

describe('cambiar', () => {
  it('guarda, deja rastro y avisa al sitio', async () => {
    const { svc, update, escribir, emit } = hacer()
    const r = await svc.cambiar({ ...base, tarifaCentavos: 450000 })

    expect(String(update.mock.calls[0][0].data.baseRate)).toBe('4500')
    expect(r).toMatchObject({ anteriorCentavos: 400000, nuevaCentavos: 450000, moneda: 'MXN' })

    // De cuánto a cuánto y quién: sin eso, el rastro no responde a la pregunta
    // que se hace cuando un huésped reclama.
    const rastro = escribir.mock.calls[0][0].data
    expect(rastro).toMatchObject({
      roomTypeId: 'rt1',
      propertyId: 'p1',
      staffId: 'st1',
      beforeCents: 400000,
      afterCents: 450000,
      currency: 'MXN',
    })

    // 🔴 Sin este aviso el hotel cambia el precio y la web sigue con el viejo.
    expect(emit).toHaveBeenCalledWith(TARIFA_CAMBIADA, expect.objectContaining({ propertyId: 'p1' }))
  })

  it('🔴 el `where` filtra por organización Y propiedad, no sólo por id', async () => {
    const { svc, prisma } = hacer()
    await svc.cambiar({ ...base, tarifaCentavos: 450000 })
    expect(prisma.roomType.findFirst.mock.calls[0][0].where).toMatchObject({
      id: 'rt1',
      organizationId: 'o1',
      propertyId: 'p1',
    })
  })

  it('🔴 un tipo de otro hotel no se toca y no se distingue de uno inexistente', async () => {
    const { svc, update, emit } = hacer({ tipo: null })
    await expect(svc.cambiar({ ...base, tarifaCentavos: 450000 })).rejects.toBeInstanceOf(
      NotFoundException,
    )
    expect(update).not.toHaveBeenCalled()
    expect(emit).not.toHaveBeenCalled()
  })

  it('guardar el MISMO precio no escribe, no deja rastro y no avisa', async () => {
    const { svc, update, escribir, emit } = hacer()
    const r = await svc.cambiar({ ...base, tarifaCentavos: 400000 })
    expect(r.nuevaCentavos).toBe(400000)
    expect(update).not.toHaveBeenCalled()
    expect(escribir).not.toHaveBeenCalled()
    expect(emit).not.toHaveBeenCalled()
  })

  it('🔴 si el rastro falla, el precio NO se deshace — pero se grita', async () => {
    const { svc, prisma, update, emit } = hacer()
    prisma.rateChangeLog.create = jest.fn().mockRejectedValue(new Error('tabla caída'))
    await expect(svc.cambiar({ ...base, tarifaCentavos: 450000 })).resolves.toMatchObject({
      nuevaCentavos: 450000,
    })
    expect(update).toHaveBeenCalled()
    expect(emit).toHaveBeenCalled()
  })
})

describe('función de aptitud', () => {
  it('🔴 la propiedad y la organización NO salen del cuerpo ni de la URL', () => {
    const ctrl = readFileSync(join(__dirname, 'room-types.controller.ts'), 'utf8')
    const metodo = ctrl.slice(ctrl.indexOf('async cambiarPrecio'), ctrl.indexOf('@Get()'))
    expect(metodo).toContain('this.tenant.getOrganizationId()')
    expect(metodo).toContain('this.tenant.getPropertyId()')
    // Si algún día alguien los acepta desde fuera, esto se pone rojo.
    expect(metodo).not.toMatch(/dto\.(propertyId|organizationId)/)
  })

  it('🔴 la ruta exige SUPERVISOR', () => {
    const ctrl = readFileSync(join(__dirname, 'room-types.controller.ts'), 'utf8')
    expect(ctrl).toContain('@Roles(StaffRole.SUPERVISOR)')
  })
})
