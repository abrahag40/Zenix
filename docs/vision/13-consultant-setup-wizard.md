# 13 · Zenix Activate — Setup Wizard dentro de Nova

> Flujo guiado para que un PLATFORM_ADMIN (ZaharDev) o PARTNER_MEMBER certificado onboardee un nuevo cliente Zenix en 30 min - 2 semanas, dependiendo de complejidad.
>
> **Inspirado en:** SAP Activate methodology + Salesforce Setup Assistant + Workday Adaptive Implementation. **Objetivo:** experiencia 10x más simple que los grandes, manteniendo el rigor enterprise.
>
> **Status:** Diseño aprobado 2026-05-15. Refinamiento Nova-aligned 2026-05-23.
>
> **Surface:** el wizard NO es app independiente — vive **dentro de Zenix Nova** (`nova.zenix.com/wizard`) como módulo. En v1.0.0 vive bajo `apps/web/src/pages/nova/wizard/*`. En v1.0.5 se extrae junto con el resto de Nova a `apps/partner` (o `apps/nova`, naming a confirmar en sprint dedicado). El cliente NUNCA accede al wizard — es herramienta interna del consultor/PLATFORM_ADMIN. El cliente recibe credenciales SOLO al activarse Step 8 (ver §3.8).
>
> **Doc fundacional vinculante:** [docs/architecture/NOVA-architecture.md §6](../architecture/NOVA-architecture.md#6-wizard-zenix-activate-integration). Este documento es el **manual operativo del consultor** (etapas, defaults, templates, plantillas CSV). El RBAC matrix y forcing functions canónicas viven en NOVA.

---

## 1. Filosofía del wizard

Los implementations de SAP/Workday toman 6-12 semanas. Razones: ERP es masivo, configurar GL chart-of-accounts es work intensivo, integraciones con dozens of sistemas legacy.

Zenix tiene **2 ventajas estructurales** que permiten 10x velocidad:
1. **Scope acotado** — PMS + módulos hermanos, no ERP
2. **Opinionated defaults** — el 80% de los clientes boutique usa configuración similar

Target de tiempos:
- **Customer single-property:** 30 min - 2 horas
- **Customer chain mismo país:** 4-8 horas
- **Customer chain multi-país (Selina-like):** 1-2 semanas (incluye PAC setup per país)

---

## 2. Quién ejecuta el wizard

### 2.1 Niveles de acceso (Nova-aligned v1.0.0)

**Solo `PLATFORM_ADMIN` o `PARTNER_MEMBER` con `canActivateWizard=true` y `scope=FULL` (o `TIER_A_ONLY` para configs fiscal/integration) pueden iniciar y ejecutar el wizard.** El cliente NO ejecuta el wizard — recibe el resultado al final como cuenta lista para usar.

| Actor | Quién | Customers que pueden onboarder | Notas |
|-------|-------|--------------------------------|-------|
| **PLATFORM_ADMIN** | Staff ZaharDev (Partner con `isInternal=true`) | Cualquier customer | Sin restricción. 2FA obligatorio. |
| **PARTNER_ADMIN** | Owner/managing partner consulting firm | Customers asignados al partner vía `PartnerClientAssignment` | Override de capabilities para casos extraordinarios. |
| **LEAD_CONSULTANT** | Senior consultant (PartnerMember.role) | Customers donde tiene `PartnerMemberAssignment.scope IN (FULL, TIER_A_ONLY)` | Path típico para PRO/ENTERPRISE. 2FA obligatorio. |
| **SOLUTION_CONSULTANT** | Mid consultant (PartnerMember.role) | Customers asignados, no puede ejecutar Step 8 final (cierra LEAD_CONSULTANT o PARTNER_ADMIN) | Hace Steps 1-7. 2FA obligatorio. |
| **SUPPORT_L3** | Soporte técnico senior (PartnerMember.role) | Solo Steps 3 (LegalEntity PAC) y 7 (Integrations) de clientes existentes — para re-config | No inicia wizards nuevos. |
| **SUPPORT_L2** | Soporte técnico (PartnerMember.role) | Solo Steps 4 (Properties) y 5 (Inventory) de clientes existentes — para ajustes | No inicia wizards nuevos. |
| **SALES_REP / TRAINEE** | Sales y trainees | **Cero acceso al wizard prod.** Sandbox demo únicamente. | Demos a prospectos. |
| **Customer Self-Service** | El propio cliente | **No habilitado en v1.0.0.** Reservado para v1.3+ trial sign-up. | — |

Matriz canónica de forcing function por Step ↔ Role en [NOVA §6.1](../architecture/NOVA-architecture.md#61-8-etapas-resumen--detalle-completo-en-docsvision13).

### 2.2 Surface técnica

Wizard vive bajo `nova.zenix.com/wizard/[organizationId]/step-N`. Guard chain: `NovaAccessGuard` (verifica `SystemRole IN (PLATFORM_ADMIN, PARTNER_ADMIN, PARTNER_MEMBER)`) → `WizardActivateGuard` (verifica `canActivateWizard=true` o role permitido per Step) → `PartnerScopeGuard` (verifica que el actor tiene `PartnerMemberAssignment` activo en la Organization target, salvo PLATFORM_ADMIN). Toda acción deja `AuditLog` entry con `domain=WIZARD`, `action=wizard.step{N}.complete`, retentionPolicy=PERMANENT en Step 8.

Tech stack: React + Vite + Tailwind + Radix UI (idéntico a `apps/web`). 2FA obligatorio para LEAD_CONSULTANT / SUPPORT_L2 / SUPPORT_L3 / PARTNER_ADMIN / PLATFORM_ADMIN.

---

## 3. Las 8 etapas del wizard

### Etapa 1 — Customer Account

**Pregunta:** ¿quién es el customer y qué plan compraron?

**Inputs:**
- Customer commercial name (legal name viene en etapa 3)
- Plan tier: STARTER ($100-200/mes single-property) / PRO ($300-500/mes 2-10 properties) / ENTERPRISE ($1000+/mes 10+ o cadena)
- Entitlements activados (checkboxes basados en el contrato firmado)
- Contact principal: email + WhatsApp para handoff
- Slug interno: `selina-group`, `hotel-monica-tulum`
- Currency principal para billing (USD para cadenas internacionales, MXN para clientes locales MX)

**Outputs:** se crea `Organization` con los entitlements aplicados + `WizardSession` row + `PartnerClientAssignment` con `status=ONBOARDING` (si el actor es PartnerMember; si es PLATFORM_ADMIN, assignment apunta al ZaharDev internal Partner).

**Forcing functions pre-avance:**
- Email format valid + verificación DNS MX record exists (skip si email del staff ZaharDev por convención).
- Slug único globalmente en `organizations` table (Postgres UNIQUE).
- Plan tier seleccionado.
- ≥1 entitlement marcado (al menos el base PMS).
- Contact phone WhatsApp-capable (regex E.164).
- Plan ≥ ENTERPRISE si `expectedPropertiesCount > 5` (warning override-able solo por PLATFORM_ADMIN).
- AuditLog entry `domain=WIZARD, action=wizard.step1.complete` creada.

**Tiempo estimado:** 5 minutos.

---

### Etapa 2 — Brand (opcional)

**Pregunta:** ¿el customer tiene una marca registrada?

**Si NO** (saltable — pulsar "Continuar sin brand"):
- `Organization.brandId = NULL`
- Wizard continúa a etapa 3

**Si SÍ:**
- Brand name + slug (público)
- Logo upload (PNG/SVG, recomendado SVG transparente)
- Brand colors (primary, secondary, accent — color picker)
- Brand book PDF (opcional)
- Website URL

**Outputs:** se crea `Brand` + `Organization.brandId` set.

**Forcing functions pre-avance:**
- Si SKIP → `Organization.brandId = NULL` confirmado.
- Si CREATE → Brand slug único globalmente, logo upload validado (file type PNG/SVG, max 2MB), colores hex validados.
- AuditLog entry `domain=WIZARD, action=wizard.step2.complete` con `skipped: true|false` en `changeDelta`.

**Nota importante:** Brand puede agregarse **después** sin migration. El wizard tiene un step "Skip" claramente visible.

**Tiempo estimado:** 5 minutos si tiene assets, saltable.

---

### Etapa 3 — Legal Entity (1 o más)

**Pregunta:** ¿en qué países opera el cliente fiscalmente?

**Por cada país donde el cliente tiene presencia fiscal:**

#### Datos de la entidad
- País (dropdown 10 países LATAM disponibles, más en roadmap)
- Razón social completa (ej. "Selina Mexico S.A. de C.V.")
- Tipo de tax ID auto-seleccionado:
  - MX → RFC (12-13 chars, regex `^([A-Z&Ñ]{3,4})\d{6}([A-Z\d]{3})$`)
  - CO → NIT (9 dígitos + verificador `^\d{9}-\d$`)
  - CR → Cédula Jurídica (10 dígitos `^\d{10}$`)
  - PE → RUC (11 dígitos `^\d{11}$`)
  - PA → RUC (formato similar)
  - GT → NIT (variable)
  - BR → CNPJ (14 dígitos)
  - SV → NIT
  - HN → RTN
  - AR → CUIT
- Domicilio fiscal (formulario varía per-país por jsonb `legalAddress`)
- Moneda base auto-seleccionada (MXN si MX, COP si CO, etc.) pero editable
- Fiscal year start (default enero, editable)

#### PAC integration
- Régimen fiscal auto-seleccionado: `MX_CFDI4`, `CO_DIAN`, etc.
- Provider PAC (dropdown):
  - MX: Facturama, SW Sapien, Solución Factible
  - CO: Olimpia, Carvajal Tecnología
  - CR: ATV directo o ATC, KOTI Solutions
  - PE: SUNAT OSE certificado
  - (Etc. per país)
- Credenciales API (encriptado al guardar)
- **Test factura sandbox** → llama al PAC y emite una factura de prueba con datos dummy. Si responde ✅, wizard continúa. Si ❌, muestra error específico para troubleshoot.

**Outputs:** se crea 1+ `LegalEntity` rows. Cada una con `fiscalRegimeId`, `pacCredentials` encriptado vía `pgcrypto`, `active = true` solo si el test pasó.

**Forcing functions pre-avance (CRÍTICAS):**
- Tax ID format valid per country (regex per `countryCode` — ver §3 tabla regex per país).
- `FiscalRegime.active=true` para el país elegido. Si NO está activo en el catálogo ZaharDev → error blocking "País todavía no soportado, contactar PLATFORM_ADMIN" (solo PLATFORM_ADMIN puede activar nuevo regime en NOVA admin panel).
- PAC credentials encrypted via `pgcrypto` antes de insert (nunca plain text en DB).
- **PAC sandbox test obligatorio**: `WizardService.testPacEmission(legalEntityId)` llama al PAC adapter con datos dummy. Success requiere XML válido + UUID emitido. Error específico (no genérico) mostrado + botón "Reintentar test".
- **Para v1.0.0 MX-only**: `MxCfdi40Adapter` con Facturama/SW Sapien sandbox. CO/CR/PE/etc. activan en sprints subsecuentes.
- ≥1 LegalEntity con `active=true` antes de avanzar a Step 4.
- Si PAC no responde tras 3 reintentos → opción "Skip — finalizar más tarde" pero `LegalEntity.active=false`. **Banner persistente** en Nova hasta resolver. Activation final (Step 8) bloqueado.
- AuditLog entry per LegalEntity creada + per test exec (success/fail) con `retentionPolicy=PERMANENT`.

**Tiempo estimado:** 10-30 minutos per país (depende de qué tan rápido el cliente envíe credenciales PAC).

#### FX integration (Sprint FX-LATAM v1.0.4)

> Configuración del adapter de tipo de cambio per-LegalEntity. Análoga a PAC integration — paralela en arquitectura (`IFxAdapter` Strategy §111).
> Ver [docs/sprints/FX-LATAM-plan.md](../sprints/FX-LATAM-plan.md) para detalle del catálogo de adapters.

- Adapter FX auto-seleccionado según `countryCode`:
  - MX → `BanxicoMxAdapter` (SF43718 FIX, requiere `BANXICO_TOKEN` gratuito)
  - CO → `BancoRepublicaCoAdapter` (TRM Datos Abiertos, sin auth)
  - CR → `BccrCrAdapter` (webservice SOAP, requiere `BCCR_API_TOKEN` gratuito)
  - PE → `SbsPeAdapter` (REST sin auth)
  - PA, SV → ninguno (USD nativo, no aplica)
  - AR, BR, GT, HN → fuera de first batch (ver §114-§115 + plan FX-LATAM §8)
- Token credentials del banco central (si aplica) — encriptado al guardar.
- **Test fetch sandbox** → dispara `adapter.fetchOfficial()` una vez al activar. Si responde con al menos 1 rate USD↔baseCurrency, ✅. Si ❌, muestra error específico (token inválido, endpoint caído, timezone wrong).
- **Set inicial de monedas secundarias** (`PropertySettings.secondaryDisplayCurrencies` — pero per-LegalEntity para el bootstrap, propagado a properties):
  - Default sugerido por país: MX/CO/CR/PE → `['USD', 'EUR']`; AR → `['USD']`; PA/SV → `['EUR']` (USD ya es primary).
  - Manager puede editar al activar o después.
- **Override inicial opcional** — si el cliente quiere lanzar con un spread comercial sobre el rate oficial (ej. +3% para márgen), el consultor lo configura aquí. Se persiste como primera row `PropertyFxRate` con `spreadFromOfficial` poblado.

**Health check pre-activación FX:**
- Confirma que `ExchangeRate` tiene al menos 1 row USD↔baseCurrency para el `organizationId`. Si no, bloqueante (warning explícito al consultor).
- Confirma que el cron del adapter está registrado en `SchedulerRegistry` con el huso correcto.

**Validaciones críticas:**
- Si el adapter FX falla 3× en el test, opción "Skip — configurar después en Dashboard". Deja `LegalEntity.active = true` pero marca flag `fxSetupPending`. Banner persistente en el dashboard del manager hasta resolver.
- Países sin adapter (AR, BR, etc.): wizard registra `LegalEntity` sin cron automático. Manager debe setear `PropertyFxRate` manualmente en Settings. Banner explicativo en el wizard.

**Tiempo estimado:** 2-5 minutos per país (depende de obtener tokens si aplica — BCCR/Banxico son self-service 2 min).

---

### Etapa 4 — Properties

**Pregunta:** ¿cuáles son las propiedades físicas a operar?

**Por cada propiedad bajo una Legal Entity:**

- Nombre (ej. "Selina Tulum", "Hotel Monica Tulum")
- Tipo de propiedad (dropdown):
  - HOTEL — clásico
  - HOSTAL — dormitorios + privadas
  - VACATION_RENTAL — un listing completo
  - B&B — bed and breakfast
  - CABAÑAS — resort de cabañas independientes
  - APARTHOTEL — estadías largas
- Dirección física + ciudad + país
- Timezone IANA auto-seleccionado desde ciudad (ej. Tulum → `America/Cancun`)
- Currency display (puede diferir de LegalEntity.baseCurrency — ej. una property MX puede mostrar USD a turistas internacionales)
- Settings operativos:
  - `checkoutHour` (default 12:00)
  - `housekeepingEndHour` (default 20:00)
  - `noShowCutoffHour` (default 2 AM)
  - `potentialNoShowWarningHour` (default 20:00)
  - `morningRosterHour` (default 7 AM)
  - `stayoverFrequency` (default según PropertyType)
- Property code auto-asignado (`TUL`, `CAN`, `BOG`)

**Outputs:** 1+ `Property` rows con `legalEntityId` y `organizationId` denormalizado.

**Forcing functions pre-avance:**
- Timezone IANA válido (lista enumerada de date-fns-tz, ej. `America/Cancun`, `America/Bogota`).
- Currency code ISO 4217 válido (3 letras uppercase).
- Property code uppercase 3 chars unique within Organization.
- Si Channex se activará en Step 7: el consultor debe ingresar el `channexPropertyId` provisional (la property en Channex se crea manualmente en su dashboard en v1.0.0; v1.1+ automatiza via Channex API). **Health check:** wizard ejecuta `ChannexGateway.getProperty(channexPropertyId)` con el `user-api-key` del partner — debe retornar HTTP 200 + payload con `id` matching. Si falla, error claro: "El property ID Channex no existe o tu API key no tiene acceso. Verifica en channex.io/properties." Skip permitido (banner persistente) pero Step 7 bloqueará hasta resolver.
- AuditLog entry per Property creada con `domain=PROPERTY, action=wizard.step4.complete`.

**Tiempo estimado:** 3-5 minutos per property (+ 2-3 min si verificación Channex falla y requiere troubleshoot).

---

### Etapa 5 — Inventory (rooms/units per property)

**Pregunta:** ¿qué habitaciones y unidades tiene cada propiedad?

#### Por cada Property:

**Template selector** (opinionated defaults):

```
┌────────────────────────────────────────────────────────────────────┐
│ Selecciona el template más cercano:                                │
│                                                                     │
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ │
│ │  🏨 BOUTIQUE │ │  🛏️ HOSTAL  │ │ 🌴 CABAÑAS  │ │  💼 BUSINESS │ │
│ │  20-80 hab  │ │  Dorms+priv │ │  Indepen-   │ │  Standardiz-│ │
│ │             │ │             │ │   dientes   │ │  ado        │ │
│ │  6 RoomType │ │  6 RoomType │ │  5 RoomType │ │  5 RoomType │ │
│ │  defaults   │ │  defaults   │ │  defaults   │ │  defaults   │ │
│ └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘ │
│                                                                     │
│           ┌─────────────────────┐                                  │
│           │  ✏️ Crear custom    │                                  │
│           └─────────────────────┘                                  │
└────────────────────────────────────────────────────────────────────┘
```

#### Template HOSTAL (Selina-style)

| RoomType | Capacity | BaseRate USD | Category |
|----------|---------:|-------------:|----------|
| Dorm 8-bed mixed | 8 | $18/bed | SHARED |
| Dorm 6-bed female | 6 | $22/bed | SHARED |
| Dorm 4-bed mixed | 4 | $25/bed | SHARED |
| Private Standard | 2 | $55/room | PRIVATE |
| Private Double | 2 | $70/room | PRIVATE |
| Private Suite | 3 | $120/room | PRIVATE |

#### Template BOUTIQUE HOTEL

| RoomType | Capacity | BaseRate USD | Category |
|----------|---------:|-------------:|----------|
| Standard Queen | 2 | $90 | PRIVATE |
| Standard Twin | 2 | $90 | PRIVATE |
| Deluxe King | 2 | $130 | PRIVATE |
| Junior Suite | 3 | $180 | PRIVATE |
| Master Suite | 4 | $280 | PRIVATE |
| Penthouse | 6 | $520 | PRIVATE |

#### Template CABAÑAS RESORT (Tulum-style)

| RoomType | Capacity | BaseRate USD | Amenities flag |
|----------|---------:|-------------:|----------------|
| Cabaña Standard | 2 | $110 | outdoorShower |
| Cabaña Premium | 2 | $160 | jacuzzi |
| Cabaña Familiar | 4 | $210 | kitchenette |
| Casa Independiente | 6 | $380 | separateBldg |
| Penthouse Beachfront | 4 | $520 | oceanView |

#### Template BUSINESS HOTEL

| RoomType | Capacity | BaseRate USD |
|----------|---------:|-------------:|
| Single Standard | 1 | $80 |
| Double Standard | 2 | $100 |
| Twin Standard | 2 | $100 |
| Executive Floor | 2 | $150 |
| Executive Suite | 3 | $220 |

#### Tras seleccionar template

UI muestra los RoomTypes del template, editables:
- Cambiar nombre, capacity, baseRate, currency
- Eliminar tipos no aplicables
- Agregar tipos custom
- Por cada RoomType: agregar las habitaciones individuales (Room1..Room8)

#### Bulk import CSV

Para clientes con 50+ habitaciones existentes:

```csv
roomNumber,floor,roomType,baseRate,currency,notes
101,1,Standard Queen,90,USD,
102,1,Standard Queen,90,USD,oceanView=true
201,2,Junior Suite,180,USD,connectingRoom=202
...
```

CSV importer:
- Auto-detecta nuevos RoomTypes y los crea
- Validation pre-import: shows preview, errors highlighted
- Atomic: o se importa todo o nada (transaction)

**Outputs:** Rooms + RoomTypes creados. Para PropertyType=HOSTAL, también se crean `Unit` rows (1 unit per bed en SHARED, 1 unit per room en PRIVATE).

**Forcing functions pre-avance:**
- ≥1 RoomType creado per Property.
- ≥1 Room (con su Bed/Unit si aplica) creado per RoomType activo.
- **Channex room type mapping obligatorio si Property tiene `channexPropertyId`:** cada `Room.channexRoomTypeId` debe verificarse via `ChannexGateway.getRoomType(channexRoomTypeId)` retornando HTTP 200. UI muestra estado per-room (✅ mapeado / ⚠️ pendiente / ❌ inválido). Si algún room queda con ❌, banner persistente; Step 7 bloqueado hasta resolver. Skip permitido pero registrado en AuditLog con warning.
- Validation pre-importación CSV: row-level validation antes de transaction commit, preview muestra errores con línea + columna específica.
- AuditLog entry `domain=PROPERTY, action=wizard.step5.complete` con `changeDelta` = counts de RoomTypes + Rooms + Units creados.

**Tiempo estimado:** 5-15 minutos per property con template, 1 hora si custom CSV. +10 min troubleshoot promedio si Channex mappings fallan.

---

### Etapa 6 — Staff + Users

**Pregunta:** ¿quién va a usar Zenix y con qué permisos?

#### Staff (operacional — pertenece a una property)

Por cada Staff:
- Nombre + email + teléfono
- Property asignado
- Role: SUPERVISOR / RECEPTIONIST / HOUSEKEEPER / TECHNICIAN
- Department: HOUSEKEEPING / RECEPTION / MAINTENANCE / F&B
- Capabilities: CLEANING / SANITIZATION / MAINTENANCE / etc.
- Password temporal o invitación por email

#### Users (autorización cross-property)

Por cada User (si aplica — solo cadenas multi-property):
- Email
- Scope:
  - `BrandUserRole` — CEO, COO (acceso a todas las properties del brand)
  - `LegalEntityUserRole` — Country GM (acceso a properties de UNA country)
  - `UserPropertyRole` — staff property-bound

#### Bulk import CSV staff

```csv
email,name,role,department,propertyCode,capabilities
ana@selina.co,Ana García,SUPERVISOR,HOUSEKEEPING,TUL,CLEANING+SANITIZATION+MAINTENANCE
maria@selina.co,María Torres,HOUSEKEEPER,HOUSEKEEPING,TUL,CLEANING+SANITIZATION
...
```

#### Invitations

Wizard envía email con magic link a cada user/staff. Link expira 7 días. Customer puede reenviar.

**Outputs:** `Staff` + `User` + `UserPropertyRole`/`LegalEntityUserRole`/`BrandUserRole` rows.

**Forcing functions pre-avance:**
- ≥1 Staff con role=`SUPERVISOR` creado per Property (single-property: 1 supervisor total; multi-property: 1 per property o 1 LegalEntityUserRole multi-property válido).
- ≥1 Staff con role=`RECEPTIONIST` creado per Property.
- ≥1 Staff con role=`HOUSEKEEPER` creado per Property (puede ser el mismo human con multiple roles si el operador es solo, pero la entrada de role HOUSEKEEPER debe existir).
- Email formats valid + sin duplicados dentro de la Organization (un mismo email puede existir en orgs distintas).
- Si se importan via CSV, transaction atómica con rollback si cualquier row falla.
- Magic link invitations encolados en outbox (NO enviados todavía — se envían en Step 8 activation).
- AuditLog entry `domain=USER, action=wizard.step6.complete` con counts per role + invite list (emails masked).

**Tiempo estimado:** 5 minutos para single-property; 30-60 minutos para cadena con 50+ usuarios.

---

### Etapa 7 — Integrations

**Pregunta:** ¿qué integraciones se activan?

Por cada Property o LegalEntity (dependiendo del scope de la integración):

#### Channel Manager
- **Channex.io** (incluido en base PMS)
  - API token Channex
  - Mapping de RoomTypes Zenix → RoomTypeId Channex
  - OTAs activadas en Channex (Booking, Airbnb, Expedia, Despegar, etc.)
  - Test push inventario al sandbox

#### Payment processors
- **Stripe** (configuración per-property)
  - Stripe Connect account (cada property tiene su cuenta merchant)
  - Test charge $1 + refund
- **Conekta** (configuración per-property, solo MX)
  - Conekta API key
  - Test charge $1 + refund

#### Pre-arrival messaging
- **WhatsApp Business API** (Twilio o Meta Business)
  - Phone number registrado
  - Template messages aprobados por Meta
  - Test message a customer test number

#### Fiscal
- PAC ya configurado en etapa 3, verificación cross-check aquí

#### Add-ons activados (segun entitlements de etapa 1)
- AI Tarifaria heurística (v1.1.1+) — configuración de reglas
- Mensajería Airbnb / Expedia (v1.1.3+) — API tokens
- Booking Engine propio (v1.2.2+) — domain config + payment connect
- Marketplace integrations — apps específicas que el cliente quiere

**Outputs:** `PmsConfig`, `ChannelMapping`, integration credentials encryptados.

**Forcing functions pre-avance (4 health checks obligatorios PASS):**

1. **Channex push test** — `ChannexGateway.testPush(propertyId)` ejecuta push minimal a sandbox. Success requiere HTTP 200 + UUID confirmación. Fail → error específico con HTTP code + body. Si Channex no se activa para esta property (cliente no usa OTAs), el check se marca `skipped:true` en `WizardSession.healthChecks` con razón.
2. **Stripe test charge + refund** — `StripeAdapter.testCharge($1, refund=true)` en test mode. Success requiere `charge_id` + `refund_id` retornados. Si Stripe no se activa (solo cash/CFDI), skip permitido.
3. **PAC test stamp** — `WizardService.testPacEmission(legalEntityId)` re-ejecutado aquí como cross-check del Step 3 (puede haber expirado el token). Success requiere XML + UUID válido del PAC del país.
4. **SMTP test** — `MailerService.sendTestEmail(consultantEmail)` envía email a sí mismo. Success requiere SMTP 250 + delivered (en sandbox=accepted).

Adicionales (warning si fallan, no bloqueante):
- Channex webhook URL registered (`https://api.zenix.com/v1/webhooks/channex` o staging equivalente) — wizard verifica vía `ChannexGateway.getWebhookConfig`.
- WhatsApp Business API test message (opcional, depende del plan).
- Conekta test charge (opcional, solo MX si se activa).

Cada health check escribe a `WizardSession.healthChecks` JSON field para audit. Health check failures se registran en AuditLog con `domain=INTEGRATION, action={integration}.test, outcome=FAILURE`. Skip explícito requiere reason text del consultor.

**Tiempo estimado:** 30-90 minutos per property (depende de qué tan rápido el cliente provea credenciales).

---

### Etapa 8 — Activación + Handover

**Pregunta:** ¿está todo listo para producción?

#### Health checks automáticos

Antes de activar, wizard ejecuta una batería de tests:

| Check | Pasa | Falla |
|-------|------|-------|
| `Organization` válida con plan asignado | ✅ | ❌ |
| ≥1 `LegalEntity` con `active=true` y PAC verificado | ✅ | ❌ |
| ≥1 `Property` con ≥1 `RoomType` y ≥1 `Room` | ✅ | ❌ |
| ≥1 `Staff` con rol SUPERVISOR | ✅ | ❌ |
| Channex test push successful (si aplica) | ✅ | ⚠️ warning |
| Stripe test charge successful (si aplica) | ✅ | ⚠️ warning |
| Conekta test charge successful (si aplica) | ✅ | ⚠️ warning |
| Test booking creation (synthetic) | ✅ | ⚠️ warning |
| Test CFDI emission successful | ✅ | ⚠️ warning |
| Email invitations enviadas a todos los users | ✅ | ⚠️ warning |

Si **cualquier check fail**, no se activa. Si **algún warning**, wizard pregunta "Continuar o reparar?".

#### Activation Report PDF

Generación automática de PDF con:

- Customer info + Brand + LegalEntities + Properties
- Inventory summary (counts por RoomType)
- Staff + Users summary
- Integrations status (✅ / ⚠️ / ❌)
- Entitlements activados
- Plan + pricing
- Test booking sample
- Test CFDI sample
- "Próximos pasos" — instrucciones para el supervisor del cliente
- Soporte contact info

PDF se envía por email al customer + a ZaharDev + a partner (si aplica).

#### Demo de 30 min

Wizard agenda automáticamente una llamada de 30 min con el supervisor del cliente para:
1. Walkthrough del calendario PMS
2. Cómo crear primera reserva
3. Cómo procesar check-in 4-steps
4. Cómo cobrar y emitir CFDI
5. Cómo manejar housekeeping
6. Q&A

Calendly link auto-generado con disponibilidad del consultor.

#### Status PRODUCTION

`Organization.activatedAt = now()`. Customer queda en facturación recurrente. Onboarding completo.

**Outputs:** customer activo en producción.

**Forcing functions pre-avance (Step 8 = punto de no retorno):**

- TODOS los previous steps marked completed en `WizardSession.completedSteps`.
- TODOS los health checks de §3.8 PASS ✅ o tienen explicit skip + reason text del consultor (auditeable).
- Activation Report PDF generado vía Puppeteer pool (ver [ADR-0001](../architecture/ADR-0001-pdf-rendering.md)) + stored en R2/S3 + link incluido en email handover.
- Magic links de invitations (encolados en Step 6) **enviados ahora** — antes de Step 8 NO se enviaron. Cliente recibe email "Tu cuenta está lista" con magic link 7-day expiry.
- `Organization.activatedAt = now()` + `WizardSession.completedAt = now()`.
- `PartnerClientAssignment.status` transition `ONBOARDING → ACTIVE`, `startedAt` ya estaba poblado.
- AuditLog entry **definitiva** con `action=wizard.activate, domain=WIZARD, retentionPolicy=PERMANENT` — captura snapshot completo (org, brand, legal entities, properties, integrations status, health checks outcomes, todos los IDs).
- Solo `PLATFORM_ADMIN` o `LEAD_CONSULTANT` con `scope=FULL` pueden ejecutar este Step. PARTNER_ADMIN puede si `canActivateWizard=true` (default true para ese role).

**Política no-negociable cliente:** durante Steps 1-7 el cliente NO tiene credenciales activas. Los users fueron `invited` pero el magic link NO funciona hasta el Step 8 activate. Razón: prevenir que el cliente entre a `app.zenix.com` mientras el partner aún configura Channex/PAC/Staff, vea calendar vacío, intente crear reserva manualmente, y reporte NPS bajo desde día 1. Patrón verificado en SAP Activate ("Realize → Deploy → Run" — Deploy es el momento en que el customer recibe credenciales, no antes) y Salesforce Setup Assistant ("Provision → Configure → Go Live").

**Tiempo estimado:** 15 minutos (health checks + PDF + scheduling).

---

## 3.bis Audit log transparency — el cliente puede auditar su propio onboarding

> Decisión Nova: cada step del wizard genera entries en `AuditLog` con `domain=WIZARD`. Cuando el cliente gana credenciales en Step 8 y abre `app.zenix.com`, su perfil tiene un panel "Historial de configuración" que muestra cronología completa:

```
🟢 2026-05-24 09:14 — Step 1 completed: Organization created
   por: María González (LEAD_CONSULTANT — TulumTech Consulting)
   reason: "Configuración inicial Hotel Monica Tulum"

🟢 2026-05-24 09:32 — Step 3 completed: LegalEntity created + PAC test passed
   por: María González (LEAD_CONSULTANT — TulumTech Consulting)
   detail: RFC HMT840923ABC, Facturama sandbox UUID a1b2c3...

⚠️ 2026-05-24 10:15 — Step 7 partial: Channex push test ✅, Stripe ⚠️ skipped
   por: Carlos Ramírez (SOLUTION_CONSULTANT — TulumTech Consulting)
   reason: "Cliente activará Stripe en semana 2 post go-live"

🟢 2026-05-24 11:00 — Step 8 activated: Production live
   por: María González (LEAD_CONSULTANT — TulumTech Consulting)
   activation report: [PDF link]
```

**Por qué importa:** transparencia construye confianza (SAP "Trust Center" pattern + Salesforce "Setup Audit Trail"). El cliente ve quién configuró qué, cuándo, y por qué. Si más tarde algo está mal configurado, el audit log permite diagnóstico sin dependencia del consultor original.

**Permisos de lectura:**
- `ORG_OWNER` ve todo el AuditLog `domain=WIZARD` de su Organization.
- `ORG_STAFF` no ve (no es relevant para operación day-to-day, cluttering).
- `PLATFORM_ADMIN` ve todo cross-tenant.
- `PARTNER_ADMIN` y `PARTNER_MEMBER` ven solo de clientes asignados.

Retention: `SEVEN_YEARS` default; Step 8 activation entry es `PERMANENT`.

---

## 4. Estado persistente y reanudación

Cada etapa guarda en BD (`WizardSession` row) el progreso. Customer/consultor puede:
- Cerrar el wizard a medio camino, reabrir desde donde se quedó
- Compartir el link del wizard entre múltiples colaboradores (DevOps del cliente provee PAC mientras el GM da info de properties)
- Auditar quién hizo qué cambios y cuándo

```prisma
model WizardSession {
  id              String   @id @default(uuid())
  organizationId  String   @unique
  currentStep     Int      // 1-8
  completedSteps  Int[]
  data            Json     // state persistente
  startedAt       DateTime @default(now())
  completedAt     DateTime?
  activatedBy     String?  // user que pulsó "Activar"
  consultantId    String   // quien lleva el onboarding
}
```

---

## 5. Implementación técnica

> **Cambio Nova v1.0.0:** la app `apps/consultant` se renombra conceptualmente a "módulo wizard dentro de Nova". En v1.0.0 vive como `apps/web/src/pages/nova/wizard/*`. En v1.0.5 se extrae junto al resto de Nova bajo `apps/partner` (naming definitivo en sprint extraction).

### Estructura de la app (v1.0.0 — dentro de apps/web/nova/)

```
apps/web/src/pages/nova/wizard/         # v1.0.0
└── (estructura idéntica a la documentada abajo — solo cambia el root path)

apps/consultant/ → apps/partner/wizard/  # v1.0.5 extracción
├── src/
│   ├── wizard/
│   │   ├── steps/
│   │   │   ├── Step1_Customer.tsx
│   │   │   ├── Step2_Brand.tsx
│   │   │   ├── Step3_LegalEntity.tsx
│   │   │   ├── Step4_Properties.tsx
│   │   │   ├── Step5_Inventory.tsx
│   │   │   ├── Step6_Staff.tsx
│   │   │   ├── Step7_Integrations.tsx
│   │   │   └── Step8_Activate.tsx
│   │   ├── components/
│   │   │   ├── WizardLayout.tsx       — sidebar + step indicator
│   │   │   ├── StepNavigator.tsx      — Anterior / Siguiente / Saltar
│   │   │   └── HealthCheckStatus.tsx
│   │   ├── hooks/
│   │   │   ├── useWizardSession.ts
│   │   │   └── useStepValidation.ts
│   │   └── templates/
│   │       ├── propertyTemplates.ts   — HOSTAL/BOUTIQUE/CABAÑAS/BUSINESS
│   │       ├── fiscalRegimes.ts       — 10 países LATAM
│   │       └── staffTemplates.ts
│   ├── activation-report/
│   │   └── PDFGenerator.tsx           — react-pdf
│   └── health-checks/
│       ├── channex.ts
│       ├── stripe.ts
│       ├── pac.ts
│       └── ...
```

### Endpoints backend nuevos (v1.0.5)

```
POST   /v1/wizard/sessions              — start a new wizard
GET    /v1/wizard/sessions/:id          — resume
PATCH  /v1/wizard/sessions/:id          — save step data
POST   /v1/wizard/sessions/:id/activate — final activation + health checks
POST   /v1/wizard/health-check          — run all checks
POST   /v1/wizard/test/stripe-charge    — test charge in sandbox
POST   /v1/wizard/test/conekta-charge   — test charge in sandbox
POST   /v1/wizard/test/channex-push     — test inventory push
POST   /v1/wizard/test/pac-emission     — test CFDI emission
GET    /v1/wizard/templates/:type       — property templates (HOSTAL/BOUTIQUE/...)
POST   /v1/wizard/import/rooms-csv      — bulk import rooms
POST   /v1/wizard/import/staff-csv      — bulk import staff
```

### Authorization (Nova-aligned)

```typescript
@UseGuards(NovaAccessGuard, WizardActivateGuard, PartnerScopeGuard)
@Controller('v1/wizard')
export class WizardController { ... }

// NovaAccessGuard       — SystemRole IN (PLATFORM_ADMIN, PARTNER_ADMIN, PARTNER_MEMBER)
// WizardActivateGuard   — verifica PartnerMember.canActivateWizard per Step:
//                          - Step 8 (activate): solo PARTNER_ADMIN, LEAD_CONSULTANT con canActivateWizard=true, PLATFORM_ADMIN
//                          - Step 7 (integrations): + SOLUTION_CONSULTANT + SUPPORT_L3
//                          - Step 3 (legal entity): + SUPPORT_L3
//                          - Steps 4-5 (properties, inventory): + SOLUTION_CONSULTANT + SUPPORT_L2
//                          - Steps 1-2 (customer, brand): solo PARTNER_ADMIN + LEAD_CONSULTANT + SOLUTION_CONSULTANT
// PartnerScopeGuard     — verifica PartnerMemberAssignment(orgId, scope IN (FULL, TIER_A_ONLY))
//                          o Partner.isInternal=true (PLATFORM_ADMIN bypass)
// 2FA enforcement       — middleware verifica session.is2FAVerified=true para LEAD/SUPPORT_L2-L3/PARTNER_ADMIN/PLATFORM_ADMIN
//
// Para single-customer setup, el customer self-service será v1.3+ — NOT habilitado en v1.0.0.
```

---

## 6. Templates y opinionated defaults — el secreto del 10x velocidad

El wizard es rápido porque **cada decisión tiene un default razonable**. El consultor solo cambia lo que es realmente custom.

### Defaults por país

```typescript
const COUNTRY_DEFAULTS = {
  MX: {
    currency: 'MXN',
    fiscalRegime: 'MX_CFDI4',
    pacProvider: 'facturama',
    taxes: [
      { code: 'IVA', rate: 16, displayName: 'IVA' },
      { code: 'ISH', rate: 3, displayName: 'Impuesto sobre Hospedaje', states: ['QR', 'YUC', 'NL'] },
    ],
  },
  CO: {
    currency: 'COP',
    fiscalRegime: 'CO_DIAN',
    pacProvider: 'olimpia',
    taxes: [
      { code: 'IVA', rate: 19, displayName: 'IVA' },
      { code: 'INC', rate: 8, displayName: 'Impuesto al Consumo' },
    ],
  },
  CR: { /* ... */ },
  // ... etc.
}
```

### Defaults por PropertyType

```typescript
const PROPERTY_TYPE_DEFAULTS = {
  HOSTAL: {
    stayoverFrequency: 'NEVER',
    housekeepingEndHour: 22,
    checkoutHour: 11,
    morningRosterHour: 6,
  },
  HOTEL: {
    stayoverFrequency: 'DAILY',
    housekeepingEndHour: 20,
    checkoutHour: 12,
    morningRosterHour: 7,
  },
  // ...
}
```

### Defaults por templates de inventory

Los 4 templates principales (HOSTAL/BOUTIQUE/CABAÑAS/BUSINESS) ya descritos en etapa 5.

---

## 7. SLA del onboarding

| Tier customer | Duration target | Costo onboarding |
|---------------|-----------------|------------------|
| STARTER 1-prop | 2-4 hrs | Incluido en plan |
| PRO 2-10 props | 1-2 días | Incluido en plan |
| ENTERPRISE 10+ | 1-2 semanas | Incluido O fee separado $5k-$15k |
| CADENA multi-país | 2-4 semanas | Fee separado $15k-$50k según complejidad |

---

## 8. KPIs del wizard

Para v1.2+ con Partner Network, medimos:

- **Time to first booking** — desde activación a primera reserva real (target: <48h)
- **Setup completion rate** — % de wizards iniciados que se activan (target: >85%)
- **Health check pass rate** — % de checks que pasan al primer intento (target: >90%)
- **Customer satisfaction post-onboarding** — NPS 30 días post-activación (target: >40)
- **Partner certification quality** — promedio de health checks que pasan first-try por partner

---

## 9. Comparación con SAP / Salesforce / Workday

| Plataforma | Setup tiempo típico | Tooling | Costo onboarding |
|------------|---------------------|---------|-------------------|
| **SAP S/4HANA Cloud Activate** | 6-12 semanas | SAP Activate methodology + accelerators | $50k-$500k |
| **Salesforce Setup Assistant** | 2-8 semanas | Trailhead + Setup Assistant + partner | $20k-$200k |
| **Workday Adaptive Insights** | 4-8 semanas | Workday Adaptive Implementation | $30k-$150k |
| **Mews Onboarding** | 2-4 semanas | Mews University + dedicated CSM | $0-$5k |
| **Cloudbeds Onboarding** | 3-7 días | Self-service + chat support | $0 |
| **Zenix Activate** (target v1.0.5) | **30 min - 2 semanas** | Wizard 8 etapas + consultor | $0-$50k según complejidad |

---

## 10. Bitácora

- **2026-05-23** — Nova-aligned refactor tras sprint Zenix Nova. Cambios clave: (1) título y header indican que el wizard vive **dentro de Nova** (`nova.zenix.com/wizard`), no es app independiente. (2) Renombrado conceptual: `apps/consultant` queda como v1.0.0 path interno (`apps/web/src/pages/nova/wizard/*`) y v1.0.5 extracción a `apps/partner/wizard/*`. (3) §2.1 quién ejecuta — tabla actualizada con tiers Nova (PLATFORM_ADMIN / PARTNER_ADMIN / LEAD_CONSULTANT / SOLUTION_CONSULTANT / SUPPORT_L1-L3 / SALES_REP / TRAINEE) y forcing function role-per-Step. Cliente self-service v1.3+ explícitamente NOT-habilitado en v1.0.0. (4) §2.2 surface técnica con guard chain (NovaAccessGuard + WizardActivateGuard + PartnerScopeGuard) y 2FA enforcement por role. (5) Cada Step (1-8) refinado con sección "Forcing functions pre-avance" específica: Step 1 valida DNS MX + slug + plan tier; Step 3 PAC sandbox emission obligatorio + `FiscalRegime.active` check; Step 4 Channex `getProperty(channexPropertyId)` ping HTTP 200; Step 5 Channex `getRoomType()` mapping verification per Room; Step 6 ≥1 SUPERVISOR + ≥1 RECEPTIONIST + ≥1 HOUSEKEEPER por property obligatorio; Step 7 los 4 health checks (Channex push + Stripe charge+refund + PAC stamp + SMTP) explícitos como PASS/skip-with-reason; Step 8 invitations enviadas SOLO ahora + PartnerClientAssignment status transition + AuditLog retentionPolicy=PERMANENT. (6) Nueva §3.bis Audit log transparency — cliente puede ver cronología completa de su onboarding en `app.zenix.com` con permisos de lectura controlados (ORG_OWNER ve todo el WIZARD domain de su org). (7) §5 estructura técnica actualizada para reflejar el path Nova-internal v1.0.0 → Nova-extracted v1.0.5. (8) Authorization guards renombrados: `WizardConsultantGuard → NovaAccessGuard + WizardActivateGuard + PartnerScopeGuard`. Schema canónico vinculante referenciado en [docs/architecture/NOVA-architecture.md §6](../architecture/NOVA-architecture.md#6-wizard-zenix-activate-integration).
- **2026-05-15** — Documento creado. Plan de 8 etapas aprobado por Abraham. Inspirado en SAP Activate + Salesforce Setup Assistant + Workday Adaptive. Target velocity 10x más rápido que SAP/Workday para boutique/chain LATAM. Implementación en `apps/consultant` planeada para v1.0.5.
