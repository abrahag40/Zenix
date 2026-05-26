# Stripe Setup Guide — para el owner ZaharDev

> Pasos manuales que el owner debe completar en Stripe Dashboard antes
> de que el sprint BILLING-CORE pueda procesar cobros en producción.
>
> **Status**: 2026-05-26 — Day 1 + Day 2 del sprint completados (schema +
> webhook handler). Faltan acciones del owner en Stripe Dashboard.
>
> **Audiencia**: dueño de ZaharDev (Abraham). No requiere conocimiento técnico.

---

## TL;DR — checklist de acciones

- [ ] **1. Crear cuenta Stripe live** (o usar la existente del piloto)
- [ ] **2. Verificar la cuenta** con documentos legales de ZaharDev (1-3 días business)
- [ ] **3. Activar Stripe Tax** para CFDI compliance MX (opcional v1.1.0, recomendado v1.2)
- [ ] **4. Configurar Stripe Customer Portal** para cliente self-service
- [ ] **5. Obtener API Keys** (secret + publishable) y agregarlos a `.env` del server
- [ ] **6. Ejecutar `seed-billing.ts`** para crear Products + Prices en Stripe
- [ ] **7. Configurar Webhook endpoint** y copiar signing secret
- [ ] **8. Configurar emails de Stripe** (recibos, payment_failed, etc.)
- [ ] **9. Test E2E** — primera subscription en test mode

---

## 1. Crear o activar cuenta Stripe live

1. Ir a [https://dashboard.stripe.com/register](https://dashboard.stripe.com/register) si aún no tienes cuenta
2. **Importante**: registrar a nombre de **ZaharDev, S. de R.L. de C.V.** (la legal entity, no a nombre personal — esto es crítico para CFDI compliance)
3. Si ya tienes cuenta del piloto, ve a Settings → Account info y verifica que el legal name sea ZaharDev S. de R.L. de C.V.

**Si la cuenta aún está a nombre personal**: contactar soporte Stripe para conversion a business account. Requieren:
- Acta constitutiva de ZaharDev
- RFC de ZaharDev
- Comprobante de domicilio fiscal
- Identificación del representante legal

Tiempo: 3-5 días hábiles.

## 2. Verificar la cuenta (business verification)

Stripe pide para business accounts MX:

1. **Información de la empresa**:
   - Nombre legal (ZaharDev S. de R.L. de C.V.)
   - RFC
   - Domicilio fiscal
   - Sector económico: "Software publishing" o "Computer programming, consultancy and related activities"

2. **Información de los representantes**:
   - Nombre completo del owner
   - Documento de identificación oficial (INE / pasaporte)
   - CURP
   - Comprobante de domicilio (< 3 meses)
   - Owner que tenga >25% participación accionaria firma como beneficial owner

3. **Información bancaria** (para depósitos):
   - CLABE interbancaria de la cuenta MXN de ZaharDev
   - Estado de cuenta como prueba

**Tiempo aproximado**: 1-3 días hábiles después de submit. Stripe puede pedir info adicional si su revisor automático detecta inconsistencias.

## 3. Stripe Tax — CFDI compliance MX (opcional v1.1.0)

**Decisión**: en v1.1.0 NO usaremos Stripe Tax. ZaharDev emite CFDI directamente vía Facturama (proceso separado del cobro). Stripe Tax se evalúa en v1.2 cuando tengamos clientes cross-border.

Razón: Stripe Tax para MX está en beta y no emite CFDI 4.0 nativo. Mejor usar Facturama (ya integrado vía `MxFacturamaAdapter`).

Saltamos a paso 4.

## 4. Configurar Stripe Customer Portal

El Customer Portal es la UI hosted by Stripe donde el cliente actualiza su tarjeta, ve invoices, descarga PDFs, y cancela. Lo embebemos como link desde `/settings/billing` del cliente.

### Pasos

1. Stripe Dashboard → **Settings** → **Billing** → **Customer Portal**
2. Click "Customize Portal"

### Configuración recomendada

**Branding**:
- Logo: subir logo Zenix PNG transparente
- Color: `#10b981` (emerald 500 — color brand Zenix)
- Display name: "Zenix"

**Features habilitadas**:
- ✅ Customer information (permite actualizar email, dirección)
- ✅ Payment methods (permite actualizar tarjeta)
- ✅ Subscriptions
  - ✅ Cancel subscriptions: **DISABLED** ← importante (la cancelación pasa por nuestro save offer flow, no Stripe Portal direct)
  - ✅ Update subscriptions: **DISABLED** ← cliente no debe cambiar plan en Portal (lo hace el consultor desde Nova o ZaharDev internal)
  - ✅ Pause subscriptions: **DISABLED** (nuestro flow custom)
- ✅ Invoice history
  - ✅ Show 12 most recent invoices
  - ✅ Allow PDF download

**Business information**:
- Privacy policy URL: `https://zenix.com/privacy` (placeholder hasta publicar el website real)
- Terms of service URL: `https://zenix.com/terms`

**Return URL**:
- Default: `https://app.zenix.com/settings/billing` (donde el cliente regresa al cerrar Portal)

### Razón por la que cancel/update/pause están DISABLED

Queremos controlar el flow de cancelación para mostrar save offers condicionales (Liverpool pattern). Si Stripe Portal permite cancel direct, perdemos retention oportunities.

El cliente que vea "Cancel" en Portal será redirigido a nuestro `/settings/billing/cancel` que ejecuta el save offer ladder, y solo después dispara la cancel real vía nuestra API → Stripe.

## 5. Obtener API Keys

1. Stripe Dashboard → **Developers** → **API keys**
2. Verás dos secciones: **Standard keys** (live mode) y **Test keys**

### Para development local

Usa **Test keys**:
- `Publishable key` empieza con `pk_test_...` — NO sensible, va al frontend
- `Secret key` empieza con `sk_test_...` — SENSIBLE, solo al backend

### Para producción

Usa **Live keys** (solo disponibles después de business verification del paso 2):
- `Publishable key` empieza con `pk_live_...`
- `Secret key` empieza con `sk_live_...`

### Agregar al `.env` del server backend

Edita `apps/api/.env` (NUNCA commitees este archivo — está en .gitignore):

```bash
# Stripe Billing — para producción usa sk_live_, para dev sk_test_
STRIPE_SECRET_KEY="sk_test_XXXXXXXXXXXXX"
STRIPE_PUBLISHABLE_KEY="pk_test_XXXXXXXXXXXXX"

# Webhook signing secret — paso 7 abajo
STRIPE_WEBHOOK_SECRET="whsec_XXXXXXXXXXXXX"
```

Restart server después de cambiar `.env`.

## 6. Ejecutar `seed-billing.ts`

Este script crea los Stripe **Products** + **Prices** alineados con `billing_pricing_config` table local.

```bash
cd apps/api
npx ts-node -r tsconfig-paths/register prisma/scripts/seed-billing.ts
```

**Output esperado**:
```
[seed-billing] Stripe initialized in TEST mode.
[seed-billing] Encontrados 3 pricing configs activos:
  - STARTER: $1200 MXN / $60 USD
  - PRO: $2400 MXN / $120 USD
  - ENTERPRISE: $4800 MXN / $240 USD

[seed-billing] Procesando tier STARTER...
  ✓ Product creado: prod_XXXXX
  ✓ Price MXN creado: price_XXXXX (1200 MXN/mes)
  ✓ Price USD creado: price_XXXXX (60 USD/mes)
  ✓ DB sync OK para tier STARTER

[seed-billing] Procesando tier PRO...
  ✓ Product creado: prod_XXXXX
  ...

[seed-billing] ✓ Seed completado. Stripe Products + Prices sincronizados.
```

**Idempotente**: ejecutable múltiples veces sin duplicar. Si los Products ya existen en Stripe (campos `stripeProductId` poblados en DB), los reutiliza.

**Verifica en Stripe Dashboard** → Products → debes ver:
- Zenix Plan Starter ($1,200 MXN/mes, $60 USD/mes)
- Zenix Plan Pro ($2,400 MXN/mes, $120 USD/mes)
- Zenix Plan Enterprise ($4,800 MXN/mes, $240 USD/mes)

## 7. Configurar Webhook endpoint

Los webhooks son cómo Stripe nos notifica cuando algo pasa (pago exitoso, pago fallido, suscripción cancelada, etc.).

### Pasos

1. Stripe Dashboard → **Developers** → **Webhooks** → **Add endpoint**
2. **Endpoint URL**:
   - Producción: `https://api.zenix.com/api/v1/webhooks/stripe`
   - Dev (con ngrok): `https://abcd1234.ngrok.io/api/v1/webhooks/stripe`

> **Nota dev con ngrok**: para testing local, instala [ngrok](https://ngrok.com) y corre `ngrok http 3000` para exponer tu server local. Usa la URL https resultante como endpoint Stripe.

3. **Description**: "Zenix BILLING-CORE webhook handler"
4. **API version**: usar la más reciente disponible (2026-04-22 o equivalente)
5. **Events to send** — selecciona estos 11:

   ```
   ✓ customer.subscription.created
   ✓ customer.subscription.updated
   ✓ customer.subscription.deleted
   ✓ customer.subscription.paused
   ✓ customer.subscription.resumed
   ✓ customer.subscription.trial_will_end
   ✓ invoice.created
   ✓ invoice.finalized
   ✓ invoice.paid
   ✓ invoice.payment_failed
   ✓ invoice.payment_action_required
   ✓ invoice.voided
   ```

6. Click **Add endpoint**
7. En la página del endpoint creado, sección **Signing secret**, click "Reveal" y copia el valor (empieza con `whsec_...`)
8. Pega ese valor en `STRIPE_WEBHOOK_SECRET` del `.env` del server
9. Restart server

### Verificar que funciona

Stripe Dashboard → Developers → Webhooks → click en tu endpoint → tab "Send test webhook":

1. Selecciona event type `customer.subscription.created`
2. Click "Send test webhook"
3. Verifica:
   - **Stripe Dashboard**: la entrega debe mostrar **200 OK** verde
   - **Logs del server**: debe loguear `[StripeWebhook] ✓ Event verified: customer.subscription.created evt_XXX`

Si ves **400 Invalid signature** → revisa que `STRIPE_WEBHOOK_SECRET` esté correcto en `.env` y el server reiniciado.

Si ves **500 Internal Server Error** → revisa logs del server por stack trace específico.

## 8. Configurar emails de Stripe

Stripe envía algunos emails automáticos al cliente (recibos, payment_failed alerts). Configúralos para que se vean profesionales:

1. Stripe Dashboard → **Settings** → **Emails**
2. Subir logo Zenix
3. Sección **Receipts**:
   - ✅ Enable receipts for successful payments
   - Replace from address: `billing@zenix.com` (configurar DNS MX para esto, o usar `noreply@zenix.com` que ya está validado en Resend)
   - Reply-to: `soporte@zenix.com`
4. Sección **Failed payments**:
   - ✅ Send notification to customer when payment fails — **DISABLED**
   - Razón: nuestro `DunningEscalationScheduler` envía emails customizados que son mejor experiencia que el genérico de Stripe (Day 20 BILLING-CORE wirea esto)

## 9. Test E2E primera subscription

Una vez completados pasos 1-8, prueba el flow completo en test mode:

### Setup test mode

1. Verifica que `.env` tiene `STRIPE_SECRET_KEY=sk_test_...` (no live)
2. Verifica que webhook endpoint configurado apunta a test mode (Stripe permite endpoints separados para test y live)

### Crear test customer + subscription manual (terminal)

```bash
cd apps/api
node << 'EOF'
const Stripe = require('stripe')
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2026-04-22.dahlia' })

async function test() {
  // 1. Crear customer
  const customer = await stripe.customers.create({
    email: 'test@zaharDev.com',
    name: 'Test ZaharDev Customer',
    metadata: { zenix_test: 'true' },
  })
  console.log('✓ Customer:', customer.id)

  // 2. Adjuntar test payment method (tarjeta de prueba Stripe)
  // Token de tarjeta test que pasa sin 3DS:
  // https://stripe.com/docs/testing#cards
  const pm = await stripe.paymentMethods.create({
    type: 'card',
    card: {
      number: '4242424242424242',
      exp_month: 12,
      exp_year: 2030,
      cvc: '123',
    },
  })
  await stripe.paymentMethods.attach(pm.id, { customer: customer.id })
  await stripe.customers.update(customer.id, {
    invoice_settings: { default_payment_method: pm.id },
  })

  // 3. Lookup el Price ID de Pro MXN
  const prisma = require('@prisma/client').PrismaClient
  const db = new prisma()
  const proConfig = await db.billingPricingConfig.findFirst({
    where: { tier: 'PRO', isActive: true },
  })
  console.log('✓ Pro price MXN:', proConfig.stripePriceIdMxn)

  // 4. Crear subscription
  const sub = await stripe.subscriptions.create({
    customer: customer.id,
    items: [{ price: proConfig.stripePriceIdMxn, quantity: 1 }],
    metadata: { zenix_tier: 'PRO', zenix_test: 'true' },
  })
  console.log('✓ Subscription:', sub.id, 'status:', sub.status)

  // 5. Espera unos segundos por webhook → check DB
  await new Promise(r => setTimeout(r, 5000))
  const events = await db.subscriptionEvent.findMany({
    where: { stripeEventId: { startsWith: 'evt_' } },
    orderBy: { createdAt: 'desc' },
    take: 5,
  })
  console.log('\n✓ Webhook events recibidos:')
  events.forEach(e => console.log(` - ${e.type} (${e.stripeEventId})`))
}
test().catch(console.error)
EOF
```

**Resultado esperado**:
- Stripe Dashboard: ves Customer + Subscription en estado `active` (con default trial 0d) o `trialing` si configuraste trial
- DB local: ves rows en `subscription_events` table con types como `CREATED`, `PLAN_CHANGED`
- Server logs: muestran webhooks recibidos y procesados

### Limpieza después de test

```bash
node << 'EOF'
const Stripe = require('stripe')
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2026-04-22.dahlia' })
// Cancel test subscriptions
const subs = await stripe.subscriptions.list({ limit: 100 })
for (const s of subs.data.filter(s => s.metadata?.zenix_test === 'true')) {
  await stripe.subscriptions.cancel(s.id)
  console.log('Cancelled:', s.id)
}
// Delete test customers
const customers = await stripe.customers.list({ limit: 100, email: 'test@zaharDev.com' })
for (const c of customers.data) {
  await stripe.customers.del(c.id)
  console.log('Deleted:', c.id)
}
EOF
```

---

## Checklist final — Stripe está listo

- [ ] Cuenta Stripe verificada a nombre de ZaharDev S. de R.L. de C.V.
- [ ] `.env` tiene `STRIPE_SECRET_KEY` + `STRIPE_PUBLISHABLE_KEY` + `STRIPE_WEBHOOK_SECRET`
- [ ] Customer Portal configurado con branding Zenix + cancel/update/pause DISABLED
- [ ] Products + Prices creados (Starter / Pro / Enterprise × MXN + USD = 6 prices)
- [ ] Webhook endpoint configurado + 12 events seleccionados + signing secret en .env
- [ ] Receipts emails configurados con branding Zenix
- [ ] Test E2E primera subscription pasó verde
- [ ] Webhook test event responde 200 OK

Una vez completado este checklist, BILLING-CORE Day 3+ (SubscriptionService CRUD) puede ejecutar contra Stripe live mode sin issues.

---

## Troubleshooting común

### "Webhook signature verification failed"
- Verifica que copiaste el signing secret completo (`whsec_...` con prefix)
- Reinicia el server después de cambiar .env
- Verifica que `bodyParser.raw` está configurado para `/api/v1/webhooks/stripe` (ya está en main.ts)
- Si el endpoint de Stripe está apuntando a localhost directo, no funcionará — usa ngrok

### "STRIPE_SECRET_KEY no configurado"
- Verifica que .env existe y tiene la variable
- Verifica que estás importando dotenv correctamente (NestJS lo hace via ConfigModule)
- Restart server

### "Cannot read property 'paymentIntents' of undefined"
- Stripe no se inicializó correctamente — typicamente STRIPE_SECRET_KEY vacío en runtime
- Revisa logs al start del server por warning `[BillingService] STRIPE_SECRET_KEY no configurado`

### Webhook 500 en handler
- Revisa server logs por stack trace
- Verifica que la migration `20260601000000_billing_core_schema` está aplicada (table `subscription_events` debe existir)
- Si es problema de DB connection, verifica `DATABASE_URL`

---

## Costos esperados Stripe

Para volumen v1.1.0 (target 10-50 clientes activos):

| Concepto | Costo |
|---|---|
| Setup account | $0 |
| Monthly subscription fee | $0 |
| Per-invoice fee (Billing) | 0.5% over $25k MRR (despreciable v1.1.0) |
| Per-transaction fee México | 3.6% + $3 MXN per cobro tarjeta MX |
| Per-transaction fee USD | 2.9% + $0.30 USD per cobro tarjeta US |
| OXXO Pay (Conekta separate) | Pendiente v1.1.x BILLING-OXXO sprint |
| Webhook cost | $0 |

**Para 30 clientes promedio Pro a $2,400 MXN/mes**:
- MRR Zenix: $72,000 MXN
- Stripe fees mensual: ~$2,800 MXN (3.6% × $72k + $90 fixed)
- ZaharDev neto: ~$69,200 MXN/mes después de Stripe fees

Esto es estándar industria — el costo de procesamiento de pagos en LATAM es siempre 3-4% por tarjeta. SPEI / OXXO Pay tienen comisiones menores pero requieren wiring adicional (v1.1.x).

---

## Recursos adicionales

- [Stripe Billing Docs](https://stripe.com/docs/billing)
- [Stripe Testing Cards](https://stripe.com/docs/testing#cards)
- [Stripe Webhooks Guide](https://stripe.com/docs/webhooks)
- [Stripe Customer Portal Setup](https://stripe.com/docs/customer-management)
- [Stripe Mexico Resources](https://stripe.com/docs/connect/mexico)
- [Conekta MX docs](https://developers.conekta.com/) (para OXXO Pay v1.1.x)
