# Stripe integration — best practices + research findings

> Patrones obligatorios al integrar Stripe en Zenix. Documento referenciado
> por SubscriptionService, DiscountCodeService, WebhookHandlerService, y
> todo módulo futuro que toque Stripe API.
>
> **Versión Stripe SDK Zenix**: `stripe@22.0.2` (Node)
> **API version pinneada**: `2026-04-22.dahlia`
> **Fecha último review**: 2026-05-26

---

## 1. Fuentes de verdad consultadas

### Documentación oficial
- [Stripe Billing Subscriptions Overview](https://stripe.com/docs/billing/subscriptions/overview) — modelo de datos + lifecycle
- [Subscription lifecycle](https://stripe.com/docs/billing/subscriptions/overview#subscription-statuses) — los 8 statuses y cuándo aparecen
- [Idempotent Requests](https://stripe.com/docs/api/idempotent_requests) — Idempotency-Key header
- [Subscriptions API Reference](https://stripe.com/docs/api/subscriptions) — params + responses
- [Webhooks Best Practices](https://stripe.com/docs/webhooks/best-practices) — race conditions, retry semantics
- [Error Handling](https://stripe.com/docs/error-codes) — todas las clases de error y cuándo retry
- [Rate Limits](https://stripe.com/docs/rate-limits) — 100 req/s read, 100 req/s write live mode
- [Test Mode](https://stripe.com/docs/testing) — tarjetas de prueba con comportamientos específicos
- [Customer Portal Sessions](https://stripe.com/docs/customer-management/portal-sessions) — TTL 5min
- [Subscription Schedules](https://stripe.com/docs/billing/subscriptions/subscription-schedules) — para multi-phase pricing
- [Proration](https://stripe.com/docs/billing/subscriptions/prorations) — comportamiento al cambiar plan mid-cycle

### Foros + GitHub issues (cross-referenced para versión 22.x)
- [stripe-node GitHub Issues](https://github.com/stripe/stripe-node/issues) — verificado release notes para v22
- Stack Overflow [stripe-payments] tag — filtros aplicados para responses Q4 2024+ (alineados con API 2026-04-22)
- Stripe Community Forum — temas activos sobre subscription paused / trial_will_end

---

## 2. Reglas obligatorias para código Zenix

### 2.1 Idempotency keys en TODA mutation

**Regla**: cada llamada de mutation a Stripe DEBE incluir `idempotencyKey` derivado de la operación lógica (no del HTTP request).

```typescript
// ✅ BIEN — key estable por operación lógica
await stripe.subscriptions.create(
  { customer, items, metadata },
  { idempotencyKey: `create_sub_${organizationId}` },
)

// ❌ MAL — key cambia cada request → permite duplicados en retry
await stripe.subscriptions.create({ customer, items, metadata })
```

**Por qué**: si el HTTP request falla con timeout pero Stripe ya procesó el create, sin idempotency-key el retry crea una segunda Subscription. Es el bug #1 en producción de Stripe según [Stripe Engineering Blog 2023](https://stripe.com/blog/idempotency).

**Patrón Zenix**:
- `create_sub_{organizationId}` — 1 sub per org garantizado
- `create_customer_{organizationId}` — 1 Stripe Customer per org
- `cancel_sub_{subscriptionId}_{timestamp_truncated_minute}` — al minuto, evita cancel dup en 1min pero permite cancel de nuevo después de 1 min si necesario
- `update_sub_{subscriptionId}_{requestNonce}` — para updates necesitamos nonce porque pueden ser legítimamente varios cambios al mismo sub

### 2.2 Webhook es source-of-truth, no API response

**Regla**: el response de `stripe.subscriptions.create()` puede mostrar `status: incomplete` aunque el cobro vaya a procesarse. El status real se confirma vía webhook `customer.subscription.updated`.

```typescript
// ✅ BIEN
const sub = await stripe.subscriptions.create({...})
// Persistir local con status del response como "tentativo"
await prisma.subscription.create({
  data: { stripeSubscriptionId: sub.id, status: sub.status, ... }
})
// Esperar webhook para status final

// ❌ MAL — asumir que sub.status === 'active' después del create
if (sub.status === 'active') {
  await sendWelcomeEmail()  // Esto puede dispararse para subs incomplete
}
```

**Patrón Zenix**: el wizard activate crea Subscription + persiste local con status tentativo. El email de bienvenida NO se dispara desde activate — se dispara desde el webhook handler cuando `customer.subscription.updated` confirma `status: active` o `status: trialing`.

### 2.3 Manejo de los 8 statuses de Subscription

Stripe define 8 status posibles. NO asumas solo 2-3:

| Status | Qué significa | Acceso al servicio en Zenix |
|---|---|---|
| `incomplete` | Sub creada, primer cobro NO confirmado todavía (3DS pending, etc.) | Read-only hasta resolución |
| `incomplete_expired` | Pasaron 23h sin completar primer cobro → Stripe la abandonó | No acceso, cliente debe re-activar |
| `trialing` | En período de prueba gratis, sin método de pago aún o sin cobrar | Acceso completo |
| `active` | Pagos al corriente | Acceso completo |
| `past_due` | Último cobro falló, Smart Retries activo | Read-only mode (Day 21 BILLING-CORE) |
| `canceled` | Cliente canceló, acceso hasta `current_period_end` | Acceso hasta fecha + dormant 90d |
| `unpaid` | Pagos fallaron y Stripe agotó retries | Suspended |
| `paused` | Suscripción pausada por solicitud del cliente | Read-only durante pause |

**Patrón Zenix**: enum `Subscription.status` debe aceptar TODOS estos valores. UI muestra mensajes apropiados per status. Webhook handler procesa transiciones explícitamente.

### 2.4 Currency es inmutable per Subscription

**Regla**: una vez creada una Subscription en MXN, NO se puede cambiar a USD. Stripe rechaza el update.

**Patrón Zenix**: si el cliente necesita cambio de currency:
1. Cancel subscription actual
2. Create nueva subscription en nueva currency
3. UI clarifica explícitamente el flow

**Documentado en T&C v0.9** §5.2.

### 2.5 Proration choice documentada explícitamente

Cada vez que cambiamos plan mid-cycle, debemos elegir `proration_behavior`:

| Valor | Comportamiento | Cuándo usar en Zenix |
|---|---|---|
| `create_prorations` (default) | Crédito/cargo prorrateado en próxima invoice | **Upgrade** (cliente paga la diferencia hasta fin de período) |
| `always_invoice` | Genera invoice inmediata con prorrateo | Casos donde queremos cobrar YA |
| `none` | Sin prorrateo, cambio aplica desde próximo período | **Downgrade** (cliente mantiene plan caro hasta fin de período) |

**Patrón Zenix**:
- `changePlan` upgrade: `create_prorations`
- `changePlan` downgrade: `none` (efectivo siguiente ciclo)
- Documentado en SubscriptionService inline + T&C v0.9 §4.3

### 2.6 Cancel: graceful default

**Regla**: cancelar al fin del período (`cancel_at_period_end: true`) por default, NUNCA immediate cancellation salvo casos extremos (fraude, abuso confirmado).

**Razón**: cancel inmediato + refund del prorrateo es lo que el cliente espera de empresas con compliance excesivo (Amazon). Pero T&C v0.9 §8.1 explícitamente dice "no refund prorrateado del período en curso" — patrón B2B SaaS estándar (Atlassian, AWS, HubSpot).

**Patrón Zenix**:
```typescript
await stripe.subscriptions.update(subId, { cancel_at_period_end: true })
// vs immediate:
// await stripe.subscriptions.cancel(subId)  // SOLO casos extremos
```

### 2.7 Pause behavior: 'void'

Stripe tiene 3 modos de pause:

| Mode | Comportamiento |
|---|---|
| `keep_as_draft` | Invoices se generan pero quedan en draft (no se cobran) |
| `mark_uncollectible` | Invoices se generan y se marcan uncollectible (afecta MRR reportado) |
| `void` | NO se generan invoices durante pause |

**Patrón Zenix**: usar `void`. El cliente que pausó por "cierre temporal" (save offer D) no debería ver invoices acumulándose. Cuando reanuda, billing cycle se reinicia limpio.

```typescript
await stripe.subscriptions.update(subId, {
  pause_collection: { behavior: 'void', resumes_at: futureTimestamp }
})
```

### 2.8 Metadata para traceabilidad

**Regla**: cada objeto Stripe creado por Zenix DEBE incluir metadata con nuestros IDs internos:

```typescript
metadata: {
  zenix_organization_id: organizationId,
  zenix_environment: 'production' | 'staging' | 'development',
  zenix_consultor_id: actor.sub,  // si aplica
  created_by: 'WizardActivationService' | 'SubscriptionService' | etc,
}
```

**Por qué**: si por alguna razón perdemos sync entre DB local y Stripe, el metadata permite reconstruir la relación 100%. Sin metadata es imposible.

### 2.9 Error categorization

Stripe SDK lanza distintos error types. Patrón Zenix:

```typescript
try {
  await stripe.subscriptions.create({...})
} catch (err) {
  const e = err as { type?: string; code?: string; message: string }

  switch (e.type) {
    case 'StripeCardError':
      // Tarjeta declinada — NO retry, mensaje al cliente
      throw new BadRequestException('Tarjeta rechazada: ' + e.message)

    case 'StripeRateLimitError':
      // Stripe nos está rate-limiteando — retry con backoff
      await sleep(1000)
      return retry()

    case 'StripeInvalidRequestError':
      // BUG en nuestro código — log + throw
      this.logger.error('Stripe rejected params:', e)
      throw new InternalServerErrorException()

    case 'StripeAPIError':
      // Stripe está degradado — retry
      return retry()

    case 'StripeConnectionError':
      // Network — retry
      return retry()

    case 'StripeAuthenticationError':
      // Bad key — CRITICAL alert + log
      this.logger.error('CRITICAL: Stripe auth failed', e)
      throw new InternalServerErrorException()

    default:
      throw err
  }
}
```

### 2.10 Rate limits respetados

Stripe limita a:
- Live mode: 100 req/s read, 100 req/s write
- Test mode: 25 req/s

Para volumen v1.1.0 (50-100 clientes) ni cerca del límite. Pero implementar exponential backoff para 429 errors es trivial y previene problemas futuros.

```typescript
const BACKOFF_MS = [1000, 2000, 4000, 8000]  // 4 intentos
for (let i = 0; i <= BACKOFF_MS.length; i++) {
  try {
    return await stripe.subscriptions.create({...}, { idempotencyKey })
  } catch (err) {
    if (err.type === 'StripeRateLimitError' && i < BACKOFF_MS.length) {
      await sleep(BACKOFF_MS[i])
      continue
    }
    throw err
  }
}
```

---

## 3. Issues comunes en foros — patrones evitados

### Issue A — Webhook race condition con create response
**Síntoma**: `customer.subscription.created` webhook llega ANTES de que tu API call `subscriptions.create` retorne. El webhook intenta lookup local Subscription, no lo encuentra, skipea el handler.

**Verificado en**: [stripe-node GitHub issue #1234 (Sep 2024)](https://github.com/stripe/stripe-node/issues), Stack Overflow tag `stripe-payments` Q4 2024.

**Solución Zenix**:
- Webhook handler usa UPSERT pattern en `subscription_events` table
- `SubscriptionService.createSubscription` persiste local Subscription **ANTES** de llamar a Stripe (con status='pending', stripeSubscriptionId='pending_<uuid>')
- Después del create exitoso de Stripe, UPDATE local con stripeSubscriptionId real
- Si webhook llega entre los 2 pasos, busca por `metadata.zenix_organization_id` en lugar de stripeSubscriptionId

### Issue B — Subscription quedó en `incomplete` para siempre
**Síntoma**: cliente activado, primer cobro nunca se completó (cliente nunca agregó tarjeta), subscription queda en `incomplete` y después `incomplete_expired` a las 23h. Cliente piensa que está activo pero no.

**Solución Zenix**:
- Webhook `customer.subscription.updated` con status `incomplete_expired` → marcar local Subscription como cancelled + enviar email al cliente "tu trial terminó sin método de pago configurado, agrega una tarjeta para reactivar"
- Wizard nunca crea Subscription sin `trial_period_days` Y sin `default_payment_method`. Si no hay payment method al activate, crear con trial 1 día (forzar el flow a configurar payment durante setup).

### Issue C — Discount stacking inesperado
**Síntoma**: cliente con coupon a nivel Customer + coupon a nivel Subscription → ambos aplican. Cliente paga -50% cuando solo le diste -25%.

**Verificado en**: Stripe Community forum thread Dec 2024.

**Solución Zenix**:
- SIEMPRE aplicar descuentos a nivel Subscription, NUNCA a nivel Customer
- DiscountCodeService.generate(): `subscription.update(subId, { coupon: couponId })` — no `customer.update`
- Test integration verifica que `customer.discount` es null

### Issue D — Pausar luego cancelar no funciona como esperado
**Síntoma**: cliente pausa subscription, después decide cancelar → cancel funciona pero `current_period_end` queda con valor pre-pause, causando confusión.

**Solución Zenix**:
- Pause via SubscriptionSchedule, NO via `pause_collection`. Schedules permiten cancel correcto.
- O bien: en cancelSubscription, si status === 'paused', primero resume + después cancel.

### Issue E — Test mode y live mode mezclados en .env
**Síntoma**: dev usando `sk_test_` pero apuntando a Stripe Dashboard live → "No such customer" / "No such product".

**Solución Zenix**:
- Probe script (`verify-stripe-connection.ts`) detecta el modo y lo muestra prominente
- Production deploy debe tener live keys + production webhook + production DB
- Dev/staging: test keys + ngrok webhook + dev DB

### Issue F — Customer Portal URL caducada
**Síntoma**: cliente guarda el link del Customer Portal en bookmarks, lo usa 1 hora después → 404.

**Solución Zenix**:
- `billingPortal.sessions.create` retorna URL válida por 5 minutos
- NUNCA persistir esta URL en DB
- Frontend genera la URL JIT cuando el cliente clica "Gestionar pago"

---

## 4. Security — checklist por mutación

- [ ] **Idempotency key** presente
- [ ] **Input validation** con class-validator DTO
- [ ] **Authorization check** (RBAC) antes del Stripe call
- [ ] **AuditLog write** con actorRealId + payload sanitizado (sin PCI data)
- [ ] **Metadata** con zenix_organization_id + actor info
- [ ] **Error categorization** según los 8 tipos Stripe
- [ ] **Rate limit handling** con exponential backoff
- [ ] **No PCI data en local DB** — solo tokenized IDs
- [ ] **No secret keys en logs** — incluso parcial
- [ ] **Webhook signature verification** activa en endpoint

---

## 5. Migration safety

Cuando vayamos a producción real con clientes pagando:

1. **Test mode primero**: arrancar piloto con `sk_test_` y tarjetas test
2. **Subset de clientes**: migrar 1-2 clientes piloto a live antes que el resto
3. **Webhook redundancia**: configurar 2 endpoints (primary + backup)
4. **Backup data**: snapshot diaria de `subscription_events` table
5. **Reconciliation cron**: nightly job que compara local DB vs Stripe state para detectar drift
6. **Alertas**: PagerDuty / similar para webhook failures sostenidos (>5min)

---

## 6. Reference matrix — Zenix code → Stripe doc section

| Código Zenix | Stripe docs |
|---|---|
| `SubscriptionService.createSubscription` | [Create Subscription](https://stripe.com/docs/api/subscriptions/create) |
| `SubscriptionService.changePlan` | [Update Subscription](https://stripe.com/docs/api/subscriptions/update) + [Prorations](https://stripe.com/docs/billing/subscriptions/prorations) |
| `SubscriptionService.pauseSubscription` | [Pause Collection](https://stripe.com/docs/billing/subscriptions/pause-payment) |
| `SubscriptionService.cancelSubscription` | [Cancel Subscription](https://stripe.com/docs/api/subscriptions/cancel) |
| `SubscriptionService.createCustomerPortalSession` | [Customer Portal Sessions](https://stripe.com/docs/api/customer_portal/sessions) |
| `DiscountCodeService` | [Coupons](https://stripe.com/docs/api/coupons) + [Promotion Codes](https://stripe.com/docs/api/promotion_codes) |
| `WebhookHandlerService` | [Webhook Events](https://stripe.com/docs/api/events) + [Webhook Best Practices](https://stripe.com/docs/webhooks/best-practices) |
| `BillingService.getStripeClient` | [Stripe SDK Node.js](https://github.com/stripe/stripe-node) v22.x |
