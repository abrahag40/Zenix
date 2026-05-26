# BILLING-CORE — Annual contracts + Free trial + T&C + Pricing admin

> Addendum al plan [BILLING-CORE-plan.md](BILLING-CORE-plan.md) cubriendo
> los 4 deliverables aprobados por owner 2026-05-26:
>
> 1. **Annual contracts** con -20% upfront
> 2. **Free trial** 14 días opcional per cliente
> 3. **Terms & Conditions** versionado + acceptance flow
> 4. **Pricing admin UI** para ZaharDev modificar precios sin deploy
>
> Estos 4 items se integran a las fases existentes del sprint y agregan
> ~4-5 días de scope al plan original (18-22d → **22-27d total**).

---

## 1. Annual contracts — incluido en v1.1.0

### Decisión arquitectónica

- **Toggle "Pago anual"** en Step 7.5 del wizard (`Plan y descuento`)
- Si activado: cliente firma 12 meses con **-20% descuento** sobre total mensual
- Stripe Subscription con `interval: 'year'` + single invoice upfront
- Renovación automática en aniversario (configurable per cliente)

### Cálculo del descuento

```typescript
const monthlyPrice = planTier.monthlyAmount * propertyCount;  // $2,400 × 1 = $2,400
const annualTotal = monthlyPrice * 12;                         // $28,800
const annualDiscounted = annualTotal * 0.80;                   // $23,040 (-20%)
const savings = annualTotal - annualDiscounted;                // $5,760 saved
```

### Stack con discount codes

Annual contracts y discount codes **pueden coexistir**. Ejemplo realista:
- Cliente firma anual (-20% baseline)
- Consultor le da código adicional ZAHAR-CIERRE-2026 (-15% primeros 3 meses)
- Stripe aplica primero el plan annual ($2,400 → $1,920/mes equivalente), después el coupon (-15% sobre $1,920 = $1,632) durante 3 meses
- Total año 1: ~$22,800 MXN (vs $28,800 mensual sin descuentos = -21% efectivo)

### UI en wizard

```
┌─ Plan y descuento ──────────────────────────────────┐
│                                                      │
│  Plan:  ( ) Starter  (•) Pro  ( ) Enterprise         │
│                                                      │
│  Modalidad de pago:                                  │
│  (•) Mensual — $2,400 MXN/mes                        │
│  ( ) Anual — $23,040 MXN/año (-20% ahorras $5,760)  │
│                                                      │
│  ☑ Descuento adicional                               │
│    25% off · 3 primeros meses                        │
│    Código: ZAHAR-TULUM-2026                          │
│                                                      │
│  Preview del cobro                                   │
│  ─────────────────────────────────────────────────── │
│  Mensual:                                            │
│  ├ Mes 1-3: $1,800 MXN/mes (-25%)                    │
│  ├ Mes 4+:  $2,400 MXN/mes                           │
│  └ Año 1 total: $26,400 MXN                          │
│                                                      │
│  Anual (recomendado):                                │
│  ├ Mes 1-3 equivalente: $1,632 MXN/mes (-32% combo)  │
│  ├ Mes 4-12 equivalente: $1,920 MXN/mes (-20%)       │
│  └ Pago único hoy: $22,464 MXN                       │
│  └ Cliente ahorra: $6,336 vs mensual sin descuento   │
│                                                      │
└──────────────────────────────────────────────────────┘
```

### Cancelación de anual

**Política**: cliente puede cancelar anual en cualquier momento (PROFECO Art. 47), pero:
- **NO hay refund pro-rata** del período anual no usado (industria-standard B2B SaaS)
- Cliente accede hasta fin del período pagado (12 meses)
- Auto-renewal se desactiva
- Esta política se documenta EXPLÍCITAMENTE en T&C anexo "Anual subscriptions"

**Comparativa**: AWS Reserved Instances, Stripe annual plans, Atlassian Cloud annual — todos siguen este modelo. Cliente acepta el trade-off al firmar anual.

### Schema additions

```prisma
model Subscription {
  // ... existing fields
  billingCycle      String   @default("monthly")  // 'monthly' | 'annual'
  annualDiscountPct Int?     @map("annual_discount_pct") // 20 si annual
  nextRenewalDate   DateTime @map("next_renewal_date")
  autoRenew         Boolean  @default(true) @map("auto_renew")
}
```

### Días de scope adicional

- D6 (Step 7.5): +0.5d para toggle annual + preview
- D7 (backend activate): +0.5d para `billingCycle: 'annual'` handling
- D14 (cliente app): +0.5d para mostrar próximo renewal en `/settings/billing`

**Total annual contracts**: +1.5 días al plan original.

---

## 2. Free trial 14 días — incluido en v1.1.0

### Decisión arquitectónica

- **Opcional per cliente**, activado por el consultor en Step 7.5
- **Default OFF** — wizard sin trial es el flow normal (consultor-led venta ya elimina friction de venta)
- Solo se activa si:
  - El consultor lo usa como cierre comercial ("te doy 14 días gratis para probar")
  - El cliente lo pide explícitamente
- Sin método de pago obligatorio durante trial
- Sin restricciones de funcionalidad durante trial (full Pro access)

### Stripe wiring

```typescript
const subscription = await stripe.subscriptions.create({
  customer: customerId,
  items: [{ price: priceId, quantity: propertyCount }],
  trial_period_days: 14,              // ← Stripe nativo
  trial_settings: {
    end_behavior: {
      missing_payment_method: 'cancel',  // si no agregó tarjeta al fin de trial
    },
  },
  metadata: {
    activated_by_consultor: consultorId,
    trial_negotiated: 'true',
  },
})
```

### Email cadence durante trial

| Día | Email |
|---|---|
| D-0 (activate) | Welcome + setup link + "Tu trial gratuito termina el {date+14}" |
| D-7 | "Tu trial está a la mitad. ¿Cómo va Zenix?" + tutoriales + CSM contact |
| D-12 | **"Tu trial termina en 2 días. Agrega tu método de pago."** + CTA Customer Portal |
| D-14 trial end success | Si agregó pago: "¡Bienvenido oficialmente! Tu primer cobro es el {date+14}" |
| D-14 trial end failure | Si NO agregó pago: "Tu trial terminó. Para seguir usando Zenix, agrega tu método de pago." + grace 7 días read-only |

### Sin restricciones durante trial

A diferencia de Spotify (free tier limitado) o Netflix (sin trial, paga desde día 1), Zenix da **full access durante trial**:
- Razón: el hotel ya está pagando un consultor para activar — el trial es señal de compromiso, no de scrappiness
- Limitar features durante trial = mala UX + consultor pierde credibilidad

### Schema additions

Stripe ya maneja `trial_end` y `trial_start` en Subscription. Sync local:

```prisma
model Subscription {
  // ... existing
  trialStartedAt    DateTime? @map("trial_started_at")
  trialEndsAt       DateTime? @map("trial_ends_at")
  trialNegotiatedBy String?   @map("trial_negotiated_by") // consultor User id
}
```

### Días de scope adicional

- D6 (Step 7.5): +0.5d para toggle trial + preview
- D7 (backend): +0.5d para `trial_period_days` handling
- D18 (cron reminders): +0.5d para emails D-7 + D-12 del trial

**Total free trial**: +1.5 días al plan original.

---

## 3. Terms & Conditions — versionado + acceptance flow

### Scope completo del entregable

#### 3.1 Documento legal — contenido del T&C v1.0

Estructura propuesta (20 secciones):

1. Identificación de las partes (ZaharDev S. de R.L. de C.V. ↔ Cliente)
2. Objeto del contrato (licencia de uso del software PMS Zenix)
3. Modalidades de servicio (Starter / Pro / Enterprise + DLC add-ons)
4. Precios y forma de cobro (mensual / anual, currency, ajustes)
5. Procesamiento de pagos (Stripe procesador, métodos aceptados)
6. Discount codes (al criterio del consultor dentro de cap, no son adquired rights)
7. Cancelación (PROFECO Art. 47, efecto fin período, no refund pro-rata)
8. Pausas (max 6 meses, después auto-cancel)
9. Modo limitado por falta de pago (escalación 21 días)
10. Tratamiento de datos personales (Zenix = Data Processor; Cliente = Controller)
11. Propiedad intelectual (código + diseño = ZaharDev; data operativa = Cliente)
12. SLA (uptime 99.5% v1.0.x sin compensación; 99.9% v1.0.5+)
13. Confidencialidad (bidireccional)
14. Limitación de responsabilidad (cap 12 meses fees pagados)
15. Cesión de derechos
16. Resolución de disputas (mediación PROFECO primero, tribunales CDMX)
17. Ley aplicable (México)
18. **Anexo A** — Política de privacidad detallada (GDPR / LFPDPPP / LGPD)
19. **Anexo B** — Política de tratamiento de datos de huéspedes (chain-of-custody, útil SIGN-DLC)
20. **Anexo C** — DPA (Data Processing Agreement) opcional para chains enterprise

#### 3.2 T&C versioning system

```prisma
model TermsAndConditionsVersion {
  id                String   @id @default(uuid())
  version           String   @unique  // '1.0', '1.1', '2.0'
  effectiveFrom     DateTime @map("effective_from")
  contentMarkdown   String   @map("content_markdown") @db.Text
  contentHtml       String?  @map("content_html") @db.Text
  pdfStorageUrl     String?  @map("pdf_storage_url")
  sha256Hash        String   @unique @map("sha256_hash")  // determinista
  language          String   @default("es")  // 'es' | 'en'
  isCurrent         Boolean  @default(false) @map("is_current")
  createdBy         String   @map("created_by")  // PLATFORM_ADMIN
  legalReviewedBy   String?  @map("legal_reviewed_by")  // abogado externo
  legalReviewedAt   DateTime? @map("legal_reviewed_at")
  changelog         String?  @db.Text  // qué cambió vs versión previa

  acceptances       TermsAcceptance[]

  @@map("terms_and_conditions_versions")
}

model TermsAcceptance {
  id                String   @id @default(uuid())
  organizationId    String   @map("organization_id")
  termsVersionId    String   @map("terms_version_id")
  acceptedByUserId  String   @map("accepted_by_user_id")  // ORG_OWNER usualmente
  acceptedAt        DateTime @default(now()) @map("accepted_at")
  ipAddress         String?  @map("ip_address")
  userAgent         String?  @map("user_agent") @db.Text
  // Para audit: dónde aceptó (wizard activation, T&C update flow, etc.)
  acceptanceContext String   @map("acceptance_context")  // 'WIZARD_ACTIVATION' | 'TC_UPDATE' | 'MANUAL_OWNER'

  organization Organization @relation(fields: [organizationId], references: [id])
  termsVersion TermsAndConditionsVersion @relation(fields: [termsVersionId], references: [id])

  @@unique([organizationId, termsVersionId])
  @@index([organizationId])
  @@index([termsVersionId])
  @@map("terms_acceptances")
}
```

#### 3.3 Wizard integration

Step 8 (Activation) adquiere checkbox obligatorio:

```
┌──────────────────────────────────────────────────────┐
│  ☑ He leído y acepto los Términos y Condiciones de  │
│    Zenix v1.0 [ver documento ↗]                      │
│                                                      │
│  Al activar, el administrador del cliente recibirá   │
│  copia del T&C en su correo de bienvenida.           │
└──────────────────────────────────────────────────────┘
```

Click "ver documento ↗" abre modal con T&C completo (scroll obligatorio al final antes de que el checkbox sea clicable — pattern Stripe, Apple, Google).

#### 3.4 Backend wizardActivate extension

```typescript
// En WizardActivationService.activate()
const currentTC = await this.prisma.termsAndConditionsVersion.findFirst({
  where: { isCurrent: true, language: dto.language ?? 'es' },
})

if (!currentTC) {
  throw new InternalServerErrorException('No hay T&C version vigente configurada')
}

// Dentro del $transaction
await tx.termsAcceptance.create({
  data: {
    organizationId: org.id,
    termsVersionId: currentTC.id,
    acceptedByUserId: actor.sub,  // consultor que activó (representando al cliente)
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
    acceptanceContext: 'WIZARD_ACTIVATION',
  },
})

// AuditLog entry
await this.auditLog.write({
  action: 'TERMS_AND_CONDITIONS_ACCEPTED',
  target: org.id,
  payload: { termsVersion: currentTC.version, sha256: currentTC.sha256Hash },
  status: 'SUCCESS',
  retentionPolicy: 'PERMANENT',
})
```

#### 3.5 T&C update flow (cuando se publica v1.1)

Cuando ZaharDev publica una nueva versión de T&C:

1. `PLATFORM_ADMIN` crea row nueva en `TermsAndConditionsVersion` con `isCurrent=false`
2. Marca `effectiveFrom` futuro (e.g. 30 días delay)
3. Antes del `effectiveFrom`: email a todos los `ORG_OWNER` con preview + changelog
4. En `effectiveFrom`: trigger SQL hace `UPDATE termsAndConditionsVersion SET isCurrent=false WHERE id != newId; UPDATE termsAndConditionsVersion SET isCurrent=true WHERE id = newId`
5. Próximo login del cliente: modal "Los Términos y Condiciones cambiaron. Por favor acepta la v1.1 para continuar."
6. 30 días grace period — durante este tiempo banner amber pero acceso normal
7. Después de 30 días sin aceptar: subscription marca read-only mode hasta accept

#### 3.6 Customer Portal del cliente

En `app.zenix.com/settings/billing` agrega sección:

```
┌─ Términos y Condiciones ────────────────────────────┐
│                                                      │
│ Versión vigente: v1.0 (efectiva desde 15 jun 2026)  │
│                                                      │
│ Versiones aceptadas:                                 │
│ ✓ v1.0 — aceptada el 20 jun 2026 por                │
│   maria@hotelboutique.com [ver PDF ↗]               │
│                                                      │
│ [ Descargar T&C vigente ]                            │
└──────────────────────────────────────────────────────┘
```

#### 3.7 PDF rendering del T&C

**Decisión técnica**: usar mismo pattern que Activation Report v1.0.0 — HTML imprimible con `@media print` + `window.print()`, NO Puppeteer.

**Para v1.1.0+**: cuando SIGN-DLC sprint introduzca Puppeteer (firma digital + NOM-151 conservation), reutilizar pool para generar PDF determinista del T&C con hash SHA-256 reconciliable.

#### 3.8 T&C content authoring workflow

ZaharDev escribe T&C en Markdown:

```
docs/legal/terms-and-conditions/
├── v1.0-es.md          # versión actual ES
├── v1.0-en.md          # versión actual EN
├── v0.9-es-draft.md    # borrador piloto
├── changelog.md        # qué cambió entre versions
└── README.md           # workflow de publishing
```

Script `scripts/publish-tc.ts`:
1. Lee `vX.X-es.md`
2. Computa SHA-256 del contenido
3. Renderiza HTML via remark/markdown-it
4. Inserta row en `TermsAndConditionsVersion` con `isCurrent=false`
5. Owner ejecuta SQL para activar (`UPDATE ... SET isCurrent=true WHERE version='X.X'`) cuando estés listo

#### 3.9 Días de scope adicional

- D1 (schema): +0.5d para `TermsAndConditionsVersion` + `TermsAcceptance` tables
- D7 (wizard activate): +1d para T&C checkbox en Step 8 + acceptance write + email attachment
- D14 (cliente app): +0.5d para mostrar T&C history en `/settings/billing`
- D19 (email templates): +0.5d para incluir T&C PDF en welcome email
- D22 (T&C update flow): +1d para modal + 30d grace period logic

**Total T&C**: +3.5 días al plan original.

#### 3.10 T&C v0.9 borrador pre-piloto

Para el piloto v1.0.0 (cobro manual via Stripe Invoice) ZaharDev necesita documento legal antes del primer cliente pagando. Propuesta:

1. ZaharDev escribe T&C v0.9 borrador (1-2 días owner + asesor legal junior)
2. Disclaimer prominente: "Este documento es borrador inicial. Sujeto a validación legal final con abogado mercantil mexicano. Aplica para clientes piloto de Zenix únicamente."
3. PDF firmado out-of-band con DocuSign / firma manuscrita
4. Acceptance manual: ZaharDev marca `Organization.termsAcceptedVersion = '0.9-draft'` desde admin script

Costo abogado mercantil senior para validar y producir v1.0 final: ~$15-30k MXN (1-2 sesiones + redacción anexos) — owner agendó dentro de v1.0.1 (ver `docs/ops/2026-05-22-bloque1-kickoff.md` decisión 7).

---

## 4. Pricing admin UI — ZaharDev modifiable

### Decisión arquitectónica

ZaharDev (PLATFORM_ADMIN only) puede modificar tiers desde `/nova/admin/pricing` page **sin requerir deploy**. Cambios afectan ÚNICAMENTE clientes nuevos — existing subscriptions tienen Price snapshot en Stripe que no cambia (industry-standard "grandfather pricing").

### UI propuesto

```
┌─ Nova / Admin / Pricing ───────────────────────────────────┐
│                                                             │
│ ⚠️  PLATFORM_ADMIN only — todos los cambios son audit-log   │
│                                                             │
│ ─── Planes activos ──────────────────────────────────────── │
│                                                             │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ Starter                                    [✏️ Editar] │ │
│ │ $1,200 MXN / $60 USD por property/mes                  │ │
│ │ Features: PMS + housekeeping + 1 OTA + email support   │ │
│ │ Activo · 3 clientes en este plan                       │ │
│ └────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ Pro                                        [✏️ Editar] │ │
│ │ $2,400 MXN / $120 USD por property/mes                 │ │
│ │ Features: Todo Starter + multi-OTA + Sign + ...        │ │
│ │ Activo · 12 clientes en este plan                      │ │
│ └────────────────────────────────────────────────────────┘ │
│                                                             │
│ [+ Crear nuevo tier]                                        │
│                                                             │
│ ─── Cap percentages per partner tier ───────────────────── │
│                                                             │
│ AUTHORIZED:  -15% max · 3 meses max duration              │
│ SILVER:      -25% max · 6 meses max duration              │
│ GOLD:        -35% max · 12 meses max duration              │
│ PLATINUM:    -50% max · forever permitido                  │
│                                                             │
│ [Editar caps]                                               │
│                                                             │
│ ─── Annual contract config ─────────────────────────────── │
│                                                             │
│ Descuento anual: -20%  [Editar]                            │
│ Free trial default: 0 días  [Editar] (consultor lo activa) │
│                                                             │
│ ─── Audit log de cambios ──────────────────────────────── │
│                                                             │
│ 26 may 2026 14:35 - PLATFORM_ADMIN abrahag40@gmail.com    │
│   Editó Pro: $2,200 → $2,400 MXN/mes                       │
│   Razón: "Aumento anual inflación + nuevas features Pro"   │
│                                                             │
│ 20 may 2026 ...                                             │
└─────────────────────────────────────────────────────────────┘
```

### Schema

```prisma
model BillingPricingConfig {
  id              String   @id @default(uuid())
  tier            String   @unique  // 'STARTER' | 'PRO' | 'ENTERPRISE'
  displayName     String   @map("display_name")
  monthlyAmountMxn Decimal @map("monthly_amount_mxn")
  monthlyAmountUsd Decimal @map("monthly_amount_usd")
  features        Json     // array of feature flags
  isActive        Boolean  @default(true) @map("is_active")
  stripeProductId  String? @map("stripe_product_id")
  stripePriceIdMxn String? @map("stripe_price_id_mxn")
  stripePriceIdUsd String? @map("stripe_price_id_usd")
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  @@map("billing_pricing_config")
}

model BillingPartnerTierCap {
  tier             String   @id  // 'AUTHORIZED' | 'SILVER' | 'GOLD' | 'PLATINUM'
  maxDiscountPct   Int      @map("max_discount_pct")
  maxDurationMonths Int?    @map("max_duration_months")  // null = forever permitido
  requiresApproval Boolean  @default(false) @map("requires_approval")
  updatedAt        DateTime @updatedAt @map("updated_at")

  @@map("billing_partner_tier_caps")
}
```

### Endpoint backend

```typescript
@Controller('v1/nova/admin/pricing')
@UseGuards(AuthGuard('jwt'), NovaTiersGuard)
@NovaTiers('PLATFORM')  // ← solo ZaharDev
export class PricingAdminController {
  @Get() async list() { ... }
  @Put(':tier') async update(@Body() dto: UpdatePricingDto, ...) { ... }
  @Post() async create(@Body() dto: CreatePricingDto, ...) { ... }
  @Put('caps/:tier') async updateCap(@Body() dto: UpdateCapDto, ...) { ... }
}
```

Cada operación:
1. Actualiza row local en `BillingPricingConfig`
2. Si cambió MXN/USD amount: crea **nuevo Stripe Price** (Stripe Prices son inmutables) y actualiza `stripePriceIdMxn`
3. Existing subscriptions siguen apuntando al Price viejo (grandfathered)
4. AuditLog entry con razón obligatoria

### Wizard usa pricing dinámico

```typescript
// En StepPlanDiscount.tsx
const { data: pricingConfig } = useQuery({
  queryKey: ['pricing-config'],
  queryFn: () => api.get<BillingPricingConfig[]>('/v1/nova/admin/pricing'),
})

// Render tiers desde pricingConfig en lugar de hardcoded constants
```

### Días de scope adicional

- D1 (schema): +0.5d para tables
- D5 (endpoints): +1d para `PricingAdminController`
- D9 (Nova dashboard): +1d para `/nova/admin/pricing` page
- D6 (wizard Step 7.5): +0.5d para fetch dinámico del pricing

**Total pricing admin UI**: +3 días al plan original.

---

## Resumen — scope total ajustado

| Item original | Días originales | Items nuevos | Días extras | Total nuevo |
|---|---:|---|---:|---:|
| BILLING-CORE plan original | 18-22 | — | 0 | 18-22 |
| + Annual contracts | — | annual UI + cycle handling | +1.5 | — |
| + Free trial 14d | — | toggle + trial cron emails | +1.5 | — |
| + T&C versionado + acceptance | — | schema + wizard + update flow | +3.5 | — |
| + Pricing admin UI | — | schema + endpoints + page | +3 | — |
| **TOTAL BILLING-CORE+ ajustado** | | | **+9.5** | **27-31 días-dev** |

**Calendar**: ~5-6 semanas (1 dev secuencial) o ~3-4 semanas (2 devs paralelos: 1 backend + 1 frontend).

---

## Fases ajustadas del sprint

### Fase 1 — Foundations (5-6 días)
- D1 Schema (incluye T&C tables + pricing config tables + annual/trial fields)
- D2 Webhook listener + idempotencia
- D3 SubscriptionService CRUD (incluye annual + trial paths)
- D4 DiscountCodeService + cap validation
- D5 Endpoints + RBAC + **PricingAdminController**
- D5.5 T&C schema seed + v0.9 borrador import

### Fase 2 — Wizard integration (4-5 días)
- D6 Step 7.5 con plan + descuento + **annual toggle + trial toggle**
- D7 Backend activate con annual + trial + **T&C acceptance write**
- D8 Email update + **T&C PDF attachment**

### Fase 3 — Dashboard consultor (5-6 días)
- D9 /nova/billing + **/nova/admin/pricing landing**
- D10 Cliente list
- D11 Cliente detail
- D12 GenerateDiscountDialog
- D13 Approvals queue + **Pricing edit page admin**

### Fase 4 — App cliente (5 días)
- D14 /settings/billing + **T&C history section**
- D15 Invoice history
- D16 Cancel flow con save offer ladder
- D17 Reminder preferences + banner past_due

### Fase 5 — Dunning + reminders (5 días)
- D18 Smart Retries config + reminder cron + **trial reminders D-7 + D-12**
- D19 Email templates (incluye **T&C update notification**)
- D20 Twilio WhatsApp
- D21 Read-only mode + suspended + **T&C re-acceptance flow**

### Fase 6 — Tests + docs (2-3 días)
- D22 E2E tests + edge cases + **T&C update flow E2E**
- D23 CLAUDE.md §D-BILL-1..10 + sales-master + prices-packages

### Fase 7 — T&C content authoring (1-2 días, paralelizable)
- D-paralelo Owner+abogado: escribir T&C v1.0 final en `docs/legal/terms-and-conditions/v1.0-es.md`
- D-paralelo: script `scripts/publish-tc.ts` que importa MD → DB row

---

## Quick reference

### Estimación final

| Versión sprint | Días | Calendar (1 dev) | Calendar (2 devs paralelos) |
|---|---:|---|---|
| **BILLING-CORE MVP reducido** (sin annual + sin trial + sin T&C + sin pricing admin) | 12-14 | ~3 sem | ~2 sem |
| **BILLING-CORE original** (plan inicial 2026-05-26) | 18-22 | ~4-5 sem | ~3 sem |
| **BILLING-CORE+ owner-approved 2026-05-26** | **27-31** | **~5-6 sem** | **~3-4 sem** |

### Pre-requisitos owner antes de kickoff

1. ✅ Save offer copy 6 templates (aprobado)
2. ✅ Cap percentages per partner tier (aprobado)
3. ✅ Annual contracts -20% (aprobado)
4. ✅ Free trial 14d opcional (aprobado)
5. ✅ Pricing modificable por ZaharDev (aprobado)
6. ⏳ **T&C v0.9 borrador escrito** (owner + asesor legal junior, 1-2 días)
7. ⏳ **T&C v1.0 validado con abogado mercantil senior** (~$15-30k MXN, 1-2 sesiones, agendado v1.0.1 timing)
8. ⏳ Stripe live mode verified
9. ⏳ Twilio WhatsApp Business + 4 templates Meta-approved (5-10d × 4, lead time 2 sem)
10. ⏳ Pricing tiers definitivos validados con piloto v1.0.0 (3-6 hoteles × 2-3 ciclos)
