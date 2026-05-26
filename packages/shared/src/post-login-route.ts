/**
 * post-login-route — pure routing decision used by login + session-expired bounce.
 *
 * Vive en @zenix/shared porque es pura TS sin deps web — y compartirla
 * permite tests con jest del apps/api workspace (donde el test runner está
 * configurado v1.0.0).
 *
 * Day 9 hotfix history:
 *   El bug original (PLATFORM_ADMIN → /dashboard → 401 → /login loop) se
 *   originaba en LoginPage que hardcodeaba '/dashboard'. Extraído aquí
 *   para que (a) el frontend lo use y (b) un test regression lo blinde.
 */
import type { ActorTier } from './types'

export interface PostLoginContext {
  tier: ActorTier | undefined
  returnTo?: string | null
}

/**
 * Devuelve la ruta a la que el usuario debe ir post-login.
 *
 * Matriz tier → fallback:
 *   PLATFORM | PARTNER_ADMIN | PARTNER_MEMBER | ORG_OWNER → /nova/clientes
 *   ORG_STAFF | undefined (legacy JWT)                     → /dashboard
 *
 * returnTo se respeta SI es coherente con el tier. Si no, fallback.
 * returnTo loopy (apunta a /login) se descarta — evita bounce infinito.
 */
export function postLoginRoute(ctx: PostLoginContext): string {
  const isNovaTier =
    ctx.tier === 'PLATFORM' ||
    ctx.tier === 'PARTNER_ADMIN' ||
    ctx.tier === 'PARTNER_MEMBER' ||
    ctx.tier === 'ORG_OWNER'

  const fallback = isNovaTier ? '/nova/clientes' : '/dashboard'

  if (!ctx.returnTo) return fallback
  // returnTo loop infinito (apunta a /login con cualquier query) — descartar
  if (ctx.returnTo.startsWith('/login')) return fallback
  // Coherence check tier × scope
  const returnIsNova = ctx.returnTo.startsWith('/nova')
  if (returnIsNova && !isNovaTier) return fallback
  if (!returnIsNova && isNovaTier) return fallback

  return ctx.returnTo
}
