/**
 * verify-customer-portal.ts — read-only check de la configuración del
 * Stripe Customer Portal.
 *
 * Valida que el portal está configurado correctamente para que el flow
 * de cancelación de Zenix funcione (cancel DISABLED en Portal porque
 * nosotros manejamos cancel con save offers en /settings/billing).
 */
import Stripe = require('stripe')
import * as path from 'path'
import * as dotenv from 'dotenv'

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') })

async function main() {
  const apiKey = process.env.STRIPE_SECRET_KEY
  if (!apiKey) {
    console.error('❌ STRIPE_SECRET_KEY no configurado')
    process.exit(1)
  }
  const stripe = new Stripe(apiKey, { apiVersion: '2026-04-22.dahlia' })

  console.log('🔍 Verificando Customer Portal config...\n')

  const configs = await stripe.billingPortal.configurations.list({ limit: 10 })

  if (configs.data.length === 0) {
    console.log('❌ NO HAY configuración del Customer Portal.')
    console.log('   El cliente no podrá actualizar tarjeta, ver invoices, etc.')
    console.log('   Ir a Stripe Dashboard → Settings → Billing → Customer Portal')
    process.exit(1)
  }

  for (const cfg of configs.data) {
    const isDefault = cfg.is_default
    console.log(`Config ${cfg.id} ${isDefault ? '⭐ DEFAULT' : ''}`)
    console.log(`  Created: ${new Date(cfg.created * 1000).toISOString()}`)
    console.log(`  Active:  ${cfg.active}`)

    console.log('\n  Features:')
    console.log(`    Customer update:     ${cfg.features.customer_update.enabled ? '✅' : '❌'}`)
    console.log(`    Payment methods:     ${cfg.features.payment_method_update.enabled ? '✅' : '❌'}`)
    console.log(`    Invoice history:     ${cfg.features.invoice_history.enabled ? '✅' : '❌'}`)
    console.log(`    Subscription cancel: ${cfg.features.subscription_cancel?.enabled ? '⚠️  ENABLED (debería estar DISABLED)' : '✅ DISABLED'}`)
    console.log(`    Subscription update: ${cfg.features.subscription_update?.enabled ? '⚠️  ENABLED (debería estar DISABLED)' : '✅ DISABLED'}`)
    console.log(`    Subscription pause:  ${(cfg.features as any).subscription_pause?.enabled ? '⚠️  ENABLED (debería estar DISABLED)' : '✅ DISABLED'}`)

    console.log('\n  Business profile:')
    console.log(`    Headline:    ${cfg.business_profile?.headline ?? '(sin headline)'}`)
    console.log(`    Privacy URL: ${cfg.business_profile?.privacy_policy_url ?? '(no configurado)'}`)
    console.log(`    Terms URL:   ${cfg.business_profile?.terms_of_service_url ?? '(no configurado)'}`)

    console.log('\n  Default return URL:')
    console.log(`    ${cfg.default_return_url ?? '(no configurado — usa per-session url)'}`)
  }

  console.log('\n═══════════════════════════════════════════════════════════════')

  // Recomendaciones para Zenix
  const defaultCfg = configs.data.find((c) => c.is_default) ?? configs.data[0]
  const issues: string[] = []
  if (defaultCfg.features.subscription_cancel?.enabled) {
    issues.push('⚠️  subscription_cancel ENABLED → cliente puede cancelar bypass de save offer flow')
  }
  if (defaultCfg.features.subscription_update?.enabled) {
    issues.push('⚠️  subscription_update ENABLED → cliente puede cambiar plan bypass del consultor')
  }
  if ((defaultCfg.features as any).subscription_pause?.enabled) {
    issues.push('⚠️  subscription_pause ENABLED → cliente puede pausar bypass del save offer "pause" branch')
  }
  if (!defaultCfg.business_profile?.privacy_policy_url) {
    issues.push('⚠️  Privacy policy URL no configurada')
  }
  if (!defaultCfg.business_profile?.terms_of_service_url) {
    issues.push('⚠️  Terms of service URL no configurada')
  }

  if (issues.length === 0) {
    console.log('✅ Configuración Portal OK — listo para BILLING-CORE save offer flow')
  } else {
    console.log('⚠️  Recomendaciones de ajuste:\n')
    for (const i of issues) {
      console.log(`  ${i}`)
    }
    console.log('\nIr a Stripe Dashboard → Settings → Billing → Customer Portal → Customize')
  }
}

main().catch((err) => {
  console.error('Error:', err)
  process.exit(1)
})
