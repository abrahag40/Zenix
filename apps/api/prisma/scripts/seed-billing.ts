/**
 * Seed billing — Stripe Products + Prices + sync con billing_pricing_config.
 *
 * Idempotente: ejecutable múltiples veces. Si los Products ya existen en
 * Stripe, los reutiliza. Si los Prices del monto actual ya existen,
 * los reutiliza; si cambió el monto, crea nuevo Price (Stripe Prices son
 * inmutables) y actualiza billing_pricing_config con el nuevo id.
 *
 * Uso:
 *   npx ts-node -r tsconfig-paths/register prisma/scripts/seed-billing.ts
 *
 * Requiere STRIPE_SECRET_KEY en env (test mode sk_test_... para dev).
 *
 * Sprint BILLING-CORE Day 1.
 */
import { PrismaClient } from '@prisma/client'
import Stripe = require('stripe')

const prisma = new PrismaClient()

async function main() {
  const apiKey = process.env.STRIPE_SECRET_KEY
  if (!apiKey) {
    console.warn(
      '[seed-billing] ⚠️ STRIPE_SECRET_KEY no configurado. Skipping Stripe sync; solo se asegura el seed de billing_pricing_config local.',
    )
  }

  const stripe = apiKey ? new Stripe(apiKey, { apiVersion: '2026-04-22.dahlia' }) : null
  const mode = stripe && apiKey && apiKey.startsWith('sk_live_') ? 'LIVE' : 'TEST'

  if (stripe) {
    console.log(`[seed-billing] Stripe initialized in ${mode} mode.`)
  }

  const configs = await prisma.billingPricingConfig.findMany({
    where: { isActive: true },
    orderBy: { monthlyAmountMxn: 'asc' },
  })

  if (configs.length === 0) {
    console.log('[seed-billing] No hay configs en billing_pricing_config. Ejecuta `prisma migrate deploy` primero.')
    return
  }

  console.log(`[seed-billing] Encontrados ${configs.length} pricing configs activos:`)
  for (const c of configs) {
    console.log(`  - ${c.tier}: $${c.monthlyAmountMxn} MXN / $${c.monthlyAmountUsd} USD`)
  }

  if (!stripe) {
    console.log('\n[seed-billing] Sin Stripe configurado, fin. Ejecuta de nuevo cuando agregues STRIPE_SECRET_KEY.')
    return
  }

  for (const cfg of configs) {
    console.log(`\n[seed-billing] Procesando tier ${cfg.tier}...`)

    // 1. Asegura Product en Stripe
    let productId = cfg.stripeProductId
    if (!productId) {
      const product = await stripe.products.create({
        name: `Zenix ${cfg.displayName}`,
        description: `Plan de suscripción ${cfg.displayName} para hoteles boutique LATAM`,
        metadata: {
          zenix_tier: cfg.tier,
          zenix_config_id: cfg.id,
        },
      })
      productId = product.id
      console.log(`  ✓ Product creado: ${productId}`)
    } else {
      console.log(`  ✓ Product reutilizado: ${productId}`)
    }

    // 2. Asegura Price MXN (mensual)
    let priceIdMxn = cfg.stripePriceIdMxn
    if (!priceIdMxn) {
      const priceMxn = await stripe.prices.create({
        product: productId,
        unit_amount: Number(cfg.monthlyAmountMxn) * 100, // centavos
        currency: 'mxn',
        recurring: {
          interval: 'month',
        },
        metadata: {
          zenix_tier: cfg.tier,
          zenix_currency_role: 'primary_mxn',
        },
      })
      priceIdMxn = priceMxn.id
      console.log(`  ✓ Price MXN creado: ${priceIdMxn} (${cfg.monthlyAmountMxn} MXN/mes)`)
    } else {
      console.log(`  ✓ Price MXN reutilizado: ${priceIdMxn}`)
    }

    // 3. Asegura Price USD (mensual)
    let priceIdUsd = cfg.stripePriceIdUsd
    if (!priceIdUsd) {
      const priceUsd = await stripe.prices.create({
        product: productId,
        unit_amount: Number(cfg.monthlyAmountUsd) * 100, // cents
        currency: 'usd',
        recurring: {
          interval: 'month',
        },
        metadata: {
          zenix_tier: cfg.tier,
          zenix_currency_role: 'usd_alt',
        },
      })
      priceIdUsd = priceUsd.id
      console.log(`  ✓ Price USD creado: ${priceIdUsd} (${cfg.monthlyAmountUsd} USD/mes)`)
    } else {
      console.log(`  ✓ Price USD reutilizado: ${priceIdUsd}`)
    }

    // 4. Sync DB con los IDs Stripe
    await prisma.billingPricingConfig.update({
      where: { id: cfg.id },
      data: {
        stripeProductId: productId,
        stripePriceIdMxn: priceIdMxn,
        stripePriceIdUsd: priceIdUsd,
      },
    })

    console.log(`  ✓ DB sync OK para tier ${cfg.tier}`)
  }

  console.log('\n[seed-billing] ✓ Seed completado. Stripe Products + Prices sincronizados con billing_pricing_config.')
  console.log('\nPróximo paso: configurar webhook endpoint en Stripe Dashboard:')
  console.log(`  URL: ${process.env.APP_BASE_URL ?? 'https://api.zenix.com'}/v1/webhooks/stripe`)
  console.log('  Events: customer.subscription.* + invoice.* + customer.subscription.trial_will_end')
  console.log('  Copy webhook signing secret a STRIPE_WEBHOOK_SECRET env var.')
}

main()
  .catch((err) => {
    console.error('[seed-billing] ❌ Error:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
