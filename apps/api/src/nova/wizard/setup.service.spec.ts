/**
 * SetupService — token validation + activation tests (Day 17).
 *
 * Cobertura:
 *   · getMetadata: token inválido → 404
 *   · getMetadata: token consumido → 410 Gone
 *   · getMetadata: token expirado → 410 Gone
 *   · getMetadata: happy path → metadata
 *   · activate: password < 10 chars → 400
 *   · activate: happy path → updates user + org + properties + returns JWT
 *   · activate: TOCTOU — token consumido entre GET y POST → 410 Gone
 */
import { BadRequestException, GoneException, NotFoundException } from '@nestjs/common'
import * as crypto from 'crypto'
import { SetupService } from './setup.service'

const VALID_RAW_TOKEN = 'a'.repeat(64) // 64 hex chars, mismo formato que activate genera
const VALID_HASH = crypto.createHash('sha256').update(VALID_RAW_TOKEN).digest('hex')

const futureExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000) // +24h
const pastExpiry = new Date(Date.now() - 60 * 60 * 1000) // -1h

function makePrismaMock(opts: {
  user?: any | null
  consumed?: boolean
  expired?: boolean
  txUserFresh?: any
} = {}) {
  const baseUser =
    opts.user === null
      ? null
      : opts.user ?? {
          id: 'user-org-owner',
          organizationId: 'org-1',
          email: 'owner@hotel-test.com',
          firstName: 'María',
          lastName: 'Fernández',
          setupTokenExpiresAt: opts.expired ? pastExpiry : futureExpiry,
          setupTokenConsumedAt: opts.consumed ? new Date() : null,
          isActive: false,
        }

  return {
    user: {
      findUnique: jest.fn().mockResolvedValue(baseUser),
      update: jest.fn().mockResolvedValue({
        id: 'user-org-owner',
        email: 'owner@hotel-test.com',
        firstName: 'María',
        lastName: 'Fernández',
        organizationId: 'org-1',
      }),
    },
    organization: {
      findUnique: jest.fn().mockResolvedValue({
        name: 'Hotel Test Tulum',
        slug: 'hotel-test-tulum',
        properties: [{ id: 'p1' }, { id: 'p2' }],
      }),
      update: jest.fn().mockResolvedValue({}),
    },
    property: {
      updateMany: jest.fn().mockResolvedValue({ count: 2 }),
    },
    $transaction: jest.fn().mockImplementation(async (fn: any) => {
      const tx = {
        user: {
          findUnique: jest.fn().mockResolvedValue(
            opts.txUserFresh ?? {
              id: 'user-org-owner',
              organizationId: 'org-1',
              setupTokenConsumedAt: null,
              setupTokenExpiresAt: futureExpiry,
            },
          ),
          update: jest.fn().mockResolvedValue({
            id: 'user-org-owner',
            email: 'owner@hotel-test.com',
            firstName: 'María',
            lastName: 'Fernández',
            organizationId: 'org-1',
          }),
        },
        organization: {
          update: jest.fn().mockResolvedValue({}),
        },
        property: {
          updateMany: jest.fn().mockResolvedValue({ count: 2 }),
        },
      }
      return fn(tx)
    }),
  } as any
}

function makeJwtMock() {
  return { sign: jest.fn().mockReturnValue('mock.jwt.token') } as any
}

function makeAuditMock() {
  return { write: jest.fn().mockResolvedValue({ id: 'audit-1' }) } as any
}

describe('SetupService', () => {
  describe('getMetadata', () => {
    it('returns metadata for valid token', async () => {
      const service = new SetupService(makePrismaMock(), makeJwtMock(), makeAuditMock())
      const res = await service.getMetadata(VALID_RAW_TOKEN)
      expect(res.organizationName).toBe('Hotel Test Tulum')
      expect(res.ownerEmail).toBe('owner@hotel-test.com')
      expect(res.ownerName).toBe('María Fernández')
      expect(res.propertyCount).toBe(2)
      expect(res.hoursRemaining).toBeGreaterThan(0)
    })

    it('throws 404 for token that does not match any user', async () => {
      const service = new SetupService(
        makePrismaMock({ user: null }),
        makeJwtMock(),
        makeAuditMock(),
      )
      await expect(service.getMetadata(VALID_RAW_TOKEN)).rejects.toThrow(NotFoundException)
    })

    it('throws 410 Gone for already-consumed token', async () => {
      const service = new SetupService(
        makePrismaMock({ consumed: true }),
        makeJwtMock(),
        makeAuditMock(),
      )
      await expect(service.getMetadata(VALID_RAW_TOKEN)).rejects.toThrow(GoneException)
    })

    it('throws 410 Gone for expired token', async () => {
      const service = new SetupService(
        makePrismaMock({ expired: true }),
        makeJwtMock(),
        makeAuditMock(),
      )
      await expect(service.getMetadata(VALID_RAW_TOKEN)).rejects.toThrow(GoneException)
    })

    it('throws 400 for malformed token (too short)', async () => {
      const service = new SetupService(makePrismaMock(), makeJwtMock(), makeAuditMock())
      await expect(service.getMetadata('abc')).rejects.toThrow(BadRequestException)
    })
  })

  describe('activate', () => {
    it('rejects password shorter than 10 chars', async () => {
      const service = new SetupService(makePrismaMock(), makeJwtMock(), makeAuditMock())
      await expect(service.activate(VALID_RAW_TOKEN, 'short')).rejects.toThrow(BadRequestException)
    })

    it('rejects password longer than 200 chars', async () => {
      const service = new SetupService(makePrismaMock(), makeJwtMock(), makeAuditMock())
      await expect(service.activate(VALID_RAW_TOKEN, 'x'.repeat(201))).rejects.toThrow(
        BadRequestException,
      )
    })

    it('happy path — activates user + org + properties, returns JWT', async () => {
      const prisma = makePrismaMock()
      const jwt = makeJwtMock()
      const audit = makeAuditMock()
      const service = new SetupService(prisma, jwt, audit)
      const res = await service.activate(VALID_RAW_TOKEN, 'SecureP@ssw0rd123')

      expect(res.access_token).toBe('mock.jwt.token')
      expect(res.user.email).toBe('owner@hotel-test.com')
      expect(jwt.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          systemRole: 'ORG_OWNER',
          actorTier: 'ORG_OWNER',
          organizationId: 'org-1',
        }),
      )
      expect(audit.write).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'OWNER_SETUP_COMPLETED',
          status: 'SUCCESS',
          retentionPolicy: 'PERMANENT',
        }),
      )
    })

    it('TOCTOU — token consumido entre GET y POST throws 410 Gone', async () => {
      // Token válido en lookup inicial, pero al re-checkear dentro de tx
      // alguien lo consumió primero (race condition simulated).
      const prisma = makePrismaMock({
        txUserFresh: {
          id: 'user-org-owner',
          organizationId: 'org-1',
          setupTokenConsumedAt: new Date(), // ya consumido
          setupTokenExpiresAt: futureExpiry,
        },
      })
      const service = new SetupService(prisma, makeJwtMock(), makeAuditMock())
      await expect(service.activate(VALID_RAW_TOKEN, 'SecureP@ssw0rd')).rejects.toThrow(
        GoneException,
      )
    })

    it('audit write failure does NOT block activation', async () => {
      const audit = { write: jest.fn().mockRejectedValue(new Error('audit DB down')) } as any
      const service = new SetupService(makePrismaMock(), makeJwtMock(), audit)
      const res = await service.activate(VALID_RAW_TOKEN, 'SecureP@ssw0rd123')
      expect(res.access_token).toBe('mock.jwt.token')
    })
  })
})
