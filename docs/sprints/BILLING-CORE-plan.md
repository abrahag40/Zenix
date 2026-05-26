# Sprint BILLING-CORE — Stripe subscription billing + discount codes negociables + dunning + retention save offers

> **Branch destino:** `feature/billing-core` (nueva, parte de `main` post-piloto).
> **Estimación:** 18-22 días-dev (1 dev secuencial) — ~4 semanas calendar.
> **Status:** propuesta técnica derivada de [docs/vision/15-subscription-billing.md](../vision/15-subscription-billing.md). Pendiente kickoff post-piloto comercial v1.0.0.
> **Versión target:** v1.1.0 (primer release pago automatizado).
> **Pre-requisitos:** piloto v1.0.0 con 3-6 hoteles cobrados manualmente via Stripe Invoice directo — datos reales para validar pricing antes de automatizar.

---

## 0. Resumen ejecutivo

Implementa el cobro recurrente automático de Zenix con Stripe Billing, integrado al wizard de activación, con flexibilidad de negociación per consultor (discount codes), dunning multi-canal (email + WhatsApp), retention save offers tipo Liverpool/Audible, y 2 UIs separadas (consultor en `/nova/billing` + cliente admin en `app.zenix.com/settings/billing`).

### Pain real

**Owner ZaharDev** (transcripción 2026-05-26):
> "Quiero darle al consultor flexibilidad de negociación. Que pueda cerrar venta con descuentos sin pedirme aprobación cada vez, pero que ZaharDev controle el techo per partner tier."
>
> "El cliente que quiera cancelar debería poder negociar como cuando cancelé mi tarjeta de Liverpool y me hicieron contraoferta. Decidí quedarme."
>
> "Recordatorios 2-3 días antes del cobro por email y WhatsApp. Y cuando falla el pago... ¿qué hacen las empresas que llevan este modelo? No quiero cortarles el acceso de una a un hotel que está operando."

### Diferenciador documentado

Ningún PMS LATAM (Cloudbeds, Mews, Opera, RoomRaccoon, Little Hotelier) cubre simultáneamente:

1. **Pricing negociable por consultor con cap controlado** (todos los PMS son self-serve o enterprise-CSM-only sin medio término)
2. **Multi-phase discount** ("2 meses -25%, después fijo") — caso owner explícito
3. **Save offer ladder condicional al motivo** de cancelación (todos hacen genérico o nada)
4. **Pause subscription** self-service (reabrir hotel temporal sin perder datos) — todos requieren CSM manual
5. **WhatsApp reminders nativos** LATAM (95% open rate vs 22% email B2B)
6. **Dunning B2B-grade no day-1 cut** (grace 21 días con read-only)
7. **Dashboard MRR/ARR/churn al consultor** (todos lo tienen interno; ningún PMS lo expone a sus partners)
8. **Partner tier discount cap** estilo SAP PartnerEdge
9. **Multi-currency invoice** para clientes cross-country (v1.2 con FX-LATAM)

Análisis comparativo completo en [vision/15 §12](../vision/15-subscription-billing.md#12-diferenciadores-comerciales-emergentes).

---

## 1. Decisiones técnicas no-negociables (candidatas a CLAUDE.md §)

### D-BILL-1: Stripe Billing como provider único v1.0.x-v1.2
Subscriptions + Coupons + PromotionCodes + Customer Portal + Smart Retries. No Chargebee / Recurly / Paddle hasta >$50k MRR estable. Justificación en [vision/15 §1](../vision/15-subscription-billing.md#1-por-qué-stripe-billing).

### D-BILL-2: Public pricing inmovible + discount codes como único mecanismo de negociación
Pattern P. McKenzie + OpenView SaaS Pricing Benchmark 2023. Cada deal con descuento genera Stripe Coupon + PromotionCode con audit trail permanente — nunca se altera el Price oficial.

### D-BILL-3: Cap per partner tier (SAP PartnerEdge model)
- AUTHORIZED: max -15% / 3 meses duration
- SILVER: max -25% / 6 meses
- GOLD: max -35% / 12 meses
- PLATINUM: max -50% / forever
- PLATFORM_ADMIN (ZaharDev): sin límite

Si el consultor excede su cap, modal "Necesitas aprobación de PARTNER_ADMIN" — genera pending approval entry + email al admin.

### D-BILL-4: Rolling billing default + opcional fixed-date opt-in
NO copiar SmartFit literal (su rationale es B2C low-ticket alta volumen). B2B SaaS norma es rolling (Stripe default + Mews + Cloudbeds). Fixed-date opt-in disponible en Settings del cliente para chains con CFO consolidado mensualmente.

### D-BILL-5: Save offer ladder condicional al motivo de cancelación
NO offer genérico. Survey forzado pre-cancel ("¿Por qué cancelas?") → save offer condicional según reason. ProfitWell Retain 2023: 30-40% save rate condicionales vs 8-12% genéricos. Botón "Cancelar de todos modos" SIEMPRE visible <2 clicks (PROFECO Art. 47 + FTC Click-to-Cancel compliance).

### D-BILL-6: Dunning 21 días con degradación gradual (no corte día 1)
Pattern B2B SaaS (Cloudbeds, Mews, Adobe Creative Cloud). Stripe Smart Retries 4 intentos + escalación email→WhatsApp→read-only mode día 14 → suspended día 21 → dormant 90 días. NUNCA corte total inmediato — chargeback Visa + reseña pública + cliente se va.

### D-BILL-7: WhatsApp reminders opt-in via Twilio + Meta templates pre-aprobados
Templates Meta-approved son requirement WhatsApp Business. Pre-aprobación 5-10 días per template — lead time obligatorio. Costo ~$0.025 USD/template message — despreciable.

### D-BILL-8: Stripe Customer Portal embebido — no UI custom para payment method
Stripe Portal ya resuelve PCI-DSS Level 1 + multi-currency + saved methods. Hacer UI custom = re-inventar la rueda con riesgos compliance.

### D-BILL-9: 2 UIs separadas physical
- `/nova/billing` (Nova consultor) — métricas agregadas, generación discount codes, cliente list
- `app.zenix.com/settings/billing` (ORG_OWNER) — Stripe Portal embed + invoices + cancel flow con save offers

Permission separation: ORG_STAFF NO ve billing (rationale: gerente operativo no debe poder cancelar el SaaS sin autorización del dueño).

### D-BILL-10: Audit log permanente per discount code + save offer outcome
`SubscriptionDiscount.generatedById + reason` REQUIRED. `RetentionSaveOffer.outcome` tracked (ACCEPTED / REJECTED / EXPIRED). Compliance + analytics — datos para optimizar save offer copy en el tiempo.

---

## 2. Schema changes (Prisma)

Ver [vision/15 §9](../vision/15-subscription-billing.md#9-schema-additions-sprint-billing-core) para schema completo. Resumen:

- `Subscription` (1:1 con Organization, mirror Stripe state)
- `SubscriptionDiscount` (historial + activos, audit trail per descuento)
- `SubscriptionEvent` (append-only lifecycle audit, dedup por stripeEventId)
- `Invoice` (mirror Stripe Invoices)
- `RetentionSaveOffer` (presentaciones + outcomes)
- `ConsultorDiscountTemplate` ("mis códigos favoritos" del consultor)

Migration: `20260601000000_billing_core_schema` con FK constraints + indexes apropiados.

---

## 3. Plan de implementación día por día

### Fase 1 — Foundations (5 días)

#### Día 1 — Schema + Stripe SDK skeleton

**Entregables**:
- Migration Prisma con los 6 modelos nuevos + FK relations
- `BillingModule` (NestJS) creado bajo `apps/api/src/billing/`
- `StripeService` extendido o nuevo `BillingService` con cliente Stripe configurado
- Env vars: `STRIPE_SECRET_KEY` (ya existe), `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`
- Stripe Products + Prices creados via seed script (Starter / Pro / Enterprise en MXN + USD)

**Definition of done**: typecheck verde + Stripe SDK instanciable con secret key + seed script idempotente.

#### Día 2 — Webhook listener + idempotencia

**Entregables**:
- `POST /v1/webhooks/stripe` endpoint Public (no JWT) con verificación HMAC `Stripe-Signature`
- Handler dispatcher por event type:
  - `customer.subscription.created` / `.updated` / `.deleted`
  - `invoice.created` / `.paid` / `.payment_failed` / `.payment_action_required`
  - `customer.subscription.trial_will_end` (si activamos trials)
- Idempotencia via `SubscriptionEvent.stripeEventId @unique` — dup webhooks NO duplican state
- Logging append-only en `SubscriptionEvent` per cada webhook recibido

**Definition of done**: 8/8 webhook handler tests verdes (happy path + dup + invalid sig + missing event type).

#### Día 3 — Subscription CRUD service

**Entregables**:
- `SubscriptionService.createSubscription(orgId, planTier, propertyCount)` — crea Stripe Customer + Subscription, sync a `Subscription` table local
- `SubscriptionService.changePlan(subId, newTier, propertyCount)` — upgrade/downgrade con prorrateo
- `SubscriptionService.pauseSubscription(subId, months)` — Stripe SubscriptionSchedule pause
- `SubscriptionService.resumeSubscription(subId)` — release schedule
- `SubscriptionService.cancelSubscription(subId, reason)` — Stripe cancel at_period_end + write `RetentionSaveOffer.outcome=REJECTED`
- AuditLog write per cada operación

**Definition of done**: 12/12 unit tests verdes con prismaMock + stripeMock.

#### Día 4 — Discount code service + cap validation

**Entregables**:
- `DiscountCodeService.generate(subId, opts)` — crea Stripe Coupon + PromotionCode + entry `SubscriptionDiscount`
- `DiscountCodeService.validateCap(actor, opts)` — verifica que el descuento esté dentro del cap del partner tier
- `DiscountCodeService.requestApproval(actor, opts)` — si excede cap, crea pending approval entry + email PARTNER_ADMIN
- Multi-phase pricing via `SubscriptionScheduleService.createPhases(subId, phases[])`

**Definition of done**: cap validation por tier funciona + 10/10 unit tests + integration test contra Stripe sandbox (verificar Coupon real creado).

#### Día 5 — Endpoint wiring + RBAC

**Entregables**:
- `POST /v1/nova/billing/subscriptions` (NovaTiers PLATFORM/PARTNER_*) — crear subscription
- `PATCH /v1/nova/billing/subscriptions/:id` — change plan
- `POST /v1/nova/billing/subscriptions/:id/discount-codes` — generar discount
- `GET /v1/nova/billing/subscriptions/:id/events` — audit log
- `GET /v1/billing/subscription` (ORG_OWNER only) — cliente ve su propia subscription
- `POST /v1/billing/cancel` (ORG_OWNER) — inicia cancel flow con save offer
- `POST /v1/billing/customer-portal-session` — genera Stripe Customer Portal URL temporal

**Definition of done**: integration tests RBAC 24/24 verdes (cada endpoint × happy/wrong-tier/wrong-org).

---

### Fase 2 — Wizard integration (3 días)

#### Día 6 — Step 7.5 "Plan y descuento" frontend

**Entregables**:
- Nuevo step `plan-discount` insertado entre `integrations` y `activation` en `WIZARD_STEPS`
- Componente `StepPlanDiscount.tsx`:
  - Selector de plan (Starter / Pro / Enterprise) con preview de pricing
  - Toggle "Aplicar descuento"
  - Selector porcentaje (% off) con validación cap del consultor
  - Selector duración (once / 1m / 3m / 6m / 12m / forever)
  - Textarea razón (visible solo a ZaharDev en audit)
  - Preview del cobro: "Mes 1-3: $1,800 MXN. Mes 4+: $2,400 MXN. Total año 1: $26,400 MXN"
- Store wizard extension: `planTier`, `discountEnabled`, `discountPercent`, `discountDuration`, `discountReason`, `multiPhasePricing[]`

**Definition of done**: Step navegable, preview cálculo correcto, cap validation visible inline.

#### Día 7 — Backend `wizardActivate` extension

**Entregables**:
- DTO `WizardActivateDto` extendido con `planTier` + `discount?` + `multiPhasePricing?`
- `WizardActivationService.activate()` extendido:
  - Después del `$transaction` que crea Org+LE+Properties+Owner, crear Stripe Customer + Subscription
  - Si `discount` presente: crear Stripe Coupon + PromotionCode + `SubscriptionDiscount` row
  - Si `multiPhasePricing` presente: crear Stripe SubscriptionSchedule con phases
  - Stripe Customer Portal session URL generada y retornada en response
- Setup link email del Org Owner ahora incluye **link directo al Customer Portal** + monto del próximo cobro

**Definition of done**: 8/8 integration tests con Stripe sandbox creando Customers + Subscriptions reales en test mode.

#### Día 8 — Email template update + activation flow E2E

**Entregables**:
- Template `activation_email.html` (Resend) actualizado:
  - Caja nueva: "Plan contratado: Pro · $1,800 MXN/mes (descuento -25% durante 3 meses)"
  - CTA secundario: "Configurar método de pago" → Stripe Customer Portal
  - Sin método de pago configurado al activate? El primer cobro intenta hasta D+7 antes de bloquear el setup link
- Frontend Step 8 (Activation): chip nuevo "Plan Pro · -25% off 3m" cuando hay descuento
- E2E test: wizard activate → Stripe Customer creado → Subscription en `incomplete` (sin payment method) → Org Owner setup → adds card via Portal → Subscription becomes `active`

**Definition of done**: flow end-to-end navegable en browser desde wizard hasta primer cobro exitoso en test mode.

---

### Fase 3 — Dashboard consultor (5 días)

#### Día 9 — `/nova/billing` landing + métricas

**Entregables**:
- Page `NovaBillingPage.tsx` con NovaShell wrap
- 4 StatTiles top: MRR actual / ARR proyectado / Churn 90d / Clientes en mora
- Query backend `GET /v1/nova/billing/metrics` con cálculo:
  - MRR = SUM(active subscriptions × current monthly amount)
  - ARR = MRR × 12
  - Churn 90d = (cancelled in last 90d) / (active 90d ago)
  - Clientes mora = subscriptions con status `past_due` or `unpaid`
- Métricas filtradas por permission: PARTNER_MEMBER solo sus assignments, PARTNER_ADMIN su firm, PLATFORM_ADMIN todo

**Definition of done**: landing renderiza con datos reales del seed + filtros funcionan.

#### Día 10 — Cliente list table + filtros

**Entregables**:
- Tabla con columnas: Cliente / Plan / MRR / Estado / Próximo cobro / Partner asignado
- Filtros: estado (active/past_due/cancelled/paused) / plan / partner / mes próximo cobro
- Sort por columnas (default: próximo cobro asc)
- Pagination cursor-based (consistent con AuditLog pattern)
- Click en row abre `NovaBillingClientDetailPage`

**Definition of done**: tabla con 50+ filas seed + filtros + pagination funcionan.

#### Día 11 — Cliente detail + acciones

**Entregables**:
- Page `NovaBillingClientDetailPage.tsx` con secciones:
  - Plan + add-ons + próximo cobro + status
  - Descuentos activos (chip + razón + quien lo generó + ciclos restantes)
  - Add-ons disponibles (botones para activar Sign DLC / Market Intel / etc)
  - Historial de cobros (invoices con link a Stripe hosted invoice URL)
- Botones acción: "Generar descuento" / "Cambiar plan" / "Pausar subscription" (PARTNER_ADMIN+) / "Ver en Stripe ↗"

**Definition of done**: detail page rendering + acciones disparan endpoints backend correctamente.

#### Día 12 — Generar discount code modal + approval flow

**Entregables**:
- Modal `GenerateDiscountDialog.tsx` con form:
  - Porcentaje (slider 5-50%, max según cap del actor)
  - Duración (once / 1m / 3m / 6m / 12m / forever) con visual del impacto
  - Razón (textarea required >20 chars)
  - Code preview ("ZAHAR-{slug}-2026")
  - Preview del cobro del cliente con/sin descuento
- Submit:
  - Si dentro de cap → call `POST /v1/nova/billing/.../discount-codes` direct
  - Si excede cap → call `POST /v1/nova/billing/.../discount-codes/request-approval` + toast "Solicitud enviada al admin"
- ConsultorDiscountTemplate: botón "Guardar como mi código favorito" después de generar

**Definition of done**: 6/6 unit tests modal + integration test approval flow.

#### Día 13 — Pending approvals queue (PARTNER_ADMIN+)

**Entregables**:
- Page `/nova/billing/approvals` (PARTNER_ADMIN+ only)
- Lista de discount approval requests pending con: solicitante / cliente / detalles del descuento / razón
- Actions: Aprobar / Rechazar (con razón obligatoria si rechaza)
- Aprobación dispara generación del Stripe Coupon + audit log entry
- Email al solicitante con outcome
- Badge en sidebar con count de approvals pending

**Definition of done**: queue + actions + email notifications funcionan.

---

### Fase 4 — App cliente (4 días)

#### Día 14 — `/settings/billing` landing + Stripe Customer Portal embed

**Entregables**:
- Page `SettingsBillingPage.tsx` en `apps/web/src/pages/` (cliente PMS, no Nova)
- Permission gate: ORG_OWNER only — ORG_STAFF redirect a settings home
- Secciones:
  - Plan actual con next billing date + monto + currency
  - Descuentos activos
  - Método de pago (botón "Gestionar" → Stripe Customer Portal new tab)
  - Recordatorios (toggles email / WhatsApp + días)
- Endpoint `POST /v1/billing/customer-portal-session` retorna URL temporal Stripe
- Stripe Portal configurado en dashboard (return_url, allowed actions, branding)

**Definition of done**: cliente puede ver su plan + abrir Stripe Portal + actualizar tarjeta + return a Zenix.

#### Día 15 — Invoice history + download PDFs

**Entregables**:
- Tabla "Recibos" con columnas: Fecha / Período / Monto / Estado / Acciones
- Endpoint `GET /v1/billing/invoices?limit=50&cursor=X` cursor pagination
- Action button "Descargar PDF" → Stripe `invoice.invoice_pdf` URL (hosted by Stripe, no need to generate)
- Empty state si no hay invoices yet (cliente recién activado)

**Definition of done**: cliente puede ver + descargar todas sus invoices.

#### Día 16 — Cancel flow con save offer ladder

**Entregables**:
- Botón "Cancelar suscripción" en SettingsBillingPage
- Modal multi-step:
  - **Step 1**: Survey forzado "¿Por qué cancelas?" con 6 razones (radio + "Otro" textarea)
  - **Step 2**: Save offer condicional según reason — cada uno con un `SaveOfferComponent` específico:
    - "Es caro" → `DiscountSaveOffer` (-30% / 3m con un click)
    - "No uso features" → `BookSessionSaveOffer` (Calendly embed o form simple)
    - "Cierre temporal" → `PauseSaveOffer` (1m / 3m con preview del resume date)
    - "Competidor" → `CounterOfferSaveOffer` (textarea + "agenda call con sales")
    - "Soporte" → `EscalationSaveOffer` (form para agendar con CSM lead)
    - "Otro" → `GenericSaveOffer` (genérico -15% 1m)
  - **Step 3**: Confirmación final con botón "Cancelar de todos modos" siempre visible
- Endpoint `POST /v1/billing/save-offer/accept` aplica el coupon + retorna a Settings con success toast
- Endpoint `POST /v1/billing/cancel` cancela subscription al fin del período actual
- Entry `RetentionSaveOffer` con outcome registrado en cada paso

**Definition of done**: 6 ramas del save offer funcionan + outcome tracked + cancel button siempre <2 clicks (compliance check).

#### Día 17 — Reminder preferences + notificaciones in-app

**Entregables**:
- UI toggles en SettingsBillingPage:
  - Email reminders: D-7 / D-3 / D-1 (default D-3 + D-1)
  - WhatsApp reminders: D-2 (opt-in, requiere número WhatsApp verificado)
- Endpoint `PATCH /v1/billing/notification-preferences`
- Schema: `User.billingNotificationPreferences: Json` con `{ emailDays: number[], whatsappDays: number[], whatsappNumber?: string }`
- In-app banner top en `app.zenix.com` cuando subscription `past_due`:
  - Día 0-7: amarillo "Tu pago no se procesó. Reintentaremos el [fecha]."
  - Día 7-14: amarillo más intenso + CTA "Actualizar método de pago"
  - Día 14+: rojo + "Modo limitado activado. Actualiza tu método de pago para reactivar."

**Definition of done**: preferences persisted + banner aparece según subscription status.

---

### Fase 5 — Dunning + reminders backend (4 días)

#### Día 18 — Stripe Smart Retries config + reminder cron

**Entregables**:
- Stripe dashboard config: Smart Retries enabled + email notification template customized + max attempts = 4 en 21 días
- Cron `BillingReminderScheduler` `@Cron('0 9 * * *', timeZone: 'America/Mexico_City')` daily 9am:
  - Query subscriptions con `currentPeriodEnd ∈ [now+1d, now+7d]`
  - Match cada subscription contra `User.billingNotificationPreferences.emailDays`
  - Si match → dispatch a `BillingReminderEmailService.sendReminder(subId, daysOut)`
- Idempotencia: `SubscriptionEvent.type='REMINDER_SENT' + metadata.daysOut` previene duplicates si cron corre 2× (e.g. server restart)

**Definition of done**: cron testeable manualmente + reminders se envían a clientes match + no duplicates.

#### Día 19 — Email templates dunning + WhatsApp templates

**Entregables**:
- Templates Resend HTML + plain-text:
  - `billing_reminder_d3.html` — friendly heads-up con monto + fecha + CTA "Verificar método de pago"
  - `billing_reminder_d1.html` — más directo "Mañana procesamos tu cobro"
  - `billing_payment_succeeded.html` — recibo con invoice PDF link
  - `billing_payment_failed.html` — con CTA "Actualizar método de pago" + explicación próximos pasos
  - `billing_payment_failed_d7.html` — escalado, "Modo limitado en 7 días"
  - `billing_subscription_paused.html` — confirmación pause + resume date
  - `billing_subscription_cancelled.html` — confirmación cancel + grace period info
- WhatsApp templates pre-aprobados Meta (4 templates):
  - `billing_reminder_d2`
  - `billing_payment_failed_d7`
  - `billing_payment_failed_d14`
  - `billing_subscription_cancelled`

**Definition of done**: emails se ven bien en Gmail/Outlook/Apple Mail. WhatsApp templates submitted a Meta para approval (lead time 5-10 días — owner activa pre-sprint).

#### Día 20 — WhatsApp integration Twilio + escalation flow

**Entregables**:
- `WhatsAppService` con Twilio Business API client
- Method `sendTemplate(toNumber, templateName, variables)` con error handling fail-soft
- Cron `DunningEscalationScheduler` `@Cron('0 10 * * *')`:
  - Query subscriptions con `status='past_due'` agrupadas por días desde primera falla
  - D-3 post-failure: email retry attempt
  - D-7: email + WhatsApp (si opt-in) + in-app banner amber
  - D-14: email + WhatsApp + in-app banner red + flag subscription para read-only mode
  - D-21: subscription pasa a `suspended` + email + WhatsApp
  - D-30: assign to CSM queue (manual outreach humano)
- Idempotencia per (subscriptionId, daysSinceFailure) — no duplicates

**Definition of done**: escalation funciona end-to-end testeada con subscription mock past_due en sandbox.

#### Día 21 — Read-only mode + suspended mode

**Entregables**:
- Schema: `Organization.billingStatus: enum 'ACTIVE' | 'READ_ONLY' | 'SUSPENDED' | 'DORMANT'`
- Webhook handler: cuando `subscription.status` cambia a `past_due` día 14+ → set `billingStatus='READ_ONLY'`
- `TenantContextService` checa `billingStatus` y rechaza writes (post / patch / delete) si `READ_ONLY` con HTTP 402 Payment Required + body `{ code: 'BILLING_READ_ONLY', message: '...' }`
- Frontend interceptor: error 402 → modal "Modo limitado" con CTA "Actualizar método de pago"
- `SUSPENDED` día 21+: solo permite endpoints `/billing/*` + `/auth/logout` + read invoices. Resto retorna 402.
- Re-activación: cuando subscription paga exitosamente → `billingStatus='ACTIVE'` automatic via webhook + email confirmation

**Definition of done**: read-only mode bloquea writes pero permite reads + cliente puede recuperar acceso pagando + transición ACTIVE↔READ_ONLY↔SUSPENDED tested.

---

### Fase 6 — Tests + docs + polish (2 días)

#### Día 22 — E2E tests + edge cases

**Entregables**:
- Test suite end-to-end Playwright (o equivalent):
  - Happy path: wizard activate → first payment → renewal → reminder → payment succeeded
  - Failed payment: webhook payment_failed → email D-3 → email D-7 → WhatsApp → read-only mode → cliente actualiza tarjeta → reactivación
  - Save offer accept: cliente cancel → survey → save offer "-30% 3m" → accept → subscription continúa
  - Save offer reject: same → reject → confirm → subscription cancel at_period_end
  - Pause flow: cliente cancel → save offer pause 3m → accept → subscription paused + email confirmation → 3 meses después auto-resume
- Edge cases:
  - Customer Portal session expired
  - Webhook out-of-order (cancel viene antes que update)
  - Multiple discounts conflictivos (Stripe rechaza, mostrar error apropiado)
  - Currency change post-activate (no soportado v1.1, mostrar warning)

**Definition of done**: 12/12 E2E tests verdes + 8/8 edge cases handled gracefully.

#### Día 23 — Decisiones en CLAUDE.md + sales-master update + sprint close

**Entregables**:
- §D-BILL-1..10 registradas en sección Non-Negotiable de CLAUDE.md
- `docs/zenix-sales-master.md` actualizado con:
  - Pricing tiers definitivos validados con piloto
  - Sección "Negotiation flexibility for partners" con discount tier cap matrix
  - Sección "Retention" con save offer playbook
  - Tabla diferenciadores billing vs competidores LATAM
- `docs/prices-packages.md` actualizado con precios finales validados
- Bitácora cambios mayores en CLAUDE.md
- Sprint close commit + branch ready for PR

**Definition of done**: doc updates verdes + CLAUDE.md §-numbering correcto + PR description draft listo.

---

## 4. Dependencias externas (pre-requisitos owner)

| Item | Owner activa antes de... | Lead time | Costo aprox |
|---|---|---|---|
| Stripe account live mode verified | Día 1 | 1-3 días business verification | $0 setup + 0.5% fees on invoices |
| Twilio WhatsApp Business API account | Día 18 | 1-2 días setup | $0 setup + $0.025/template msg |
| Meta WhatsApp Business templates pre-aprobados (4 templates) | Día 19 | **5-10 días review per template** ← gating | $0 |
| Pricing tiers definitivos validados con 1-2 prospectos | Día 6 | 1-2 semanas owner + prospectos | $0 |
| Cap percentages per partner tier finalizados | Día 4 | 1 semana owner | $0 |
| `RESEND_API_KEY` ya existe ([env.example](../../apps/api/.env.example) Day 18 Nova sprint) | — | — | $20/mes 50k emails |

**Crítico**: WhatsApp templates Meta-approval es el long-pole con 5-10 días review per template × 4 templates. Owner debe enviar templates a aprobación **2 semanas antes del kickoff del sprint** para no bloquear Día 19-20.

---

## 5. Riesgos + mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|:---:|:---:|---|
| Meta rechaza WhatsApp templates → reminder solo email | Media | Bajo | Templates conservadores (no marketing copy, solo transaccional). Lead time generoso (2 sem buffer). |
| Stripe webhook downtime → state desync con Zenix | Baja | Medio | Idempotencia stripeEventId UNIQUE + nightly reconciliation job + dashboard health check |
| Cliente con tarjeta declined LATAM repetidos (15-22% rate) | Alta | Medio | OXXO Pay (Conekta) + SPEI bank transfer fallback en `/billing` (deferred a v1.1.x post-launch) |
| Consultor abusa discount codes forever para cerrar deals fáciles | Media | Alto | Cap per tier + monthly review PARTNER_ADMIN + audit log dashboard "discounts emitidos último mes" |
| Save offer flow disparado por cliente "exploratorio" baja revenue | Media | Bajo | Solo 1 save offer per subscription per 6 meses (cooldown). Si rechaza, no muestra otro en 6m. |
| PROFECO complaint por "cancel flow es engañoso" | Baja | Alto | Botón cancel SIEMPRE visible <2 clicks. Save offers son páginas separadas con back button always visible. UX review pre-launch con compliance check FTC + PROFECO. |
| Currency change post-activate causa data issues | Baja | Medio | Bloquear currency change v1.1. Documentar en error message. v1.2 con FX-LATAM permite cambio. |
| Cliente pausa subscription indefinidamente | Baja | Bajo | Pause máximo 3 meses. Después auto-resume con tarjeta saved o auto-cancel con email warning D-7. |
| Discount code generado se filtra (shared en redes) | Baja | Medio | PromotionCode con `customer: stripeCustomerId` binding — solo el customer especifico puede usarlo. |
| Bug en cap validation permite consultor exceder | Baja | Alto | Validación en 3 capas: frontend (UI disable) + backend pre-flight + Stripe Coupon metadata audit periodic |

---

## 6. Definition of Done — sprint completo

Sprint cerrado cuando:

- [ ] 6 modelos Prisma + migration deployed local + tests passing
- [ ] Stripe wiring backend con webhook + idempotencia + 12+ unit tests
- [ ] Wizard Step 7.5 navegable + activación crea Stripe Subscription real en test mode
- [ ] `/nova/billing` con métricas MRR/ARR/churn + cliente list + filtros + pagination
- [ ] Discount code generation con cap validation per tier + approval workflow
- [ ] `app.zenix.com/settings/billing` con Stripe Customer Portal + invoices + cancel flow
- [ ] Save offer ladder funcional con 6 ramas + outcome tracking
- [ ] Dunning cron 21 días con escalación email → WhatsApp → read-only → suspended
- [ ] Reminder preferences UI + cron D-3/D-1 funcional
- [ ] WhatsApp templates Meta-approved + Twilio wiring tested
- [ ] Read-only mode bloquea writes pero permite reads + recovery automatic
- [ ] 12 E2E tests + 8 edge cases passing
- [ ] §D-BILL-1..10 registradas en CLAUDE.md
- [ ] `zenix-sales-master.md` + `prices-packages.md` actualizados
- [ ] Backend + frontend typecheck verde
- [ ] Lint + tests CI verde

---

## 7. Estimación rebajada — versiones acortadas

Si owner necesita acelerar / postergar fases:

### MVP Reducido (12-14 días) — solo lo crítico para v1.1.0
- Fase 1 (5d) + Fase 2 (3d) + parte Fase 3 (3d) + parte Fase 5 (3d)
- Skip: discount approval flow, save offer ladder full, multi-phase pricing UI, WhatsApp templates
- Activación: Stripe Subscription se crea, discount simple (% off + duration), dunning básico (Smart Retries solo + email reminders), Customer Portal embed
- Cancel: directo sin save offers (lawyer doc + PROFECO compliance check still)

### Sprint completo BILLING-CORE+ (22-26 días)
- Todo lo planeado arriba + extras:
  - OXXO Pay (Conekta) fallback para clientes sin tarjeta
  - SPEI / bank transfer alternativo
  - Annual contracts con descuento -20% upfront
  - Multi-currency invoice (USD/MXN/COP) — requires v1.2 FX-LATAM

### Roadmap escalonado recomendado
- **v1.1.0 BILLING-CORE** (18-22d): plan principal
- **v1.1.1 BILLING-WHATSAPP** (~3d): si templates Meta no listos al sprint inicial, agregarlos post-launch
- **v1.1.x BILLING-OXXO** (~5d): OXXO Pay + SPEI fallback (LATAM-specific)
- **v1.2 BILLING-MULTI-CURRENCY** (~5d): bundled con FX-LATAM sprint

---

## 8. Decisiones pendientes del owner antes de kickoff

1. **Pricing tiers finales validados** — el doc 15-billing propone Starter $60 / Pro $120 / Enterprise $240 USD. Validar con 1-2 prospectos reales antes de hard-code.

2. **Cap percentages per partner tier** — propuesta:
   - AUTHORIZED: 15% / 3 meses
   - SILVER: 25% / 6 meses
   - GOLD: 35% / 12 meses
   - PLATINUM: 50% / forever
   - PLATFORM_ADMIN: sin límite

3. **Política de save offers** — owner valida los 6 templates condicionales (texto + descuento exacto per reason).

4. **WhatsApp templates content** — Meta requiere texto exacto al pre-aprobar. Owner valida copy de los 4 templates antes de submit.

5. **Annual contracts** — ¿incluir en v1.1.0 o defer a v1.1.x? Annual = mejor cash flow + lock-in pero requiere flow de upfront billing distinto.

6. **Free trial** — ¿ofrecer 14d free trial o no? Argumentos pro (industria SaaS norma) vs contra (consultor-led onboarding ya elimina friction de venta, trial podría diluir señal de compromiso).

7. **OXXO Pay urgency** — si primer cliente piloto pide pagar con OXXO/SPEI desde el inicio, ¿bumpear de v1.1.x a v1.1.0?

---

## Apéndice — Surface map

```
Backend
├── apps/api/src/billing/
│   ├── billing.module.ts
│   ├── subscription.service.ts          # CRUD subscriptions
│   ├── discount-code.service.ts         # Coupons + PromotionCodes + cap validation
│   ├── invoice.service.ts               # Mirror Stripe invoices
│   ├── retention-save-offer.service.ts  # Save offer logic
│   ├── billing-reminder.scheduler.ts    # Cron daily 9am — reminders D-3/D-1
│   ├── dunning-escalation.scheduler.ts  # Cron daily 10am — past_due escalation
│   ├── billing.controller.ts            # /v1/billing/* (cliente)
│   ├── nova-billing.controller.ts       # /v1/nova/billing/* (consultor)
│   ├── stripe-webhook.controller.ts     # /v1/webhooks/stripe (Public)
│   ├── whatsapp.service.ts              # Twilio Business API wrapper
│   ├── billing-email.service.ts         # Resend templates
│   └── dto/
│       ├── create-subscription.dto.ts
│       ├── generate-discount-code.dto.ts
│       ├── cancel-subscription.dto.ts
│       └── accept-save-offer.dto.ts

Frontend (cliente)
├── apps/web/src/pages/
│   └── SettingsBillingPage.tsx          # /settings/billing landing
├── apps/web/src/components/billing/
│   ├── PlanSummaryCard.tsx
│   ├── PaymentMethodCard.tsx            # CTA → Stripe Customer Portal
│   ├── InvoiceHistoryTable.tsx
│   ├── ReminderPreferencesForm.tsx
│   ├── CancelSubscriptionFlow.tsx        # multi-step survey + save offer
│   ├── BillingStatusBanner.tsx           # past_due in-app banner
│   └── save-offers/
│       ├── DiscountSaveOffer.tsx
│       ├── BookSessionSaveOffer.tsx
│       ├── PauseSaveOffer.tsx
│       ├── CounterOfferSaveOffer.tsx
│       ├── EscalationSaveOffer.tsx
│       └── GenericSaveOffer.tsx

Frontend (Nova consultor)
├── apps/web/src/nova/pages/
│   ├── NovaBillingPage.tsx              # /nova/billing landing
│   ├── NovaBillingClientDetailPage.tsx  # /nova/billing/clients/:id
│   └── NovaBillingApprovalsPage.tsx     # /nova/billing/approvals (PARTNER_ADMIN+)
├── apps/web/src/nova/components/billing/
│   ├── BillingMetricsRow.tsx            # MRR/ARR/Churn/Mora stats
│   ├── ClientBillingRow.tsx
│   ├── GenerateDiscountDialog.tsx
│   ├── DiscountCodePreview.tsx
│   └── ConsultorDiscountTemplatesList.tsx

Wizard integration
└── apps/web/src/nova/components/wizard/
    └── StepPlanDiscount.tsx              # Step 7.5 inserted

Schema
└── apps/api/prisma/migrations/
    └── 20260601000000_billing_core_schema/migration.sql
```
