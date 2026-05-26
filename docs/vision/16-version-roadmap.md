# 16 · Roadmap por versiones — qué entra en cada release

> Vista consolidada del roadmap v1.0.0 → v1.2 con énfasis en **billing** y
> qué módulos están comprometidos en cada release. Complementa
> [docs/vision/03-roadmap-v1-v2.md](03-roadmap-v1-v2.md) (que cubre la
> visión completa hasta v2.0) con foco en lo accionable corto/mediano plazo.
>
> **Status**: 2026-05-26 — owner aprobó save offer copy + pricing modifiable
> por ZaharDev + cap per tier + annual contracts + free trial + T&C
> generation. Este doc consolida el plan de trabajo por release.

---

## Vista rápida — qué va en cada versión

| Versión | Target date | Sprints incluidos | Billing scope |
|---|---|---|---|
| **v1.0.0** | jul-ago 2026 | CHECK-IN modal redesign · RATES-METRICS-COMPSET-CORE · QA-α · CI-RESCUE | **Cobro manual** (Stripe Invoice directo del dashboard ZaharDev) |
| **v1.0.x** | ago-sep 2026 | PAY-CORE · CFDI-CORE · FX-LATAM · IMG · SSE-RESILIENCE · DEBT-α | Stripe Connect activo para cliente; aún sin subscription automation |
| **v1.1.0** | sep-oct 2026 | **BILLING-CORE** · SIGN-DLC · IA tarifaria heurística | **Subscription automation FULL** — wizard genera Stripe sub al activar |
| **v1.1.x** | oct-dic 2026 | BILLING-WHATSAPP · BILLING-OXXO · MARKET-INTEL-PRO · DEMAND-INTELLIGENCE | OXXO Pay + SPEI alternativas LATAM + reminders WhatsApp full |
| **v1.2** | 2027 H1 | NOVA Phase 2 (extract `apps/partner`) · BILLING-MULTI-CURRENCY · BR via Sovos | Multi-currency invoicing para chains cross-country |

---

## v1.0.0 — Piloto comercial (target jul-ago 2026)

### Lo que YA está listo (sprint NOVA-CHANNEX-COMMAND-CENTER cerrado 2026-05-25)

- ✅ PMS Core (calendar + reservas + folios)
- ✅ Housekeeping (planning + 2-phase + carryover + auto-assign)
- ✅ No-shows + Night Audit + Pre-arrival warming
- ✅ SmartBlocks (mantenimiento + bloqueos)
- ✅ Notifications Center + SSE singleton
- ✅ Maintenance backend + mobile + web
- ✅ Mobile Hub Recamarista
- ✅ Channex Inbound (webhooks OTA → PMS real-time)
- ✅ Channex Outbound Cert (PMS → Channex push, 14 cert tests)
- ✅ Channex UX E2-E3 (cancel push + grupos multi-room)
- ✅ Nova foundation 5-tier RBAC + Partner schema + AuditLog universal
- ✅ Wizard Zenix Activate end-to-end (8 steps + 4 health-checks + setup token 72h + auto-login + HTML Activation Report)
- ✅ Setup activation flow `/setup/:token` con TOCTOU defense
- ✅ Resend auto-email post-activation
- ✅ PAC adapter Strategy (Facturama SANDBOX real, SW Sapien stub)

### Lo que falta para cerrar v1.0.0 (~25-31 días-dev = ~5-6 sem calendar)

| Sprint | Días | Prioridad | Estado |
|---|---:|---|---|
| **CHECK-IN modal redesign** | 1-2 | Recomendado | Pending |
| **RATES-METRICS-COMPSET-CORE** | 20-23 | **Revenue blocker** — sin esto manager piloto cobra "a ojo" | Pending |
| **QA-α mobile** | 4-5 | Pre-release | Pending |
| **CI-RESCUE residual** | 0.5-1 | Cleanup | Pending |

### Billing en v1.0.0 — manual via Stripe Invoice

**Estrategia**: durante el piloto comercial (3-6 hoteles iniciales) los cobros se hacen **manualmente** vía Stripe Invoice directo desde el dashboard de Stripe que el owner ZaharDev maneja.

**Workflow operativo del piloto**:

1. Consultor cierra venta con hotel cliente
2. ZaharDev owner crea Customer en Stripe dashboard manualmente
3. ZaharDev crea Invoice manual en Stripe con:
   - Customer del cliente
   - Líneas: Plan Pro × N properties
   - Descuentos aplicados manualmente como line item negativo
4. Stripe envía invoice por email al cliente (Stripe hosted invoice)
5. Cliente paga via Stripe hosted payment page (todas las opciones: tarjeta, OXXO, SPEI, ACH)
6. Owner monitorea pagos en Stripe dashboard
7. Renovaciones mensuales: owner crea nueva invoice cada mes (tedioso pero manageable a 3-6 clientes)

**Por qué manual y no automatic**:
- Datos reales del piloto para validar pricing tiers ANTES de hard-codearlos
- Validar cap percentages per partner tier con casos reales
- Detectar edge cases (multi-currency, prorrateo, refunds) sin tener que retroceder en automation
- Owner tiene visibilidad total del cash flow durante semanas críticas

**Costo operativo del manual approach**:
- Owner dedica ~30 min/cliente/mes a invoicing
- 6 clientes piloto × 30 min × 12 meses = ~36 horas año 1
- Comparado vs CAC perdido si automation bug rompe primer cobro = irrelevante

**Pricing del piloto** (revisable post-data):

| Plan | MXN/mes/property | USD equivalente |
|---|---:|---:|
| Starter | $1,200 | $60 |
| Pro | $2,400 | $120 |
| Enterprise | $4,800+ | $240+ |
| Add-ons (Sign DLC, Market Intel, Demand Intel, Booking Engine) | $200-1,000/mes | $10-50 |

**Pricing modificable por owner**: durante el piloto el owner puede modificar precios al cliente caso-por-caso sin restricción técnica (es Stripe Invoice manual, no DB hard-code). Post v1.1.0 BILLING-CORE el pricing vive en `BillingPricingConfig` table editable solo por `PLATFORM_ADMIN` (ZaharDev).

### Acciones owner durante v1.0.0 (pre-piloto)

1. Stripe live mode account verified (1-3d business verification)
2. Stripe Tax setup para MX (opcional, ZaharDev emite CFDI separate del cobro)
3. Documentar pricing tiers final en `docs/prices-packages.md`
4. Preparar contratos de servicio (T&C) base para piloto — ver v1.0.0 T&C scope abajo

---

## v1.0.0 — Terms & Conditions base (deliverable nuevo)

Owner agregó esto al scope. T&C necesario antes de cobrar al primer cliente del piloto.

### Scope T&C v1.0.0 — minimum viable legal

Documento legal B2B SaaS bilingüe (ES primary, EN secondary para clientes US futuros) cubriendo:

1. **Identificación de las partes** — ZaharDev S. de R.L. de C.V. (LegalEntity emisor) ↔ Cliente
2. **Objeto del contrato** — licencia uso del software PMS Zenix
3. **Modalidades de servicio** — Starter / Pro / Enterprise + add-ons
4. **Precios y forma de cobro** — mensual recurring, fecha de cobro, currency, ajustes anuales
5. **Procesamiento de pagos** — Stripe como procesador, métodos aceptados
6. **Política de descuentos y promociones** — discount codes son al criterio del consultor dentro del tier cap, no son acquired rights
7. **Cancelación** — derecho a cancelar en cualquier momento (PROFECO Art. 47), efecto al fin del período actual, no reembolso prorrateado del mes en curso (industria-standard)
8. **Pausas de suscripción** — máximo 6 meses, después auto-cancel
9. **Modo limitado por falta de pago** — escalación 21 días grace + read-only + suspended
10. **Tratamiento de datos personales** — Zenix es Data Processor del cliente; cliente es Data Controller de sus huéspedes. GDPR / LFPDPPP / LGPD compliance.
11. **Propiedad intelectual** — código y diseño de Zenix son propiedad de ZaharDev; data operativa del cliente es propiedad del cliente
12. **Acuerdos de nivel de servicio (SLA)** — uptime objetivo 99.5% v1.0.x (sin compensación contractual en piloto), 99.9% v1.0.5+
13. **Confidencialidad** — both ways
14. **Limitación de responsabilidad** — cap en 12 meses de fees pagados (industria-standard)
15. **Cesión de derechos** — Zenix puede cedirse a successor entity sin notice; cliente requiere notice
16. **Resolución de disputas** — mediación PROFECO primero, después tribunales CDMX
17. **Ley aplicable** — México
18. **Anexo A** — política de privacidad detallada (GDPR/LFPDPPP/LGPD)
19. **Anexo B** — política de tratamiento de datos de huéspedes (qué Zenix hace con guest data — útil para SIGN-DLC chain-of-custody)
20. **Anexo C** — DPA (Data Processing Agreement) opcional para clientes que lo pidan (chains enterprise)

### Workflow del T&C en v1.0.0 piloto

1. ZaharDev crea documento T&C v1.0 en Notion o Google Docs (PDF export)
2. PDF se sube al primer cliente del piloto vía email
3. Cliente firma con DocuSign o similar (out-of-band del wizard)
4. Acceptance manual: ZaharDev marca `Organization.termsAcceptedVersion = '1.0'` + `termsAcceptedAt = now()` + `termsAcceptedBy = orgOwner.id` desde el admin panel

### Workflow del T&C en v1.1.0 BILLING-CORE (post-piloto)

1. T&C v1.0 cargado en DB como `TermsAndConditionsVersion` row
2. Wizard Step 8 muestra checkbox "He leído y acepto los Términos y Condiciones v1.0" obligatorio
3. Setup link email incluye PDF adjunto del T&C aceptado
4. T&C version updates: cliente recibe email + obligación de re-aceptar en próximo login (no bloquea acceso 30 días, después read-only hasta aceptar)
5. Customer Portal incluye historial de T&C versions aceptadas + fecha + IP del cliente

### Validación legal pre-piloto

Owner agendó (`docs/ops/2026-05-22-bloque1-kickoff.md` decisión 7): validación con abogado mercantil MX dentro de v1.0.1 timing. Implica:
- Pre-piloto puede usar T&C v0.9 "borrador con disclaimer 'sujeto a validación legal final'"
- Antes de escalar a 10+ clientes pagando, T&C v1.0 finalizado con abogado
- Costo estimado: $15-30k MXN abogado mercantil senior (1-2 sesiones revisión + redacción anexos)

---

## v1.0.x — Foundation hardening (target ago-sep 2026)

Sprints post-piloto que cierran deuda técnica + features esenciales pre-billing-automation:

| Sprint | Días | Justificación |
|---|---:|---|
| **PAY-CORE** | ~30 (~6 sem) | Stripe + Conekta + folio modal + master billing + multi-currency `PaymentFxLock` + cash drawer multi-divisa + OTA-collect detection + GuestCredit con CFDI E |
| **CFDI-CORE** | ~15 (~3 sem) | MxCfdi40Adapter (Facturama/SW Sapien) + CFDI I/E/REP + tax engine LATAM + `IFiscalAdapter` Strategy |
| **REPORTS-CORE** | ~30-40 | 12 reportes esenciales + cold storage partition + GuestCredit liabilities |
| **IMG + NS-UI + DEBT-α** | ~5-10 | S3 + image upload (R2) + toggle no-shows + cleanup deuda técnica |
| **FX-LATAM** | ~3-5 (paralelizable) | IFxAdapter Strategy pattern + adapters CO/CR/PE (Banco República TRM, BCCR, SBS) |
| **SSE-RESILIENCE** | ~2-3 (paralelizable) | Hardening prod-grade del SSE singleton |

**Billing en v1.0.x**: aún manual via Stripe Invoice. PAY-CORE habilita los cobros del HUÉSPED al hotel (charge tarjeta de un guest por su estadía), no el cobro de la suscripción Zenix al hotel (eso es BILLING-CORE en v1.1.0).

**Pricing modificable por owner**: a partir de PAY-CORE, los tiers se pueden configurar via DB ya (no hard-coded). Owner accede a `/nova/admin/pricing` page para ajustar.

---

## v1.1.0 — BILLING-CORE (target sep-oct 2026)

**El gran release que automatiza el cobro de suscripción Zenix.**

### Sprints incluidos

| Sprint | Días | Scope |
|---|---:|---|
| **BILLING-CORE** | 18-22 | Plan principal — ver [docs/sprints/BILLING-CORE-plan.md](../sprints/BILLING-CORE-plan.md) |
| **SIGN-DLC** | ~12 (paralelizable) | Digital check-in + e-signature canvas + ToC versionado per LegalEntity + NOM-151 conservation Mifiel + chargeback Evidence Package builder |
| **IA tarifaria heurística** | ~10 | Recomendaciones automáticas de pricing diario basadas en historical + occupancy + competidor |

### Billing en v1.1.0 — automation full

Todo lo que el wizard hace HOY (crear Org + Brand + LegalEntity + Properties + Owner + AuditLog) ahora ADEMÁS:

1. **Step 7.5 nuevo en wizard**: "Plan y descuento"
   - Selector Starter / Pro / Enterprise
   - Toggle "Aplicar descuento" con cap validation per partner tier
   - Duration selector (once / 1m / 3m / 6m / 12m / forever)
   - Multi-phase pricing UI ("primeros 2 meses -25%, después fijo")
   - Razón obligatoria (visible solo a ZaharDev en audit log)
   - **Toggle "Annual contract"** con -20% upfront

2. **Backend al activate**:
   - Crea Stripe Customer + Subscription real
   - Genera Stripe Coupon + PromotionCode si hay descuento
   - SubscriptionSchedule si multi-phase
   - Annual contract = single invoice upfront + auto-renew anniversary

3. **Email de bienvenida actualizado**:
   - Caja "Plan contratado: Pro · $1,800 MXN/mes (descuento -25% durante 3 meses)"
   - CTA secundario "Configurar método de pago" → Stripe Customer Portal
   - **PDF del T&C v1.x aceptado** adjunto al email
   - **Free trial activado** si owner habilita (14 días sin cargo)

4. **Customer Portal embebido** en `/settings/billing` del cliente

5. **Save offer ladder** en cancel flow (6 templates condicionales — ver [BILLING-CORE-save-offer-copy.md](../sprints/BILLING-CORE-save-offer-copy.md))

6. **Dunning automation 21 días**:
   - Stripe Smart Retries (4 attempts)
   - Email D-3 + D-1 reminders
   - Read-only mode día 14
   - Suspended día 21
   - Dormant 90 días

7. **Dashboard consultor `/nova/billing`**:
   - MRR / ARR / Churn / Mora StatTiles
   - Cliente list con estado + filtros
   - Discount code generation con cap validation
   - Approval queue para PARTNER_ADMIN+
   - **Pricing config admin** (PLATFORM_ADMIN only)

### Free trial — incluido en v1.1.0

Owner aprobó. Estructura:

- **14 días sin cargo** al activar (Stripe Subscription con `trial_period_days: 14`)
- Sin método de pago obligatorio durante trial
- Email D-12 (2 días antes de fin de trial): "Tu trial termina en 2 días. Agrega método de pago para continuar."
- Email D-14 (último día): si no agregó método de pago → subscription pasa a `incomplete_expired` → cliente cae en grace 7 días read-only antes de suspended
- **Cero CAC perdido**: el wizard activate del consultor es lo que cuesta ($100-400). Si después del trial el cliente no convierte, ya pagaste el consultor — el trial mismo no agrega costo

**Decisión técnica**: trial es **opcional per cliente** activado por el consultor durante Step 7.5. Default: NO trial (consultor-led venta no necesita trial; lo activas solo si el cliente lo pide o el consultor lo usa como cierre).

### Annual contracts — incluido en v1.1.0

Owner aprobó. Estructura:

- Toggle "Pago anual" en Step 7.5 wizard
- Si activado: cliente firma 12 meses upfront con **-20% descuento** sobre total mensual
- Stripe Subscription con `interval: 'year'` + invoice upfront
- Renovación automática en aniversario
- Cancel anual: el cliente paga el resto del año? **NO** — PROFECO Art. 47 prohíbe penalizar cancel. Cliente accede hasta fin de período (12 meses pre-pagados) y no se renueva
- Refund pro-rata? **NO** (industria-standard B2B SaaS, AWS / Stripe / Atlassian). Esto se documenta explícitamente en T&C.

### T&C en v1.1.0 — version 1.0 definitiva

- T&C v1.0 cargado en DB como `TermsAndConditionsVersion`
- Wizard Step 8 obliga checkbox "He leído y acepto los Términos y Condiciones v1.0"
- Acceptance registrada con timestamp + IP + user agent en `TermsAcceptance` table
- PDF version del T&C generado al accept (Stripe hosted document o R2 storage en v1.0.4 IMG)
- Customer Portal muestra historial de T&C versions aceptadas

### Pricing config admin — incluido en v1.1.0

ZaharDev (PLATFORM_ADMIN) puede modificar pricing tiers desde `/nova/admin/pricing`:

- Editar precio MXN / USD per tier
- Activar/desactivar tiers (deprecate Starter cuando ya no se vende)
- Agregar nuevos tiers
- Configurar cap percentages per partner tier (AUTHORIZED/SILVER/GOLD/PLATINUM)
- Cambios afectan ÚNICAMENTE clientes nuevos — existing subscriptions tienen Price snapshot en Stripe que no cambia (industry-standard "grandfather pricing")

---

## v1.1.x — DLC + market intelligence (target oct-dic 2026)

| Sprint | Días | Scope |
|---|---:|---|
| **BILLING-WHATSAPP** | ~3 | Templates Meta-approved + Twilio Business API wiring + opt-in UI |
| **BILLING-OXXO** | ~5 | OXXO Pay (Conekta) + SPEI bank transfer + ACH para CO/CR/PE como métodos alternativos |
| **MARKET-INTEL-PRO DLC** | ~15-20 | Event ingest multi-adapter + dedup fuzzy + Lighthouse partnership + auto-radius compset + push notifications |
| **DEMAND-INTELLIGENCE Premium DLC** | ~30-40 | Flight APIs (Amadeus) + vacation calendars + DemandScore heurístico + Recommendations engine |
| **Mensajería Airbnb + Expedia** | ~5 | Inbound messaging desde OTAs |
| **Upsell engine** | ~5 | Cross-sell de room upgrades pre-check-in |

---

## v1.2 — Multi-currency + Brasil + Nova Phase 2 (target 2027 H1)

| Sprint | Días | Scope |
|---|---:|---|
| **BILLING-MULTI-CURRENCY** | ~5 | Subscription en USD para clientes cross-border (Selina-like). Bundled con FX-LATAM completo. |
| **NOVA Phase 2 extraction** | ~10-15 | Mover `/nova/*` a `apps/partner` separado con dominio propio `nova.zenix.com`. Mantiene compatibility con `apps/web` durante transición. |
| **BR via Sovos** | ~20-25 | ISS municipal + NFSe + reforma tributária 2026-2033 (CBS/IBS). Stripe Brasil. |
| **Group reservations + Master billing refinado** | ~8 | Para chains con guest spend reconciliation |

---

## Resumen visual del roadmap

```
v1.0.0 (jul-ago 2026)
├── Operación PMS completa (✅ ya cerrado: Channex + Nova + Wizard)
├── Sprints pendientes: CHECK-IN modal · RATES-METRICS · QA-α · CI-RESCUE
├── Billing: MANUAL via Stripe Invoice (ZaharDev maneja)
└── T&C: v0.9 borrador con disclaimer "sujeto a validación legal"

v1.0.x (ago-sep 2026)
├── PAY-CORE + CFDI-CORE (cobro del HUÉSPED al hotel + facturación)
├── REPORTS-CORE + IMG + DEBT-α
├── FX-LATAM (paralelizable)
└── Billing: aún MANUAL (Stripe Invoice)

v1.1.0 (sep-oct 2026) ← EL GRAN RELEASE BILLING
├── BILLING-CORE (subscription automation full)
│   ├── Step 7.5 wizard plan + discount
│   ├── Save offer ladder 6 templates
│   ├── Dunning 21d email + (WhatsApp si templates Meta listos)
│   ├── Customer Portal embebido cliente
│   ├── Dashboard consultor MRR/ARR/churn
│   ├── Annual contracts -20%
│   ├── Free trial 14d opcional
│   ├── Pricing admin UI (ZaharDev modifiable)
│   └── T&C v1.0 versionado + acceptance flow
├── SIGN-DLC (digital check-in para huéspedes + NOM-151)
└── IA tarifaria heurística

v1.1.x (oct-dic 2026)
├── BILLING-WHATSAPP (post templates Meta-approved)
├── BILLING-OXXO + SPEI fallback LATAM
├── MARKET-INTEL-PRO DLC
└── DEMAND-INTELLIGENCE Premium DLC

v1.2 (2027 H1)
├── BILLING-MULTI-CURRENCY (chains cross-border)
├── NOVA Phase 2 extraction a apps/partner
└── BR via Sovos
```

---

## ¿Qué decisiones del owner están pendientes para v1.0.0?

### Decididas ✅
- ✅ Pricing tiers iniciales (modificables por owner via DB en v1.1.0+)
- ✅ Cap percentages per partner tier (AUTHORIZED 15% / SILVER 25% / GOLD 35% / PLATINUM 50%)
- ✅ Save offer copy (6 templates definitivos)
- ✅ Annual contracts con -20% upfront
- ✅ Free trial 14d opcional per cliente
- ✅ T&C base generado pre-piloto (v0.9 borrador)

### Pendientes para v1.0.0 piloto
1. **Validación legal T&C con abogado mercantil MX** — owner agendar dentro de v1.0.1 timing
2. **Selección primeros 3-6 hoteles piloto** — comercial owner
3. **Stripe live account verified** — owner activate cuando esté listo el primer cliente
4. **Templates email transaccional Resend** — owner valida copy de welcome / receipt / cancellation
5. **Documentar pricing en `docs/prices-packages.md`** — owner finaliza números

### Pendientes para v1.1.0 BILLING-CORE
1. **Meta WhatsApp Business templates pre-aprobados** — 5-10d lead time × 4 templates, owner submit 2 sem antes del sprint
2. **Twilio o 360dialog account** — owner activate pre-sprint Día 18
3. **T&C v1.0 finalizado con abogado** — antes de escalar a 10+ clientes pagando
4. **Validación cap percentages con piloto data** — después de 3-6 meses datos reales

---

## Métricas para decidir "v1.1.0 está listo"

Definition of done para release v1.1.0 BILLING-CORE:

- [ ] 3-6 hoteles piloto v1.0.0 cobrados manualmente exitosamente >= 2 ciclos cada uno
- [ ] Pricing tiers validados — sin clientes pidiendo descuentos >50% para cerrar (señal de mispricing)
- [ ] T&C v1.0 firmado por abogado mercantil
- [ ] Stripe Smart Retries testeado en sandbox con 5+ scenarios past_due
- [ ] WhatsApp Meta templates 4/4 approved
- [ ] BILLING-CORE sprint completado con DoD 15/15 checkboxes (ver [BILLING-CORE-plan.md §6](../sprints/BILLING-CORE-plan.md#6-definition-of-done--sprint-completo))
- [ ] E2E test wizard → first payment → renewal → reminder verde
- [ ] Save offer flow probado con A/B test (5+ clientes reales que hayan visto el flow)

---

> **Recomendación operativa**: NO arrancar BILLING-CORE hasta tener 2-3 meses
> de datos del piloto manual. Razón: cualquier decisión de pricing /
> automation que tomes sin datos reales se convierte en deuda técnica
> imposible de revertir (subscriptions activas con pricing legacy).
> El piloto manual cuesta ~36 horas/año del owner — irrelevante comparado
> con el costo de re-arquitectura por mispricing.
