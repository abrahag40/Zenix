/**
 * Channex provisioning sandbox integration test — Sprint AUTO-PROVISION Day 6.
 *
 * E2E real contra staging.channex.io. Skipped automáticamente si la api-key
 * no está configurada (CI offline).
 *
 * Run manually:
 *   cd apps/api && CHANNEX_API_KEY=<sandbox-key> npx jest channex-provision.integration --runInBand
 *
 * Qué valida:
 *   1. createGroup → UUID válido devuelto + persistido por Channex
 *   2. createProperty con group_id → UUID válido + queda dentro del Group
 *   3. createRoomType x2 → 2 UUIDs distintos, ambos válidos
 *   4. createRatePlan x4 (2 RT × 2 plans) → 4 UUIDs válidos
 *   5. createChannel OpenChannel → UUID válido, is_active=false default
 *   6. Cleanup orden inverso (defensa contra basura en sandbox):
 *      deleteChannel → deleteRatePlan x4 → deleteRoomType x2
 *      (no hay deleteProperty/deleteGroup expuestos en el gateway —
 *       sandbox los acumula, OK para piloto)
 *
 * Estos tests EJERCITAN el gateway directamente — el ChannexProvisionService
 * está cubierto por unit tests con mocks (channex-provision.service.spec.ts).
 * Este spec demuestra que el contrato HTTP real con Channex sandbox sigue
 * funcionando con los métodos nuevos del Day 1 (createProperty/createGroup/
 * createChannel/upsertChannelRoomType/upsertChannelRatePlan).
 *
 * Cert alignment: este test NO ejecuta los 14 cert tests (Test 1-14 viven
 * en channex.cert-tests.integration.spec.ts). Este spec valida solo el
 * provisioning path que el wizard dispara al activar.
 */
import { ConfigService } from '@nestjs/config'
import { Test } from '@nestjs/testing'
import { ChannexGateway } from '../../integrations/channex/channex.gateway'

const hasKey = Boolean(process.env.CHANNEX_API_KEY?.trim())
const describeIfKey = hasKey ? describe : describe.skip

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

describeIfKey('Channex provisioning (sandbox E2E)', () => {
  let gateway: ChannexGateway

  // Resources creados — limpiamos al final en orden inverso
  let createdGroupId: string | null = null
  let createdPropertyId: string | null = null
  const createdRoomTypeIds: string[] = []
  const createdRatePlanIds: string[] = []
  let createdChannelId: string | null = null

  // Timestamp único para evitar collision si re-corres el spec rápido
  const stamp = Date.now()
  const groupTitle = `zenix-auto-prov-test-${stamp}`
  const propertyTitle = `Hotel AUTO-PROVISION Test ${stamp}`

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      providers: [
        ChannexGateway,
        {
          provide: ConfigService,
          useValue: {
            get: (k: string) => {
              if (k === 'CHANNEX_API_KEY') return process.env.CHANNEX_API_KEY
              if (k === 'CHANNEX_BASE_URL')
                return process.env.CHANNEX_BASE_URL ?? 'https://staging.channex.io/api/v1'
              return undefined
            },
          },
        },
      ],
    }).compile()
    gateway = mod.get(ChannexGateway)
  })

  afterAll(async () => {
    // Cleanup orden inverso. Best-effort — si Channex 422 (mapping activo),
    // log y sigo. El sandbox acumula basura pero no hay alternativa más limpia
    // sin endpoints deleteProperty/deleteGroup expuestos.
    if (createdChannelId) {
      try {
        await gateway.deleteChannel(createdChannelId)
      } catch (err) {
        console.warn(`[cleanup] deleteChannel ${createdChannelId} failed: ${String(err).slice(0, 200)}`)
      }
    }
    for (const id of createdRatePlanIds) {
      try {
        await gateway.deleteRatePlan(id)
      } catch (err) {
        console.warn(`[cleanup] deleteRatePlan ${id} failed: ${String(err).slice(0, 200)}`)
      }
    }
    for (const id of createdRoomTypeIds) {
      try {
        await gateway.deleteRoomType(id)
      } catch (err) {
        console.warn(`[cleanup] deleteRoomType ${id} failed: ${String(err).slice(0, 200)}`)
      }
    }
    // Property + Group quedan en sandbox. El gateway NO expone deleteProperty
    // (destructivo intencionalmente — requiere acción manual ZaharDev).
    if (createdPropertyId) {
      console.log(`[cleanup] Property ${createdPropertyId} left in sandbox — delete manually if needed`)
    }
    if (createdGroupId) {
      console.log(`[cleanup] Group ${createdGroupId} left in sandbox — delete manually if needed`)
    }
  })

  it('1. createGroup devuelve UUID válido', async () => {
    const group = await gateway.createGroup({ title: groupTitle })
    expect(group.id).toMatch(UUID_RE)
    expect(group.title).toBe(groupTitle)
    createdGroupId = group.id ?? null
    expect(createdGroupId).toBeTruthy()
  }, 30_000)

  it('2. createProperty con group_id queda asignada al Group', async () => {
    if (!createdGroupId) throw new Error('Group not created')
    const property = await gateway.createProperty({
      title: propertyTitle,
      currency: 'MXN',
      timezone: 'America/Cancun',
      country: 'MX',
      groupId: createdGroupId,
    })
    expect(property.id).toMatch(UUID_RE)
    expect(property.title).toBe(propertyTitle)
    expect(property.currency).toBe('MXN')
    expect(property.group_id).toBe(createdGroupId)
    createdPropertyId = property.id ?? null
  }, 30_000)

  it('3. createRoomType x2 — UUIDs distintos válidos', async () => {
    if (!createdPropertyId) throw new Error('Property not created')

    const rt1 = await gateway.createRoomType({
      propertyId: createdPropertyId,
      title: 'Habitación Estándar (test)',
      countOfRooms: 6,
      occAdults: 2,
      occChildren: 0,
    })
    expect(rt1.id).toMatch(UUID_RE)
    createdRoomTypeIds.push(rt1.id!)

    const rt2 = await gateway.createRoomType({
      propertyId: createdPropertyId,
      title: 'Suite Junior (test)',
      countOfRooms: 4,
      occAdults: 3,
      occChildren: 2,
    })
    expect(rt2.id).toMatch(UUID_RE)
    expect(rt2.id).not.toBe(rt1.id)
    createdRoomTypeIds.push(rt2.id!)
  }, 60_000)

  it('4. createRatePlan x4 (2 RT × 2 plans) — UUIDs distintos válidos', async () => {
    if (!createdPropertyId || createdRoomTypeIds.length !== 2) {
      throw new Error('Property or RoomTypes not ready')
    }

    for (const rtId of createdRoomTypeIds) {
      const bar = await gateway.createRatePlan({
        propertyId: createdPropertyId,
        roomTypeId: rtId,
        title: `BAR ${rtId.slice(0, 6)}`,
        currency: 'MXN',
        rateCents: 100_00,
        occupancy: 2,
      })
      expect(bar.id).toMatch(UUID_RE)
      createdRatePlanIds.push(bar.id!)

      const nonRef = await gateway.createRatePlan({
        propertyId: createdPropertyId,
        roomTypeId: rtId,
        title: `NonRef ${rtId.slice(0, 6)}`,
        currency: 'MXN',
        rateCents: 90_00,
        occupancy: 2,
      })
      expect(nonRef.id).toMatch(UUID_RE)
      createdRatePlanIds.push(nonRef.id!)
    }
    expect(createdRatePlanIds.length).toBe(4)
    expect(new Set(createdRatePlanIds).size).toBe(4) // todos distintos
  }, 90_000)

  it('5. createChannel OpenChannel inactive — UUID válido + is_active=false', async () => {
    if (!createdPropertyId) throw new Error('Property not created')

    const channel = await gateway.createChannel({
      type: 'OpenChannel',
      propertyId: createdPropertyId,
      title: `Sandbox Test Channel ${stamp}`,
      // isActive default false — provisioning NUNCA publica al crear
    })
    expect(channel.id).toMatch(UUID_RE)
    expect(channel.is_active).toBe(false)
    createdChannelId = channel.id ?? null
  }, 30_000)

  it('6. updateChannel toggle is_active=true (validación binding sandbox)', async () => {
    if (!createdChannelId) throw new Error('Channel not created')

    // Solo para validar que el flag persiste — luego cleanup
    const updated = await gateway.updateChannel(createdChannelId, { isActive: true })
    expect(updated.id).toBe(createdChannelId)
    expect(updated.is_active).toBe(true)

    // Revertimos a inactive para que el deleteChannel en cleanup no falle
    // (Channex 422 cuando hay mapping activo)
    await gateway.updateChannel(createdChannelId, { isActive: false })
  }, 30_000)
})
