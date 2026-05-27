---
Audiencia: Owner + dev del próximo sprint
Tipo: Plan técnico — provisionamiento Channex desde wizard
Status: Propuesta v2 (alineada con cert Stage 4)
Branch propuesta: feature/channex-auto-provision
Estimación: 8-11 días-dev (1 dev secuencial)
Padre comercial: docs/sprints/NOVA-CHANNEX-COMMAND-CENTER-plan.md
Padre cert: docs/sprints/CHANNEX-CERT-SURGICAL-PLAN.md
Última actualización: 2026-05-27
---

# Sprint CHANNEX-AUTO-PROVISION — Plan técnico v2

> **Misión**: dejar al cliente activado por el wizard con **toda la presencia
> Channex creada y mapeada en BD Zenix**, listo para que CHANNEX-OUTBOUND-CERT
> empuje ARI desde Day 1. Cero acción manual del consultor post-activación
> excepto el OAuth handshake de Airbnb (regla regulatoria, no técnica).
>
> **Resultado esperado**: cuando el cliente entra a Zenix post-trial activación,
> ya hay Property + RoomTypes + RatePlans + Channels conectados en Channex con
> los mappings persistidos en `Property.channexPropertyId`, `Room.channexRoomTypeId`,
> `RatePlan.channexRatePlanId`. Sin esto, CHANNEX-OUTBOUND-CERT no tiene cómo
> demostrar Tests 1-13 contra datos reales del cliente piloto.

---

## 0. Alineación con certificación Channex Stage 4

Este sprint **NO entrega cert** — entrega los **mappings y la disciplina de
codepath** que CHANNEX-OUTBOUND-CERT y CHANNEX-INBOUND requieren para
demostrar Tests 1-13 contra sandbox `staging.channex.io`.

### Tests cert que dependen de este sprint

| Test | Qué requiere de auto-provision |
|---|---|
| **Test 1** Full Data Update | RoomType + RatePlan mapeados con `channexRoomTypeId`/`channexRatePlanId` reales — sin esto la primera sincronización 500 días no tiene targets |
| **Tests 2-8** Rate/Restriction updates | Idem — el batcher OUTBOUND lee `RatePlan.channexRatePlanId` para construir el payload |
| **Tests 9-10** Availability updates | `Room.channexRoomTypeId` debe existir para que `pushAvailability` agrupe |
| **Test 11** Booking receiving | Property debe estar conectada a **al menos un canal** sandbox (Open Channel) para recibir webhooks de prueba |
| **Test 12** Rate limits | TokenBucket existente respeta 20/min — no depende de provision pero el seed productivo necesita ≥3 channels para demostrar rate-bursting realista |
| **Test 13** Update logic | Disciplina: provision NUNCA dispara full sync — emite events que el OUTBOUND deduplica con `MIN_INTERVAL_MS=23h` (§145 D-CHX-OUT-7) |

### Anti-patterns Channex que este sprint debe evitar estructuralmente

- ❌ **Per-date calls** durante provisionamiento → bulk APIs siempre (un único `POST /restrictions/bulk_update` por property al final del provisioning).
- ❌ **Hardcoded UUIDs** → todo viene del response de Channex y se persiste en BD inmediato.
- ❌ **Full sync timer** → provision dispara 1 sync por property la PRIMERA VEZ; después solo deltas via OUTBOUND existente.
- ❌ **Certification-only UI** → todos los CRUD de OTAs viven en `/nova/billing/codigos` style (production UI), no en endpoint test-only.

---

## 1. Problema y decisión de arquitectura

### Problema

Hoy `WizardActivationService.activate()` ([apps/api/src/nova/wizard/wizard-activation.service.ts](../../apps/api/src/nova/wizard/wizard-activation.service.ts)) crea en BD:

- Organization + Brand + LegalEntity + Properties + Org Owner + SetupToken
- Stripe Subscription (Step 7.5)
- AuditLog `ORGANIZATION_ACTIVATED`

Pero **NO toca Channex**. El cliente queda activado sin presencia OTA, lo cual
significa que:
- El piloto comercial no recibe reservas reales hasta que el consultor configura
  manualmente todo en `/settings/channex`.
- La cert Stage 4 no puede demostrarse contra datos del cliente real.
- El consultor tiene 8-10 clicks adicionales × N canales post-activación.

Gap detectado por owner 2026-05-27.

### Decisión 0 — Multi-tenant Channex (Fase 1)

**Modelo elegido: D adaptado** — 1 Channex master + Groups por Organization +
Zenix middleware enforces RBAC. **API key Channex JAMÁS sale del backend.**

| Modelo | Por qué NO Fase 1 |
|---|---|
| **A** — master único sin Groups | Consultor PARTNER_MEMBER comprometido accede a todas las properties; no hay audit por consultor |
| **B** — Channex Partner Program | Requiere Partner agreement (2-4 sem comercial); commission % no compensa <10 clientes. **Va a Fase 2 post-piloto.** |
| **C** — BYO cliente propio | Onboarding 3× más largo; cliente paga doble. **Va a Fase 3 enterprise opcional.** |
| **D adaptado** ✅ | 1 master + Groups + RBAC middleware. Path migration a B/C es solo cambiar API key per-`LegalEntity` (campo nullable) |

**Security guarantees del Modelo D**:
- Consultor jamás ve la API key Channex.
- `NovaActingOrgGuard` valida que cualquier mutation Channex sea sobre properties dentro de `assignedOrgIds` del consultor.
- Si consultor comprometido → ZaharDev rota 1 API key global.
- Audit trail completo en `ChannexAuditLog` (existente CHANNEX-INBOUND Day 2).

**Migration path documentada**: `LegalEntity.channexApiKey String?` nullable.
Si null → usa master + Group (Fase 1). Si set → usa la del cliente (Fase 2/3).
Cero breaking change para switchear cliente por cliente.

**Referencias**:
- RoomRaccoon usó master + Groups en su piloto 2019.
- Cloudbeds migró D → B en 2021 al pasar 5k clientes.
- Mews usa C (BYO) por filosofía enterprise — limita su mercado SMB.

---

## 2. Scope del sprint — 8 días, 1 dev secuencial

### Day 1 — Gateway gap audit + nuevos métodos CRUD

**Archivos a tocar:**
- [apps/api/src/integrations/channex/channex.gateway.ts](../../apps/api/src/integrations/channex/channex.gateway.ts)
- [apps/api/src/integrations/channex/channex.gateway.spec.ts](../../apps/api/src/integrations/channex/channex.gateway.spec.ts)

**Métodos faltantes a agregar** (confirmado por audit: gateway tiene RoomType + RatePlan CRUD pero NO Property/Channel/Group):

```typescript
// Property lifecycle (alineado con docs Channex API Reference)
async createProperty(input: ChannexPropertyCreateInput): Promise<ChannexProperty>
async updateProperty(id: string, input: ChannexPropertyUpdateInput): Promise<ChannexProperty>
async getProperty(id: string): Promise<ChannexProperty>
// NO deleteProperty — destructivo, requiere ZaharDev approval manual

// Group (multi-tenancy Fase 1)
async createGroup(input: { title: string }): Promise<ChannexGroup>
async assignPropertyToGroup(propertyId: string, groupId: string): Promise<void>

// Channels CRUD (existe listChannels; faltan los demás)
async createChannel(input: ChannexChannelCreateInput): Promise<ChannexChannel>
async updateChannel(id: string, input: ChannexChannelUpdateInput): Promise<ChannexChannel>
async deleteChannel(id: string): Promise<void>

// Channel mappings (room_type/rate_plan ↔ channel-side IDs)
async upsertChannelRoomType(channelId: string, mapping: ChannexChannelRoomTypeMapping): Promise<void>
async upsertChannelRatePlan(channelId: string, mapping: ChannexChannelRatePlanMapping): Promise<void>
```

**Endpoints Channex (oficiales)**:
- `POST /api/v1/properties` body: `{ property: { title, currency, timezone, country, content?, group_id? } }`
- `POST /api/v1/groups` body: `{ group: { title } }`
- `POST /api/v1/channels` body: `{ channel: { type: 'BookingCom'|'ExpediaCom'|'AirbnbCom'|'AgodaCom'|'GoogleHotelAds'|'VRBOCom'|'OpenChannel', property_id, title, settings: {...per-channel} } }`
- `POST /api/v1/channel_room_types` mapping room_type_id ↔ channel external_id
- `POST /api/v1/channel_rate_plans` mapping rate_plan_id ↔ channel external_id

**Auth**: header `user-api-key: <key>` (existente en `ChannexGateway` constructor).

**Tests**: 1 spec por método con `jest.spyOn(fetch).mockResolvedValueOnce(...)` siguiendo pattern de `createRoomType`. Cubrir: happy path + 401 → log error + 422 validation errors → throw typed exception.

**Estimación**: 1.5 días.

---

### Day 2 — Schema migrations + ChannexProvisionService

**Migrations Prisma:**

```prisma
model Property {
  // existente
  channexPropertyId          String?  @unique
  // nuevos
  channexProvisioningStatus  String?  // 'pending' | 'in_progress' | 'completed' | 'partial' | 'failed'
  channexProvisioningError   String?  @db.Text
  channexLastProvisionedAt   DateTime?
  channexGroupId             String?  // FK lógico al Group de Channex (multi-tenant Fase 1)
}

model LegalEntity {
  // existente
  channexApiKey  String?  // null = usa master (Fase 1). Set = Fase 2/3 BYO.
}

model Channel {
  id                  String   @id @default(cuid())
  propertyId          String
  channexChannelId    String   @unique
  type                String   // 'BookingCom' | 'ExpediaCom' | ...
  title               String
  status              String   // 'inactive' | 'pending_credentials' | 'connected' | 'requires_oauth' | 'error'
  settingsEncrypted   String?  @db.Text  // credentials cliente (Booking hotel_id, Expedia EQC ID, etc.) — encriptados AES-256 con KEK en .env
  lastSyncedAt        DateTime?
  createdAt           DateTime @default(now())

  property            Property @relation(fields: [propertyId], references: [id])
  @@index([propertyId])
}
```

**Servicio nuevo**: `apps/api/src/nova/wizard/channex-provision.service.ts`

```typescript
@Injectable()
export class ChannexProvisionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: ChannexGateway,
    private readonly audit: ChannexAuditLogService,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Llamado OUTSIDE-TX después de WizardActivationService.activate() commit.
   * Best-effort: errores se persisten en Property.channexProvisioningStatus.
   * Idempotente: re-trigger valida mappings existentes antes de POST.
   */
  async provisionFromWizard(input: ProvisionInput): Promise<ProvisionResult> {
    // ...
  }
}
```

**Flujo per Organization (1 Property, N Properties análogo)**:

1. **Ensure Group exists** (Fase 1): si `Organization.channexGroupId == null`, crear via `gateway.createGroup({ title: org.slug })`. Persistir en `Organization.channexGroupId`.
2. **Create Property**: si `Property.channexPropertyId == null`, llamar `gateway.createProperty({ title, currency, timezone, country, group_id })`. Persistir en `Property.channexPropertyId` + `Property.channexProvisioningStatus = 'in_progress'`.
3. **Create RoomTypes** (bulk): por cada `RoomType` del template, llamar `gateway.createRoomType({ propertyId, title, count_of_rooms, occ_adults, occ_children, occ_infants })`. Persistir `Room.channexRoomTypeId` en bulk update.
4. **Create RatePlans** (bulk): por cada `RatePlan` del template, llamar `gateway.createRatePlan({ propertyId, roomTypeId, title, currency, sell_mode })`. Persistir `RatePlan.channexRatePlanId`.
5. **Push initial rates** (single bulk call respetando Test 1 cert): llamar `gateway.pushRestrictions([...all entries...])` con base BAR del wizard inventory. **NUNCA loops per-date** (anti-pattern Channex AP-4).
6. **Mark complete**: `Property.channexProvisioningStatus = 'completed'` + `channexLastProvisionedAt = now()`.

**Si cualquier paso falla**:
- `Property.channexProvisioningStatus = 'failed'` + `channexProvisioningError = error.message`
- AuditLog `CHANNEX_PROVISION_FAILED` con detalle
- Emit `AppNotification` ACTION_REQUIRED al consultor "Reintentar provision en /settings/channex"
- **NO rollback** Organization (ya activada)

**Estimación**: 2 días.

---

### Day 3 — Wizard Step 5.5 (Channels selection)

**Decisión arquitectónica**: separar inventory (Step 5) de OTA selection (nuevo Step 5.5) porque conceptualmente son fases distintas (inventory = qué vende el hotel; OTAs = dónde lo vende). Salesforce CPQ pattern.

**Frontend**: `apps/web/src/nova/components/wizard/StepChannelsSelection.tsx`

UI:
```
┌─ Step 5.5 — Canales OTA ─────────────────────┐
│ Selecciona los canales que el cliente quiere │
│ tener activos desde día 1.                   │
│                                              │
│ [✓] Booking.com    ⚠ Requiere Hotel ID + ESP │
│ [✓] Expedia        ⚠ Requiere EQC ID         │
│ [ ] Airbnb         🔒 Activación post-trial  │
│                       (OAuth manual)         │
│ [ ] Agoda                                    │
│ [ ] Google Hotel Ads ⚠ Booking link required │
│ [✓] Open Channel    ✅ Sandbox/test          │
│                                              │
│ Por cada canal seleccionado, captura ahora   │
│ las credenciales del cliente. Si no las      │
│ tienes hoy, marca "Configurar después" y     │
│ el canal queda en estado `pending_credentials`│
└──────────────────────────────────────────────┘
```

**Sub-modal per channel** (al click "[✓] Booking.com"):
```
┌─ Booking.com ───────────────────────────┐
│ Hotel ID (Booking ID del cliente)        │
│ [____________________]                   │
│                                          │
│ Username Booking Extranet                │
│ [____________________]                   │
│                                          │
│ Password Booking Extranet                │
│ [••••••••••••••••••]                     │
│                                          │
│ ☐ No tengo las credenciales hoy          │
│   → Canal queda en pending_credentials.  │
│   Consultor o cliente las completa       │
│   después en /settings/channex.          │
│                                          │
│ [Cancelar]              [Guardar canal]  │
└─────────────────────────────────────────┘
```

**Campos requeridos per channel** (alineados con `settings` object de Channex API):

| Channel | Campos requeridos | Auth method |
|---|---|---|
| **BookingCom** | `hotel_id`, `username`, `password` | API key passthrough |
| **ExpediaCom** | `eqc_id`, `username`, `password` | API key passthrough |
| **AirbnbCom** | `listing_id` (Airbnb listing ID) | **OAuth handshake manual** post-trial — regla regulatoria Airbnb desde 2022, ningún PMS puede crear connection sin user consent en Airbnb portal |
| **AgodaCom** | `hotel_id`, `username`, `password` | API key passthrough |
| **GoogleHotelAds** | `partner_id`, `booking_link_template` | Service account JSON (opcional Fase 2) |
| **VRBOCom** | `vrbo_property_id`, `eqc_credentials` (heredados via Expedia) | API key passthrough |
| **OpenChannel** | `title` only — para testing/cert | No auth |

**Estado inicial de cada channel creado**:
- Si credenciales completas → `status: 'inactive'` (creado pero no published)
- Si "Configurar después" → `status: 'pending_credentials'`
- Si Airbnb → `status: 'requires_oauth'` (siempre, sin importar inputs)

**Backend wizard DTO extension** ([apps/api/src/nova/wizard/dto/wizard-dto.ts](../../apps/api/src/nova/wizard/dto/wizard-dto.ts)):

```typescript
export class WizardChannelDto {
  @IsIn(['BookingCom', 'ExpediaCom', 'AirbnbCom', 'AgodaCom', 'GoogleHotelAds', 'VRBOCom', 'OpenChannel'])
  type!: ChannelType

  @IsString() @MaxLength(120)
  title!: string

  @IsOptional()
  @IsObject()
  credentials?: Record<string, string>  // encriptado server-side antes de persistir

  @IsBoolean()
  configureLater!: boolean  // si true → status pending_credentials
}

export class WizardActivateDto {
  // ...existente

  // Sprint CHANNEX-AUTO-PROVISION Day 3
  @IsOptional()
  @IsBoolean()
  channexPushEnabled?: boolean  // default true — escape hatch para clientes sin Channex

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WizardChannelDto)
  channels?: WizardChannelDto[]
}
```

**Encryption de credenciales**:
- AES-256-GCM con KEK en `.env` (`CHANNEX_CREDENTIALS_KEK=...`)
- Persistir en `Channel.settingsEncrypted` (cifrado completo, incluyendo IV + auth tag)
- Servicio nuevo: `ChannelCredentialsCryptoService` con `encrypt(json)` y `decrypt(ciphertext)`
- **NUNCA loguear credenciales en plain text** — ni en console.log, ni en error messages, ni en AuditLog (loguear solo `credentialsKeys: Object.keys(credentials)`)

**Estimación**: 2 días (1 backend DTO + crypto, 1 frontend UI + modal).

---

### Day 4 — Wizard Step 8 (Activación) UI update + provision integration

**Frontend** ([apps/web/src/nova/components/wizard/StepActivate.tsx](../../apps/web/src/nova/components/wizard/StepActivate.tsx)):

Antes:
```
[Activar cliente]
```

Después:
```
┌─ Preview de activación ─────────────────────────┐
│ ✅ Organization "Hotel Boutique XYZ"            │
│ ✅ LegalEntity "Hotel Boutique XYZ SA de CV"    │
│ ✅ 1 Property                                    │
│ ✅ 5 RoomTypes  → serán creados en Channex      │
│ ✅ 12 RatePlans → serán creados en Channex      │
│ ✅ 3 Canales OTA:                                │
│    • Booking.com  ✓ credenciales completas      │
│    • Expedia      ⚠ pending_credentials         │
│    • Airbnb       🔒 OAuth post-trial           │
│ ✅ Org Owner: maria@hotelxyz.com                │
│ ✅ Stripe trial 14 días                         │
│                                                  │
│ [Activar cliente + provisionar Channex]         │
└─────────────────────────────────────────────────┘
```

**Backend integration** ([apps/api/src/nova/wizard/wizard-activation.service.ts](../../apps/api/src/nova/wizard/wizard-activation.service.ts)):

```typescript
async activate(dto: WizardActivateDto, actor: JwtPayload): Promise<WizardActivateResponse> {
  // ...existente $transaction crea Org+Brand+LE+Properties+Owner+SetupToken+AuditLog

  // NEW — outside-tx (best-effort)
  let channexProvisioning: ChannexProvisioningResult | null = null
  if (dto.channexPushEnabled !== false) {
    try {
      channexProvisioning = await this.channexProvision.provisionFromWizard({
        organizationId: org.id,
        properties: createdProperties,
        channels: dto.channels ?? [],
        actor,
      })
    } catch (err) {
      this.logger.warn(`Channex provision failed for org ${org.id}: ${err.message}`)
      // No rollback — Organization queda activada con provisioningStatus=failed
    }
  }

  // ...existente Stripe sub + email + return
  return {
    organizationId: org.id,
    // ...
    channexProvisioning,  // null si push disabled, o ProvisioningResult
  }
}
```

**Response type**:
```typescript
interface ChannexProvisioningResult {
  status: 'completed' | 'partial' | 'failed'
  propertiesProvisioned: number
  roomTypesCreated: number
  ratePlansCreated: number
  channelsCreated: number
  channelsRequiringOauth: number  // Airbnb count
  channelsPendingCredentials: number
  errors: Array<{ step: string; message: string }>
}
```

**Frontend post-activate**:
- Si `status: 'completed'` → toast verde "Cliente activado y conectado a Channex".
- Si `status: 'partial'` → modal con warning + lista de errors + CTA "Revisar en /nova/billing/channex".
- Si `status: 'failed'` → modal rojo + "Reintentar provision" button.

**Estimación**: 1 día.

---

### Day 5 — Idempotency + retry endpoint

**Problema**: cliente activado pero Channex provision falló. Consultor necesita
re-disparar provision sin re-activar el cliente.

**Endpoint nuevo**: `POST /v1/nova/properties/:propertyId/channex/provision`

- Roles: `PLATFORM_ADMIN`, `PARTNER_MEMBER` (con `NovaActingOrgGuard`)
- Body: opcional `{ channels?: WizardChannelDto[], force?: boolean }`
- Comportamiento idempotente:
  - Si `Property.channexPropertyId` existe → skip createProperty
  - Si `Room.channexRoomTypeId` existe → skip createRoomType
  - Si `RatePlan.channexRatePlanId` existe → skip createRatePlan
  - Si `Channel.channexChannelId` existe → skip createChannel (a menos que `force=true` → delete + recreate)
- Solo crea lo faltante. Idempotency NATURAL (no necesita lock).

**UI nueva** en `/nova/billing/channex` (o `/settings/channex` si ya existe):
- Lista de Properties con `channexProvisioningStatus` chip
- Por cada Property con status `failed` o `partial`: botón "Reintentar provision"
- Por cada Channel con status `pending_credentials`: botón "Completar credenciales"
- Por cada Channel con status `requires_oauth` (Airbnb): botón externo "Abrir Airbnb extranet ↗"

**Estimación**: 1 día.

---

### Day 6 — Tests integration + cert sandbox smoke

**Tests unitarios** (`apps/api/src/nova/wizard/channex-provision.service.spec.ts`):
- Happy path: organization sin presencia previa → crea Group + Property + N RoomTypes + N RatePlans + N Channels → todos los mappings persistidos.
- Idempotency: re-trigger sobre Property ya provisionada → 0 calls a Channex, status `completed`.
- Partial failure: `createRoomType` falla en el 3er roomtype → 2 primeros persisted, status `partial`, error message captura el 3er.
- Channel encryption: credenciales nunca aparecen en plain text en error logs.

**Test integration** (`channex-provision.integration.spec.ts`, opt-in con `CHANNEX_INTEGRATION_TESTS=1`):
- Run real contra `staging.channex.io` con API key sandbox del .env
- Crea Group + Property + 2 RoomTypes + 4 RatePlans + 1 OpenChannel
- Verifica que los IDs retornados son UUIDs válidos
- Cleanup: delete entities creadas (orden inverso) si test exitoso

**Smoke test cert-alignment**:
- Post-provision, verificar que `RatePlan.channexRatePlanId` y `Room.channexRoomTypeId` están presentes en BD
- Llamar `RatesService.batchUpdateRates([...])` (cuando exista post RATES-METRICS sprint)
- Verificar que `ChannexOutboundQueue` recibe row kind=`RATES_RESTRICTIONS`
- Worker drena el row → HTTP 200 vs sandbox
- Esto valida que la cadena AUTO-PROVISION → RATES → OUTBOUND funciona end-to-end (Tests 2-8 cert)

**Estimación**: 1.5 días.

---

### Day 7 — Docs + decisiones + CLAUDE.md

**Docs nuevos**:
- `docs/architecture/channex-provisioning-flow.md` — diagrama de secuencia wizard → provision → mappings BD, con anti-patterns Channex explícitos
- `docs/ops/channex-credentials-rotation.md` — runbook para rotación de API key master + KEK per-environment

**CLAUDE.md** — agregar §189-§194 D-CHX-AP-1..6 + bitácora del sprint:

- §189 **D-CHX-AP-1** — Provisioning es best-effort outside-tx (no rollback Org)
- §190 **D-CHX-AP-2** — Idempotency natural via verificación de mappings BD antes de cualquier POST
- §191 **D-CHX-AP-3** — Multi-tenant Fase 1 = Modelo D adaptado (master + Groups + RBAC middleware)
- §192 **D-CHX-AP-4** — Credenciales OTA encriptadas AES-256-GCM, KEK en .env, nunca en logs
- §193 **D-CHX-AP-5** — Channels creados inactive por default; activación requiere paso explícito post-trial
- §194 **D-CHX-AP-6** — Airbnb siempre `requires_oauth` — UI muestra CTA externo Airbnb extranet, nunca intenta connection programática

**Estimación**: 0.5 días.

---

## 3. Resumen tabular

| Day | Entregable | Estim |
|---|---|---|
| 1 | Gateway: `createProperty/createGroup/createChannel/updateChannel/deleteChannel/upsertChannelRoomType/upsertChannelRatePlan` + specs | 1.5 |
| 2 | Schema migrations + `ChannexProvisionService` + AES-256-GCM crypto | 2 |
| 3 | Wizard Step 5.5 (Channels selection) + per-channel credentials modal + DTO extension | 2 |
| 4 | Wizard Step 8 preview + activation integration outside-tx | 1 |
| 5 | Idempotent retry endpoint + `/nova/billing/channex` retry UI | 1 |
| 6 | Tests unit + integration sandbox + cert-alignment smoke | 1.5 |
| 7 | Docs + CLAUDE.md decisions §189-§194 | 0.5 |
| **Total** | | **~9.5 días** (buffer a 11) |

---

## 4. Decisiones a registrar al cerrar sprint

(Numeradas §189-§194 al pre-commit del último día)

1. **D-CHX-AP-1** — Provisioning best-effort outside-tx. Org no rollbacks si Channex falla.
2. **D-CHX-AP-2** — Idempotency natural via mappings BD. Re-trigger seguro sin force.
3. **D-CHX-AP-3** — Multi-tenant Fase 1 = Modelo D (master + Groups). Migration path a B/C via `LegalEntity.channexApiKey` nullable.
4. **D-CHX-AP-4** — Credenciales OTA AES-256-GCM. KEK en .env. NUNCA en logs/AuditLog.
5. **D-CHX-AP-5** — Channels creados inactive por default. Activación published requiere OTA-side onboarding (content moderation Booking, etc.).
6. **D-CHX-AP-6** — Airbnb siempre `requires_oauth`. UI nunca intenta connection programática — link directo a Airbnb extranet (cumplimiento regla regulatoria Airbnb 2022).

---

## 5. No-goals (scope exclusivo)

- ❌ **NO se publica inventario en OTAs** (no content moderation Booking, no rates push live a Expedia). Channels quedan creados inactive. La publicación requiere onboarding adicional per-OTA que vive fuera del wizard (módulo `/nova/billing/channex` Phase 2).
- ❌ **NO se reconfigura inventory existente** si cambia el template. Re-run wizard sobre Property activa no es supported — sería migration tool separada (post v1.0.1).
- ❌ **NO se cubre Channex Partner Program signup** (Fase 2). Requiere acción comercial ZaharDev con Channex.
- ❌ **NO se cubre OAuth flow Airbnb completo** — solo el handoff a Airbnb extranet con deep link. Implementación OAuth full va a sprint AIRBNB-OAUTH (post v1.0.0).
- ❌ **NO se entrega cert Stage 4** — pero deja toda la disciplina y mappings listos para que CHANNEX-OUTBOUND-CERT lo demuestre contra datos del cliente piloto real.

---

## 6. Dependencias

- ✅ **Channex Gateway base** (Sprint CHANNEX-INBOUND/OUTBOUND closed) — `pushRestrictions`, `pushAvailability`, `cancelBookingAtChannex`, `getBookingRevision` ya funcionales
- ✅ **Wizard activation transactional** (`WizardActivationService` Day 16 NOVA closed)
- ✅ **Multi-tenancy NovaActingOrgGuard** (Sprint NOVA closed)
- ⚠️ **API key Channex sandbox** debe estar en `apps/api/.env` como `CHANNEX_API_KEY=...` antes de Day 6 integration test
- ⚠️ **KEK encryption** debe generarse antes de Day 2: `openssl rand -base64 32 > CHANNEX_CREDENTIALS_KEK` en .env
- ⚠️ **RATES-METRICS-COMPSET-CORE sprint** sigue siendo dependency para cert Tests 2-8 (rates updates); AUTO-PROVISION solo deja los mappings listos. Si RATES no está done al cerrar este sprint, Tests 2-8 quedan `describe.skip` igual que hoy

---

## 7. Documentos referenciados

- [docs/sprints/CHANNEX-INBOUND-plan.md](./CHANNEX-INBOUND-plan.md)
- [docs/sprints/CHANNEX-OUTBOUND-CERT-plan.md](./CHANNEX-OUTBOUND-CERT-plan.md)
- [docs/sprints/CHANNEX-CERT-SURGICAL-PLAN.md](./CHANNEX-CERT-SURGICAL-PLAN.md)
- [docs/sprints/CHANNEX-COMMAND-CENTER-plan.md](./CHANNEX-COMMAND-CENTER-plan.md)
- [apps/api/src/integrations/channex/](../../apps/api/src/integrations/channex/)
- **Channex API Reference oficial**: https://docs.channex.io/api-v.1-documentation/api-reference
- **Channex PMS Certification Tests (14 tests)**: https://docs.channex.io/api-v.1-documentation/pms-certification-tests
- **Channex API key access**: https://docs.channex.io/application-documentation/api-key-access

---

## 8. Cuándo arrancar

**Recomendación**: inmediatamente después de merge `feature/billing-discount-codes` → `feature/billing-core` → `main`.

**Orden post-DISCOUNT-CODES**:

1. **Netflix-style trial flow** (1-2d) — captura tarjeta upfront via Stripe Checkout setup mode. Es quirúrgico y bloquea churn.
2. **CHANNEX-AUTO-PROVISION** (este sprint, 9-11d) — bloqueante para que cliente piloto reciba reservas reales day 1 post-trial.
3. **RATES-METRICS-COMPSET-CORE** (20-23d) — revenue blocker + cert Tests 2-8.
4. **QA-α mobile** (4-5d) + **CI-RESCUE residual** (0.5-1d).
5. **Tag v1.0.0** + activación piloto real.

Total restante a v1.0.0: ~35-42 días-dev = ~7-8 sem calendar.
