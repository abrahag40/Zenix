/**
 * Sprint NOVA-CHANNEX-COMMAND-CENTER — Day 3 (§170 D-NOVA-12).
 *
 * NovaActingOrgGuard — unit tests con Reflector mock + request mock.
 */
import { ExecutionContext, ForbiddenException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { NovaActingOrgGuard, ACTING_ORG_HEADER } from './nova-acting-org.guard'

function makeContext(opts: {
  required: boolean
  user?: any
  headers?: Record<string, string>
}): ExecutionContext {
  const req: any = {
    user: opts.user,
    headers: opts.headers ?? {},
  }
  return {
    switchToHttp: () => ({
      getRequest: () => req,
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as any
}

function makeGuard(required: boolean): { guard: NovaActingOrgGuard; reflector: Reflector } {
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(required),
  } as any
  const guard = new NovaActingOrgGuard(reflector)
  return { guard, reflector }
}

describe('NovaActingOrgGuard', () => {
  // ── 1. Endpoint sin @RequireActingOrg() → permite todo ───────────────────

  it('endpoint sin @RequireActingOrg() siempre permite', () => {
    const { guard } = makeGuard(false)
    const ctx = makeContext({ required: false })
    expect(guard.canActivate(ctx)).toBe(true)
  })

  // ── 2. Sin autenticación → ForbiddenException ────────────────────────────

  it('sin actor en request → ForbiddenException', () => {
    const { guard } = makeGuard(true)
    const ctx = makeContext({ required: true, user: undefined })
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException)
    expect(() => guard.canActivate(ctx)).toThrow(/No autenticado/)
  })

  // ── 3. ORG_OWNER / ORG_STAFF — header ignorado ──────────────────────────

  it('ORG_OWNER ignora header (organizationId del JWT)', () => {
    const { guard } = makeGuard(true)
    const ctx = makeContext({
      required: true,
      user: { sub: 'user-1', actorTier: 'ORG_OWNER', organizationId: 'org-1' },
    })
    expect(guard.canActivate(ctx)).toBe(true)
  })

  it('ORG_STAFF (default sin actorTier) ignora header', () => {
    const { guard } = makeGuard(true)
    const ctx = makeContext({
      required: true,
      user: { sub: 'staff-1' }, // actorTier ausente → default ORG_STAFF
    })
    expect(guard.canActivate(ctx)).toBe(true)
  })

  // ── 4. PLATFORM_ADMIN — header opcional ────────────────────────────────

  it('PLATFORM_ADMIN sin header → permite (cross-tenant queries)', () => {
    const { guard } = makeGuard(true)
    const ctx = makeContext({
      required: true,
      user: { sub: 'zahardev-1', actorTier: 'PLATFORM' },
    })
    expect(guard.canActivate(ctx)).toBe(true)
  })

  it('PLATFORM_ADMIN con header válido → setea req.actingOrgId', () => {
    const { guard } = makeGuard(true)
    const req: any = {
      user: { sub: 'zahardev-1', actorTier: 'PLATFORM' },
      headers: { [ACTING_ORG_HEADER]: 'org-target' },
    }
    const ctx = {
      switchToHttp: () => ({ getRequest: () => req }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as any
    expect(guard.canActivate(ctx)).toBe(true)
    expect(req.actingOrgId).toBe('org-target')
  })

  // ── 5. PARTNER_MEMBER — header REQUERIDO + validación ──────────────────

  it('PARTNER_MEMBER sin header → ForbiddenException', () => {
    const { guard } = makeGuard(true)
    const ctx = makeContext({
      required: true,
      user: {
        sub: 'consultor-1',
        actorTier: 'PARTNER_MEMBER',
        assignedOrgIds: ['org-1', 'org-2'],
      },
    })
    expect(() => guard.canActivate(ctx)).toThrow(/Falta header X-Acting-Organization-Id/)
  })

  it('PARTNER_MEMBER con header fuera de assignedOrgIds → ForbiddenException', () => {
    const { guard } = makeGuard(true)
    const ctx = makeContext({
      required: true,
      user: {
        sub: 'consultor-1',
        actorTier: 'PARTNER_MEMBER',
        assignedOrgIds: ['org-1', 'org-2'],
      },
      headers: { [ACTING_ORG_HEADER]: 'org-OTHER' },
    })
    expect(() => guard.canActivate(ctx)).toThrow(/No tienes asignación/)
  })

  it('PARTNER_MEMBER con header válido → permite + setea actingOrgId', () => {
    const { guard } = makeGuard(true)
    const req: any = {
      user: {
        sub: 'consultor-1',
        actorTier: 'PARTNER_MEMBER',
        assignedOrgIds: ['org-1', 'org-2'],
      },
      headers: { [ACTING_ORG_HEADER]: 'org-1' },
    }
    const ctx = {
      switchToHttp: () => ({ getRequest: () => req }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as any
    expect(guard.canActivate(ctx)).toBe(true)
    expect(req.actingOrgId).toBe('org-1')
  })

  it('PARTNER_MEMBER con assignedOrgIds=undefined (>20 overflow) → Forbidden (Phase 2 pendiente)', () => {
    const { guard } = makeGuard(true)
    const ctx = makeContext({
      required: true,
      user: {
        sub: 'consultor-with-overflow',
        actorTier: 'PARTNER_MEMBER',
        // assignedOrgIds: undefined (overflow > 20)
      },
      headers: { [ACTING_ORG_HEADER]: 'org-1' },
    })
    expect(() => guard.canActivate(ctx)).toThrow(/Phase 2/)
  })

  // ── 6. PARTNER_ADMIN — mismo enforcement que PARTNER_MEMBER ────────────

  it('PARTNER_ADMIN sin header → ForbiddenException', () => {
    const { guard } = makeGuard(true)
    const ctx = makeContext({
      required: true,
      user: {
        sub: 'firm-admin-1',
        actorTier: 'PARTNER_ADMIN',
        assignedOrgIds: ['org-1', 'org-2'],
      },
    })
    expect(() => guard.canActivate(ctx)).toThrow(/Falta header/)
  })

  it('PARTNER_ADMIN con header válido → permite', () => {
    const { guard } = makeGuard(true)
    const req: any = {
      user: {
        sub: 'firm-admin-1',
        actorTier: 'PARTNER_ADMIN',
        assignedOrgIds: ['org-1', 'org-2'],
      },
      headers: { [ACTING_ORG_HEADER]: 'org-2' },
    }
    const ctx = {
      switchToHttp: () => ({ getRequest: () => req }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as any
    expect(guard.canActivate(ctx)).toBe(true)
    expect(req.actingOrgId).toBe('org-2')
  })
})
