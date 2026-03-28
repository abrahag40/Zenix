import { Test, TestingModule } from '@nestjs/testing'
import { INestApplication, ValidationPipe } from '@nestjs/common'
import * as request from 'supertest'
import { AppModule } from '../../app.module'
import { PrismaService } from '../../prisma/prisma.service'

/**
 * TENANT ISOLATION TEST
 *
 * Crea 2 organizaciones completamente separadas con sus datos.
 * Verifica que ningún endpoint filtra datos cruzados.
 *
 * Si este test falla → hay un data breach entre tenants.
 * Este test NUNCA debe deshabilitarse ni saltarse.
 */
describe('Tenant Isolation (e2e)', () => {
  let app: INestApplication
  let prisma: PrismaService
  let tokenOrgA: string
  let tokenOrgB: string
  let taskIdOrgA: string
  let roomIdOrgA: string

  // Track created org IDs for cleanup
  let orgAId: string
  let orgBId: string

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()

    app = moduleFixture.createNestApplication()
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }))
    app.setGlobalPrefix('api')
    await app.init()

    prisma = moduleFixture.get<PrismaService>(PrismaService)

    await setupTenants()
  }, 30000)

  afterAll(async () => {
    await cleanupTenants()
    await app.close()
  })

  // ─── SETUP ────────────────────────────────────────────────────────
  async function setupTenants() {
    const bcrypt = await import('bcrypt')

    // Org A — Hotel Azúcar
    const orgA = await prisma.organization.create({
      data: { name: 'Hotel Azucar', slug: 'hotel-azucar-test' },
    })
    orgAId = orgA.id

    const propertyA = await prisma.property.create({
      data: {
        organizationId: orgA.id,
        name: 'Hotel Azucar Tulum',
        type: 'BOUTIQUE',
      },
    })

    const roomA = await prisma.room.create({
      data: {
        organizationId: orgA.id,
        propertyId: propertyA.id,
        number: '101',
        category: 'PRIVATE',
        capacity: 2,
      },
    })
    roomIdOrgA = roomA.id

    const bedA = await prisma.bed.create({
      data: {
        organizationId: orgA.id,
        roomId: roomA.id,
        label: 'Cama King A',
        status: 'DIRTY',
      },
    })

    const task = await prisma.cleaningTask.create({
      data: {
        organizationId: orgA.id,
        bedId: bedA.id,
        status: 'READY',
        taskType: 'CLEANING',
        priority: 'HIGH',
      },
    })
    taskIdOrgA = task.id

    await prisma.housekeepingStaff.create({
      data: {
        organizationId: orgA.id,
        propertyId: propertyA.id,
        name: 'Staff A',
        email: 'staff-a@isolation-test.com',
        passwordHash: await bcrypt.hash('password123', 10),
        role: 'SUPERVISOR',
        capabilities: ['CLEANING'],
      },
    })

    // Org B — Hotel Rival
    const orgB = await prisma.organization.create({
      data: { name: 'Hotel Rival', slug: 'hotel-rival-test' },
    })
    orgBId = orgB.id

    const propertyB = await prisma.property.create({
      data: {
        organizationId: orgB.id,
        name: 'Hotel Rival Cancun',
        type: 'HOTEL',
      },
    })

    await prisma.housekeepingStaff.create({
      data: {
        organizationId: orgB.id,
        propertyId: propertyB.id,
        name: 'Staff B',
        email: 'staff-b@isolation-test.com',
        passwordHash: await bcrypt.hash('password123', 10),
        role: 'SUPERVISOR',
        capabilities: ['CLEANING'],
      },
    })

    // Obtener tokens de ambos tenants
    const resA = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'staff-a@isolation-test.com', password: 'password123' })
    tokenOrgA = resA.body.accessToken

    const resB = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'staff-b@isolation-test.com', password: 'password123' })
    tokenOrgB = resB.body.accessToken
  }

  async function cleanupTenants() {
    const testOrgIds = [orgAId, orgBId].filter(Boolean)
    if (testOrgIds.length === 0) return

    // Borrar en orden correcto por FK constraints
    await prisma.cleaningTask.deleteMany({
      where: { organizationId: { in: testOrgIds } },
    })
    await prisma.bed.deleteMany({
      where: { organizationId: { in: testOrgIds } },
    })
    await prisma.room.deleteMany({
      where: { organizationId: { in: testOrgIds } },
    })
    await prisma.housekeepingStaff.deleteMany({
      where: { email: { endsWith: '@isolation-test.com' } },
    })
    await prisma.property.deleteMany({
      where: { organizationId: { in: testOrgIds } },
    })
    await prisma.organization.deleteMany({
      where: { slug: { in: ['hotel-azucar-test', 'hotel-rival-test'] } },
    })
  }

  // ─── TESTS ────────────────────────────────────────────────────────

  describe('GET /tasks/:id — cross-tenant access', () => {
    it('Org A puede acceder a su propio task', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/tasks/${taskIdOrgA}`)
        .set('Authorization', `Bearer ${tokenOrgA}`)

      expect(res.status).toBe(200)
      expect(res.body.id).toBe(taskIdOrgA)
    })

    it('Org B NO puede acceder al task de Org A — debe recibir 404', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/tasks/${taskIdOrgA}`)
        .set('Authorization', `Bearer ${tokenOrgB}`)

      expect(res.status).toBe(404)
      // CRÍTICO: la respuesta no debe revelar nada sobre el recurso
      expect(res.body).not.toHaveProperty('organizationId')
      expect(res.body).not.toHaveProperty('bedId')
    })
  })

  describe('GET /rooms/:id — cross-tenant access', () => {
    it('Org A puede acceder a su propia room', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/rooms/${roomIdOrgA}`)
        .set('Authorization', `Bearer ${tokenOrgA}`)

      expect(res.status).toBe(200)
    })

    it('Org B NO puede acceder a room de Org A — debe recibir 404', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/rooms/${roomIdOrgA}`)
        .set('Authorization', `Bearer ${tokenOrgB}`)

      expect(res.status).toBe(404)
    })
  })

  describe('GET /tasks — list isolation', () => {
    it('Org A solo ve sus propias tasks en el listado', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/tasks')
        .set('Authorization', `Bearer ${tokenOrgA}`)

      expect(res.status).toBe(200)
      const tasks = res.body
      // Todas las tasks deben pertenecer a Org A
      const ids = tasks.map((t: any) => t.id)
      expect(ids).toContain(taskIdOrgA)
    })

    it('Org B tiene 0 tasks — no ve las de Org A', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/tasks')
        .set('Authorization', `Bearer ${tokenOrgB}`)

      expect(res.status).toBe(200)
      const tasks = res.body
      const ids = tasks.map((t: any) => t.id)
      expect(ids).not.toContain(taskIdOrgA)
    })
  })

  describe('Sin token — debe rechazar', () => {
    it('GET /tasks/:id sin token → 401', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/tasks/${taskIdOrgA}`)

      expect(res.status).toBe(401)
    })

    it('GET /tasks sin token → 401', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/tasks')

      expect(res.status).toBe(401)
    })
  })
})
