// JwtStrategy.validate — regression guard Day 9 hotfix.
//
// Bug original: validate() hacía SOLO prisma.staff.findUnique() — los Nova
// users (PLATFORM, PARTNER_ADMIN, PARTNER_MEMBER, ORG_OWNER) que viven en
// `users` table eran rechazados con 401 silencioso. El frontend hacía
// auto-logout en loop.
//
// Este spec asegura que ambos lookups funcionan + ambos active=false son
// rechazados.
import { UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtStrategy } from './jwt.strategy'

describe('JwtStrategy.validate — Staff + User fallback (Day 9 regression)', () => {
  function build(opts: {
    staff?: { id: string; active: boolean } | null
    user?: { id: string; isActive: boolean } | null
  }) {
    const prisma: any = {
      staff: { findUnique: jest.fn().mockResolvedValue(opts.staff ?? null) },
      user: { findUnique: jest.fn().mockResolvedValue(opts.user ?? null) },
    }
    const config = new ConfigService({})
    return { strategy: new JwtStrategy(config, prisma), prisma }
  }

  const PAYLOAD: any = { sub: 'subject-id', email: 'x@y', role: 'PLATFORM_ADMIN' }

  it('Staff activo → return payload', async () => {
    const { strategy } = build({ staff: { id: 'subject-id', active: true } })
    await expect(strategy.validate(PAYLOAD)).resolves.toEqual(PAYLOAD)
  })

  it('Staff inactivo → UnauthorizedException', async () => {
    const { strategy } = build({ staff: { id: 'subject-id', active: false } })
    await expect(strategy.validate(PAYLOAD)).rejects.toThrow(UnauthorizedException)
  })

  it('NO Staff pero Nova User activo → return payload (fallback Path 2)', async () => {
    const { strategy, prisma } = build({
      staff: null,
      user: { id: 'subject-id', isActive: true },
    })
    await expect(strategy.validate(PAYLOAD)).resolves.toEqual(PAYLOAD)
    expect(prisma.staff.findUnique).toHaveBeenCalled()
    expect(prisma.user.findUnique).toHaveBeenCalled() // fallback ejecutado
  })

  it('NO Staff y Nova User inactivo → UnauthorizedException', async () => {
    const { strategy } = build({
      staff: null,
      user: { id: 'subject-id', isActive: false },
    })
    await expect(strategy.validate(PAYLOAD)).rejects.toThrow(UnauthorizedException)
  })

  it('NI Staff NI User → UnauthorizedException', async () => {
    const { strategy } = build({ staff: null, user: null })
    await expect(strategy.validate(PAYLOAD)).rejects.toThrow(UnauthorizedException)
  })

  it('Staff activo prevalece sobre User (no consulta innecesaria)', async () => {
    const { strategy, prisma } = build({
      staff: { id: 'subject-id', active: true },
      user: { id: 'subject-id', isActive: false }, // si se consultara, fallaría
    })
    await expect(strategy.validate(PAYLOAD)).resolves.toEqual(PAYLOAD)
    expect(prisma.user.findUnique).not.toHaveBeenCalled()
  })
})
