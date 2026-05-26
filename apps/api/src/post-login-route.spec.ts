/**
 * post-login-route — regression guard Day 9 hotfix.
 *
 * Vive físicamente en `apps/api/src` porque apps/web no tiene runner de
 * tests configurado (v1.0.0). La función bajo prueba vive en
 * @zenix/shared/post-login-route — pura TS sin deps web, así que es
 * agnóstica del workspace.
 *
 * Matriz que blinda:
 *
 *   tier=PLATFORM       returnTo=null              → /nova/clientes
 *   tier=PLATFORM       returnTo=/dashboard        → /nova/clientes (no /dashboard! bug original)
 *   tier=PLATFORM       returnTo=/nova/dashboard   → /nova/dashboard
 *   tier=PLATFORM       returnTo=/login?...        → /nova/clientes (loop break)
 *   tier=ORG_STAFF      returnTo=null              → /dashboard
 *   tier=ORG_STAFF      returnTo=/nova/clientes    → /dashboard (cliente no debe ver Nova)
 *   tier=undefined      returnTo=null              → /dashboard (legacy JWT)
 *   ...
 *
 * Bug original: PLATFORM sin returnTo iba a /dashboard hardcoded → 401 loop.
 */
import { postLoginRoute } from '@zenix/shared'

describe('postLoginRoute — Day 9 regression guard', () => {
  describe('sin returnTo → fallback per tier', () => {
    it('PLATFORM → /nova/clientes', () => {
      expect(postLoginRoute({ tier: 'PLATFORM' })).toBe('/nova/clientes')
    })
    it('PARTNER_ADMIN → /nova/clientes', () => {
      expect(postLoginRoute({ tier: 'PARTNER_ADMIN' })).toBe('/nova/clientes')
    })
    it('PARTNER_MEMBER → /nova/clientes', () => {
      expect(postLoginRoute({ tier: 'PARTNER_MEMBER' })).toBe('/nova/clientes')
    })
    it('ORG_OWNER → /nova/clientes', () => {
      expect(postLoginRoute({ tier: 'ORG_OWNER' })).toBe('/nova/clientes')
    })
    it('ORG_STAFF → /dashboard', () => {
      expect(postLoginRoute({ tier: 'ORG_STAFF' })).toBe('/dashboard')
    })
    it('tier undefined (legacy pre-Nova JWT) → /dashboard', () => {
      expect(postLoginRoute({ tier: undefined })).toBe('/dashboard')
    })
  })

  describe('returnTo coherente → respetar', () => {
    it('PLATFORM + /nova/dashboard → /nova/dashboard', () => {
      expect(postLoginRoute({ tier: 'PLATFORM', returnTo: '/nova/dashboard' })).toBe(
        '/nova/dashboard',
      )
    })
    it('PLATFORM + /nova/channex → /nova/channex', () => {
      expect(postLoginRoute({ tier: 'PLATFORM', returnTo: '/nova/channex' })).toBe(
        '/nova/channex',
      )
    })
    it('ORG_STAFF + /checkouts → /checkouts', () => {
      expect(postLoginRoute({ tier: 'ORG_STAFF', returnTo: '/checkouts' })).toBe('/checkouts')
    })
    it('ORG_STAFF + /rooms → /rooms', () => {
      expect(postLoginRoute({ tier: 'ORG_STAFF', returnTo: '/rooms' })).toBe('/rooms')
    })
  })

  describe('returnTo incoherente → fallback (anti-401-loop)', () => {
    it('🐛 BUG ORIGINAL: PLATFORM + /dashboard PMS → /nova/clientes (no /dashboard!)', () => {
      expect(postLoginRoute({ tier: 'PLATFORM', returnTo: '/dashboard' })).toBe('/nova/clientes')
    })
    it('PLATFORM + /rooms (PMS) → /nova/clientes', () => {
      expect(postLoginRoute({ tier: 'PLATFORM', returnTo: '/rooms' })).toBe('/nova/clientes')
    })
    it('ORG_STAFF + /nova/clientes → /dashboard (cliente fuera de Nova)', () => {
      expect(postLoginRoute({ tier: 'ORG_STAFF', returnTo: '/nova/clientes' })).toBe('/dashboard')
    })
    it('PARTNER_MEMBER + /dashboard → /nova/clientes', () => {
      expect(postLoginRoute({ tier: 'PARTNER_MEMBER', returnTo: '/dashboard' })).toBe(
        '/nova/clientes',
      )
    })
  })

  describe('returnTo loopy → fallback (anti-/login bounce)', () => {
    it('returnTo=/login con PLATFORM → /nova/clientes', () => {
      expect(postLoginRoute({ tier: 'PLATFORM', returnTo: '/login' })).toBe('/nova/clientes')
    })
    it('returnTo=/login con ORG_STAFF → /dashboard', () => {
      expect(postLoginRoute({ tier: 'ORG_STAFF', returnTo: '/login' })).toBe('/dashboard')
    })
    it('returnTo=/login?returnTo=%2Fnova%2Fclientes (nested loop) → fallback', () => {
      expect(
        postLoginRoute({
          tier: 'PLATFORM',
          returnTo: '/login?returnTo=%2Fnova%2Fclientes',
        }),
      ).toBe('/nova/clientes')
    })
  })

  describe('returnTo falsy variations', () => {
    it('null → fallback', () => {
      expect(postLoginRoute({ tier: 'PLATFORM', returnTo: null })).toBe('/nova/clientes')
    })
    it('undefined → fallback', () => {
      expect(postLoginRoute({ tier: 'PLATFORM', returnTo: undefined })).toBe('/nova/clientes')
    })
    it('"" empty string → fallback', () => {
      expect(postLoginRoute({ tier: 'PLATFORM', returnTo: '' })).toBe('/nova/clientes')
    })
  })
})
