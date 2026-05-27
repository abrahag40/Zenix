/**
 * configure-customer-portal.ts — configuración programática del Stripe
 * Customer Portal alineada con la decisión arquitectónica de Zenix
 * (§D-BILL-9 Customer Portal embebido) + save offer flow (§D-BILL-5).
 *
 * Configuración aplicada:
 *   - Branding: headline "Zenix", privacy/terms URLs placeholders
 *   - Customer update: ENABLED (permite actualizar email, dirección, tax IDs)
 *   - Payment method update: ENABLED (permite cambiar tarjeta)
 *   - Invoice history: ENABLED (descarga PDFs Stripe)
 *   - Subscription cancel: DISABLED (cancelación pasa por save offers en Zenix)
 *   - Subscription update: DISABLED (cambios de plan vía Nova consultor)
 *   - Subscription pause: DISABLED (pausa vía save offer "cierre temporal")
 *   - Default return URL: app.zenix.com/settings/billing
 *
 * Idempotente: actualiza el config default si existe, crea uno nuevo si no.
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

  const ZENIX_PORTAL_CONFIG: any = {
    business_profile: {
      headline: 'Zenix — Hotelería Boutique LATAM',
      privacy_policy_url: 'https://zenix.com/privacy',
      terms_of_service_url: 'https://zenix.com/terms',
    },
    default_return_url: 'https://app.zenix.com/settings/billing',
    features: {
      // Cliente puede actualizar su info (email, address, tax IDs)
      customer_update: {
        enabled: true,
        allowed_updates: ['email', 'address', 'phone', 'tax_id'],
      },
      // Cliente puede actualizar tarjeta — CRÍTICO para dunning
      payment_method_update: { enabled: true },
      // Cliente puede ver + descargar invoices (PDFs hosted by Stripe)
      invoice_history: { enabled: true },
      // Cancel DISABLED — pasa por nuestro save offer flow
      subscription_cancel: { enabled: false },
      // Update DISABLED — cambios de plan los hace el consultor desde Nova
      subscription_update: { enabled: false },
    },
    metadata: {
      configured_by: 'zenix_configure_script',
      configured_at: new Date().toISOString(),
      sprint: 'BILLING-CORE',
    },
  }

  console.log('🔧 Configurando Customer Portal de Zenix...\n')

  // Buscar config default existente
  const existing = await stripe.billingPortal.configurations.list({ limit: 10 })
  const currentDefault = existing.data.find((c) => c.is_default)

  let config: any
  if (currentDefault) {
    console.log(`Actualizando config default existente: ${currentDefault.id}`)
    config = await stripe.billingPortal.configurations.update(
      currentDefault.id,
      ZENIX_PORTAL_CONFIG,
    )
    console.log('✓ Config actualizada')
  } else {
    console.log('Creando config nueva (no había default)')
    config = await stripe.billingPortal.configurations.create(ZENIX_PORTAL_CONFIG)
    console.log(`✓ Config creada: ${config.id}`)
  }

  console.log('\n📋 Configuración aplicada:\n')
  console.log(`  Config ID:           ${config.id}`)
  console.log(`  Active:              ${config.active ? '✅' : '❌'}`)
  console.log(`  Default:             ${config.is_default ? '✅' : '❌'}`)
  console.log(`  Headline:            ${config.business_profile?.headline}`)
  console.log(`  Privacy URL:         ${config.business_profile?.privacy_policy_url}`)
  console.log(`  Terms URL:           ${config.business_profile?.terms_of_service_url}`)
  console.log(`  Default return URL:  ${config.default_return_url}`)
  console.log('')
  console.log('  Features:')
  console.log(`    Customer update:     ${config.features.customer_update.enabled ? '✅ ENABLED' : '❌'}`)
  console.log(`    Payment methods:     ${config.features.payment_method_update.enabled ? '✅ ENABLED' : '❌'}`)
  console.log(`    Invoice history:     ${config.features.invoice_history.enabled ? '✅ ENABLED' : '❌'}`)
  console.log(`    Subscription cancel: ${config.features.subscription_cancel?.enabled ? '⚠️  ENABLED' : '✅ DISABLED (correcto — save offers en Zenix)'}`)
  console.log(`    Subscription update: ${config.features.subscription_update?.enabled ? '⚠️  ENABLED' : '✅ DISABLED (correcto — cambios via Nova consultor)'}`)

  console.log('\n✅ Customer Portal listo para BILLING-CORE save offer flow')
  console.log('\nNota: los URLs zenix.com/privacy y /terms son placeholders.')
  console.log('Cuando publiques el website, vuelve a correr este script con los URLs reales.')
}

main().catch((err) => {
  console.error('❌ Error:', err)
  process.exit(1)
})
