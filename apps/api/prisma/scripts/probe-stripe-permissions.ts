/**
 * probe-stripe-permissions.ts — mapea TODO lo que la API key puede/no puede hacer.
 *
 * Útil para Restricted Keys (rk_live_*) que tienen scopes específicos
 * configurados al momento de crearlas. Este script intenta ~30 operaciones
 * read y ~15 write (con cleanup) y reporta para cada una si la key tiene
 * permiso o no.
 *
 * Para operaciones write usa `metadata: { zenix_probe: 'true' }` para
 * identificar los objetos creados durante el probe y permitir cleanup.
 *
 * Uso:
 *   npx ts-node -r tsconfig-paths/register prisma/scripts/probe-stripe-permissions.ts
 *
 * Modos:
 *   READ_ONLY=true (default) → solo prueba operaciones de lectura
 *   READ_ONLY=false          → también prueba write + auto-cleanup
 */
import Stripe = require('stripe')
import * as path from 'path'
import * as dotenv from 'dotenv'

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') })

const READ_ONLY = process.env.READ_ONLY !== 'false'

interface ProbeResult {
  scope: string
  operation: string
  permitted: boolean
  errorCode?: string
  errorMessage?: string
  data?: string
}

const results: ProbeResult[] = []

function logResult(scope: string, op: string, permitted: boolean, info?: { errorCode?: string; errorMessage?: string; data?: string }) {
  results.push({ scope, operation: op, permitted, ...info })
  const icon = permitted ? '✅' : '❌'
  const detail = permitted ? info?.data ?? '' : `${info?.errorCode ?? 'error'}: ${(info?.errorMessage ?? '').slice(0, 80)}`
  console.log(`  ${icon} ${scope.padEnd(20)} ${op.padEnd(30)} ${detail}`)
}

async function tryOp(scope: string, op: string, fn: () => Promise<string>) {
  try {
    const data = await fn()
    logResult(scope, op, true, { data })
  } catch (err) {
    const e = err as { type?: string; code?: string; message?: string }
    // Stripe usa código `permission_error` para denied scopes
    if (e.type === 'StripeInvalidRequestError' && (e.message?.includes('permission') || e.message?.includes('not authorized'))) {
      logResult(scope, op, false, { errorCode: 'permission_denied', errorMessage: e.message })
    } else {
      logResult(scope, op, false, { errorCode: e.type ?? 'unknown', errorMessage: e.message })
    }
  }
}

async function main() {
  const apiKey = process.env.STRIPE_SECRET_KEY
  if (!apiKey) {
    console.error('❌ STRIPE_SECRET_KEY no configurado')
    process.exit(1)
  }

  const mode = apiKey.startsWith('sk_live_')
    ? 'SECRET LIVE 🔴'
    : apiKey.startsWith('sk_test_')
      ? 'SECRET TEST 🟢'
      : apiKey.startsWith('rk_live_')
        ? 'RESTRICTED LIVE 🔵 (recomendado para agentes)'
        : apiKey.startsWith('rk_test_')
          ? 'RESTRICTED TEST 🟢'
          : 'UNKNOWN ⚠️'
  console.log(`\n🔍 Probing Stripe API key — modo: ${mode}\n`)
  console.log(`READ_ONLY mode: ${READ_ONLY ? 'YES (no escribirá nada)' : 'NO (probará writes con cleanup)'}\n`)

  const stripe = new Stripe(apiKey, { apiVersion: '2026-04-22.dahlia' })

  // ─── READ permissions ─────────────────────────────────────────────
  console.log('─── READ permissions ──────────────────────────────────────────────')

  await tryOp('balance', 'retrieve', async () => {
    const b = await stripe.balance.retrieve()
    return `${b.available.length} currencies disponibles`
  })

  await tryOp('account', 'retrieve', async () => {
    const a = await (stripe.accounts as any).retrieve()
    return `${a.country} ${a.default_currency?.toUpperCase()}`
  })

  await tryOp('customers', 'list', async () => {
    const r = await stripe.customers.list({ limit: 1 })
    return `${r.data.length} en sample`
  })

  await tryOp('products', 'list', async () => {
    const r = await stripe.products.list({ limit: 5 })
    return `${r.data.length} products`
  })

  await tryOp('prices', 'list', async () => {
    const r = await stripe.prices.list({ limit: 5 })
    return `${r.data.length} prices`
  })

  await tryOp('subscriptions', 'list', async () => {
    const r = await stripe.subscriptions.list({ limit: 1 })
    return `${r.data.length} subscriptions`
  })

  await tryOp('invoices', 'list', async () => {
    const r = await stripe.invoices.list({ limit: 1 })
    return `${r.data.length} invoices`
  })

  await tryOp('payment_intents', 'list', async () => {
    const r = await stripe.paymentIntents.list({ limit: 1 })
    return `${r.data.length} PIs`
  })

  await tryOp('charges', 'list', async () => {
    const r = await stripe.charges.list({ limit: 1 })
    return `${r.data.length} charges`
  })

  await tryOp('refunds', 'list', async () => {
    const r = await stripe.refunds.list({ limit: 1 })
    return `${r.data.length} refunds`
  })

  await tryOp('payouts', 'list', async () => {
    const r = await stripe.payouts.list({ limit: 1 })
    return `${r.data.length} payouts`
  })

  await tryOp('disputes', 'list', async () => {
    const r = await stripe.disputes.list({ limit: 1 })
    return `${r.data.length} disputes`
  })

  await tryOp('coupons', 'list', async () => {
    const r = await stripe.coupons.list({ limit: 1 })
    return `${r.data.length} coupons`
  })

  await tryOp('promotion_codes', 'list', async () => {
    const r = await stripe.promotionCodes.list({ limit: 1 })
    return `${r.data.length} promos`
  })

  await tryOp('webhook_endpoints', 'list', async () => {
    const r = await stripe.webhookEndpoints.list({ limit: 5 })
    return `${r.data.length} endpoints`
  })

  await tryOp('events', 'list', async () => {
    const r = await stripe.events.list({ limit: 1 })
    return `${r.data.length} events`
  })

  await tryOp('payment_methods', 'list', async () => {
    // Requiere customer ID — usamos one que probablemente no exista
    const r = await stripe.paymentMethods.list({ limit: 1, type: 'card' as any })
    return `${r.data.length} PMs`
  })

  await tryOp('files', 'list', async () => {
    const r = await stripe.files.list({ limit: 1 })
    return `${r.data.length} files`
  })

  await tryOp('tax_rates', 'list', async () => {
    const r = await stripe.taxRates.list({ limit: 1 })
    return `${r.data.length} tax rates`
  })

  await tryOp('reporting', 'list', async () => {
    const r = await (stripe as any).reporting.reportTypes.list({ limit: 1 })
    return `${r.data.length} report types`
  })

  await tryOp('checkout.sessions', 'list', async () => {
    const r = await stripe.checkout.sessions.list({ limit: 1 })
    return `${r.data.length} checkouts`
  })

  await tryOp('billing_portal', 'configurations.list', async () => {
    const r = await stripe.billingPortal.configurations.list({ limit: 1 })
    return `${r.data.length} portal configs`
  })

  // ─── WRITE permissions (idempotent + cleanup) ──────────────────────
  if (!READ_ONLY) {
    console.log('\n─── WRITE permissions (creating + cleanup) ──────────────────────')

    let testCustomerId: string | null = null

    await tryOp('customers', 'create', async () => {
      const c = await stripe.customers.create({
        email: 'probe-test@zenix.com',
        name: 'PROBE — borrar',
        metadata: { zenix_probe: 'true', created_at: new Date().toISOString() },
      })
      testCustomerId = c.id
      return c.id
    })

    let testProductId: string | null = null
    await tryOp('products', 'create', async () => {
      const p = await stripe.products.create({
        name: 'PROBE — borrar',
        metadata: { zenix_probe: 'true' },
      })
      testProductId = p.id
      return p.id
    })

    let testPriceId: string | null = null
    if (testProductId) {
      await tryOp('prices', 'create', async () => {
        const p = await stripe.prices.create({
          product: testProductId!,
          unit_amount: 100,
          currency: 'mxn',
          recurring: { interval: 'month' },
          metadata: { zenix_probe: 'true' },
        })
        testPriceId = p.id
        return p.id
      })
    }

    let testCouponId: string | null = null
    await tryOp('coupons', 'create', async () => {
      const c = await stripe.coupons.create({
        percent_off: 50,
        duration: 'once',
        metadata: { zenix_probe: 'true' },
      })
      testCouponId = c.id
      return c.id
    })

    let testPromoId: string | null = null
    if (testCouponId) {
      await tryOp('promotion_codes', 'create', async () => {
        const p = await (stripe.promotionCodes as any).create({
          coupon: testCouponId!,
          code: `PROBE-${Date.now()}`,
          max_redemptions: 1,
          metadata: { zenix_probe: 'true' },
        })
        testPromoId = p.id
        return p.id
      })
    }

    let testSubId: string | null = null
    if (testCustomerId && testPriceId) {
      await tryOp('subscriptions', 'create', async () => {
        const s = await stripe.subscriptions.create({
          customer: testCustomerId!,
          items: [{ price: testPriceId!, quantity: 1 }],
          trial_period_days: 1,
          metadata: { zenix_probe: 'true' },
        })
        testSubId = s.id
        return s.id
      })

      if (testSubId) {
        await tryOp('subscriptions', 'update', async () => {
          const s = await stripe.subscriptions.update(testSubId!, {
            metadata: { zenix_probe: 'true', updated: 'true' },
          })
          return `metadata updated`
        })

        await tryOp('subscriptions', 'cancel', async () => {
          await stripe.subscriptions.cancel(testSubId!)
          return 'cancelled'
        })
      }
    }

    let testWebhookId: string | null = null
    await tryOp('webhook_endpoints', 'create', async () => {
      const w = await stripe.webhookEndpoints.create({
        url: 'https://example.com/probe-webhook-do-not-use',
        enabled_events: ['invoice.created'],
        description: 'PROBE — borrar',
        metadata: { zenix_probe: 'true' },
      })
      testWebhookId = w.id
      return w.id
    })

    await tryOp('billing_portal', 'configurations.create', async () => {
      const c = await stripe.billingPortal.configurations.create({
        business_profile: {
          headline: 'PROBE',
        },
        features: {
          payment_method_update: { enabled: true },
        },
        metadata: { zenix_probe: 'true' },
      })
      return c.id
    })

    // ─── CLEANUP ─────────────────────────────────────────────────────
    console.log('\n─── Cleanup de objetos creados durante probe ──────────────────')
    let cleaned = 0
    let cleanFailed = 0
    const cleanups: Array<{ name: string; fn: () => Promise<void> }> = []

    if (testCustomerId) {
      cleanups.push({
        name: 'customer',
        fn: async () => {
          await stripe.customers.del(testCustomerId!)
        },
      })
    }
    if (testProductId) {
      cleanups.push({
        name: 'product (archive)',
        fn: async () => {
          await stripe.products.update(testProductId!, { active: false })
        },
      })
    }
    if (testCouponId) {
      cleanups.push({
        name: 'coupon',
        fn: async () => {
          await stripe.coupons.del(testCouponId!)
        },
      })
    }
    if (testPromoId) {
      cleanups.push({
        name: 'promotion code (deactivate)',
        fn: async () => {
          await stripe.promotionCodes.update(testPromoId!, { active: false })
        },
      })
    }
    if (testWebhookId) {
      cleanups.push({
        name: 'webhook endpoint',
        fn: async () => {
          await stripe.webhookEndpoints.del(testWebhookId!)
        },
      })
    }

    for (const c of cleanups) {
      try {
        await c.fn()
        console.log(`  ✓ ${c.name} cleaned`)
        cleaned++
      } catch (err) {
        console.log(`  ❌ ${c.name} cleanup failed: ${(err as Error).message?.slice(0, 80)}`)
        cleanFailed++
      }
    }
    console.log(`\n  Cleanup: ${cleaned} OK, ${cleanFailed} failed`)
  }

  // ─── REPORTE FINAL ─────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(70))
  console.log('REPORTE FINAL — capabilities de esta API key')
  console.log('═'.repeat(70))

  const byScope: Record<string, { read: boolean[]; write: boolean[] }> = {}
  for (const r of results) {
    if (!byScope[r.scope]) byScope[r.scope] = { read: [], write: [] }
    const isWrite = !['retrieve', 'list', 'configurations.list'].includes(r.operation)
    if (isWrite) byScope[r.scope].write.push(r.permitted)
    else byScope[r.scope].read.push(r.permitted)
  }

  console.log('\nResource          READ                WRITE')
  console.log('─'.repeat(70))
  for (const [scope, ops] of Object.entries(byScope).sort()) {
    const readSym = ops.read.length === 0 ? '—  no tested' : ops.read.every((v) => v) ? '✅ permitted ' : '❌ denied    '
    const writeSym =
      ops.write.length === 0
        ? READ_ONLY
          ? '—  read-only mode'
          : '—  no tested'
        : ops.write.every((v) => v)
          ? '✅ permitted'
          : '❌ denied'
    console.log(`  ${scope.padEnd(18)} ${readSym}        ${writeSym}`)
  }

  const totalPermitted = results.filter((r) => r.permitted).length
  const totalDenied = results.filter((r) => !r.permitted).length
  console.log('\n' + '─'.repeat(70))
  console.log(`Total: ${totalPermitted} permitted · ${totalDenied} denied · ${results.length} tests`)
  console.log('─'.repeat(70))

  console.log('\nLeyenda:')
  console.log('  ✅ permitted = la API key tiene este permiso')
  console.log('  ❌ denied    = la API key NO tiene este permiso (configurar en Stripe Dashboard)')
  console.log('  —  no tested = no se probó (read-only mode o dependency falló)')

  if (READ_ONLY) {
    console.log('\nPara probar también permisos de WRITE, ejecuta:')
    console.log('  READ_ONLY=false npx ts-node -r tsconfig-paths/register prisma/scripts/probe-stripe-permissions.ts')
  }
}

main().catch((err) => {
  console.error('\n❌ Probe falló inesperadamente:', err)
  process.exit(1)
})
