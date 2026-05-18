# 13 · Zenix Activate — Consultant Setup Wizard

> Flujo guiado para que un consultor (ZaharDev internal o partner certificado v1.2+) onboardee un nuevo cliente Zenix en 30 min - 1 semana, dependiendo de complejidad.
>
> **Inspirado en:** SAP Activate methodology + Salesforce Setup Assistant + Workday Adaptive Implementation. **Objetivo:** experiencia 10x más simple que los grandes, manteniendo el rigor enterprise.
>
> **Status:** Diseño aprobado 2026-05-15. Implementación en v1.0.5+ como nueva app `apps/consultant`.

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

### Niveles de acceso

| Tier | Quién | Customers que pueden onboarder |
|------|-------|--------------------------------|
| **Internal Consultant** | Staff ZaharDev | Cualquier customer |
| **Certified Partner Gold/Platinum** (v1.2+) | Partner con certificación máxima | Customers de su pipeline |
| **Certified Partner Silver/Bronze** (v1.2+) | Partner con certificación media | Solo single-property, plan STARTER |
| **Customer Self-Service** (v1.3+) | El propio cliente | Trial sign-up + trial-to-paid conversion |

### App separada `apps/consultant`

Tech stack idéntico al `apps/web` (React + Vite + Tailwind + Radix UI) para reusar componentes. Acceso requiere:
- `SystemRole = OWNER` (ZaharDev internal)
- O `User.isImplementationPartner = true` (partners certificados)
- 2FA obligatorio
- Audit log de toda acción del wizard

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

**Outputs:** se crea `Organization` con los entitlements aplicados.

**Validaciones:**
- Email validado con magic link enviado al final
- Slug único globalmente
- Plan ≥ ENTERPRISE para clientes con >5 properties anticipadas

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

**Outputs:** se crea 1+ `LegalEntity` rows. Cada una con `fiscalRegimeId`, `pacCredentials` encriptado, `active = true` solo si el test pasó.

**Validaciones críticas:**
- No avanzar a etapa 4 si NINGUNA LegalEntity pasó test
- Test repetible (botón "Reintentar test")
- Si el PAC es nuevo o no responde, opción "Skip test — finalizar más tarde" pero deja la LegalEntity en estado `active = false`

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

**Validaciones:**
- Timezone IANA válido (lista enumerada de date-fns-tz)
- Currency code ISO 4217 válido

**Tiempo estimado:** 3-5 minutos per property.

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

**Tiempo estimado:** 5-15 minutos per property con template, 1 hora si custom CSV.

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

**Validaciones:**
- Cada integración tiene test de smoke (test charge, test push, test message)
- Wizard NO permite finalizar si una integración crítica falla; permite SKIP con warning

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

**Tiempo estimado:** 15 minutos (health checks + PDF + scheduling).

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

### Estructura de la app

```
apps/consultant/
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

### Authorization

```typescript
@UseGuards(WizardConsultantGuard)
@Controller('v1/wizard')
export class WizardController { ... }

// El guard verifica que el actor sea OWNER de ZaharDev o partner certificado activo.
// Para single-customer setup, el customer self-service será v1.3+.
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

- **2026-05-15** — Documento creado. Plan de 8 etapas aprobado por Abraham. Inspirado en SAP Activate + Salesforce Setup Assistant + Workday Adaptive. Target velocity 10x más rápido que SAP/Workday para boutique/chain LATAM. Implementación en `apps/consultant` planeada para v1.0.5.
