import { Test, TestingModule } from '@nestjs/testing'
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { RatesService } from './rates.service'
import { PrismaService } from '../../prisma/prisma.service'
import { TenantContextService } from '../../common/tenant-context.service'

const ORG = 'org-1'
const PROP = 'prop-1'

describe('RatesService — RATES-CORE Fase 1', () => {
  let service: RatesService

  const prisma = {
    property: { findFirst: jest.fn().mockResolvedValue({ id: PROP }) },
    roomType: { findMany: jest.fn(), findFirst: jest.fn() },
    ratePlan: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    rateSeason: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), delete: jest.fn() },
    dayOfWeekRule: { deleteMany: jest.fn(), create: jest.fn() },
    rateRestriction: { create: jest.fn(), findUnique: jest.fn(), delete: jest.fn() },
    rateOverride: { findMany: jest.fn().mockResolvedValue([]), upsert: jest.fn() },
    $transaction: jest.fn((arr: unknown[]) => Promise.resolve(arr)),
  }
  const tenant = { getOrganizationId: jest.fn().mockReturnValue(ORG) }

  beforeEach(async () => {
    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        RatesService,
        { provide: PrismaService, useValue: prisma },
        { provide: TenantContextService, useValue: tenant },
      ],
    }).compile()
    service = mod.get(RatesService)
    jest.clearAllMocks()
    prisma.property.findFirst.mockResolvedValue({ id: PROP })
    prisma.rateOverride.findMany.mockResolvedValue([])
  })

  describe('createRatePlan', () => {
    it('crea un plan BAR', async () => {
      prisma.ratePlan.findFirst.mockResolvedValue(null)
      prisma.ratePlan.create.mockResolvedValue({ id: 'rp-1', code: 'BAR' })
      const r = await service.createRatePlan(PROP, { code: 'BAR', name: 'Tarifa base' })
      expect(r.id).toBe('rp-1')
      expect(prisma.ratePlan.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ code: 'BAR', baseStrategy: 'BAR' }) }),
      )
    })

    it('rechaza código duplicado', async () => {
      prisma.ratePlan.findFirst.mockResolvedValue({ id: 'rp-existing' })
      await expect(service.createRatePlan(PROP, { code: 'BAR', name: 'x' })).rejects.toBeInstanceOf(ConflictException)
    })

    it('FIXED sin baseRate → BadRequest', async () => {
      prisma.ratePlan.findFirst.mockResolvedValue(null)
      await expect(
        service.createRatePlan(PROP, { code: 'NR', name: 'No reembolsable', baseStrategy: 'FIXED' }),
      ).rejects.toBeInstanceOf(BadRequestException)
    })

    it('MULTIPLIER con baseMultiplier 0 → BadRequest', async () => {
      prisma.ratePlan.findFirst.mockResolvedValue(null)
      await expect(
        service.createRatePlan(PROP, { code: 'ADV', name: 'Anticipada', baseStrategy: 'MULTIPLIER', baseMultiplier: 0 }),
      ).rejects.toBeInstanceOf(BadRequestException)
    })

    it('property fuera de la org → NotFound', async () => {
      prisma.property.findFirst.mockResolvedValue(null)
      await expect(service.createRatePlan('otra', { code: 'X', name: 'y' })).rejects.toBeInstanceOf(NotFoundException)
    })
  })

  describe('getRateQuoteGrid con ratePlanId (resolver D-RATES2)', () => {
    it('aplica multiplier de season sobre la baseRate del room type', async () => {
      prisma.roomType.findMany.mockResolvedValue([
        { id: 'rt-cabana', name: 'Cabaña', code: 'CAB', baseRate: 100, currency: 'USD', maxOccupancy: 4 },
      ])
      prisma.ratePlan.findFirst.mockResolvedValue({
        id: 'rp-1', baseStrategy: 'BAR', baseRate: null, baseMultiplier: null,
        seasons: [{ startDate: new Date('2026-07-01'), endDate: new Date('2026-07-31'), roomTypeId: null, overrideRate: null, multiplier: 1.5 }],
        dayOfWeekRules: [],
      })
      const grid = await service.getRateQuoteGrid(PROP, new Date('2026-07-10'), new Date('2026-07-10'), 'rp-1')
      expect(grid.ratePlanId).toBe('rp-1')
      expect(grid.grid['rt-cabana']['2026-07-10']).toBe(150) // 100 × 1.5
    })

    it('sin ratePlanId usa baseRate flat (v1.0.0 preservado)', async () => {
      prisma.roomType.findMany.mockResolvedValue([
        { id: 'rt-cabana', name: 'Cabaña', code: 'CAB', baseRate: 130, currency: 'USD', maxOccupancy: 4 },
      ])
      const grid = await service.getRateQuoteGrid(PROP, new Date('2026-07-10'), new Date('2026-07-10'))
      expect(grid.ratePlanId).toBeNull()
      expect(grid.grid['rt-cabana']['2026-07-10']).toBe(130)
      expect(prisma.ratePlan.findFirst).not.toHaveBeenCalled()
    })

    it('override manual gana sobre season', async () => {
      prisma.roomType.findMany.mockResolvedValue([
        { id: 'rt-cabana', name: 'Cabaña', code: 'CAB', baseRate: 100, currency: 'USD', maxOccupancy: 4 },
      ])
      prisma.ratePlan.findFirst.mockResolvedValue({
        id: 'rp-1', baseStrategy: 'BAR', baseRate: null, baseMultiplier: null,
        seasons: [{ startDate: new Date('2026-07-01'), endDate: new Date('2026-07-31'), roomTypeId: null, overrideRate: null, multiplier: 1.5 }],
        dayOfWeekRules: [],
      })
      prisma.rateOverride.findMany.mockResolvedValue([
        { roomTypeId: 'rt-cabana', date: new Date('2026-07-10T00:00:00.000Z'), overrideRate: 999 },
      ])
      const grid = await service.getRateQuoteGrid(PROP, new Date('2026-07-10'), new Date('2026-07-10'), 'rp-1')
      expect(grid.grid['rt-cabana']['2026-07-10']).toBe(999)
    })
  })

  describe('resolvePrice', () => {
    it('retorna rate + source de la capa que ganó', async () => {
      prisma.roomType.findFirst.mockResolvedValue({ baseRate: 200, currency: 'USD' })
      prisma.ratePlan.findFirst.mockResolvedValue({
        id: 'rp-1', baseStrategy: 'MULTIPLIER', baseRate: null, baseMultiplier: 0.8,
        seasons: [], dayOfWeekRules: [],
      })
      const r = await service.resolvePrice(PROP, 'rt-cabana', new Date('2026-07-10'), 'rp-1')
      expect(r.rate).toBe(160) // 200 × 0.8
      expect(r.source).toBe('BASE')
      expect(r.bar).toBe(200)
    })
  })

  describe('createSeason', () => {
    it('crea temporada con multiplier', async () => {
      prisma.ratePlan.findFirst.mockResolvedValue({ id: 'rp-1' })
      prisma.rateSeason.create.mockResolvedValue({ id: 'se-1' })
      const r = await service.createSeason(PROP, {
        ratePlanId: 'rp-1', name: 'Alta', startDate: new Date('2026-12-01'), endDate: new Date('2026-12-31'), multiplier: 1.5,
      })
      expect(r.id).toBe('se-1')
    })

    it('sin overrideRate ni multiplier → BadRequest', async () => {
      prisma.ratePlan.findFirst.mockResolvedValue({ id: 'rp-1' })
      await expect(service.createSeason(PROP, {
        ratePlanId: 'rp-1', name: 'x', startDate: new Date('2026-12-01'), endDate: new Date('2026-12-31'),
      })).rejects.toBeInstanceOf(BadRequestException)
    })

    it('startDate > endDate → BadRequest', async () => {
      prisma.ratePlan.findFirst.mockResolvedValue({ id: 'rp-1' })
      await expect(service.createSeason(PROP, {
        ratePlanId: 'rp-1', name: 'x', startDate: new Date('2026-12-31'), endDate: new Date('2026-12-01'), multiplier: 1.2,
      })).rejects.toBeInstanceOf(BadRequestException)
    })
  })

  describe('bulkUpdateOverrides', () => {
    beforeEach(() => {
      prisma.roomType.findMany.mockResolvedValue([{ id: 'rt-cabana', name: 'Cabaña', baseRate: 100 }])
    })

    it('dryRun (default) retorna preview SIN escribir', async () => {
      const r = await service.bulkUpdateOverrides(PROP, {
        roomTypeIds: ['rt-cabana'], from: new Date('2026-07-10'), to: new Date('2026-07-11'),
        newRate: 200, createdById: 'staff-1',
      })
      expect(r.dryRun).toBe(true)
      expect(r.affectedCount).toBe(2) // 2 días × 1 roomType
      expect(r.preview[0]).toMatchObject({ current: 100, next: 200 })
      expect(prisma.rateOverride.upsert).not.toHaveBeenCalled()
      expect(prisma.$transaction).not.toHaveBeenCalled()
    })

    it('dryRun:false aplica vía $transaction', async () => {
      const r = await service.bulkUpdateOverrides(PROP, {
        roomTypeIds: ['rt-cabana'], from: new Date('2026-07-10'), to: new Date('2026-07-10'),
        newRate: 200, createdById: 'staff-1', dryRun: false,
      })
      expect(r.dryRun).toBe(false)
      expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    })

    it('roomType fuera de la property → BadRequest', async () => {
      prisma.roomType.findMany.mockResolvedValue([]) // no matchea
      await expect(service.bulkUpdateOverrides(PROP, {
        roomTypeIds: ['rt-x'], from: new Date('2026-07-10'), to: new Date('2026-07-10'),
        newRate: 200, createdById: 'staff-1',
      })).rejects.toBeInstanceOf(BadRequestException)
    })
  })

  describe('setDayOfWeekRules', () => {
    it('reemplaza todas las reglas (deleteMany + create por día)', async () => {
      prisma.ratePlan.findFirst.mockResolvedValue({ id: 'rp-1' })
      const r = await service.setDayOfWeekRules(PROP, 'rp-1', [
        { dayOfWeek: 6, multiplier: 1.2 }, { dayOfWeek: 0, multiplier: 1.1 },
      ])
      expect(r.count).toBe(2)
      expect(prisma.dayOfWeekRule.deleteMany).toHaveBeenCalledWith({ where: { ratePlanId: 'rp-1' } })
      expect(prisma.dayOfWeekRule.create).toHaveBeenCalledTimes(2)
    })

    it('dayOfWeek fuera de 0-6 → BadRequest', async () => {
      prisma.ratePlan.findFirst.mockResolvedValue({ id: 'rp-1' })
      await expect(service.setDayOfWeekRules(PROP, 'rp-1', [{ dayOfWeek: 7, multiplier: 1.2 }]))
        .rejects.toBeInstanceOf(BadRequestException)
    })

    it('multiplier ≤ 0 → BadRequest', async () => {
      prisma.ratePlan.findFirst.mockResolvedValue({ id: 'rp-1' })
      await expect(service.setDayOfWeekRules(PROP, 'rp-1', [{ dayOfWeek: 6, multiplier: 0 }]))
        .rejects.toBeInstanceOf(BadRequestException)
    })
  })
})
