import { RatesService } from './rates.service'

/**
 * C3 — el rastro del cambio de tarifa.
 *
 * `rate_overrides` se escribe con `upsert`: la tarifa nueva PISA a la vieja.
 * `created_by_id` contesta «quién la cambió»; no contesta **«de cuánto a
 * cuánto»** — que es justo lo que hace falta cuando un huésped reclama el
 * precio que vio, o cuando una OTA cobra comisión sobre una tarifa que el hotel
 * dice no haber publicado.
 *
 * El historial va a `audit_log`, que ya existía y es append-only por trigger.
 * No se creó tabla: el criterio C-7 dice que lo que la casa ya resolvió no se
 * reinventa.
 */
describe('RatesService — auditoría del cambio de tarifa', () => {
  let prisma: any
  let audit: { write: jest.Mock }
  let service: RatesService

  const tenant = { getOrganizationId: () => 'org-1' } as any
  const events = { emit: jest.fn() } as any

  beforeEach(() => {
    audit = { write: jest.fn().mockResolvedValue({ id: 'a1' }) }
    prisma = {
      property: { findFirst: jest.fn().mockResolvedValue({ id: 'prop-1', organizationId: 'org-1' }) },
      user: { findUnique: jest.fn().mockResolvedValue({ systemRole: 'ORG_OWNER' }) },
      rateOverride: {
        findUnique: jest.fn().mockResolvedValue({ overrideRate: 1200, createdById: 'u-vieja' }),
        upsert: jest.fn().mockResolvedValue({ id: 'ov-1', overrideRate: 1500 }),
      },
      roomType: { findMany: jest.fn().mockResolvedValue([]) },
      channelMapping: { findMany: jest.fn().mockResolvedValue([]) },
    }
    service = new RatesService(prisma, tenant, events, audit as any)
  })

  const cambiar = () =>
    service.upsertOverride('prop-1', {
      roomTypeId: 'rt-1',
      ratePlanId: null,
      date: new Date('2026-12-25T00:00:00Z'),
      overrideRate: 1500,
      reason: 'Navidad',
      createdById: 'u-nueva',
    })

  it('🔴 guarda el valor ANTERIOR, que el upsert destruye', async () => {
    await cambiar()
    expect(audit.write).toHaveBeenCalledTimes(1)
    const entrada = audit.write.mock.calls[0][0]
    expect(entrada.action).toBe('RATE_OVERRIDE_UPSERT')
    expect(entrada.payload).toMatchObject({ anterior: 1200, nueva: 1500, reason: 'Navidad' })
  })

  it('lee el valor anterior ANTES de escribir — si no, ya no existe', async () => {
    const orden: string[] = []
    prisma.rateOverride.findUnique.mockImplementation(async () => { orden.push('lee'); return { overrideRate: 1200 } })
    prisma.rateOverride.upsert.mockImplementation(async () => { orden.push('escribe'); return { id: 'ov-1' } })
    await cambiar()
    expect(orden).toEqual(['lee', 'escribe'])
  })

  it('la primera vez que se fija una tarifa, `anterior` es null y no cero', async () => {
    prisma.rateOverride.findUnique.mockResolvedValue(null)
    await cambiar()
    expect(audit.write.mock.calls[0][0].payload.anterior).toBeNull()
  })

  it('🔴 el rol se LEE de la base, no se deduce del token', async () => {
    // `JwtPayload.role` es un StaffRole; `audit_log.actor_real_role` es un
    // SystemRole. Son ejes distintos: mapearlos a ojo sería inventar.
    await cambiar()
    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'u-nueva' }, select: { systemRole: true } }),
    )
    expect(audit.write.mock.calls[0][0].actorRealRole).toBe('ORG_OWNER')
  })

  it('el target identifica la tarifa: tipo de habitación y noche', async () => {
    await cambiar()
    expect(audit.write.mock.calls[0][0].target).toBe('rt-1|2026-12-25')
  })

  it('🔴 si la auditoría falla, el cambio de tarifa NO se cae', async () => {
    // Auditar no puede bloquear la operación de negocio. Esta prueba falló en
    // el primer intento —la excepción se propagaba— y por eso existe: si
    // `audit_log` está caído, el hotel tiene que poder seguir vendiendo.
    audit.write.mockRejectedValue(new Error('audit_log caído'))
    await expect(cambiar()).resolves.toMatchObject({ id: 'ov-1' })
    expect(prisma.rateOverride.upsert).toHaveBeenCalled()
  })
})
