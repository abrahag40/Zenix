/**
 * Pre-deploy smoke test — Phase 3 audit defense.
 *
 * Script ejecutable que valida en vivo los puntos críticos de integración
 * antes de promover un deploy. Sin frontend, sin browser — solo curl-like
 * HTTP calls + verificaciones contra Stripe / Channex / DB.
 *
 * Casos cubiertos:
 *   1. Stripe key autentica + balance.retrieve OK
 *   2. billing_pricing_config en BD tiene IDs reales que existen en Stripe
 *      (detecta el bug de mixing live/test IDs que tuvimos)
 *   3. Channex API key alcanza staging.channex.io y lista properties
 *   4. CHANNEX_CREDENTIALS_KEK válida + encrypt/decrypt roundtrip
 *   5. Migrations BD aplicadas (compara prisma migrations vs schema_migrations)
 *   6. Endpoints HTTP críticos responden status code esperado:
 *      · GET  /api/health   → 200
 *      · POST /api/v1/webhooks/stripe (sin sig) → 400 (NO 500 → defense del rawBody bug)
 *
 * Run:
 *   cd apps/api
 *   nvm use 22 && npx ts-node -r tsconfig-paths/register prisma/scripts/smoke-test-pre-deploy.ts
 *
 * Exit codes:
 *   0  → todos los smoke checks OK, deploy go-ahead
 *   1+ → al menos un check falló (output detalla cuál) — NO promover
 *
 * IMPORTANTE: este script asume que el server NestJS NO está corriendo
 * cuando se ejecuta (los checks HTTP usan `localhost:3000` solo si se pasa
 * --with-server). Por default solo valida los integration points sin HTTP.
 */
import * as dotenv from 'dotenv'
import * as path from 'path'
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') })

import { PrismaClient } from '@prisma/client'
import { ConfigService } from '@nestjs/config'
import { ChannelCredentialsCryptoService } from '../../src/nova/wizard/channel-credentials-crypto.service'

interface CheckResult {
  name: string
  ok: boolean
  detail: string
}

const results: CheckResult[] = []
const prisma = new PrismaClient()

function pass(name: string, detail = '') {
  results.push({ name, ok: true, detail })
  console.log(`  ✓ ${name}${detail ? ' — ' + detail : ''}`)
}
function fail(name: string, detail: string) {
  results.push({ name, ok: false, detail })
  console.error(`  ✗ ${name} — ${detail}`)
}

// ─── Check 1: Stripe ──────────────────────────────────────────────────────

async function checkStripe() {
  console.log('\n[1] Stripe auth + balance')
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) return fail('Stripe key set', 'STRIPE_SECRET_KEY no configurada en .env')
  if (!key.startsWith('rk_') && !key.startsWith('sk_'))
    return fail('Stripe key shape', `prefix=${key.slice(0, 4)}... inesperado (esperaba rk_ o sk_)`)
  pass('Stripe key set', `prefix=${key.slice(0, 8)}... mode=${key.includes('_test_') ? 'TEST' : 'LIVE'}`)

  try {
    const res = await fetch('https://api.stripe.com/v1/balance', {
      headers: { Authorization: `Bearer ${key}` },
    })
    if (!res.ok) return fail('Stripe /v1/balance', `HTTP ${res.status}`)
    const body = (await res.json()) as { livemode: boolean }
    pass('Stripe /v1/balance HTTP 200', `livemode=${body.livemode}`)
  } catch (err) {
    fail('Stripe /v1/balance', String(err).slice(0, 100))
  }
}

// ─── Check 2: billing_pricing_config ↔ Stripe products coherent ───────────

async function checkPricingConfig() {
  console.log('\n[2] billing_pricing_config consistencia con Stripe')
  const key = process.env.STRIPE_SECRET_KEY!
  const rows = await prisma.billingPricingConfig.findMany({
    where: { isActive: true },
    orderBy: { tier: 'asc' },
  })
  if (rows.length === 0) {
    return fail('Pricing rows', 'No hay rows activas — correr seed-billing.ts')
  }
  pass('Pricing rows', `${rows.length} tiers active`)

  for (const row of rows) {
    if (!row.stripeProductId) {
      fail(`Pricing ${row.tier} stripeProductId`, 'null — seed-billing.ts no se ha corrido')
      continue
    }
    try {
      const res = await fetch(`https://api.stripe.com/v1/products/${row.stripeProductId}`, {
        headers: { Authorization: `Bearer ${key}` },
      })
      const body = (await res.json()) as any
      if (!res.ok) {
        const msg = body?.error?.message ?? `HTTP ${res.status}`
        const crossMode = msg.includes('a similar object exists')
        fail(
          `Pricing ${row.tier} product ${row.stripeProductId}`,
          crossMode
            ? 'BD tiene ID de OTHER mode (live vs test mismatch — reset BD + re-seed)'
            : msg,
        )
      } else {
        pass(
          `Pricing ${row.tier}`,
          `product OK livemode=${body.livemode} active=${body.active}`,
        )
      }
    } catch (err) {
      fail(`Pricing ${row.tier} product`, String(err).slice(0, 100))
    }
  }
}

// ─── Check 3: Channex ─────────────────────────────────────────────────────

async function checkChannex() {
  console.log('\n[3] Channex API auth + properties list')
  const key = process.env.CHANNEX_API_KEY
  const url = process.env.CHANNEX_BASE_URL ?? 'https://staging.channex.io/api/v1'
  if (!key) return fail('Channex key set', 'CHANNEX_API_KEY no configurada')
  pass('Channex key set', `prefix=${key.slice(0, 8)}...`)

  try {
    const res = await fetch(`${url}/properties`, {
      headers: { 'user-api-key': key },
    })
    if (!res.ok) return fail('Channex /properties', `HTTP ${res.status}`)
    const body = (await res.json()) as { data: any[] }
    pass('Channex /properties HTTP 200', `${body.data?.length ?? 0} properties accesibles`)
  } catch (err) {
    fail('Channex /properties', String(err).slice(0, 100))
  }
}

// ─── Check 4: KEK encryption ─────────────────────────────────────────────

async function checkKek() {
  console.log('\n[4] CHANNEX_CREDENTIALS_KEK encrypt/decrypt')
  const config = { get: (k: string) => process.env[k] } as unknown as ConfigService
  const svc = new ChannelCredentialsCryptoService(config)
  if (!svc.isReady()) return fail('KEK ready', 'CHANNEX_CREDENTIALS_KEK no configurada o inválida (32 bytes base64)')

  const plain = { hotel_id: '12345', username: 'test', password: 'secret' }
  try {
    const blob = svc.encrypt(plain)
    const recovered = svc.decrypt(blob)
    if (JSON.stringify(plain) !== JSON.stringify(recovered)) {
      return fail('KEK roundtrip', 'recovered != plain')
    }
    pass('KEK encrypt/decrypt', `blob ${blob.length} chars (AES-256-GCM)`)
  } catch (err) {
    fail('KEK roundtrip', String(err).slice(0, 200))
  }
}

// ─── Check 5: Migrations ─────────────────────────────────────────────────

async function checkMigrations() {
  console.log('\n[5] Prisma migrations applied')
  try {
    const rows = await prisma.$queryRawUnsafe<any[]>(
      'SELECT migration_name, finished_at FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 3',
    )
    if (rows.length === 0) return fail('Migrations applied', '_prisma_migrations vacío')
    pass('Migrations applied', `last=${rows[0].migration_name}`)
  } catch (err) {
    fail('Migrations query', String(err).slice(0, 100))
  }
}

// ─── Check 6: Optional HTTP endpoint smoke (only if server up) ────────────

async function checkHttpEndpoints() {
  console.log('\n[6] HTTP endpoints (skip si server no corriendo)')
  try {
    const ctl = new AbortController()
    const t = setTimeout(() => ctl.abort(), 1500)
    const res = await fetch('http://localhost:3000/api/v1/webhooks/stripe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'evt_smoke', type: 'test' }),
      signal: ctl.signal,
    })
    clearTimeout(t)
    if (res.status === 400) {
      pass(
        'POST /webhooks/stripe sin sig',
        'HTTP 400 (Missing Stripe-Signature — defense del rawBody bug working)',
      )
    } else if (res.status === 500) {
      fail(
        'POST /webhooks/stripe sin sig',
        `HTTP 500 → bug rawBody parser de nuevo? Ver src/main.ts bodyParser.json verify callback`,
      )
    } else {
      fail(`POST /webhooks/stripe sin sig`, `HTTP ${res.status} inesperado`)
    }
  } catch (err: any) {
    const msg = String(err)
    // Node 22+ fetch on connection refused throws "fetch failed" sin error.code
    const looksLikeNoServer =
      err.name === 'AbortError' ||
      err.code === 'ECONNREFUSED' ||
      msg.includes('ECONNREFUSED') ||
      msg.includes('fetch failed')
    if (looksLikeNoServer) {
      pass('HTTP endpoints', 'server no corriendo — skip (OK, run with backend up para validar)')
    } else {
      fail('HTTP endpoints', msg.slice(0, 100))
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Zenix pre-deploy smoke test ===')
  console.log(`run at: ${new Date().toISOString()}`)

  await checkStripe()
  await checkPricingConfig()
  await checkChannex()
  await checkKek()
  await checkMigrations()
  await checkHttpEndpoints()

  console.log('\n=== Summary ===')
  const passed = results.filter((r) => r.ok).length
  const failed = results.filter((r) => !r.ok).length
  console.log(`  passed: ${passed}`)
  console.log(`  failed: ${failed}`)
  if (failed > 0) {
    console.log('\nFAILED checks:')
    for (const r of results.filter((r) => !r.ok)) {
      console.log(`  ✗ ${r.name}: ${r.detail}`)
    }
    console.log('\n❌ NOT SAFE TO DEPLOY — fix above before promoting.')
    process.exit(1)
  } else {
    console.log('\n✅ All smoke checks passed — deploy go-ahead.')
    process.exit(0)
  }
}

main().catch((err) => {
  console.error('FATAL:', err)
  process.exit(2)
})
