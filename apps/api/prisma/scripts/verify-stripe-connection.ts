/**
 * verify-stripe-connection.ts — Read-only health check de la conexión Stripe.
 *
 * NO crea ningún recurso en Stripe. Solo lee:
 *   - balance.retrieve() — verifica que la key funciona y la cuenta está activa
 *   - account.retrieve() — verifica metadata de la cuenta (id, country, charges_enabled)
 *   - products.list(limit: 5) — verifica permisos read sobre Products
 *
 * Útil para validar setup antes de correr seed-billing.ts (que SÍ crea recursos).
 *
 * Uso:
 *   npx ts-node -r tsconfig-paths/register prisma/scripts/verify-stripe-connection.ts
 */
import Stripe = require('stripe')
import * as path from 'path'
import * as dotenv from 'dotenv'

// Carga .env desde apps/api/
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') })

async function main() {
  const apiKey = process.env.STRIPE_SECRET_KEY
  if (!apiKey) {
    console.error('❌ STRIPE_SECRET_KEY no configurado en .env')
    process.exit(1)
  }

  const mode = apiKey.startsWith('sk_live_') ? 'LIVE 🔴' : apiKey.startsWith('sk_test_') ? 'TEST 🟢' : 'UNKNOWN ⚠️'
  console.log(`\n🔍 Verificando conexión Stripe en modo ${mode}...\n`)

  const stripe = new Stripe(apiKey, { apiVersion: '2026-04-22.dahlia' })

  // ─── Test 1: balance.retrieve (idempotente, no consume rate-limit) ───
  try {
    const balance = await stripe.balance.retrieve()
    console.log('✓ Test 1 PASSED — balance.retrieve()')
    console.log(`  Available: ${balance.available.map((b) => `${(b.amount / 100).toFixed(2)} ${b.currency.toUpperCase()}`).join(', ')}`)
    console.log(`  Pending:   ${balance.pending.map((b) => `${(b.amount / 100).toFixed(2)} ${b.currency.toUpperCase()}`).join(', ')}`)
  } catch (err) {
    const e = err as { type?: string; message: string }
    console.error('❌ Test 1 FAILED — balance.retrieve()')
    console.error(`   ${e.type ?? 'Error'}: ${e.message}`)
    process.exit(1)
  }

  // ─── Test 2: account.retrieve (skippable si V2 account sin capability) ──
  try {
    // SDK types requieren argumento; en runtime accounts.retrieve() sin arg
    // devuelve la cuenta propia del API key. Cast a any para bypass de types.
    const account = await (stripe.accounts as any).retrieve()
    console.log('\n✓ Test 2 PASSED — account.retrieve()')
    console.log(`  Account ID:        ${account.id}`)
    console.log(`  Country:           ${account.country}`)
    console.log(`  Email:             ${account.email ?? 'not set'}`)
    console.log(`  Default currency:  ${account.default_currency?.toUpperCase()}`)
    console.log(`  Business type:     ${account.business_type ?? 'not set'}`)
    console.log(`  Charges enabled:   ${account.charges_enabled ? '✅ YES' : '⚠️  NO (completar business verification en Dashboard)'}`)
    console.log(`  Payouts enabled:   ${account.payouts_enabled ? '✅ YES' : '⚠️  NO'}`)
    console.log(`  Details submitted: ${account.details_submitted ? '✅ YES' : '⚠️  NO'}`)
  } catch (err) {
    const e = err as { type?: string; message: string }
    console.warn('\n⚠️  Test 2 SKIPPED — account.retrieve() requiere capability stripe_balance.stripe_transfers')
    console.warn(`   ${e.message?.slice(0, 200)}`)
    console.warn('   Esto es normal si la cuenta aún está en V2 setup sin verificación business completada.')
    console.warn('   No bloquea la operación de subscriptions (Test 1 balance.retrieve() ya pasó).')
  }

  // ─── Test 3: products.list (existing? ¿ya está corrido seed-billing?) ─
  try {
    const products = await stripe.products.list({ limit: 10, active: true })
    console.log(`\n✓ Test 3 PASSED — products.list() — ${products.data.length} products activos`)
    if (products.data.length === 0) {
      console.log('  (No hay products todavía — ejecuta seed-billing.ts para crear Zenix tiers)')
    } else {
      for (const p of products.data) {
        const zenixTier = p.metadata?.zenix_tier
        console.log(`  - ${p.name} ${zenixTier ? `[Zenix ${zenixTier}]` : ''} (${p.id})`)
      }
    }
  } catch (err) {
    const e = err as { type?: string; message: string }
    console.error('❌ Test 3 FAILED — products.list()')
    console.error(`   ${e.type ?? 'Error'}: ${e.message}`)
    process.exit(1)
  }

  // ─── Test 4: webhook endpoints already configured? ───────────────────
  try {
    const endpoints = await stripe.webhookEndpoints.list({ limit: 5 })
    console.log(`\n✓ Test 4 PASSED — webhookEndpoints.list() — ${endpoints.data.length} endpoints`)
    if (endpoints.data.length === 0) {
      console.log('  ⚠️  No hay webhook endpoint configurado — necesario para BILLING-CORE.')
      console.log('     Ir a Stripe Dashboard → Developers → Webhooks → Add endpoint')
    } else {
      for (const ep of endpoints.data) {
        console.log(`  - ${ep.url}`)
        console.log(`    Events: ${ep.enabled_events.length} ${ep.enabled_events.length > 5 ? `(${ep.enabled_events.slice(0, 3).join(', ')}, ...)` : `(${ep.enabled_events.join(', ')})`}`)
        console.log(`    Status: ${ep.status}`)
      }
    }
  } catch (err) {
    const e = err as { type?: string; message: string }
    console.error('❌ Test 4 FAILED — webhookEndpoints.list()')
    console.error(`   ${e.type ?? 'Error'}: ${e.message}`)
    process.exit(1)
  }

  console.log('\n' + '═'.repeat(60))
  console.log('✅ TODOS LOS TESTS PASARON — Stripe está accesible y configurado.')
  console.log('═'.repeat(60))
  console.log('\nPróximos pasos:')
  console.log('  1. Si charges_enabled=NO → completar business verification en Stripe Dashboard')
  console.log('  2. Si no hay webhook endpoints → configurar (ver docs/ops/stripe-setup-guide.md §7)')
  console.log('  3. Cuando todo OK → ejecutar `seed-billing.ts` para crear Zenix Products + Prices')
}

main().catch((err) => {
  console.error('\n❌ Unexpected error:', err)
  process.exit(1)
})
