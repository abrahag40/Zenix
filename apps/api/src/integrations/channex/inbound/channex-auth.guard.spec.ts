import { ExecutionContext, UnauthorizedException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { ChannexAuthGuard } from './channex-auth.guard'
import { PrismaService } from '../../../prisma/prisma.service'

function makeCtx(headers: Record<string, string>): {
  ctx: ExecutionContext
  req: Record<string, unknown> & { headers: Record<string, string> }
} {
  const req = { headers, channexAuth: undefined as unknown }
  const ctx = {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext
  return { ctx, req }
}

describe('ChannexAuthGuard', () => {
  let guard: ChannexAuthGuard
  let prisma: {
    propertySettings: { findUnique: jest.Mock }
  }

  beforeEach(async () => {
    prisma = {
      propertySettings: {
        findUnique: jest.fn(),
      },
    }
    const mod = await Test.createTestingModule({
      providers: [
        ChannexAuthGuard,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile()
    guard = mod.get(ChannexAuthGuard)
  })

  it('rechaza 401 cuando falta X-Channex-Property-Id', async () => {
    const { ctx } = makeCtx({})
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException)
  })

  it('rechaza 401 cuando property no existe', async () => {
    prisma.propertySettings.findUnique.mockResolvedValue(null)
    const { ctx } = makeCtx({ 'x-channex-property-id': 'unknown' })
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException)
  })

  it('acepta y marca secretConfigured:false cuando la property no tiene secret (onboarding)', async () => {
    prisma.propertySettings.findUnique.mockResolvedValue({
      propertyId: 'prop-1',
      channexWebhookSecret: null,
    })
    const { ctx, req } = makeCtx({ 'x-channex-property-id': 'prop-1' })

    const ok = await guard.canActivate(ctx)

    expect(ok).toBe(true)
    expect(req.channexAuth).toEqual({
      propertyId: 'prop-1',
      secretConfigured: false,
      valid: true,
    })
  })

  it('rechaza 401 con bearer token inválido cuando secret está configurado', async () => {
    prisma.propertySettings.findUnique.mockResolvedValue({
      propertyId: 'prop-1',
      channexWebhookSecret: 'expected-token-123',
    })
    const { ctx } = makeCtx({
      'x-channex-property-id': 'prop-1',
      authorization: 'Bearer wrong-token',
    })
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException)
  })

  it('acepta con bearer token válido (timing-safe compare)', async () => {
    prisma.propertySettings.findUnique.mockResolvedValue({
      propertyId: 'prop-1',
      channexWebhookSecret: 'expected-token-123',
    })
    const { ctx, req } = makeCtx({
      'x-channex-property-id': 'prop-1',
      authorization: 'Bearer expected-token-123',
    })

    await expect(guard.canActivate(ctx)).resolves.toBe(true)
    expect(req.channexAuth).toEqual({
      propertyId: 'prop-1',
      secretConfigured: true,
      valid: true,
    })
  })

  it('rechaza 401 cuando secret configurado pero authorization header ausente', async () => {
    prisma.propertySettings.findUnique.mockResolvedValue({
      propertyId: 'prop-1',
      channexWebhookSecret: 'expected-token-123',
    })
    const { ctx } = makeCtx({ 'x-channex-property-id': 'prop-1' })
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException)
  })
})
