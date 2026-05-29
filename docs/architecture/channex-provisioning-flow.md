---
Audiencia: Engineering + nuevos devs onboarding al módulo Channex
Tipo: Architecture flow doc
Status: Sprint CHANNEX-AUTO-PROVISION cerrado 2026-05-28
Padre comercial: docs/sprints/CHANNEX-AUTO-PROVISION-plan.md
Cert padre: docs/sprints/CHANNEX-CERT-SURGICAL-PLAN.md
Última actualización: 2026-05-28
---

# Channex auto-provisioning flow

Cómo el wizard Zenix Activate empuja inventario + canales OTA a Channex sin
acción manual del consultor post-activación, mientras mantiene compliance
con los 14 cert tests Stage 4 y los anti-patrones oficiales.

---

## 0. TL;DR — la trayectoria de un cliente nuevo

```
Consultor pulsa "Activar"
      │
      ▼
WizardActivationService.activate(dto, actor)
   ┌──────────────────────────────────────────────────┐
   │ $transaction (inside-tx, atómico):              │
   │   · Organization + Brand + LegalEntity          │
   │   · Properties + Rooms                          │
   │   · Org Owner placeholder + SetupToken 72h      │
   └──────────────────────────────────────────────────┘
      │
      ▼ (outside-tx best-effort)
SubscriptionService.createPendingSubscription
      │ (Netflix flow: Sub status='pending_payment_method')
      ▼ (outside-tx best-effort)
ChannexProvisionService.provisionFromWizard
   ┌──────────────────────────────────────────────────┐
   │ 1. Group: createGroup(zenix-{slug})              │
   │ 2. Property: createProperty(title, group_id)     │
   │ 3. RoomTypes: bulk per Room                      │
   │ 4. RatePlans: bulk per RoomType (BAR placeholder)│
   │ 5. Channels: per OTA selection del Step 5.5      │
   │ 6. Mark PropertySettings.channexProvisioningStatus│
   └──────────────────────────────────────────────────┘
      │
      ▼
AuditLog ORGANIZATION_ACTIVATED + Email Resend
      │
      ▼
Response a wizard incluye:
   { organizationId, ownerSetupLink, subscription, channexProvisioning }
      │
      ▼
Consultor ve preview: "5 RoomTypes, 12 RatePlans, 3 channels creados"
Si parcial/failed → toast warning → /nova/billing/channex retry
```

---

## 1. Multi-tenant Fase 1 (Modelo D adaptado)

**Decisión D-CHX-AP-3**: 1 Channex master account + Groups por Organization +
`NovaActingOrgGuard` enforces RBAC. La API key Channex JAMÁS sale del backend.

**Por qué este modelo (no Partner Program todavía)**:

| Aspecto | Modelo A (master único, sin Groups) | **Modelo D adaptado (elegido)** | Modelo B (Partner Program) | Modelo C (BYO cliente) |
|---|---|---|---|---|
| Aislamiento per cliente | ❌ Ninguno | ✅ Channex Group nativo | ✅ Sub-account independiente | ✅ Account independiente |
| Audit per consultor | ❌ | ✅ vía `NovaActingOrgGuard` + AuditLog | ✅ + comisión Channex | ✅ |
| Tiempo onboarding | 1 día | **1 día** | 2-4 semanas firma Partner | 2-3 días contratación cliente |
| Costo | $X master | **$X master** | $X master + commission % per sub | Cliente paga $Y separado |
| Cuándo activarlo | Single-tenant only | **Fase 1 piloto (1-10 clientes)** | Fase 2 (≥10 clientes activos) | Fase 3 enterprise opcional |

**Migration path a Modelo B post-piloto**: cuando ZaharDev firme el Channex
Partner Agreement (estimado Q3 2026 con ≥10 orgs activas), el switch es
quirúrgico — `LegalEntity.channexApiKey String?` nullable ya existe en el
schema. Si null → master + Group (Fase 1, default). Si set → BYO key (Fase 2).
ChannexGateway picks la key per request. Cero breaking change — migration
gradual cliente por cliente.

**Referencias industria** (pattern documentado):
- RoomRaccoon usó master + Groups en su piloto 2019, migró a Partner Program 2021
- Cloudbeds migró D → B en 2021 al pasar 5k clientes activos
- Mews usa Modelo C (BYO) por filosofía enterprise — limita su mercado SMB

---

## 2. Pipeline detallado per Property

```
provisionOneProperty(propertyId, groupId, channels[], result):
│
├─ Pre-load: Prisma findUnique + include {organization, legalEntity, settings, rooms}
│
├─ Mark PropertySettings.channexProvisioningStatus = 'in_progress'
│
├─ 1. Property push
│    │
│    ├─ if (settings.channexPropertyId existe):
│    │     skip create + ensure groupId via assignPropertyToGroup
│    │
│    └─ else:
│          gateway.createProperty({title, currency, timezone, country, groupId})
│          → upsert PropertySettings.channexPropertyId
│
├─ 2. RoomTypes (bulk per Room)
│    │
│    └─ per room ∈ prop.rooms:
│         if (room.channexRoomTypeId existe): skip (idempotent)
│         else:
│           gateway.createRoomType({propertyId, title, countOfRooms:1, occAdults:2})
│           → prisma.room.update channexRoomTypeId
│
├─ 3. RatePlans (bulk per Room+RoomType)
│    │
│    └─ per room ∈ rooms con channexRoomTypeId set:
│         gateway.createRatePlan({propertyId, roomTypeId, title:'BAR {n}',
│                                  currency, rateCents:10000, occupancy:2})
│         (RATES-METRICS sprint sustituirá el placeholder $100 con rates reales)
│
├─ 4. Channels per OTA selection del Step 5.5
│    │
│    └─ per channelInput ∈ channels:
│         · isAirbnb (type='AirbnbCom'):
│             status='requires_oauth' siempre (regla regulatoria Airbnb 2022;
│             ningún PMS puede crear connection sin OAuth user consent)
│             credentials encriptadas si vienen + cryptoReady
│         · configureLater=true OR no credentials:
│             status='pending_credentials' — consultor las completa después
│         · KEK no ready + credentials presentes:
│             status='pending_credentials' + error en result.errors[]
│         · happy path:
│             encrypt(credentials) → settingsEncrypted
│             status='inactive' (NEVER publish at provisioning)
│         · gateway.createChannel({type, propertyId, title, isActive:false, ...settings})
│         · prisma.channel.create({propertyId, channexChannelId, type, status, ...})
│
└─ Mark PropertySettings.channexProvisioningStatus per outcome:
      · allOk → 'completed' + channexProvisioningError=null
      · errors per propertyId > 0 → 'partial' + joined error messages
      · catastrophic abort early → 'failed'
   + channexLastProvisionedAt = now()
```

**Idempotency garantías** (D-CHX-AP-2):
- Property level: check `settings.channexPropertyId` antes de POST
- RoomType level: check `room.channexRoomTypeId` antes de POST
- RatePlan level: bulk per room con check del mapping
- Channel level: constraint UNIQUE `channex_channel_id` → DB rechaza duplicates

Re-trigger desde `/nova/billing/channex` es seguro — solo crea lo que falta.

---

## 3. Encryption de credentials OTA (D-CHX-AP-4)

`ChannelCredentialsCryptoService` cifra AES-256-GCM antes de persistir.

**Format del blob `Channel.settingsEncrypted`** (base64):
```
[12 bytes IV][16 bytes auth tag][N bytes ciphertext]
```

**Setup ops** (one-time per environment):
```bash
openssl rand -base64 32 > /tmp/channex-kek.txt
# Copiar el valor a .env como CHANNEX_CREDENTIALS_KEK
```

**Runtime guards**:
- KEK no set → `isReady()=false` → channels con credentials fallan suavemente
  (status='pending_credentials' + error capturado, no crash)
- KEK length != 32 bytes → logged error + isReady=false
- Auth tag mismatch en decrypt → throw InternalServerErrorException
  (KEK rotada y blobs viejos quedan inválidos hasta re-encrypt migration)

**Audit safety**: `describeCredentials(settings)` retorna solo
`keys=[hotel_id,username,password]` — NUNCA values. Aplicado en logs,
AuditLog payloads, error messages.

**KEK rotation playbook** (cuando una key se compromete):
1. Generar nueva KEK + setear como `CHANNEX_CREDENTIALS_KEK_NEW` en .env
2. Script de migration lee todos los Channel.settingsEncrypted con KEK vieja
3. Re-encrypt con KEK_NEW → update Channel.settingsEncrypted
4. Swap env vars: KEK_NEW → KEK; KEK_OLD → KEK_LEGACY (failsafe rollback)
5. Después de 24h sin issues, delete KEK_LEGACY

---

## 4. Cert Stage 4 alignment

El sprint AUTO-PROVISION **NO entrega cert directamente**. Entrega los
mappings y la disciplina de codepath que CHANNEX-OUTBOUND-CERT necesita
para demostrar los Tests contra datos del cliente piloto.

**Tests dependientes** (mapping deliverable → test):

| Test | Deliverable AUTO-PROVISION que lo habilita |
|---|---|
| Test 1 (Full Data Update) | `RatePlan.channexRatePlanId` + `Room.channexRoomTypeId` poblados |
| Tests 2-8 (rate/restriction) | Idem + OUTBOUND emite events post-RatesService methods |
| Tests 9-10 (availability) | `Room.channexRoomTypeId` para agrupar pushAvailability |
| Test 11 (booking receiving) | Property connected a ≥1 channel sandbox (Open Channel) |
| Test 12 (rate limits) | TokenBucket existente; seed productivo necesita ≥3 channels |
| Test 13 (delta-only updates) | Provision dispara 1 sync first-time; después solo deltas vía OUTBOUND |

**Anti-patterns evitados estructuralmente** (verificable por grep test en CI):
- ❌ Per-date calls → arquitectura usa bulk APIs (`pushRestrictions(entries[])`)
- ❌ Hardcoded UUIDs → todo viene del Channex response y persiste inmediato
- ❌ Full sync timer → provision dispara 1 sync first-time; deltas vía OUTBOUND
- ❌ Certification-only UI → CRUD vive en `/nova/billing/channex` (production)

---

## 5. Recovery + retry flow

```
Cliente activado, status=partial/failed
      │
      ▼
Consultor abre /nova/billing → tarjeta "Channex provisioning"
      │
      ▼
/nova/billing/channex
   ┌──────────────────────────────────────────────────┐
   │ GET /v1/nova/channex/provisioning                │
   │   → list per property con StatusChip + Channels  │
   │   → <details> con error message stack            │
   └──────────────────────────────────────────────────┘
      │
      ▼ click "Reintentar" en property con status≠completed
POST /v1/nova/channex/provision/:propertyId
   ┌──────────────────────────────────────────────────┐
   │ defense-in-depth: prop.organizationId === actingOrg│
   │ ChannexProvisionService.retryProperty            │
   │   → reusa provisionOneProperty con idempotency   │
   │   → solo crea lo que falta                       │
   └──────────────────────────────────────────────────┘
      │
      ▼
Toast result.status:
   completed → green "Provision OK · N room types · M channels"
   partial   → amber "Provision parcial · N errors restantes"
   failed    → red "Provision falló · {error[0].message}"
+ invalidateQueries → refetch
```

---

## 6. Cuándo NO usar este flow

- ❌ Cliente con Channex via Partner Program propio (Fase 2): el flow espera
  master key + Group. Cuando llegue Fase 2, `LegalEntity.channexApiKey` no-null
  ruteará al gateway con su key — la lógica del ProvisionService es agnóstica.

- ❌ Cliente que NO quiere Channex (cliente directo sin OTAs): wizard envía
  `channexPushEnabled: false` → service skip total. Cliente puede activar
  Channex post-onboarding desde Nova settings (no implementado todavía).

- ❌ Activación re-disparada para cambio de inventory (cambiar template):
  fuera de scope. Eso requiere migration tool separada (post v1.0.1).

- ❌ OAuth Airbnb completion: el flow marca `requires_oauth` pero el OAuth
  handshake vive en sprint AIRBNB-OAUTH post v1.0.0.

---

## 7. Referencias cruzadas

- Plan padre: [docs/sprints/CHANNEX-AUTO-PROVISION-plan.md](../sprints/CHANNEX-AUTO-PROVISION-plan.md)
- Cert padre: [docs/sprints/CHANNEX-CERT-SURGICAL-PLAN.md](../sprints/CHANNEX-CERT-SURGICAL-PLAN.md)
- Multi-tenant: [docs/vision/11-multi-tenant-architecture.md](../vision/11-multi-tenant-architecture.md)
- Nova architecture: [docs/architecture/NOVA-architecture.md](./NOVA-architecture.md)
- Channex API official: https://docs.channex.io/api-v.1-documentation/api-reference
- Cert tests official: https://docs.channex.io/api-v.1-documentation/pms-certification-tests
