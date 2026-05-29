---
Audiencia: Owner + dev del sprint
Tipo: Reporte de avance per-day
Sprint: CHANNEX-AUTO-PROVISION
Branch: feature/netflix-trial-flow
PR abierto: #47 (incluye Netflix Days 1-2 + AUTO-PROVISION Days 1-N)
Plan padre: docs/sprints/CHANNEX-AUTO-PROVISION-plan.md
Última actualización: 2026-05-28
---

# Sprint CHANNEX-AUTO-PROVISION — Reporte de avance

> Documento vivo. Se actualiza al cierre de cada día-dev para que el contexto
> sobreviva session-clean y para que el owner pueda saltar a cualquier punto
> del sprint sin re-leer commits.

## Estado global

| Day | Status | Commits | Tests pass | Notas |
|---|---|---|---|---|
| 1 — Gateway CRUD methods | ✅ | `34a87da` | 20 nuevos | 9 métodos nuevos + types |
| 2 — Schema + ProvisionService + crypto | ✅ | `f2ec4ec` | 11 nuevos | AES-256-GCM + Modelo D Fase 1 |
| 3 — Wizard Step 5.5 UI | ✅ | `e3fe82b` | 0 nuevos (wiring) | Step 6 nuevo, total 10 steps |
| 4 — Step 8 preview + post-activate UI | ✅ | (pendiente commit) | 0 nuevos (UI) | Channex preview + outcome handling |
| 5 — Retry endpoint + UI recovery | ⏸ | — | — | — |
| 6 — Integration sandbox test | ⏸ | — | — | — |
| 7 — Docs + CLAUDE.md §189-§194 | ⏸ | — | — | — |

**Total commits del sprint hasta ahora**: 3 (+ 2 Netflix antes = 5 en branch).
**Backend tests**: 88/88 verde en suites relacionadas (wizard + provision + crud).
**Frontend typecheck**: verde.

---

## Day 1 — Gateway CRUD methods (cerrado)

**Goal**: agregar al `ChannexGateway` los 9 métodos REST nuevos que el
`ChannexProvisionService` necesita para empujar el wizard a Channex.

### Entregables

**Archivos tocados:**
- `apps/api/src/integrations/channex/channex.gateway.ts` (+~350 LOC)
- `apps/api/src/integrations/channex/channex-crud.gateway.spec.ts` (+~260 LOC tests)

**Nuevos métodos (todos alineados con endpoints oficiales `docs.channex.io`):**

| Método | Endpoint | Notas |
|---|---|---|
| `createProperty(input)` | `POST /api/v1/properties` | acepta `groupId` opcional para multi-tenant Fase 1 |
| `updateProperty(id, input)` | `PUT /api/v1/properties/:id` | partial update |
| `getProperty(id)` | `GET /api/v1/properties/:id` | idempotency check |
| `createGroup({ title })` | `POST /api/v1/groups` | aislamiento sub-tenancy |
| `assignPropertyToGroup(propId, groupId)` | wraps `updateProperty` | semántica clara |
| `createChannel(input)` | `POST /api/v1/channels` | 7 OTA types soportados |
| `updateChannel(id, input)` | `PUT /api/v1/channels/:id` | activate/deactivate/settings |
| `deleteChannel(id)` | `DELETE /api/v1/channels/:id` | destructivo |
| `upsertChannelRoomType(mapping)` | `POST /api/v1/channel_room_types` | Zenix RoomType ↔ OTA external_id |
| `upsertChannelRatePlan(mapping)` | `POST /api/v1/channel_rate_plans` | Zenix RatePlan ↔ OTA external_id |

**Nuevos types exportados:**
- `ChannexProperty` + `ChannexPropertyCreateInput` + `ChannexPropertyUpdateInput`
- `ChannexGroup`
- `ChannexChannelType` union: `BookingCom | ExpediaCom | AirbnbCom | AgodaCom | GoogleHotelAds | VRBOCom | OpenChannel`
- `ChannexChannelCreateInput` + `ChannexChannelUpdateInput`
- `ChannexChannelRoomTypeMapping` + `ChannexChannelRatePlanMapping`

**Pattern consistente con `createRoomType`** existente:
- `fetch` con `user-api-key` header
- Body wrapped en `{ resource_name: {...} }`
- Response unwrap desde `{ data: { id, attributes } }`
- `ChannexHttpError` on non-2xx
- `requireEnabled()` guard si no hay API key

### Tests
**20 nuevos** en `channex-crud.gateway.spec.ts`:
- Happy paths con `jest.spyOn(global, 'fetch')` mock
- 422 validation errors + 404 + 503 (sin API key)

### Decisiones impactadas
- D-CHX-AP-3 (Modelo D adaptado) — `createProperty` acepta `groupId` para enforcing automático
- Anti-patterns Channex evitados estructuralmente:
  - ❌ Per-date calls (bulk APIs siempre)
  - ❌ Hardcoded UUIDs (todo viene del response)

---

## Day 2 — Schema migrations + ChannexProvisionService + AES-256-GCM (cerrado)

**Goal**: persistir el estado del provisioning + crear el servicio que orquesta
el push wizard → Channex.

### Entregables

**Archivos creados:**
- `apps/api/prisma/migrations/20260604000000_channex_auto_provision/migration.sql`
- `apps/api/src/nova/wizard/channel-credentials-crypto.service.ts` (AES-256-GCM)
- `apps/api/src/nova/wizard/channex-provision.service.ts` (~340 LOC)
- `apps/api/src/nova/wizard/channex-provision.service.spec.ts` (~270 LOC)

**Archivos modificados:**
- `apps/api/prisma/schema.prisma` (Organization + LegalEntity + PropertySettings + new Channel model)
- `apps/api/src/nova/wizard/wizard.module.ts` (registra servicios nuevos)

### Schema migration

Nuevas columnas:
- `organizations.channex_group_id` — Multi-tenant Fase 1, Group ID Channex
- `legal_entities.channex_api_key` — Migration path Fase 2/3 (nullable)
- `property_settings.channex_provisioning_{status,error,last_provisioned_at}`

Nueva tabla `channels`:
- `id`, `property_id` (FK), `channex_channel_id` (UNIQUE)
- `type`, `title`, `status` (default `inactive`)
- `settings_encrypted` (AES-256-GCM ciphertext)
- `last_synced_at` + timestamps
- Indices: `(property_id)`, `(status)`

### ChannelCredentialsCryptoService

- AES-256-GCM, KEK 32 bytes en `.env CHANNEX_CREDENTIALS_KEK` (`openssl rand -base64 32`)
- IV único per encrypt (12 bytes) + auth tag GCM (16 bytes)
- Format blob: `[12 IV][16 tag][N ciphertext]` base64
- `isReady()` guard cuando KEK no configurada
- `describeCredentials()` audit-safe helper (solo `keys=[...]`, no values)
- **NUNCA logea plain text**

### ChannexProvisionService

```typescript
provisionFromWizard({ organizationId, propertyIds, channels, actor }): Promise<ProvisionResult>
retryProperty(propertyId, channels): Promise<ProvisionResult>  // idempotent endpoint
```

**Flow per Property:**
1. Ensure `Group` exists per Organization (idempotent vía `Organization.channexGroupId`)
2. `createProperty` con `group_id` (skip si `PropertySettings.channexPropertyId` ya set; assignPropertyToGroup si pre-existente)
3. Bulk `createRoomType` per Room (idempotent skip si `Room.channexRoomTypeId`)
4. Bulk `createRatePlan` per Room+RoomType (BAR placeholder $100 USD — RATES sprint sustituye)
5. Per channel: encrypt credentials → `createChannel` con `is_active=false` siempre
   - Airbnb siempre `status='requires_oauth'` (regla regulatoria 2022)
   - `configureLater=true` → `status='pending_credentials'`
6. Mark `PropertySettings.channex_provisioning_status = completed | partial | failed`

**Best-effort**: errors NO rolla back Organization. Capturados en `ProvisionResult.errors[]` + persistidos en `PropertySettings.channexProvisioningError`.

### Tests

**11 nuevos** en `channex-provision.service.spec.ts`:
- Happy path completo (Group + Property + 2 RoomTypes + 2 RatePlans + 1 Channel)
- Org con `channexGroupId` existente — skip createGroup
- Property con `channexPropertyId` existente — skip createProperty + assignToGroup
- Room con `channexRoomTypeId` — idempotent skip
- `createProperty` falla → status=failed, abort early
- `createRoomType` falla en uno → property `partial`, org `failed` (single)
- Multi-property: 1 OK + 1 falla → status=`partial` global
- Org no encontrada → status=failed
- Airbnb siempre `requires_oauth`
- `configureLater=true` → `pending_credentials`, no encrypt
- KEK no configurada + credentials → error capturado, channel `pending_credentials`

### Decisiones impactadas
- D-CHX-AP-1 (best-effort outside-tx) — ✅ implementado
- D-CHX-AP-2 (idempotency natural) — ✅ via mappings BD pre-POST
- D-CHX-AP-3 (Modelo D adaptado) — ✅ Group ensure + assign
- D-CHX-AP-4 (AES-256-GCM encryption) — ✅ KEK en .env
- D-CHX-AP-5 (Channels `is_active: false` default) — ✅
- D-CHX-AP-6 (Airbnb siempre `requires_oauth`) — ✅

---

## Day 3 — Wizard Step 5.5 channels UI + WizardActivationService wiring (cerrado)

**Goal**: dar al consultor la UI para seleccionar OTAs durante el wizard y
capturar credentials per-channel. Conectar al backend para que `provisionFromWizard`
se invoque outside-tx al activar.

### Entregables

**Archivos creados:**
- `apps/web/src/nova/components/wizard/StepChannels.tsx` (~450 LOC)

**Archivos modificados:**
- `apps/api/src/nova/wizard/dto/wizard-dto.ts` — agrega `WizardChannelDto` + `channels?` + `channexPushEnabled?` + `channexProvisioning` response
- `apps/api/src/nova/wizard/wizard-activation.service.ts` — inyecta `ChannexProvisionService`, llama `provisionFromWizard` outside-tx, agrega `channexProvisioning` al return
- `apps/api/src/nova/wizard/wizard-activation.service.spec.ts` — `makeChannexProvisionMock` + 22 instantiations actualizadas
- `apps/web/src/store/wizard.ts` — agrega `WizardChannelType` + `WizardChannelState` + state fields + actions, WIZARD_STEPS pasa de 9 → 10 steps
- `apps/web/src/nova/pages/NovaWizardPage.tsx` — case `'channels'` → render StepChannels
- `apps/web/src/nova/api/wizard-client.ts` — serializa channels al POST

### Wizard nuevo step layout

| # | Step | Estado |
|---|---|---|
| 1 | Customer Account | unchanged |
| 2 | Brand | unchanged |
| 3 | Legal Entity | unchanged |
| 4 | Properties | unchanged |
| 5 | Inventory | unchanged |
| **6** | **Canales OTA** | **NUEVO (Day 3)** |
| 7 | Staff | renumerado de 6 |
| 8 | Integrations | renumerado de 7 |
| 9 | Plan y cobro | renumerado de 8 |
| 10 | Activación | renumerado de 9 |

### StepChannels.tsx UI

- **Master toggle** `channexPushEnabled` — off = backend skip Channex completo
- **2 grupos visuales**: "Populares LATAM" (Booking, Airbnb, Expedia) + "Otros" (Agoda, VRBO, Google Hotel Ads, Open Channel)
- **`ChannelCard`** chip-style con icon Lucide + auth hint + status badge (Listo / Pendiente / OAuth post-trial)
- **`ChannelCredentialsDialog`** modal per-channel:
  - Booking/Expedia/Agoda: hotel_id + username + password (con show/hide secrets toggle)
  - Airbnb: listing_id opcional + banner amber "OAuth post-trial — regla regulatoria 2022"
  - Google Hotel Ads: partner_id + booking_link_template
  - Open Channel: sin credentials (sandbox)
- **"Configurar después"** checkbox → status `pending_credentials`, sin enviar credentials
- **Privacy note**: "credenciales cifradas AES-256-GCM, nunca en logs"

### WizardActivationService wiring

```typescript
// Outside-tx best-effort post Stripe pending sub
if (channexEnabled && created.propertyIds.length > 0) {
  channexProvisioning = await this.channexProvision.provisionFromWizard({
    organizationId: created.organizationId,
    propertyIds: created.propertyIds,
    channels: dto.channels?.map(...) ?? [],
    actor,
  })
}
```

`WizardActivateResponse.channexProvisioning` ahora retorna:
```ts
{
  status: 'completed' | 'partial' | 'failed',
  propertiesProvisioned: number,
  roomTypesCreated: number,
  ratePlansCreated: number,
  channelsCreated: number,
  channelsRequiringOauth: number,
  channelsPendingCredentials: number,
  errors: Array<{ step, propertyId?, message }>
}
```

### Tests

- No nuevos tests escritos en Day 3 (wiring + UI puramente)
- **88/88 tests verde** en suites relacionadas (wizard-activation + channex-provision + channex-crud)
- Mock `makeChannexProvisionMock()` agregado + propagado a las 22 instantiations directas

### Decisiones impactadas
- Sin nuevas decisiones — Day 3 es wiring que ejecuta las decisiones D-CHX-AP-1..6 ya tomadas en Days 1-2

### Deferidos a Day 4
- Frontend handling del `WizardActivateResponse.channexProvisioning` (toast + modal warning si `status=partial|failed`)
- Step 8 (Activación) preview pre-submit: "5 RoomTypes serán creados, 3 channels seleccionados"

---

## Day 4 — Step 8 preview + post-activate response UI (cerrado)

**Goal**: cerrar el loop visual del wizard. El consultor (a) ve preview de
lo que va a empujar a Channex antes del submit, (b) recibe feedback claro
del outcome (completed/partial/failed) post-activate.

### Entregables

**Archivos modificados:**
- `apps/web/src/nova/components/wizard/StepActivation.tsx` (+~150 LOC):
  - Nueva `SummarySection` icon=Globe2 title="Canales OTA (Channex)" con preview:
    - Si `channexPushEnabled=false` → caption explicativo
    - Si enabled: listing de N properties + RoomTypes + RatePlans + chips per channel
      (icon Lock para Airbnb OAuth post-trial, Settings warning si configureLater, CheckCircle2 si listo)
  - CTA primaryAction adaptativo: "Activar X + Channex" si hay canales, "Activar X" si no
  - Toast post-activate adaptativo: éxito verde / warning amber con CTA `partial` / error rojo con CTA `failed`
  - Bloque resultado en success state con grid de métricas (properties OK, room types, rate plans, channels, OAuth req, pending creds)
  - `<details>` colapsable con lista de errors (step + message en code-style)
  - CTA link a `/nova/billing/channex` cuando `status != completed`

- `apps/web/src/nova/api/wizard-client.ts` (+15 LOC):
  - `WizardActivateResponse.channexProvisioning` typed agregado al interface frontend

### Tests
- Frontend typecheck verde
- No nuevos unit tests (pure UI binding)
- Recomendable smoke test E2E manual: activar cliente con 0 channels → toast verde sin Channex section. Activar con 2 channels → toast con counts. Forzar fallo (KEK no configurada) → toast warning + CTA /nova/billing/channex.

### Decisiones impactadas
- Sin nuevas decisiones — Day 4 cumple el contrato del `channexProvisioning` que ya estaba en el DTO desde Day 3.

### Deferidos a Day 5
- Endpoint `POST /v1/nova/properties/:id/channex/provision` (idempotent retry)
- Página/section en `/nova/billing/channex` para mostrar Properties con `channexProvisioningStatus = 'failed' | 'partial'` con botón "Reintentar provision"
- Botón "Completar credenciales" para channels con `status = 'pending_credentials'`

---

## Días siguientes (resumen del plan padre)

- **Day 5** — Retry endpoint `POST /v1/nova/properties/:id/channex/provision` (idempotent) + UI en `/nova/billing/channex` para failed/partial recovery
- **Day 6** — Integration test contra `staging.channex.io` (opt-in con `CHANNEX_INTEGRATION_TESTS=1`)
- **Day 7** — Docs + CLAUDE.md §189-§194 D-CHX-AP-1..6 numeradas + `docs/architecture/channex-provisioning-flow.md`

---

## Pendientes administrativos para owner

- ⚠️ Generar KEK: `openssl rand -base64 32` y setear en `.env CHANNEX_CREDENTIALS_KEK` ANTES de activar primer cliente real con OTAs.
- ⚠️ Confirmar Channex sandbox property test sigue activo (`ef0bdedf-e7fb-43fd-8664-a4dfb6bcec13`) para Day 6 integration tests.
- ⚠️ Decidir si la KEK rota cada 90d o se mantiene estable (re-encrypt all `Channel.settingsEncrypted` rows requiere migration tool en v1.0.1+).
