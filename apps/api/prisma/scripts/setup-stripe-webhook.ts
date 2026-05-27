/**
 * setup-stripe-webhook.ts — crea (o actualiza) el webhook endpoint Stripe
 * apuntando a la URL pasada como arg, captura el signing secret, y lo
 * persiste a .env automáticamente.
 *
 * Uso:
 *   npx ts-node -r tsconfig-paths/register prisma/scripts/setup-stripe-webhook.ts <URL>
 *
 * Ejemplo (dev con ngrok):
 *   npx ts-node ... prisma/scripts/setup-stripe-webhook.ts https://xxx.ngrok-free.dev
 *
 * Idempotente: si ya hay un webhook endpoint con tag metadata.zenix='true',
 * lo actualiza con la nueva URL en lugar de crear uno nuevo.
 */
import Stripe = require('stripe')
import * as fs from 'fs'
import * as path from 'path'
import * as dotenv from 'dotenv'

const ENV_PATH = path.join(__dirname, '..', '..', '.env')
dotenv.config({ path: ENV_PATH })

const ZENIX_EVENTS = [
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'customer.subscription.resumed',
  'customer.subscription.trial_will_end',
  'invoice.created',
  'invoice.finalized',
  'invoice.paid',
  'invoice.payment_failed',
  'invoice.payment_action_required',
  'invoice.voided',
]

async function main() {
  const baseUrl = process.argv[2]
  if (!baseUrl) {
    console.error('❌ Uso: setup-stripe-webhook.ts <URL_PUBLICA_HTTPS>')
    process.exit(1)
  }
  if (!baseUrl.startsWith('https://')) {
    console.error('❌ URL debe ser HTTPS (Stripe lo exige)')
    process.exit(1)
  }
  const endpointUrl = `${baseUrl.replace(/\/$/, '')}/api/v1/webhooks/stripe`

  const apiKey = process.env.STRIPE_SECRET_KEY
  if (!apiKey) {
    console.error('❌ STRIPE_SECRET_KEY no configurado')
    process.exit(1)
  }
  const stripe = new Stripe(apiKey, { apiVersion: '2026-04-22.dahlia' })

  console.log(`🔧 Configurando webhook endpoint Stripe → ${endpointUrl}\n`)

  // Buscar endpoint existente con tag zenix
  const existing = await stripe.webhookEndpoints.list({ limit: 100 })
  const zenixEndpoint = existing.data.find((e) => e.metadata?.zenix === 'true')

  let endpoint
  let signingSecret: string | undefined

  if (zenixEndpoint) {
    console.log(`Actualizando endpoint existente: ${zenixEndpoint.id}`)
    console.log(`  URL vieja: ${zenixEndpoint.url}`)
    console.log(`  URL nueva: ${endpointUrl}`)
    endpoint = await stripe.webhookEndpoints.update(zenixEndpoint.id, {
      url: endpointUrl,
      enabled_events: ZENIX_EVENTS as any,
      description: 'Zenix BILLING-CORE webhook handler',
      disabled: false,
    } as any)
    // Update no devuelve el signing secret — leer del .env si ya estaba
    signingSecret = process.env.STRIPE_WEBHOOK_SECRET || undefined
    if (!signingSecret) {
      console.log('\n⚠️  Endpoint actualizado pero STRIPE_WEBHOOK_SECRET no estaba en .env.')
      console.log('    Stripe NO devuelve signing secrets de endpoints existentes vía API.')
      console.log('    Opciones:')
      console.log('    1. Eliminar este endpoint y dejar que el script lo recree (NUEVA secret)')
      console.log('    2. Ir a Stripe Dashboard → Webhooks → este endpoint → "Reveal" → copiar manual')
      console.log('\n    Eliminando + recreando ahora para automatizar...')

      await stripe.webhookEndpoints.del(zenixEndpoint.id)
      console.log('  ✓ Endpoint viejo eliminado')

      endpoint = await stripe.webhookEndpoints.create({
        url: endpointUrl,
        enabled_events: ZENIX_EVENTS as any,
        description: 'Zenix BILLING-CORE webhook handler',
        metadata: { zenix: 'true', created_by: 'setup-stripe-webhook.ts' },
      } as any)
      signingSecret = endpoint.secret
      console.log(`  ✓ Endpoint recreado: ${endpoint.id}`)
    }
  } else {
    console.log('Creando endpoint nuevo (no había uno con tag zenix)')
    endpoint = await stripe.webhookEndpoints.create({
      url: endpointUrl,
      enabled_events: ZENIX_EVENTS as any,
      description: 'Zenix BILLING-CORE webhook handler',
      metadata: { zenix: 'true', created_by: 'setup-stripe-webhook.ts' },
    } as any)
    signingSecret = endpoint.secret
    console.log(`✓ Endpoint creado: ${endpoint.id}`)
  }

  console.log('\n📋 Webhook endpoint config:')
  console.log(`  ID:        ${endpoint.id}`)
  console.log(`  URL:       ${endpoint.url}`)
  console.log(`  Status:    ${endpoint.status}`)
  console.log(`  Events:    ${endpoint.enabled_events.length} configurados`)
  console.log(`  Secret:    ${signingSecret ? signingSecret.slice(0, 12) + '...' + signingSecret.slice(-4) : '(no disponible)'}`)

  // Actualizar .env
  if (signingSecret) {
    const envContent = fs.readFileSync(ENV_PATH, 'utf-8')
    const updated = envContent.includes('STRIPE_WEBHOOK_SECRET=')
      ? envContent.replace(/STRIPE_WEBHOOK_SECRET="[^"]*"/, `STRIPE_WEBHOOK_SECRET="${signingSecret}"`)
      : envContent + `\nSTRIPE_WEBHOOK_SECRET="${signingSecret}"\n`
    fs.writeFileSync(ENV_PATH, updated)
    console.log(`\n✓ STRIPE_WEBHOOK_SECRET actualizado en ${ENV_PATH}`)
  }

  console.log('\n═══════════════════════════════════════════════════════════════')
  console.log('✅ Webhook endpoint listo. Para test end-to-end:')
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('  1. Asegúrate que tu API server esté corriendo en localhost:3000')
  console.log('     cd apps/api && npx nest start --watch')
  console.log('  2. Asegúrate que ngrok siga corriendo (tunnel actual debe seguir vivo)')
  console.log('  3. En Stripe Dashboard → Webhooks → click este endpoint →')
  console.log('     "Send test webhook" → elige customer.subscription.created')
  console.log('  4. Verifica:')
  console.log('     - Dashboard Stripe debe mostrar 200 OK')
  console.log('     - Logs del server deben mostrar [StripeWebhook] ✓ Event verified')
}

main().catch((err) => {
  console.error('\n❌ Error:', err)
  process.exit(1)
})
