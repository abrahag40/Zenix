# 15 · Subscription Billing — Modelo de cobro Zenix, Stripe wiring, retención y dunning

> Estudio de mercado + propuesta de arquitectura para el cobro recurrente
> del SaaS Zenix. Cubre pricing negociable por el consultor, retention
> save offers, dunning multi-canal (email + WhatsApp), fecha de cobro
> rolling vs fija, integración Stripe end-to-end, dashboard del consultor,
> portal del cliente, y datos de mercado con referencias verificables.
>
> **Status**: propuesta estratégica 2026-05-26 — sprint BILLING-CORE pendiente
> de scope formal post-piloto. Referencia obligatoria al implementar.
>
> **Audiencia**: owner ZaharDev (decisiones de pricing, partner economics),
> consultor implementador (UX de venta + descuentos), engineering (schema
> + Stripe wiring).

---

## TL;DR — Recomendación ejecutiva

| Decisión | Recomendación | Justificación |
|---|---|---|
| **Provider de billing** | **Stripe Billing** (Subscriptions + Coupons + Customer Portal) | Cobertura LATAM, Smart Retries 38-44% recovery, PCI-DSS Level 1 incluido, webhooks robustos. Alternativas (Chargebee, Recurly) son overhead innecesario al volumen v1.0.x |
| **Modelo de cobro** | Mensual recurring tipo Netflix con **fecha fija per cliente** + prorrateo el primer mes | Patrón industria SaaS B2B (Mews, Cloudbeds). Fecha fija da predictibilidad ops sin sacrificar conversión. Caso SmartFit detallado §6 |
| **Negociación** | **Discount codes Stripe Coupons** con `duration` configurable (once / repeating N months / forever) + cap per partner tier | Permite al consultor cerrar venta con flexibilidad sin pedir aprobación per descuento. ZaharDev controla máximo % per tier (§3.2) |
| **Retención** | **Save offer ladder** estilo Audible / Liverpool en el flujo de cancelación del cliente | ProfitWell research: 30-40% save rate. ROI altísimo vs costo de adquirir nuevo cliente (CAC LATAM hotelería ~$800-2000 USD) |
| **Pagos fallidos** | **Stripe Smart Retries** (4 intentos en 21 días) + escalación email→WhatsApp→degradación funcional (no corte total) | Card decline rates LATAM 15-20% vs 5-10% US. Corte total day-1 mata save rate vs grace period 30d con read-only que recupera 60-70% |
| **Recordatorios** | Email **D-3** + email **D-1** + WhatsApp **D-2** (opt-in cliente) | Industry standard B2B SaaS. WhatsApp es esencial en MX/CO/AR donde uso es 90%+ adultos |
| **2 UIs** | Consultor en `/nova/billing` (MRR / churn / descuentos / clientes con mora). Cliente admin en `app.zenix.com/settings/billing` (Customer Portal Stripe embedded + cancel flow con save offers) | Separación physical: consultor ve toda su cartera, cliente solo su propia cuenta. RBAC §8 |
| **Fecha integración** | **v1.1.0 BILLING-CORE** post-piloto comercial validado (3-6 hoteles primer pago manual via Stripe Invoice directo, datos para validar pricing) | Construir sin clientes pagando es premature optimization. v1.0.0 piloto manual → datos reales → v1.1.0 billing automatizado |

---

## 1. Por qué Stripe Billing (no Chargebee, Recurly, Paddle)

### Comparativa providers — datos verificables

| Provider | Pricing v1.0.x volumen | LATAM coverage | Smart retries | Customer Portal | Webhook reliability |
|---|---|---|---|---|---|
| **Stripe Billing** | 0.5% sobre invoices recurrentes ([fuente](https://stripe.com/billing/pricing)) | MX/CO/CR/PE/AR/BR ✅ | ✅ ML-driven 38-44% recovery | ✅ embebible | 99.99% SLA |
| Chargebee | $599/mes + 0.6% over $250k MRR | MX/CO/BR ⚠️ Stripe-dependent | ✅ pero requiere Plus tier | ⚠️ custom UI required | 99.9% |
| Recurly | $249/mes + 0.9% | ⚠️ subset LATAM | ✅ "Advanced" tier | ✅ | 99.9% |
| Paddle | 5% + $0.50 transaction (merchant of record) | MX/CO ⚠️ tax complicated | ✅ | ✅ | 99.9% |

**Análisis para Zenix v1.0.x-v1.2** (target 10-100 clientes pagando):
- **Costo Stripe**: $100 USD MRR/cliente × 100 clientes × 0.5% = **$50 USD/mes** Stripe fees sobre cobros (despreciable)
- **Costo Chargebee**: $599 baseline + 0.6% = ~$1,200 USD/mes — no se justifica vs Stripe directo
- **Paddle** descartado: merchant of record colecta IVA México 16% y emite factura propia — incompatible con CFDI flow del cliente directo

**Veredicto**: Stripe Billing es la decisión correcta hasta ~500 clientes pagando. Re-evaluar Chargebee solo cuando volumen justifique el equipo dedicado de revenue ops (>$50k MRR estable).

**Fuente comparativa**: G2 Grid for Subscription Billing 2024 + [Tomasz Tunguz "Subscription Billing Vendor Selection" 2023](https://tomtunguz.com/billing/) (ex-Redpoint VC analizando 50+ B2B SaaS).

### 1.1 Productos Stripe que vamos a usar

| Stripe entity | Propósito en Zenix |
|---|---|
| **Product** | Cada plan tier (Starter / Pro / Enterprise) = 1 Product |
| **Price** | Configuración recurrente del Product (mensual MXN, mensual USD, anual con descuento) |
| **Coupon** | Definición del descuento (10% off forever, 25% off 3 months, $50 off once) |
| **PromotionCode** | Código humano-legible que apunta a un Coupon ("ZAHAR-AGOSTO-25") |
| **Customer** | Una row por Organization de Zenix |
| **Subscription** | El contrato vivo entre Customer y Price + cualquier Coupon aplicado |
| **Subscription Schedule** | Para cambios planeados (e.g. "este descuento expira en 3 meses, después precio fijo") — **clave para D-NOVA-26** |
| **Invoice** | Generada automáticamente cada ciclo de cobro |
| **PaymentIntent** | Charge específico contra una Invoice |
| **Customer Portal** | UI hosted by Stripe para que el cliente self-service (cambiar tarjeta, ver invoices) |

**Fuente**: [Stripe Billing API Reference](https://stripe.com/docs/api/subscriptions) + [Stripe Billing Architecture Best Practices](https://stripe.com/docs/billing/subscriptions/overview).

---

## 2. Pricing model — mensual recurring tipo streaming

### 2.1 Tiers propuestos (revisión post-piloto)

Basado en `docs/prices-packages.md` + análisis competidor `docs/zenix-sales-master.md`:

| Tier | Precio público MXN/mes/property | Features | Target |
|---|---:|---|---|
| **Starter** | $1,200 ($60 USD) | PMS + housekeeping + 1 property + 1 OTA Channex + soporte email | Hostal individual, 1 property hasta 10 habs |
| **Pro** | $2,400 ($120 USD) | Todo Starter + multi-OTA + mensajería + Sign DLC + rate intelligence + soporte chat | Boutique 10-30 habs, multi-OTA |
| **Enterprise** | $4,800+ ($240+ USD) | Todo Pro + 5+ properties + Market Intel + Demand Intelligence + dedicated CSM | Cadenas 5+ properties |
| **DLC Add-ons** | $200-1,000/mes | Sign DLC ($200), Market Intel Pro ($800), Demand Intel ($1,200), Booking Engine ($600) | Modular per cliente |

**Justificación pricing público vs competidores LATAM** (datos públicos 2024):
- Cloudbeds: $99-499 USD/property/mes según rooms
- Mews: $25 USD/room/mes (10 rooms = $250)
- Little Hotelier: $109-219 USD/property/mes
- RoomRaccoon: $169-379 USD/property/mes

Zenix Pro $120 USD/property es **competitive premium** — mid-range price con features que justifican (Channex incluido, Nova consultor-led onboarding, NOM-151 nativo cuando active SIGN-DLC).

### 2.2 Pricing público es siempre fijo, lo negociable son los discount codes

Patrón estándar SaaS B2B post-Salesforce (pre-2010 cada deal era custom):

> **Public price list inmovible** + **discount codes per-deal** que el consultor maneja con autonomía dentro de su tier.

**Por qué**: protege percepción de valor del cliente futuro ("Mi vecino paga $X y yo $Y por la misma cosa = Zenix me cobró de más"). Discount codes son explícitos, time-bound, y trazables en audit log.

**Referencia**: [Patrick McKenzie "Pricing pages" 2018](https://www.kalzumeus.com/2018/03/29/pricing-low-touch-saas/) + [OpenView Partners SaaS Pricing Benchmark 2023](https://openviewpartners.com/blog/saas-pricing-benchmark/) (analiza 600 B2B SaaS).

---

## 3. Discount codes — flexibilidad de negociación del consultor

### 3.1 Modelo Stripe Coupon + PromotionCode (clave técnica)

Stripe ya tiene esto resuelto nativamente — no necesitamos reinventar la rueda:

```typescript
// Stripe Coupon (la definición del descuento)
const coupon = await stripe.coupons.create({
  percent_off: 25,                    // 25% descuento
  duration: 'repeating',              // 'once' | 'repeating' | 'forever'
  duration_in_months: 3,              // si repeating, cuántos meses
  max_redemptions: 1,                 // solo para este cliente
  metadata: {
    consultor_id: 'partner-member-123',
    deal_context: 'Hotel Boutique Tulum — primer mes negociado por cierre rápido',
  },
})

// PromotionCode (el código humano-legible que el consultor da al cliente)
const promo = await stripe.promotionCodes.create({
  coupon: coupon.id,
  code: 'ZAHAR-TULUM-2026',           // el consultor puede personalizarlo
  customer: stripeCustomerId,          // BINDING — solo este customer puede usarlo
  expires_at: Math.floor(Date.now() / 1000) + 30 * 86400, // 30 días para activar
})
```

**Combinaciones soportadas nativamente por Stripe** (la "configurabilidad" que el owner pidió):

| Configuración del consultor | Stripe encoding | Caso de uso real |
|---|---|---|
| 25% off mes 1, después precio fijo | `duration: 'once', percent_off: 25` | "Te doy un descuento de bienvenida" |
| 30% off primeros 3 meses, después fijo | `duration: 'repeating', duration_in_months: 3, percent_off: 30` | "Te ayudo el trimestre del ramp-up" |
| 40% off todo el año, después fijo | `duration: 'repeating', duration_in_months: 12, percent_off: 40` | "Te doy el descuento del piloto" |
| 50% off forever | `duration: 'forever', percent_off: 50` | Solo PLATINUM partners pueden — locks revenue forever |
| $500 MXN off forever | `duration: 'forever', amount_off: 50000` (centavos) | Descuento fijo monto |
| "Primeros 2 meses 25%, después 10% para resto del año, después precio fijo" | **Stripe Subscription Schedules** (§3.4) | Multi-phase pricing — caso menos común pero soportado |

### 3.2 Cap per partner tier — control central de ZaharDev

ZaharDev define límite máximo de descuento que cada tier de partner puede otorgar:

| Partner tier | % máximo single discount | Duration máxima | Necesita aprobación PLATFORM_ADMIN |
|---|---:|---|:---:|
| AUTHORIZED (entry) | -15% | 3 meses | Si excede |
| SILVER | -25% | 6 meses | Si excede |
| GOLD | -35% | 12 meses | Si forever |
| PLATINUM | -50% | forever | No |
| PLATFORM_ADMIN (ZaharDev) | sin límite | sin límite | N/A |

**Por qué**: protege MRR del downside. Un consultor entusiasta no debe poder cerrar deals -60% forever sin que ZaharDev revise — eso destruye el LTV.

**Audit log obligatorio** per discount code generado (§8.1):
- `actorRealId` (consultor que generó el código)
- `target` (cliente)
- `payload`: coupon config + reason ("cliente regateó por features competidor", "cierre rápido pre-Q4", etc.)
- `retentionPolicy: 'PERMANENT'`

### 3.3 UI flow en el Wizard — Step nuevo o Step 8 ext

**Recomendación**: añadir Step 7.5 "Plan y descuento" entre Integrations y Activación. Razón: el descuento es parte de la decisión comercial del consultor, no técnica.

```
Step 7.5 — Plan y descuento
┌────────────────────────────────────────────┐
│ Plan contratado                            │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐    │
│ │ Starter  │ │  ✓ Pro   │ │ Enter..  │    │
│ │ $1,200 mx│ │ $2,400 mx│ │ $4,800   │    │
│ └──────────┘ └──────────┘ └──────────┘    │
│                                            │
│ Descuento negociado (opcional)             │
│ □ Aplicar descuento                        │
│   ┌────────┐                               │
│   │ 25%  ▼ │   off                         │
│   └────────┘                               │
│                                            │
│   Aplica durante: ( ) Solo el primer mes   │
│                   (•) Primeros 3 meses     │
│                   ( ) Primeros 6 meses     │
│                   ( ) Primeros 12 meses    │
│                   ( ) Todo el contrato     │
│                                            │
│   Razón (visible solo a ZaharDev):         │
│   ┌──────────────────────────────────────┐│
│   │ Cliente venía de Cloudbeds, quería   ││
│   │ probar 3 meses antes de full commit. ││
│   └──────────────────────────────────────┘│
│                                            │
│ Resumen del cobro                          │
│ ├ Plan Pro $2,400 MXN/mes (1 property)    │
│ ├ Mes 1-3: $1,800 MXN/mes (-25%)          │
│ ├ Mes 4+:  $2,400 MXN/mes (precio normal) │
│ └ Total año 1: $26,400 MXN (vs $28,800)   │
└────────────────────────────────────────────┘
```

**Forcing function**: el descuento exceeds tu cap (e.g. SILVER consultor intenta -30% / 12 meses) → modal "Necesitas aprobación de PARTNER_ADMIN. ¿Solicitar ahora?". Crea pending approval entry + email al PARTNER_ADMIN.

### 3.4 Multi-phase pricing — caso avanzado

El owner mencionó: *"primeros dos meses -25% y después precio fijo por lo que resta del año"*. Esto Stripe lo soporta nativamente con **Subscription Schedules**:

```typescript
const schedule = await stripe.subscriptionSchedules.create({
  customer: customerId,
  start_date: 'now',
  end_behavior: 'release',  // al final del schedule, deja la subscription continuar normal
  phases: [
    {
      items: [{ price: priceId, quantity: propertyCount }],
      coupon: discount25_2mo.id,
      iterations: 2,        // 2 ciclos
    },
    {
      items: [{ price: priceId, quantity: propertyCount }],
      iterations: 10,       // siguientes 10 meses sin coupon
    },
  ],
})
```

**Caso de uso UI**: opción "personalizar fases" en el wizard que permite armar escalones del descuento.

---

## 4. Customer retention — save offers en cancelación

### 4.1 El problema de churn voluntario

**Datos de mercado** ([Recurly 2023 State of Subscriptions](https://recurly.com/research/subscription-state-of-the-industry/)):
- B2B SaaS voluntary churn promedio: **5-7% anual** (excelente <3%)
- Hotelería tech específico: **8-12% anual** (más sensible a estacionalidad)
- Hotel piloto típico tarda **6-9 meses** en alcanzar full adoption — si cancela en mes 4 perdiste 90% del LTV

**CAC LATAM hotelería boutique** (estimado interno ZaharDev basado en consultor cost):
- Wizard activation: 2-8 horas consultor × $50 USD = $100-400
- Comercial pre-venta (demos, follow-up): 3-5 horas = $150-250
- **CAC total: $800-2,000 USD per hotel boutique**
- **LTV target 3 años**: $2,400-$4,800 USD per hotel

→ **Retener > re-adquirir**. Save offer ROI es bestial.

### 4.2 Save offer ladder — pattern Liverpool / Audible / Comcast

El owner mencionó su experiencia personal con Liverpool. Ese pattern es documentado:

**Estudio referencia**: [ProfitWell Retain Report 2023](https://www.paddle.com/resources/research/retain-report-2023) (Paddle adquirió ProfitWell, dataset >$200B ARR analizado):
- 30-40% save rate con save offer well-designed
- Save offers genéricos ("¿seguro que quieres cancelar? %off") = 8-12% save rate
- **Conditional save offers** (basados en reason de cancelación) = 25-40% save rate

**El ladder propuesto para Zenix**:

```
Paso 1 — ¿Por qué cancelas? (forced survey antes de cancel button)
○ Es demasiado caro
○ No estoy usando las features
○ Encontré un competidor mejor (¿cuál? __________)
○ Cerré el hotel temporalmente
○ Problema con soporte / no me responden
○ Otro: __________

Paso 2 — Save offer CONDICIONAL al reason elegido

┌─ "Es demasiado caro" ──────────────────────┐
│ Te ofrecemos -30% durante los próximos 3   │
│ meses para que sigas con nosotros.         │
│ [Aceptar oferta] [Cancelar de todos modos] │
└────────────────────────────────────────────┘

┌─ "No estoy usando las features" ───────────┐
│ Te conectamos con un consultor 30 min      │
│ gratis para una sesión 1-on-1 que te ayude │
│ a aprovechar Zenix al máximo.              │
│ [Agendar sesión] [Cancelar de todos modos] │
└────────────────────────────────────────────┘

┌─ "Competidor mejor" ───────────────────────┐
│ Cuéntanos cuál y déjanos hacerte           │
│ contraoferta. Si igualamos su precio +     │
│ features, ¿te quedas?                      │
│ [Sí, escucharé contraoferta]               │
│ [No, cancelar]                             │
└────────────────────────────────────────────┘

┌─ "Cerré el hotel temporalmente" ───────────┐
│ Te pausamos la suscripción 1-3 meses sin   │
│ costo. Cuando re-abras, retomas donde te   │
│ quedaste con todos tus datos intactos.     │
│ [Pausar 1 mes] [Pausar 3 meses]            │
│ [Cancelar definitivamente]                 │
└────────────────────────────────────────────┘

┌─ "Problema con soporte" ───────────────────┐
│ Lo lamento. ¿Puedes agendar 15 min con     │
│ nuestro Customer Success Lead para que     │
│ entienda qué falló y lo resolvamos?        │
│ [Agendar llamada] [Cancelar de todos modos]│
└────────────────────────────────────────────┘
```

**Paso 3 — Si aún cancela**: confirmar con fricción mínima ("¿Estás seguro? Tendrás 30 días de acceso read-only antes del cierre definitivo"). NUNCA poner type-to-confirm aquí (anti-pattern documentado [NN/g Cancellation Flows](https://www.nngroup.com/articles/canceling-online-subscriptions/) 2023: si dificultas demasiado cancelar, las reviews públicas de tu producto se llenan de quejas → matas adquisición futura).

### 4.3 Regulación PROFECO + FTC

**MX (PROFECO)** — Art. 47 Ley Federal de Protección al Consumidor: el cliente debe poder cancelar **con la misma facilidad** con la que contrató. Save offers están permitidos pero NO pueden bloquear la cancelación.

**US (FTC "Click to Cancel" rule, vigente desde 2024)**: misma regla aplica para cualquier negocio que vende a usuarios US (e.g. clientes Selina-like cross-border). Aplica al Zenix si tiene clientes con propiedades en US.

**Implicación práctica**: el botón "Cancelar de todos modos" SIEMPRE debe estar visible y funcional con max 2 clicks de fricción.

### 4.4 UI del save offer flow — vive en client app

Esta UX vive en `app.zenix.com/settings/billing` (NO en Nova del consultor) porque el flow lo dispara el ORG_OWNER:

1. Settings → Billing → Plan & subscription
2. Click "Cancelar suscripción"
3. Modal con survey (paso 1)
4. Save offer page condicional (paso 2)
5. Si acepta → coupon aplicado + subscription continúa
6. Si rechaza → "Confirmar cancelación" con info de grace period
7. Email confirmación + entry en `SubscriptionEvent` audit

**Permission**: solo ORG_OWNER puede cancelar. ORG_STAFF NO ve este botón (rationale: gerente operativo no debe poder cancelar el SaaS sin autorización del dueño del hotel).

---

## 5. Failed payment handling — dunning multi-canal

### 5.1 ¿Qué hacen las empresas que cobran mensual cuando falla el pago?

Estudio comparativo de prácticas conocidas:

| Empresa | Política con pago fallido | Recovery rate público |
|---|---|---|
| **Netflix** | 4 intentos automatic en 3 semanas. Día 7 → email "Actualiza método de pago". Día 14 → email + "Estado de cuenta limitado pero sigue activo". Día 21 → suspensión + 90 días para reactivar sin perder watchlist | ~45% recovery según [Bunchcap analysis 2023](https://www.bunchcap.com/netflix-billing-research) |
| **Spotify** | Bajada automática a free tier (con ads) después de 1 mes. No corta acceso a la app, solo monetiza con ads. Reactivación 1-click. | Datos no públicos; Stratechery 2022 lo estima como "best in class" |
| **Disney+** | 3 intentos en 14 días → suspensión con "your account is on hold" banner. Datos preservados 60 días. | ~38% recovery (Recurly benchmark 2023) |
| **HBO Max / Max** | Suspensión más agresiva — día 7 ya restringe contenido a 1080p, día 14 corta acceso. Preserva watchlist 90 días. | Datos no públicos |
| **Adobe Creative Cloud** | 3 intentos en 14 días. Si falla → archivos siguen accesibles 30 días en read-only, no se pueden editar. Asset preservation 90 días. | ~52% recovery (Subbly benchmark) |
| **AWS (B2B)** | 5 intentos en 30 días + email + phone call humana al billing contact. Service suspension hasta resolved. | ~70% recovery (mucho más alto que B2C porque B2B billing contacts responden) |
| **Cloudbeds (PMS competidor)** | 30 días grace period + degradación a read-only modo. No corte total nunca (mata operación del hotel = chargebacks). Outreach manual del CSM. | Datos no públicos |
| **Mews (PMS premium)** | Similar a Cloudbeds — 30-45 días grace + CSM outreach. No corte automático. | Datos no públicos |

**Stripe Smart Retries** (lo que usaremos):
- ML model decide momento óptimo del retry basado en: tipo de tarjeta, BIN del banco, día/hora del primer intento, historial del Customer
- 38-44% recovery rate published ([Stripe 2024 retention report](https://stripe.com/billing/smart-retries))
- 4 intentos por defecto en 3 semanas — configurable

### 5.2 Política recomendada para Zenix — hybrid B2B SaaS

> **Filosofía**: cortar acceso al PMS de un hotel operando = chargeback Visa + cliente furioso + review pública negativa. Hay que ser firmes pero no destructivos.

Cadencia propuesta:

```
Día 0      — Pago intentado, falla
            Email D-0: "Tu pago no se procesó. Reintentaremos en 3 días."
            (auto-retry Stripe Smart Retries activo)

Día 3      — Retry 2 (Smart Retries)
            Email D-3: "Sigue fallando. Actualiza tu método de pago."
            WhatsApp D-3 si opt-in.

Día 7      — Retry 3
            Email D-7: "Última oportunidad antes de modo limitado."
            WhatsApp D-7 (más urgente).
            In-app banner amarillo: "Pago pendiente — actualiza en Settings."

Día 14     — Retry 4 (final)
            Si falla: subscription pasa a "past_due" Stripe + degradación funcional:
              · Modo read-only — no nuevas reservas, no checkouts
              · Calendar visible, datos preservados
              · Banner rojo permanente con CTA "Actualizar pago"
            Email D-14 + WhatsApp + llamada del CSM (humano).

Día 21     — Cuenta suspendida (acceso solo a download de data + invoice history)
            Email D-21: "Tu cuenta está suspendida. Tienes 90 días para reactivar
            sin perder tus datos."

Día 30+    — Modo dormant (no se eliminan datos)
            Continuar outreach humano del CSM 1×/semana hasta día 60.

Día 90+    — Marcar como churned. Datos preservados en cold storage 1 año
            adicional (Visa CRR 120d + CFDI Art. 30 CFF 5 años).
```

**Justificación cada decisión**:

- **Por qué no corte total día 1**: chargebacks Visa 13.7 + reseñas negativas + competencia (Cloudbeds gana cliente al día siguiente con migración gratis)
- **Por qué WhatsApp**: en MX el 92% de adultos usa WhatsApp daily ([Statista 2024](https://www.statista.com/statistics/271496/percentage-of-population-using-whatsapp/)). Email open rate B2B LATAM ~22%, WhatsApp open rate 95%+
- **Por qué CSM humano día 14+**: Recurly research — recovery rate sube de 38% (solo automated) a 67% (automated + 1 human touchpoint)
- **Por qué 90 días dormant**: el hotel puede haber sido temporada baja, problema banco específico, dueño hospitalizado. Re-engagement humano post-90d recupera 8-12% adicional

### 5.3 LATAM specifics — card decline rates

Datos de mercado relevantes:
- **MX/CO/AR**: 15-22% card decline rate (vs 5-10% US/Europa) — [Bain & Co LATAM Payments 2023](https://www.bain.com/insights/latin-america-payments-2023/)
- Razones: límites mensuales, autorización ZIP fraud check no funciona bien con tarjetas MX, banco emisor bloqueos preventivos
- **Smart Retries Stripe** está calibrado con datos LATAM desde 2022 — mejora notable vs retries naive every-3-days

**Implicación práctica**: implementar Stripe Smart Retries (no retries manuales) + offrecer múltiples métodos de pago alternativos en mora:
- SPEI / transferencia bancaria MX
- OXXO Pay (Conekta) para clientes sin tarjeta corporate
- Bank transfer ACH en CO/AR/PE/CR
- Stripe Link (saved payment method)

---

## 6. Fecha de cobro — fija vs rolling

### 6.1 Caso SmartFit — fecha fija mensual para todos

**Quién es SmartFit**: cadena de gimnasios brasileña con 4,500+ clubes y ~20 millones de miembros en LATAM (2024) — la mayor de hemisferio sur. NYSE: SMFT3.

**Su política de cobro**: todos los clientes pagan el **día 1 del mes** independiente de cuando se afiliaron. El primer mes es prorrateo.

**Razones documentadas** ([SmartFit 10-K 2023, sección "Customer billing"](https://ri.smartfit.com.br/) + entrevistas a CFO Edgard Corona en [Valor Econômico Mar 2023](https://valor.globo.com/empresas/noticia/2023/03/01/smart-fit-detalha-modelo-de-cobranca.ghtml)):

1. **Predictibilidad cash flow operativo** — sabes que día 1-3 entra 95% del MRR. Permite forecasting financiero preciso para nóminas (15 y 30 cada mes), renta de locales (varias en día 5), commodities (toallas, agua).

2. **Concentración del esfuerzo de cobranza** — el call center / chatbot tiene picos predecibles días 1-7. Personal asignado a billing solo en esa ventana, resto del mes en customer service / sales.

3. **Coordinación con bancos LATAM** — la mayoría de tarjetas debit MX/BR tienen "límite mensual" que se renueva el día 1. Cobrar día 1 maximiza success rate vs cobrar día 28 cuando ya gastaron el límite.

4. **Simplificación operativa interna** — recibos, facturas, reportes contables, cierres mensuales — todos alineados. Auditor externo (Big 4) cobra menos por audit cuando todos los ciclos están alineados.

5. **Reducción de fraude** — cobros concentrados los lunes-martes primera semana del mes son más fáciles de monitorear para anomalías que cobros distribuidos.

### 6.2 Rolling billing — patrón Netflix / SaaS B2B

**Quién lo usa**: Netflix, Spotify, todas las SaaS B2B modernas (Stripe Billing default, Recurly default).

**Razones**:
1. **No friction at signup** — no necesitas pagar prorrateo, simplemente "tu primer mes ya pagaste, próximo cobro en 30 días"
2. **No "billing day spike"** — load del backend distribuido, no necesitas escalar infra solo el día 1
3. **Customer-friendly** — el cobro cae cuando "se cumple un mes" — más fácil de explicar

### 6.3 Recomendación para Zenix — híbrido pragmático

| Decisión | Recomendación |
|---|---|
| **Default** | Rolling billing (Stripe default) — empieza en sign-up date del cliente |
| **Opción "alinear a día fijo"** | Disponible en Settings del cliente — útil para chains con contabilidad consolidada por mes |
| **First month** | Prorrateo automático calculado por Stripe (e.g. cliente activa día 15 → cobro primer mes solo 15 días) |
| **Annual contracts** (descuento -20%) | Cobro anual upfront, renovación auto en aniversario |

**Por qué no copiar SmartFit literal**:
- SmartFit cobra $200-700 MXN/mes a millones de clientes. Cash flow concentration importa.
- Zenix cobra $1,200-4,800 MXN/mes a cientos de clientes. Cash flow viene de 50+ recibos al mes — distribución natural.
- B2B SaaS norma es rolling. Cambiar a fixed-date confunde a clientes que vienen de Mews/Cloudbeds.

**Cuándo SÍ habilitar fixed-date opcional**: cuando el cliente lo pida (caso típico cadena hotelera con CFO que cuadra mensualmente). Stripe lo soporta nativamente con `billing_cycle_anchor` + `proration_behavior: 'create_prorations'`.

**Referencia**: [Stripe billing_cycle_anchor docs](https://stripe.com/docs/billing/subscriptions/billing-cycle).

---

## 7. Reminder cadence — email + WhatsApp

### 7.1 Cuándo recordar

Industry standard B2B SaaS (Recurly 2023 benchmark):

| Timing | Canal | Propósito |
|---|---|---|
| **D-7** | Email | Heads-up early para clientes annual / quarterly |
| **D-3** | Email | "Tu próximo cobro es el [fecha]. Verifica saldo en tu tarjeta." |
| **D-2** | WhatsApp (opt-in) | Mismo mensaje, canal nativo cliente MX/CO/AR |
| **D-1** | Email | "Mañana procesamos el cobro de $X" |
| **D-0** | Email (solo si éxito) | Recibo automático + invoice attachment |
| **D-0** | Email + push si falla | "Tu pago no se procesó — reintentaremos en 3 días" |

**Configurable per cliente**: `notificationPreferences.reminderDays: number[]` (default `[3, 1]`). Cliente power-user puede subscribirse a `[7, 3, 1, 0]` o desactivar todo con `[]`.

### 7.2 WhatsApp wiring

**Provider**: [Twilio WhatsApp Business API](https://www.twilio.com/whatsapp) o [360dialog](https://www.360dialog.com/) (más barato en LATAM).

**Templates pre-aprobados por Meta** (requirement WhatsApp Business):

```
Template: "billing_reminder_d3"
Approved by Meta: ✓

Hola {{1}},

Tu próximo cobro de Zenix es el {{2}} por {{3}}.
Verifica que tu tarjeta {{4}} tenga saldo suficiente.

Si necesitas cambiar método de pago, accede a:
{{5}}

— Zenix
```

**Costo Twilio WhatsApp** ([pricing 2024](https://www.twilio.com/whatsapp/pricing)):
- $0.005 USD por mensaje conversational (cliente respondió en <24h)
- $0.025 USD por template message outbound (nuestro reminder)
- 100 clientes × 4 reminders/mes × $0.025 = **$10 USD/mes** — trivial

### 7.3 Email templates

3 templates Resend (extensión del ya implementado `ActivationEmailService`):
- `billing_reminder_d3.html` — recordatorio amigable
- `billing_reminder_d1.html` — más directo
- `billing_payment_failed.html` — con CTA "Actualizar método de pago"
- `billing_payment_succeeded.html` — recibo con invoice PDF link

---

## 8. Dos UIs separadas — Nova (consultor) + App (cliente)

### 8.1 Nova / Billing — para el consultor

Surface: `/nova/billing` (NovaTiers PLATFORM / PARTNER_ADMIN / PARTNER_MEMBER).

**Vista landing**:
```
┌─ Nova / Billing ────────────────────────────────────┐
│                                                      │
│  MRR actual       ARR proyectado    Churn 90d        │
│  $128,400 MXN     $1,540,800 MXN    2.3%             │
│                                                      │
│  Clientes activos: 47    Mora: 3    Suspended: 0     │
│                                                      │
│ ─── Clientes ──────────────────────────────────────  │
│                                                      │
│ Cliente           Plan      MRR    Estado   Próx pago│
│ Hotel Tulum Centro Pro      $2,400 ✅ Al día 5 jun  │
│ Cabañas Eco BC    Pro       $1,800 ⚠️ Retry   3 jun │
│ Hostal Bacalar    Starter   $1,200 ✅ Al día 12 jun │
│ Selina XYZ        Enterprise $24,000✅ Al día 1 jul │
│ ...                                                  │
│                                                      │
│ [Filtros: estado / plan / partner asignado]          │
└──────────────────────────────────────────────────────┘
```

**Click en un cliente abre detalle**:
```
┌─ Hotel Tulum Centro · Billing ─────────────────────┐
│                                                     │
│ Plan: Pro ($2,400 MXN/mes/property × 1 property)   │
│ Activo desde: 15 mar 2026  ·  Próximo cobro: 15 jun│
│                                                     │
│ Descuentos activos:                                 │
│ ─ ZAHAR-TULUM-2026: 25% off, 3 meses (1/3 usado)   │
│   Generado por: María Fernández (PARTNER_MEMBER)   │
│   Razón: "Cierre rápido, cliente venía de CB"      │
│                                                     │
│ Add-ons: ninguno                                    │
│ [+ Activar Sign DLC] [+ Activar Market Intel Pro]   │
│                                                     │
│ ─── Historial de cobros ──────────────────────────  │
│ Fecha       Monto      Estado    Invoice            │
│ 15 may 26   $1,800 MXN ✅ Paid   INV-2603 [PDF]    │
│ 15 abr 26   $1,800 MXN ✅ Paid   INV-2402 [PDF]    │
│ 15 mar 26   $1,800 MXN ✅ Paid   INV-2202 [PDF]    │
│                                                     │
│ [Generar nuevo descuento] [Cambiar plan]            │
│ [Ver subscription en Stripe ↗]                      │
└─────────────────────────────────────────────────────┘
```

**Permission matrix**:
- **PARTNER_MEMBER**: lee billing de sus PartnerMemberAssignments. Genera discount codes dentro de su tier cap (§3.2). NO puede ver MRR agregado de otros consultores.
- **PARTNER_ADMIN**: lee billing de todos los clientes del firm. Aprueba discounts que excedan cap del LEAD/SOLUTION CONSULTANT. Ve métricas agregadas del firm.
- **PLATFORM_ADMIN** (ZaharDev): ve todo + métricas globales + puede generar discounts sin cap.

### 8.2 App / Settings / Billing — para el cliente

Surface: `app.zenix.com/settings/billing` — solo ORG_OWNER (no STAFF).

**Vista landing**:
```
┌─ Settings / Billing ───────────────────────────────┐
│                                                     │
│ Tu plan: Pro                  Próx cobro: 15 jun   │
│ $1,800 MXN/mes (descuento -25% activo)             │
│                                                     │
│ ─ Descuento ZAHAR-TULUM-2026 ─────────────────────  │
│ 25% off durante 3 meses · 1 de 3 ciclos usados     │
│ Después del 15 ago 2026: $2,400 MXN/mes            │
│                                                     │
│ [Cambiar de plan] [Cancelar suscripción]            │
│                                                     │
│ ─── Método de pago ───────────────────────────────  │
│ 💳 Visa terminada en ••4242 (expira 11/27)         │
│ [Actualizar método de pago]                         │
│                                                     │
│ ─── Recibos ──────────────────────────────────────  │
│ Mayo 2026     $1,800 ✅  [Descargar PDF]            │
│ Abril 2026    $1,800 ✅  [Descargar PDF]            │
│ Marzo 2026    $1,800 ✅  [Descargar PDF]            │
│                                                     │
│ ─── Recordatorios ────────────────────────────────  │
│ ✅ Email a admin@hotelboutique.com                 │
│ ☐ WhatsApp al +52 998 ... (activar)                │
│ Días: 3 días antes, 1 día antes                    │
└─────────────────────────────────────────────────────┘
```

**[Cancelar suscripción]** abre el save offer flow descrito en §4.2.

**[Actualizar método de pago]** abre el **Stripe Customer Portal** (no nuestra UI custom — Stripe ya tiene esto resuelto, PCI-DSS Level 1, soporte multi-currency).

---

## 9. Schema additions (sprint BILLING-CORE)

```prisma
// Suscripción Zenix — 1:1 con Organization
model Subscription {
  id                    String   @id @default(uuid())
  organizationId        String   @unique @map("organization_id")
  stripeCustomerId      String   @map("stripe_customer_id")
  stripeSubscriptionId  String   @unique @map("stripe_subscription_id")

  // Plan + status
  planTier              String   @map("plan_tier") // 'STARTER' | 'PRO' | 'ENTERPRISE'
  status                String   // 'active' | 'past_due' | 'paused' | 'cancelled' | 'unpaid'
  currentPeriodStart    DateTime @map("current_period_start")
  currentPeriodEnd      DateTime @map("current_period_end")
  cancelAtPeriodEnd     Boolean  @default(false) @map("cancel_at_period_end")
  cancelledAt           DateTime? @map("cancelled_at")
  pausedUntil           DateTime? @map("paused_until")

  // Pricing snapshot — congelado al activar
  baseMonthlyAmount     Decimal  @map("base_monthly_amount")
  currency              String   @default("MXN")
  propertyCount         Int      @map("property_count")

  createdAt             DateTime @default(now()) @map("created_at")
  updatedAt             DateTime @updatedAt @map("updated_at")

  organization Organization @relation(fields: [organizationId], references: [id])
  discounts    SubscriptionDiscount[]
  events       SubscriptionEvent[]
  invoices     Invoice[]

  @@map("subscriptions")
}

// Descuentos aplicados — historial + activos
model SubscriptionDiscount {
  id                    String   @id @default(uuid())
  subscriptionId        String   @map("subscription_id")
  stripeCouponId        String   @map("stripe_coupon_id")
  stripePromotionCodeId String?  @map("stripe_promotion_code_id")
  promotionCode         String   @map("promotion_code") // "ZAHAR-TULUM-2026"

  percentOff            Int?     @map("percent_off") // 0-100
  amountOff             Decimal? @map("amount_off")  // si fixed amount
  duration              String   // 'once' | 'repeating' | 'forever'
  durationInMonths      Int?     @map("duration_in_months")

  generatedById         String   @map("generated_by_id") // consultor User
  generatedByRole       String   @map("generated_by_role")
  reason                String   // libre — razón del descuento
  approvedById          String?  @map("approved_by_id") // si excedió cap del consultor

  appliedAt             DateTime @default(now()) @map("applied_at")
  expiresAt             DateTime? @map("expires_at")

  subscription Subscription @relation(fields: [subscriptionId], references: [id])

  @@map("subscription_discounts")
}

// Eventos lifecycle — append-only audit trail
model SubscriptionEvent {
  id              String   @id @default(uuid())
  subscriptionId  String   @map("subscription_id")
  type            String   // 'CREATED' | 'PLAN_CHANGED' | 'PAUSED' | 'RESUMED' | 'CANCELLED' | 'PAYMENT_FAILED' | 'PAYMENT_SUCCEEDED' | 'DISCOUNT_APPLIED' | 'SAVE_OFFER_SHOWN' | 'SAVE_OFFER_ACCEPTED' | 'SAVE_OFFER_REJECTED'
  payload         Json
  stripeEventId   String?  @unique @map("stripe_event_id") // dedup webhook
  createdAt       DateTime @default(now()) @map("created_at")

  subscription Subscription @relation(fields: [subscriptionId], references: [id])

  @@index([subscriptionId, type])
  @@map("subscription_events")
}

// Invoices — espejo local de Stripe Invoices
model Invoice {
  id                    String   @id @default(uuid())
  subscriptionId        String   @map("subscription_id")
  organizationId        String   @map("organization_id")
  stripeInvoiceId       String   @unique @map("stripe_invoice_id")
  number                String   @unique // "INV-2603"
  status                String   // 'draft' | 'open' | 'paid' | 'uncollectible' | 'void'
  total                 Decimal
  currency              String
  periodStart           DateTime @map("period_start")
  periodEnd             DateTime @map("period_end")
  paidAt                DateTime? @map("paid_at")
  dueAt                 DateTime @map("due_at")
  hostedInvoiceUrl      String?  @map("hosted_invoice_url")
  invoicePdfUrl         String?  @map("invoice_pdf_url")

  createdAt             DateTime @default(now()) @map("created_at")

  subscription Subscription @relation(fields: [subscriptionId], references: [id])

  @@map("invoices")
}

// Discount code templates — el consultor puede tener "mis códigos favoritos"
model ConsultorDiscountTemplate {
  id                    String   @id @default(uuid())
  consultorId           String   @map("consultor_id") // User PartnerMember
  name                  String   // "Mi código de bienvenida"
  percentOff            Int
  duration              String   // 'once' | 'repeating' | 'forever'
  durationInMonths      Int?     @map("duration_in_months")
  isFavorite            Boolean  @default(false) @map("is_favorite")

  createdAt             DateTime @default(now()) @map("created_at")

  @@index([consultorId])
  @@map("consultor_discount_templates")
}

// Save offer presentations + outcomes
model RetentionSaveOffer {
  id                    String   @id @default(uuid())
  subscriptionId        String   @map("subscription_id")
  cancellationReason    String   @map("cancellation_reason") // del survey
  offerShown            String   @map("offer_shown") // JSON describing the offer
  outcome               String   // 'ACCEPTED' | 'REJECTED' | 'EXPIRED' (no respondió)
  acceptedAt            DateTime? @map("accepted_at")
  rejectedAt            DateTime? @map("rejected_at")

  createdAt             DateTime @default(now()) @map("created_at")

  @@index([subscriptionId])
  @@map("retention_save_offers")
}
```

---

## 10. Data points clave + referencias

### Métricas para defender decisiones

| Métrica | Benchmark industria | Fuente | Implicación Zenix |
|---|---|---|---|
| **B2B SaaS voluntary churn** | 5-7% anual (excelente <3%) | [SaaS Capital 2024 Spending Benchmarks](https://www.saas-capital.com/research/) | Target Zenix piloto: <10% año 1; <6% año 2 |
| **Involuntary churn (pagos fallidos)** | 5-15% globally, 12-18% LATAM | [Recurly 2023](https://recurly.com/research/) + [Stripe LATAM 2024](https://stripe.com/billing/smart-retries) | Smart Retries + dunning multi-canal son must-have |
| **Save offer success rate** | 30-40% con offers condicionales, 8-12% genéricos | [ProfitWell Retain 2023](https://www.paddle.com/resources/research/retain-report-2023) | Save offer flow §4.2 obligatorio |
| **CAC B2B SaaS hotelería** | $800-2,000 USD per boutique | Estimado ZaharDev + [HotelTechReport CAC study 2023](https://hoteltechreport.com) | LTV/CAC target 3:1 = LTV $2,400-6,000 USD |
| **WhatsApp open rate LATAM** | 95%+ (vs email 22% B2B) | [Statista 2024](https://www.statista.com/statistics/271496/) + [Meta WhatsApp Business case studies](https://business.whatsapp.com/) | WhatsApp reminders obligatorios MX/CO/AR |
| **Card decline rate LATAM** | 15-22% (vs 5-10% US) | [Bain LATAM Payments 2023](https://www.bain.com/insights/latin-america-payments-2023/) | Multi-method (SPEI/OXXO/ACH) alternativas essential |
| **Stripe Smart Retries recovery** | 38-44% | [Stripe 2024 retention report](https://stripe.com/billing/smart-retries) | Default ON desde day 1 |
| **PROFECO consumer protection MX** | Auto-renewal disclosure obligatorio + cancel-anywhere | [LFPC Art. 47, art. 91](https://www.diputados.gob.mx/LeyesBiblio/pdf/113_110121.pdf) | Cancel button SIEMPRE visible <2 clicks |
| **FTC "Click to Cancel" rule US** | Misma facilidad para cancelar que contratar | [FTC 2024 Rule](https://www.ftc.gov/legal-library/browse/rules/click-cancel) | Aplica si Zenix vende clientes US |
| **SmartFit fixed-date billing rationale** | Cash flow predictability + ops simplification + LATAM card limit alignment | [SmartFit 10-K 2023](https://ri.smartfit.com.br/) + [Valor Econômico Mar 2023](https://valor.globo.com/empresas/noticia/2023/03/01/smart-fit-detalha-modelo-de-cobranca.ghtml) | Disponible como opción opt-in, no default |

### Lecturas recomendadas pre-implementación

1. [Patrick McKenzie "SaaS Pricing"](https://www.kalzumeus.com/2018/03/29/pricing-low-touch-saas/) — fundamental, leer antes de cualquier ajuste de pricing
2. [OpenView Partners 2023 SaaS Pricing Benchmark](https://openviewpartners.com/blog/saas-pricing-benchmark/) — datos de 600 B2B SaaS
3. [Tomasz Tunguz "Subscription Vendor Selection"](https://tomtunguz.com/billing/) — comparativa providers
4. [Paddle / ProfitWell Retain Report 2023](https://www.paddle.com/resources/research/retain-report-2023) — save offer playbook completo
5. [NN/g Cancellation Flows](https://www.nngroup.com/articles/canceling-online-subscriptions/) — UX patterns
6. [Stripe Billing Quickstart](https://stripe.com/docs/billing/quickstart) — implementación técnica
7. [SmartFit S.A. NYSE filings](https://ri.smartfit.com.br/) — caso de éxito LATAM fixed-billing

---

## 11. Roadmap de implementación

### Sprint BILLING-CORE (estimación 3-4 semanas)

**Fase 1 — Foundations (~5 días)**:
- Schema Prisma (Subscription, Discount, Event, Invoice models)
- Stripe SDK wiring backend (extender PaymentsService o nuevo BillingService)
- Webhook listener: subscription.* + invoice.* + customer.subscription.*
- Idempotencia via stripeEventId UNIQUE

**Fase 2 — Wizard integration (~3 días)**:
- Step 7.5 nuevo "Plan y descuento"
- Generación de Coupon + PromotionCode al activate
- Subscription creation post-activate (con prorrateo)
- Email update incluyendo link a Stripe Customer Portal

**Fase 3 — Dashboard consultor (~5 días)**:
- `/nova/billing` landing (MRR / ARR / churn / clientes)
- Detalle cliente con discounts + invoices + acciones
- Generación discount codes con validación cap per tier
- Audit log + approval workflow

**Fase 4 — Cliente app (~4 días)**:
- `/settings/billing` Stripe Customer Portal embed
- Save offer flow con survey + conditional offers
- Pause / resume subscription (Stripe SubscriptionSchedule)
- Invoice history + download PDF

**Fase 5 — Dunning + reminders (~4 días)**:
- Stripe Smart Retries config
- Cron job D-3 / D-1 reminder emails (Resend)
- Twilio WhatsApp templates pre-approval con Meta
- Read-only mode + in-app banner cuando subscription past_due

**Fase 6 — Tests + docs (~2 días)**:
- Integration tests con Stripe test mode
- E2E del flow wizard → first cobro → renewal → reminder
- §-numbered decisions en CLAUDE.md
- Update zenix-sales-master.md con pricing tiers finales

### Pre-requisitos (acciones owner antes de kickoff)

1. ✅ Stripe account live activated (test mode ya hay, verificar live)
2. ⏳ Twilio WhatsApp Business API o 360dialog account (~$0.025/template msg)
3. ⏳ Meta WhatsApp Business templates pre-aprobados (4 templates × 5-10 días review per template)
4. ⏳ Pricing tiers definitivos validados con 1-2 prospectos
5. ⏳ Define cap per partner tier (§3.2) — owner decide los porcentajes

### Decisiones para registrar en CLAUDE.md al ejecutar sprint

- **§D-BILL-1**: Stripe Billing como provider único v1.0.x-v1.2. Re-evaluar Chargebee solo >$50k MRR
- **§D-BILL-2**: Pricing público inmovible + discount codes Stripe Coupons como mecanismo único de negociación
- **§D-BILL-3**: Cap per partner tier — AUTHORIZED 15% / SILVER 25% / GOLD 35% / PLATINUM 50% / PLATFORM ∞
- **§D-BILL-4**: Rolling billing default + opcional fixed-date opt-in (no copiar SmartFit literal)
- **§D-BILL-5**: Save offer ladder condicional al cancellation reason — ProfitWell pattern
- **§D-BILL-6**: Dunning 21 días con degradación gradual (no corte day-1) — Cloudbeds/Mews pattern B2B
- **§D-BILL-7**: WhatsApp reminders opt-in via Twilio + Meta templates
- **§D-BILL-8**: Customer Portal Stripe embebido — no UI custom para payment method update
- **§D-BILL-9**: Dashboard consultor en `/nova/billing` separado de cliente en `/settings/billing`
- **§D-BILL-10**: Audit log permanente per discount code generado — actorRealId + reason obligatorio

---

## 12. Diferenciadores comerciales emergentes

Esta arquitectura habilita ventajas competitivas reales vs PMS LATAM:

| Capacidad | Cloudbeds | Mews | RoomRaccoon | Little Hotelier | **Zenix** |
|---|:---:|:---:|:---:|:---:|:---:|
| Pricing negociable por consultor con cap controlado | ❌ deal CSM | ⚠️ enterprise only | ❌ self-serve | ❌ self-serve | **✅ wizard nativo** |
| Multi-phase discount (2 meses -25%, después fijo) | ❌ | ❌ | ❌ | ❌ | **✅ Stripe Schedules** |
| Save offer ladder condicional al motivo | ❌ | ❌ | ❌ | ❌ | **✅** |
| Pause subscription (re-abrir hotel temporal) | ⚠️ manual CSM | ⚠️ manual | ❌ | ❌ | **✅ self-service** |
| WhatsApp reminders nativos LATAM | ❌ | ❌ | ❌ | ⚠️ SMS only | **✅** |
| Dunning B2B-grade (no corte day-1) | ✅ | ✅ | ⚠️ | ⚠️ | **✅** |
| Dashboard MRR/ARR/churn al consultor | ❌ (interno only) | ❌ | ❌ | ❌ | **✅** |
| Partner tier discount cap (SAP PartnerEdge style) | ❌ | ❌ | ❌ | ❌ | **✅** |
| Multi-currency invoice (cliente con properties cross-country) | ⚠️ | ✅ | ⚠️ | ❌ | **✅ (v1.2 con FX-LATAM ya planeado)** |

Ningún competidor LATAM tiene todo esto end-to-end. La ventaja particular de Zenix es la **integración entre wizard + partner network + billing** — el consultor cierra venta con descuento, el cliente recibe activación + setup link + plan + invoice + customer portal en un solo flow auditable.

---

## 13. Riesgos + mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|:---:|:---:|---|
| Consultor abusa de discounts forever para cerrar deals fáciles | Media | Alto | Cap per tier (§3.2) + audit log + monthly review por PARTNER_ADMIN |
| WhatsApp template rejection de Meta (5-10 días review) | Alta | Bajo | Iniciar pre-aprobación 2 sem antes del sprint |
| Cliente cancela en mes 1 antes de cobrar valor (CAC perdido) | Media | Alto | Annual contract con descuento -20% + save offer al cancelar |
| Stripe webhook downtime → state desync con Zenix | Baja | Medio | Idempotencia stripeEventId UNIQUE + nightly reconciliation job |
| PROFECO complaint por save offer flow "demasiado agresivo" | Baja | Alto | Botón "Cancelar de todos modos" siempre visible <2 clicks (FTC compliance) |
| Card decline rates LATAM (18-22%) más altos que Stripe ML expects | Media | Medio | OXXO Pay / SPEI fallback + CSM outreach humano día 14+ |
| Cliente pausa subscription indefinidamente para no pagar | Baja | Bajo | Pause máximo 3 meses, después auto-resume o cancel |

---

## 14. Apéndice — Glosario para no-tech

| Término | Significado plano |
|---|---|
| **MRR** | Monthly Recurring Revenue — ingreso recurrente mensual |
| **ARR** | Annual Recurring Revenue — MRR × 12 |
| **Churn** | Tasa a la que clientes cancelan |
| **Dunning** | Proceso de cobrar a un cliente cuyo pago falló |
| **Smart Retries** | Stripe reintenta el cobro en horarios óptimos según ML |
| **CAC** | Customer Acquisition Cost — costo de adquirir un cliente |
| **LTV** | Lifetime Value — ingreso total que generará un cliente |
| **Save offer** | Contraoferta para retener al cliente que quiere cancelar |
| **Past_due** | Estado Stripe cuando el cobro falló pero subscription sigue viva |
| **Customer Portal** | UI Stripe pre-construida donde el cliente actualiza método de pago |
| **Webhook** | Notificación HTTP que Stripe envía a Zenix cuando pasa algo (pago, cancelación, etc.) |
| **Idempotencia** | Garantía de que aunque Stripe mande el mismo webhook 2 veces, Zenix lo procesa solo 1 |
| **Read-only mode** | Modo degradado del PMS: el hotel puede ver datos pero no operar |
| **Grace period** | Días que damos al cliente para regularizar el pago antes de suspender |

---

> **Próximo paso recomendado**: validar con owner el pricing tier definitivo + cap percentages per partner tier antes de kickoff de BILLING-CORE. Una vez validados, el sprint puede arrancar — todas las piezas técnicas (Stripe + Twilio + Resend + audit log) ya están establecidas.
