# Sprint NOVA-CHANNEX-COMMAND-CENTER — Multi-OTA control center + Nova foundation fase 1

> **Branch destino:** `feature/channex-inbound` (continuación del sprint Channex en curso).
> **Estimación:** 16-20 días-dev (1 dev secuencial) — expandido respecto a propuesta original 12-16d para incluir Nova foundation fase 1.
> **Status:** propuesta arquitectónica **APROBADA por owner** 2026-05-23 Late PM — Nova foundation 5-tier RBAC + Partner schema + wizard integration + Channex multi-OTA CRUD.
> **Doc fundacional Nova:** [docs/architecture/NOVA-architecture.md](../architecture/NOVA-architecture.md) (2016 líneas consulting-grade, ADR permanente).
> **Bloque 1 v1.0.0 expandido:** ~56-74 días-dev = ~11-15 sem calendar. Target tag ago-oct 2026.
> **Estudio comparativo:** Mews / Cloudbeds / Opera / Little Hotelier / RoomRaccoon / Sirvoy documentado en §6.

---

## 0. Resumen ejecutivo

Reemplaza el módulo actual `/settings/channex` (snapshot read-only de queues + token bucket + DEAD_LETTER) por un **centro de comando full-CRUD** que sincroniza bidireccionalmente con Channex API. Permite al hotel operar todas las OTAs desde una sola pantalla en Zenix, sin abrir extranet de Channex día-a-día.

### Pain real

Quote piloto Monica Tulum (2026-05-23):
> "Hay ocasiones que en Booking el hotel quiere poner un precio y en Hostelworld uno más barato, que todo eso se pueda controlar desde una pantalla que existe en Zenix."

Quote competencia (Capterra/G2 recurrentes):
> "Why do I need two tabs open all the time?" (Little Hotelier reviewer 2024)
> "Channel mgmt is OK but I still need to log into Booking extranet for half the things" (Mews G2 2025)
> "This is why we chose Cloudbeds. One tab for everything." (Cloudbeds G2 2024 — pattern a igualar)

### Diferenciador documentado

Ningún PMS del estudio cubre **simultáneamente**:
1. Rate-parity matrix con alerts visuales color-coded (Cloudbeds tiene la matriz pero sin alerts)
2. **RBAC granular 3-tier** consultor / supervisor / receptionist alineado a SAP+SuccessFactors (Cloudbeds da admin todo, Mews/Opera roles planos)
3. **Channel pause como acción temporal** (no requiere desconectar+reconectar al canal — preserva mapping)
4. Audit log de quién tocó qué rate, cuándo, y push status
5. Wizard guiado de mapping room_type ↔ channel codes

Cloudbeds cubre #1 parcial. Mews #4. Los demás ninguno.

---

## 1.5 Nova foundation incluida en este sprint

> Decisión owner 2026-05-23 Late PM: la fase 1 de Nova (interfaz consultor/admin) **se entrega como parte de este sprint**, no se espera a v1.0.5 ni se hace en sprint aparte. Razón: la arquitectura Channex Command Center (CRUD pleno, RBAC granular, audit log universal, mapping wizard) está hecha PARA consultor — sin la cápsula Nova alrededor, los endpoints quedan accesibles desde el sidebar PMS del cliente, lo cual contradice la separación de concerns.

### Qué entrega este sprint de Nova fase 1

- **Shell `/nova/*` dentro `apps/web`** — sidebar Nova (distinto del Sidebar PMS) + topbar con tenant switcher + impersonation banner persistente. NO extracción a `apps/partner` (eso es Phase 2 v1.0.5).
- **5-tier RBAC schema**: `Partner` + `PartnerMember` + `PartnerClientAssignment` + `PartnerMemberAssignment` (tablas + migrations + seed de ZaharDev como Partner `isInternal=true` + primer PLATFORM_ADMIN user). Ver [docs/architecture/NOVA-architecture.md §3](../architecture/NOVA-architecture.md).
- **`AuditLog` universal append-only** (trigger Postgres bloquea UPDATE/DELETE) — reemplaza al `ChannexAuditLog` específico del plan original; la tabla universal cubre TODOS los actos administrativos Nova, no sólo Channex.
- **`AccessControlService` extension** con UNION query 4 niveles (PartnerMemberAssignment + UserPropertyRole + LegalEntityUserRole + BrandUserRole) — pattern §67 del CLAUDE.md.
- **`TenantContextService` extension** con `partnerMemberId` + `assignedOrgIds[]` resolution + `X-Acting-Organization-Id` header guard (`NovaActingOrgGuard`).
- **JWT extension** con `actorTier` + `partnerMemberId` + `assignedOrgIds[]` (max 20 inline, fallback Redis cache TTL 5min). Backward-compat: si `actorTier == null` se asume PROPERTY scope legacy.
- **Wizard "Zenix Activate"** `/nova/wizard` scaffolding con 4 steps funcionales (Step 1 Customer Account, Step 4 Property con Channex ping, Step 7 Integrations health-checks 4-pass, Step 8 Activación + Activation Report PDF + credenciales email) + 4 steps stubbed (Brand/LegalEntity/Inventory/Staff). Wizard navegable end-to-end aún con steps incompletos. Ver [docs/vision/13-consultant-setup-wizard.md](../vision/13-consultant-setup-wizard.md) §2.2 para forcing functions per step.
- **Impersonation banner persistente** (stripe amber top, `position: sticky; top: 0; z-index: 50`) cuando un PARTNER_MEMBER opera `onBehalfOf` un ORG_OWNER. Texto exacto: `"Actuando como [Nombre cliente] · razón: [reason] · finalizar [link]"`.
- **Tenant switcher híbrido** SuccessFactors-style: landing `/nova/clientes` lista filtrada por tier (PLATFORM_ADMIN ve TODOS; PARTNER_ADMIN ve clientes del firm; PARTNER_MEMBER ve sólo sus assignments) + chip persistente top-bar dentro del workspace cliente.
- **Transparency notif obligatoria al cliente** (email al ORG_OWNER + AppNotification in-app) en cada acceso/acción `onBehalfOf` — compliance GDPR Art. 13 + LFPDPPP Art. 16 + ISO 27001 A.9.2.5.

### Lo que NO entrega este sprint (defer a sprints futuros)

- Extracción a `apps/partner` con build separado + dominio propio `nova.zenix.com` (Phase 2 v1.0.5).
- Partner Portal marketplace público (Phase 3 v1.2).
- Health-checks adicionales del wizard más allá de los 4 obligatorios (Channex ping + Stripe $1 + PAC sandbox + SMTP) — el playbook completo con 12 validaciones llega en wizard v2 (v1.0.5).
- Cold storage partition del `AuditLog` >365 días — Phase 3 v1.0.3 REPORTS-CORE entrega el move scheduler.
- White-label per-partner (logo + colores customizable de la shell Nova) — defer a v1.0.6.

Ver [docs/architecture/NOVA-architecture.md](../architecture/NOVA-architecture.md) para mockups completos, schema Prisma detallado, RBAC matrix exhaustiva, y rationale de cada decisión arquitectónica.

---

## 1. RBAC — 5 tiers (Nova foundation: SAP PartnerEdge + SuccessFactors model)

> Refactor 2026-05-23 Late PM: la propuesta original de 3 tiers (consultor / supervisor / receptionist) queda **subsumida** por la hierarchy 5-tier de Nova. El antiguo "Tier A consultor" se desdobla en PLATFORM_ADMIN + PARTNER_ADMIN + PARTNER_MEMBER (con scopes distintos); "Tier B supervisor" y "Tier C receptionist" pasan a ser ORG_STAFF (SUPERVISOR / RECEPTIONIST `SystemRole` legacy). ORG_OWNER es nuevo. Ver [docs/architecture/NOVA-architecture.md §4](../architecture/NOVA-architecture.md) para RBAC matrix completa.

### PLATFORM_ADMIN — ZaharDev staff

Acceso pleno a TODOS los Organizations + Partners + Properties. Único tier con privilegios cross-Partner (puede tocar la config de otro Partner Firm). Solo usuarios de la fila `Partner` con `isInternal=true` (= ZaharDev) pueden tener este rol.

### PARTNER_ADMIN — leadership del partner firm

Acceso pleno DENTRO de su firm: gestionar PartnerMembers del firm, asignar engagements (PartnerClientAssignment), ver toda la actividad de su firm. Acceso a workspaces cliente vía impersonation (queda en AuditLog). NO puede tocar otros Partners ni el rol PLATFORM_ADMIN.

### PARTNER_MEMBER — consultant / support engineer dentro del firm

Scope limitado a sus PartnerMemberAssignments. Para acceder a workspace cliente requiere header `X-Acting-Organization-Id` validado por `NovaActingOrgGuard` (§170 CLAUDE.md). Pleno CRUD operativo dentro de los workspaces asignados (Channex room types + rate plans + rate calendar + restrictions + mappings + wizard ejecución). Granularidad sub-rol via `PartnerMemberRole` enum 8 valores (LEAD_CONSULTANT / SOLUTION_CONSULTANT / SUPPORT_L1-L3 / SALES_REP / TRAINEE).

| Item | Endpoint | Tiers permitidos |
|------|----------|------------------|
| Conectar/desconectar channels | `GET /channels` + redirect manual extranet | PLATFORM_ADMIN, PARTNER_MEMBER (scope=FULL) |
| CRUD Room Types | `GET/POST/PATCH/DELETE /channex/room-types` | PLATFORM_ADMIN, PARTNER_MEMBER |
| CRUD Rate Plans | `GET/POST/PATCH/DELETE /channex/rate-plans` | PLATFORM_ADMIN, PARTNER_MEMBER |
| Mapping wizard room_type ↔ channel codes | `GET/POST /channex/mappings` | PLATFORM_ADMIN, PARTNER_MEMBER |
| Validate mapping integrity | `POST /channex/validate-mappings` | PLATFORM_ADMIN, PARTNER_MEMBER |
| Tax sets + cancellation policies | `GET/POST/PATCH /channex/tax-sets` | PLATFORM_ADMIN, PARTNER_MEMBER |
| Editar caps de rate (Salesforce Permission Set pattern) | `PATCH /channex/rate-plans/:id/caps` | PLATFORM_ADMIN, PARTNER_MEMBER |
| Disparar full-sync manual | `POST /channex/full-sync/:propertyId` | PLATFORM_ADMIN, PARTNER_MEMBER, ORG_OWNER |
| Wizard "Zenix Activate" execution | `POST /nova/wizard/*` | PLATFORM_ADMIN, PARTNER_MEMBER (scope=FULL) |

### ORG_OWNER — customer admin

Acceso pleno a su Organization: invitar staff, configurar billing, ver toda la actividad de su org. NO toca Channex CRUD estructural (room types / rate plans / mappings) — eso es Tier consultor. SÍ toca rate calendar day-to-day (rates per date × channel × room type) dentro de los caps establecidos por consultor.

### ORG_STAFF — Tier B y Tier C consolidados (SystemRole legacy)

`SystemRole.SUPERVISOR` (Tier B antiguo):

| Item | Endpoint |
|------|----------|
| Rate Calendar Matrix — edit per date × channel × room type | `GET/PATCH /channex/rate-calendar` |
| Bulk rate edit (N días × M channels en 1 mutation) | `PATCH /channex/rate-calendar/bulk` |
| Restrictions per channel: CTA / CTD / min-stay / max-stay / stop-sell | `PATCH /channex/restrictions` |
| Rate-parity matrix con alerts (Booking $130, Hostelworld $120 → flag amber) | derivado client-side |
| Pause / unpause channel (stop_sell global temporal) | `POST /channex/channels/:id/pause` |
| Revisar DEAD_LETTER + retry | `POST /channex/outbox/:id/retry` |
| Conflict resolution review | `/channex/conflicts` (existente) |

`SystemRole.RECEPTIONIST` (Tier C antiguo): solo lectura — chip post-push §151 + chip brand OTA §149 ya entregados. Sin acceso a `/settings/channex`.

### Por qué este modelo (vs Cloudbeds dar-todo-al-admin)

1. **Room type / rate plan creation rompe webhooks si está mal mapeado** — hotel boutique LATAM sin staff técnico no diagnostica `NO_ROOM_TYPE_MATCH` conflict. Consultor con health-check builtin deja el sistema en estado válido.
2. **Consultor = revenue stream recurrente** (modelo SuccessFactors). Onboarding inicial + revisiones trimestrales. CRUD pleno al cliente = pierdes ese revenue.
3. **Lección Opera Cloud**: Distribution module sin certificación → 30% Opera customers reportan dist roto post-self-edit (HotelTechReport 2024).
4. **Cloudbeds da admin pleno** → 4 posts/sem en r/hotels "I broke my channel mapping" (G2 2024-2025).
5. **Day-to-day pain (Tier B) sí tiene impacto revenue inmediato** y no rompe estructura. Resuelve la queja Capterra 5/5 PMS.

---

## 2. Decisiones de diseño (a registrar §159-§168 CLAUDE.md al cerrar)

- **D-CHX-CC-1 — `/settings/channex` es multi-tab.** Reemplaza la vista snapshot única. Tabs: Status (existente) / Room Types (Tier A) / Rate Plans (Tier A) / Rate Calendar (A+B) / Restrictions (A+B) / Channels (A+B) / Mappings (A) / Audit Log (A+B read).
- **D-CHX-CC-2 — RBAC enforcement server-side por endpoint.** `@Roles(...)` decorator con tiers explícitos. UI oculta tabs según rol pero no es la barrera; backend rechaza con 403 igual.
- **D-CHX-CC-3 — Pass-through CRUD via gateway, write-through cache en Zenix DB.** Cuando consultor crea un room type, Zenix llama `POST /room_types` a Channex → cuando OK → upsert en `RoomType` local con `channexRoomTypeId`. Sin esto la próxima query a Zenix DB no ve el nuevo type hasta full-sync.
- **D-CHX-CC-4 — Optimistic UI bloqueado por defecto.** Channex API puede tardar 1-3s. La UI muestra spinner + chip "Aplicando…" hasta ack. Sin optimistic porque rollback de operación destructiva (delete room type) es caro de revertir.
- **D-CHX-CC-5 — Rate Calendar Matrix es virtual scroll.** N días × M channels × K room types puede ser 90 × 5 × 5 = 2250 cells. Virtualizer (`@tanstack/react-virtual`) horizontal + vertical. Edit inline con popover. Bulk select con shift+click.
- **D-CHX-CC-6 — Rate-parity threshold default 5% spread.** Configurable per-property en `PropertySettings.rateParity ThresholdPct`. Color amber si spread > threshold, red si > 2× threshold. Heurística NN/g pre-attentive Treisman 1980.
- **D-CHX-CC-7 — Channel pause = temp stop_sell, no desconectar.** Channex no expone API de "pause channel" — emulamos vía `stop_sell=true` per rate_plan × channel en restrictions endpoint. Unpause = revertir a previous state (guardado en `ChannexChannelPauseLog`). Pattern Cloudbeds "Snooze channel".
- **D-CHX-CC-8 — Audit log append-only fiscal-grade.** Tabla `ChannexAuditLog { actorId, actorTier, action, target, payload, channexResponse, status, createdAt }`. Patrón §28 PaymentLog. Visa CRR §5.9.2 chargeback evidence + auditabilidad cross-OTA + GDPR record-of-processing.
- **D-CHX-CC-9 — Rate caps per Tier B operativos.** Consultor (Tier A) puede definir "BAR Estándar no puede bajar de USD 50 ni subir de USD 200" en `RatePlan.rateCapMin/rateCapMax`. Supervisor (Tier B) edita dentro de caps; intento fuera → 400 con mensaje claro. Salesforce Permission Set pattern.
- **D-CHX-CC-10 — Mapping wizard con health-check pre-save.** Antes de aceptar un mapping room_type ↔ channel code, llama `gateway.testMapping(channelId, code)` que verifica que el código existe del lado del OTA. Sin esto, mismatch silente → bookings caen en NO_ROOM_TYPE_MATCH conflict.

---

## 2.2 Schema additions — Nova foundation tables

> Las 17 decisiones §159-§175 (CLAUDE.md) requieren 5 tablas nuevas para Nova foundation. NO duplicar aquí el schema Prisma completo — la fuente de verdad es [docs/architecture/NOVA-architecture.md §3](../architecture/NOVA-architecture.md). Resumen ejecutivo:

- **`Partner`** — firm de consultoría/sales. Campos clave: `id`, `name`, `slug`, `tier` (PartnerTier enum AUTHORIZED/SILVER/GOLD/PLATINUM), `isInternal` (Boolean, true sólo para ZaharDev), `parentPartnerId` (sub-partner para white-label engagements; sólo PLATINUM puede tener subs), `createdAt`. Constraint: `actorTier='PLATFORM_ADMIN'` requiere `partner.isInternal=true` (CHECK).
- **`PartnerMember`** — usuario individual dentro de un firm. Campos: `id`, `partnerId` FK, `userId` FK (link a User existente), `role` (PartnerMemberRole enum 8 valores), `scope` (FULL / READ_ONLY / SHADOW para TRAINEE), `activatedAt`, `deactivatedAt`. Un user puede ser PartnerMember de varios firms simultáneamente (caso freelancer).
- **`PartnerClientAssignment`** — firm ↔ Organization (cliente). Campos: `id`, `partnerId` FK, `organizationId` FK, `assignmentType` (PRIMARY / SUB / SUPPORT), `startedAt`, `endedAt`. Una Organization puede tener 1 PRIMARY + N SUB simultáneos.
- **`PartnerMemberAssignment`** — member ↔ engagement (1 row por consultor asignado a 1 cliente). Campos: `id`, `partnerMemberId` FK, `partnerClientAssignmentId` FK, `role` (LEAD / SUPPORT / OBSERVER), `assignedAt`, `revokedAt`. Permite rotación interna del firm sin tocar la relación firm↔cliente.
- **`AuditLog`** universal — append-only DB-level (trigger Postgres bloquea UPDATE/DELETE). Campos: `id`, `organizationId` FK (NULL para acciones PLATFORM-level), `actorRealId` FK User, `actorRealRole`, `onBehalfOfId` FK User NULLABLE, `onBehalfOfRole`, `action` (string enum), `target` (entity id), `payload` (Json), `channexResponse` (Json NULLABLE), `status` (SUCCESS/FAILURE/PARTIAL), `errorMessage`, `reason` (REQUIRED if `onBehalfOfId IS NOT NULL` — CHECK constraint), `retentionPolicy` (HOT_365_THEN_COLD / PERMANENT / ANONYMIZE_AFTER_2Y), `createdAt`. Reemplaza al `ChannexAuditLog` específico del plan original.

Migrations:
1. Migration `nova_foundation_schema` — crea las 5 tablas + indexes + trigger Postgres del AuditLog.
2. Migration `nova_foundation_seed` — seed ZaharDev como Partner `isInternal=true` + primer PartnerMember PLATFORM_ADMIN user (link al user actual del owner).
3. Migration `channex_command_center_schema` — `RatePlanCap` + `ChannexChannelPause` + `PropertySettings` extensions (rateParityThresholdPct + channexCommandCenterEnabled).

NOTA: el modelo `ChannexAuditLog` propuesto originalmente en §4 abajo queda obsoleto — sus campos se subsumen en el `AuditLog` universal. La sección §4 conserva sólo `RatePlanCap` + `ChannexChannelPause` + `PropertySettings` extensions.

---

## 3. Arquitectura

### Backend

```
apps/api/src/integrations/channex/
├── channex.gateway.ts                    (existente — extender con CRUD methods)
├── management/                           (nuevo)
│   ├── channex-management.module.ts
│   ├── room-types.controller.ts          GET/POST/PATCH/DELETE
│   ├── room-types.service.ts             pass-through + write-through Zenix DB
│   ├── rate-plans.controller.ts          GET/POST/PATCH/DELETE
│   ├── rate-plans.service.ts             idem
│   ├── rate-calendar.controller.ts       GET (matrix) / PATCH (bulk)
│   ├── rate-calendar.service.ts          aggregator + bulk edit dispatch
│   ├── restrictions.controller.ts        PATCH bulk
│   ├── restrictions.service.ts           bulk dispatch via existente outbox
│   ├── channels.controller.ts            GET / POST :id/pause / POST :id/unpause
│   ├── channels.service.ts               pause emula stop_sell
│   ├── mappings.controller.ts            GET/POST + wizard health-check
│   ├── mappings.service.ts
│   ├── channex-audit.service.ts          append-only writer
│   └── *.spec.ts
```

### Frontend

```
apps/web/src/pages/
└── ChannexAdminPage.tsx                  (refactor a multi-tab)
apps/web/src/modules/channex/             (nuevo módulo)
├── components/
│   ├── tabs/
│   │   ├── StatusTab.tsx                 (existente — preservar)
│   │   ├── RoomTypesTab.tsx              CRUD list + create dialog (Tier A)
│   │   ├── RatePlansTab.tsx              CRUD list + create dialog (Tier A)
│   │   ├── RateCalendarTab.tsx           Matrix virtualizada (A+B)
│   │   ├── RestrictionsTab.tsx           CTA/CTD/min-max/stop-sell grid
│   │   ├── ChannelsTab.tsx               Connected channels + pause action
│   │   ├── MappingsTab.tsx               Wizard (Tier A)
│   │   └── AuditLogTab.tsx               Append-only list
│   ├── RateCalendarMatrix.tsx            Core component — virtual scroll
│   ├── RateParityIndicator.tsx           Color-coded delta
│   ├── BulkRateEditDialog.tsx
│   ├── RoomTypeFormDialog.tsx
│   └── RatePlanFormDialog.tsx
├── hooks/
│   ├── useChannexRoomTypes.ts
│   ├── useChannexRatePlans.ts
│   ├── useChannexRateCalendar.ts
│   └── useChannexAuditLog.ts
└── api/
    └── channex-management.api.ts
```

### 3.1 Nova shell architecture

> Phase 1 (v1.0.0 — este sprint): `/nova/*` routes dentro `apps/web` con shell separado. Phase 2 (v1.0.5): extracción a `apps/partner` con build separado + dominio `nova.zenix.com`. Ver [docs/architecture/NOVA-architecture.md §5](../architecture/NOVA-architecture.md) para mockups completos.

Estructura de routing Phase 1:

```
apps/web/src/
├── nova/                                  (nuevo módulo Nova)
│   ├── NovaShell.tsx                      Layout root: sidebar Nova + topbar + main
│   ├── components/
│   │   ├── NovaSidebar.tsx                Distinto del Sidebar PMS — items Clientes / Partners / Wizard / Audit
│   │   ├── NovaTopbar.tsx                 Tenant switcher chip + impersonation banner
│   │   ├── ImpersonationBanner.tsx        Stripe amber sticky top z-50 cuando onBehalfOf
│   │   ├── TenantSwitcher.tsx             SuccessFactors-style chip + dropdown
│   │   └── PartnerBadge.tsx               Badge tier (Authorized/Silver/Gold/Platinum)
│   ├── pages/
│   │   ├── ClientsLandingPage.tsx         /nova/clientes — landing list filtered by tier
│   │   ├── ClientWorkspacePage.tsx        /nova/clientes/:orgId/* — shell client + sub-routes
│   │   ├── PartnersListPage.tsx           /nova/partners — solo PLATFORM_ADMIN
│   │   ├── PartnerDetailPage.tsx          /nova/partners/:id — members + assignments
│   │   ├── AuditLogPage.tsx               /nova/audit — query universal AuditLog
│   │   ├── wizard/                        /nova/wizard/* — 8-step wizard
│   │   │   ├── WizardShell.tsx
│   │   │   ├── Step1Customer.tsx
│   │   │   ├── Step4Property.tsx
│   │   │   ├── Step7Integrations.tsx
│   │   │   └── Step8Activation.tsx
│   │   └── ChannelsCommandCenterPage.tsx  /nova/clientes/:orgId/channex/* (Channel Manager)
│   ├── hooks/
│   │   ├── useActorTier.ts                derives current tier from JWT
│   │   ├── useAssignedClients.ts          fetch /nova/me/assigned-clients
│   │   ├── useActingOrg.ts                manages X-Acting-Organization-Id header
│   │   └── useImpersonationContext.ts
│   └── api/
│       ├── nova-clients.api.ts
│       ├── nova-partners.api.ts
│       ├── nova-wizard.api.ts
│       └── nova-audit.api.ts
└── pages/
    └── (existing PMS pages — sidebar PMS only, no `/nova/*` routes here)
```

Routing strategy: `App.tsx` agrega `<Route path="/nova/*">` que monta `NovaShell` + sub-routes. Si `actorTier === 'ORG_OWNER' | 'ORG_STAFF'` y URL inicia con `/nova/*` → redirect a `/dashboard` (clientes no entran a Nova).

### 3.2 Wizard "Zenix Activate" — 8 steps con forcing functions

> Plan completo en [docs/vision/13-consultant-setup-wizard.md §2.2](../vision/13-consultant-setup-wizard.md). Este sprint entrega 4 steps funcionales (1, 4, 7, 8) + 4 stubbed (2, 3, 5, 6).

Flow:

1. **Step 1 — Customer Account** (FUNCIONAL este sprint): crea fila `Organization` en status='ONBOARDING' + valida CFDI tax ID via PAC sandbox + asigna Partner (FK). Forcing function: tax ID válido O confirmación explícita "sin facturación" (override audit log).
2. **Step 2 — Brand** (STUBBED): UI básica, no health-check. Skipeable (Brand opcional).
3. **Step 3 — LegalEntity** (STUBBED): UI básica, PAC adapter selection. Skipeable si Step 1 ya validó tax ID.
4. **Step 4 — Property** (FUNCIONAL): crea Property + dispara ping a Channex `GET /properties/{channexPropertyId}` ANTES de aceptar el save. Si Channex devuelve 404 o mismatch de propertyName → block + retry button.
5. **Step 5 — Inventory** (STUBBED): wizard básico room types + rate plans. Sin mapping wizard avanzado en este sprint (eso lo entrega RoomTypesTab/RatePlansTab del Channex Command Center).
6. **Step 6 — Staff** (STUBBED): crea ORG_OWNER user (sin envío de credenciales aún — eso ocurre Step 8).
7. **Step 7 — Integrations** (FUNCIONAL): 4 health-checks obligatorios pass:
   - (a) Channex ping `GET /properties/:id` → 200 + property name match
   - (b) Stripe test charge $1 USD + immediate refund → 200 + `paymentIntent.status='succeeded'`
   - (c) PAC sandbox test stamp con XML mock → 200 + `cfdi.status='STAMPED'`
   - (d) SMTP test email a `noreply@zenix.app` → 200 + delivery confirmation
   - Cualquier fail bloquea avance. Retry botón por check. Audit log entry por intento.
8. **Step 8 — Activación** (FUNCIONAL): genera Activation Report PDF (con Puppeteer pool ADR-0001) + setea `Organization.activatedAt` + envía email setup link single-use 72h al ORG_OWNER con instrucciones 2FA mandatory + password reset forced on first login. Sin click en este step → cliente NUNCA recibe acceso.

### 3.3 Impersonation banner — UI component requerido

> Ver [docs/architecture/NOVA-architecture.md §7](../architecture/NOVA-architecture.md) para mockup + interaction states.

`ImpersonationBanner.tsx`:
- Stripe amber (`bg-amber-100 border-b border-amber-300 text-amber-900`), texto centrado, `position: sticky; top: 0; z-index: 50` por encima de TODO incluyendo modales.
- Texto exacto: `"Actuando como [Nombre cliente] · razón: [reason] · finalizar [link]"`.
- "finalizar [link]" hace `POST /nova/impersonation/end` → revierte X-Acting-Organization-Id → redirect a `/nova/clientes`.
- Triggered cuando: actor en JWT es PARTNER_MEMBER (no PLATFORM_ADMIN ni PARTNER_ADMIN — esos tampoco se ocultan, también ven el banner para reforzar awareness) + header `X-Acting-Organization-Id` está activo + `assignmentScope='FULL'`.
- Cuando consultor ejecuta acción mientras está impersonating: la mutation graba `actorRealId = user.id` + `onBehalfOfId = orgOwner.id` + `reason` (capturado al inicio de la sesión impersonation, REQUIRED).

---

## 4. Modelo de datos nuevo

```prisma
// NOTA: el ChannexAuditLog original queda subsumido por el AuditLog universal
// (Nova foundation §2.2) — ver schema completo en docs/architecture/NOVA-architecture.md §3.5.
// Las acciones Channex (ROOM_TYPE_CREATE, RATE_EDIT, CHANNEL_PAUSE, etc.) escriben
// al AuditLog universal con action='CHANNEX_<verb>' + target=<entity_id> + payload + channexResponse.

// Rate caps per rate plan — D-CHX-CC-9
model RatePlanCap {
  id            String   @id @default(uuid())
  ratePlanId    String   @unique          // Zenix RatePlan FK (v1.0.0 RATES sprint)
  channexId     String                    // Channex rate_plan UUID
  rateCapMin    Decimal? @db.Decimal(10,2)
  rateCapMax    Decimal? @db.Decimal(10,2)
  setBy         String                    // consultor actorId
  setAt         DateTime @default(now())

  @@map("rate_plan_caps")
}

// Channel pause history — D-CHX-CC-7
model ChannexChannelPause {
  id              String    @id @default(uuid())
  propertyId      String
  channexChannelId String
  pausedAt        DateTime  @default(now())
  pausedBy        String    // actorId
  reason          String?
  unpausedAt      DateTime?
  unpausedBy      String?

  @@index([propertyId, pausedAt])
  @@map("channex_channel_pauses")
}

// PropertySettings extensions
model PropertySettings {
  // ... existentes ...
  rateParityThresholdPct  Float?  @default(5)  // %, default 5
  channexCommandCenterEnabled Boolean @default(true)
}
```

---

## 5. Cronograma sugerido (16-20 días-dev)

> Refactor 2026-05-23 Late PM: 12-16d expandido a 16-20d para incluir Nova foundation fase 1 (5-tier RBAC + Partner schema + wizard scaffolding + impersonation banner + AuditLog universal).

| Día | Tarea |
|-----|-------|
| 1 | Migration `nova_foundation_schema`: Partner + PartnerMember + PartnerClientAssignment + PartnerMemberAssignment + AuditLog universal (trigger Postgres bloquea UPDATE/DELETE). Seed ZaharDev como Partner `isInternal=true` + primer PartnerMember PLATFORM_ADMIN user (link al owner). Tests integrity del trigger append-only. |
| 2 | Migration `channex_command_center_schema`: RatePlanCap + ChannexChannelPause + PropertySettings extensions (rateParityThresholdPct + channexCommandCenterEnabled). SystemRole extension legacy + retention. |
| 3 | `AccessControlService` extension con UNION query 4 niveles (PartnerMemberAssignment + UserPropertyRole + LegalEntityUserRole + BrandUserRole). `TenantContextService` extension con `partnerMemberId` + `assignedOrgIds[]` resolution + `NovaActingOrgGuard`. JWT extension con `actorTier` + `partnerMemberId` + `assignedOrgIds[]` (max 20 inline, fallback Redis). RBAC guards (`@Roles(NovaTier.PLATFORM_ADMIN, NovaTier.PARTNER_MEMBER)`). |
| 4 | Gateway extensions Channex CRUD: createRoomType, updateRoomType, deleteRoomType, createRatePlan, updateRatePlan, deleteRatePlan, listChannels, listRoomTypes (refactor del stub). |
| 5 | Backend: RoomTypesController + Service (CRUD pass-through + write-through Zenix DB) + RatePlansController + Service + specs. Todos los actos escriben al AuditLog universal con `action='CHANNEX_<verb>'`. |
| 6 | Backend: RateCalendarController + aggregator (GET matrix) + bulk PATCH dispatch via outbox existente. |
| 7 | Backend: RestrictionsController + ChannelsController (pause/unpause) + MappingsController + Service + health-check + implementación `validateMappings()` real. |
| 8 | Frontend: Nova shell `/nova/*` (NovaShell + NovaSidebar + NovaTopbar) + landing `/nova/clientes` (filtered list by tier) + workspace shell `/nova/clientes/{orgId}/*` + ImpersonationBanner sticky top z-50. Routing redirect para ORG_OWNER/ORG_STAFF que intenta acceder `/nova/*`. |
| 9 | Frontend: Channex Command Center tabs (StatusTab existente preservado + RoomTypesTab + RatePlansTab + RateCalendarTab). RoomTypeFormDialog + RatePlanFormDialog (create + edit). |
| 10 | Frontend: RateCalendarMatrix (virtual scroll horizontal + vertical con `@tanstack/react-virtual`, inline edit, popover). BulkRateEditDialog + RateParityIndicator (color-coded delta). |
| 11 | Frontend: RestrictionsTab + ChannelsTab + MappingsTab + AuditLogTab. Cap form (RatePlanCap edit). |
| 12 | Wizard scaffolding `/nova/wizard` + WizardShell (8-step navegable) + Step 1 (Customer Account: tax ID validation via PAC sandbox, Organization status=ONBOARDING) + Step 4 (Property con Channex ping pre-save). |
| 13 | Wizard Step 5 stubbed (Inventory) + Step 7 (Integrations 4 health-checks: Channex ping + Stripe $1 charge+refund + PAC sandbox stamp + SMTP test email). Retry button per check. AuditLog entries per intento. |
| 14 | Wizard Step 8 (Activación + Activation Report PDF generation con Puppeteer pool ADR-0001 + setea Organization.activatedAt + email setup link single-use 72h al ORG_OWNER + 2FA mandatory + password reset forced first login). |
| 15 | Tests integration: unit (services) + integration (controllers RBAC enforcement) + e2e sandbox (verify round-trip Channex). |
| 16 | RBAC enforcement final: @Roles decorators + frontend tab gating + 403 handling + Nova guards (PLATFORM_ADMIN, PARTNER_MEMBER scope=FULL, ORG_OWNER, ORG_STAFF). Impersonation tests (banner aparece + actorRealId vs onBehalfOfId correctos en AuditLog). |
| 17 | QA cross-feature: edit room type → cascade to rate plans? Borrar rate plan en uso? Pause channel mid-booking? Wizard recovery from Step 7 fail? AuditLog integrity (trigger Postgres) + transparency notif al cliente (email + AppNotification) en cada acceso onBehalfOf. |
| 18 | i18n strings ES/EN para Nova shell + wizard + impersonation banner. Mobile responsive verification (Nova es desktop-first pero el sidebar debe colapsar en mobile). |
| 19 | Buffer: bug fixes encontrados en QA + verification con owner preview. |
| 20 | Pre-merge cleanup: rebase main + verify 305+ tests existing verde + PR description con screenshots + docs final. |

---

## 6. Estudio comparativo extendido — Multi-OTA command center

> Investigación cruzada Capterra (sept 2024–mar 2026), G2 Crowd, HotelTechReport, foros oficiales mews-community/cloudbeds-community, Reddit r/hotels + r/hotelmanagement.

### Mews
- Tab "Distribution" con rate calendar + restrictions per channel.
- Rate-per-channel override ✅ (sólo tier "Operations Manager+" via Rate Groups, no Front Desk).
- CRUD room types desde Mews ❌ — siempre extranet Channex/SiteMinder.
- Quote G2 2025: *"Channel management is good but I still need Channex extranet open for half the setup tasks"*.
- Tier RBAC: Manager edita rates, Admin todo, Receptionist solo lee.

### Cloudbeds — el más ambicioso (target a igualar)
- Channel Manager nativo **propio (myAllotment)**, no Channex/SiteMinder.
- CRUD completo: room types, rate plans, restrictions, channel mappings desde una sola UI.
- Rate-per-channel **con percentage override** ("Booking +5% sobre BAR base") + absoluto.
- **Calendar Bulk Edit** 30 días × 5 channels en una pantalla — pattern a copiar.
- Quote G2 2024 (recurrente): *"This is why we chose Cloudbeds. One tab for everything."*
- Tier RBAC: Owner / Manager / Front Desk — 3 niveles planos (no granularidad consultor).
- ⚠️ Costo: Channel Manager incluido en Pro/Premier ($$$), no en Starter.
- ❌ Sin rate-parity alerts visuales — el operador debe verificar manualmente.

### Opera Cloud
- **Distribution & Sales module (Oracle OXI)** — CRUD existe pero setup requiere consultor Oracle ($15-30k engagement).
- UI v5 legacy, infame: *"feels like 2005"* (HotelTechReport 2024).
- Hotel admin edita rate plans day-to-day; crear room types requiere consultor.
- Enterprise pesado, no aplicable a boutique LATAM target.

### Little Hotelier (SiteMinder)
- **NO tiene CRUD interno** — todas las ediciones redirigen a SiteMinder extranet.
- *"Why do I need two tabs always open?"* — queja recurrente Reddit r/hotels 2024-2025.
- Tier: 1 nivel admin plano.

### RoomRaccoon
- CRUD nativo limitado: edit rates + restrictions desde UI; crear room types también.
- Rate-per-channel con descuento % por canal (no rate absoluto).
- Tier: Admin / Reception, sin granularidad fina.

### Sirvoy
- Channel manager interno parcial: CRUD rates + restrictions; no room types.
- Sin rate-per-channel override (sólo BAR único).

### Tabla resumen

| Capacidad | Mews | Cloudbeds | Opera | Little Hotelier | RR | Sirvoy | **Zenix con CC** |
|-----------|:----:|:---------:|:-----:|:---------------:|:--:|:------:|:----------------:|
| Rate edit per channel desde PMS | ✅ | ✅ | ✅ (clunky) | ❌ (SiteMinder) | ⚠️ % | ❌ | ✅ |
| CRUD room types desde PMS | ❌ | ✅ | ⚠️ consultor | ❌ | ⚠️ | ❌ | ✅ (Tier A) |
| CRUD rate plans desde PMS | ⚠️ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ (Tier A) |
| Channel-mapping desde PMS | ❌ | ✅ | ⚠️ | ❌ | ❌ | ❌ | ✅ (Tier A) |
| **Rate-parity matrix con alerts** | ❌ | ⚠️ matrix sin alerts | ❌ | ❌ | ❌ | ❌ | **✅** |
| **Channel pause sin desconectar** | ❌ | ✅ "Snooze" | ❌ | ❌ | ❌ | ❌ | **✅** |
| **RBAC granular 3-tier consultor / supervisor / receptionist** | ❌ | ⚠️ 3 planos | ✅ | ❌ | ❌ | ❌ | **✅** |
| **Rate caps per Tier (Salesforce Permission Set)** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | **✅** |
| Audit log con quién tocó qué | ⚠️ parcial | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ |
| Mapping wizard health-check pre-save | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

**Conclusión:** Cloudbeds es el mejor del mercado para esta función. Zenix con Command Center supera a Cloudbeds en 4 dimensiones críticas: rate-parity alerts, RBAC granular, rate caps, mapping wizard.

---

## 7. Definition of done

### Channex Command Center

- [ ] 3 migrations aplicadas (nova_foundation_schema + nova_foundation_seed + channex_command_center_schema).
- [ ] Gateway con 10 nuevos métodos (room types CRUD, rate plans CRUD, channels list, restrictions bulk).
- [ ] 7 controllers backend con RBAC enforcement + specs (target ≥85% coverage).
- [ ] Multi-tab `/settings/channex` (o `/nova/clientes/:orgId/channex` cuando se opera desde Nova) con 8 tabs (Status existente + 7 nuevas).
- [ ] RateCalendarMatrix con virtual scroll, inline edit, bulk edit, rate-parity alerts.
- [ ] AuditLogTab visible para PLATFORM_ADMIN + PARTNER_MEMBER + ORG_OWNER (filtros por action, tier, fecha, target).
- [ ] E2E sandbox: crear room type → push CRS → verify aparece en `staging.channex.io`.

### Nova foundation fase 1

- [ ] Shell `/nova/*` funcional dentro `apps/web`: NovaShell + NovaSidebar + NovaTopbar + redirect para ORG_OWNER/ORG_STAFF que intenta acceder.
- [ ] ZaharDev seed user PLATFORM_ADMIN puede login a `/nova/clientes` y ver TODOS los Organizations + Partners.
- [ ] Tenant switcher híbrido funcional: landing `/nova/clientes` lista filtrada por tier + chip persistente top-bar dentro workspace cliente.
- [ ] Wizard `/nova/wizard` puede crear nuevo cliente end-to-end (al menos Step 1 + Step 4 + Step 7 + Step 8 funcionales; Steps 2/3/5/6 stubbed pero navegables).
- [ ] Wizard Step 7 ejecuta 4 health-checks pass (Channex + Stripe + PAC + SMTP) con retry button per check; cualquier fail bloquea Step 8.
- [ ] Wizard Step 8 genera Activation Report PDF + envía email setup link single-use 72h al ORG_OWNER + setea `Organization.activatedAt`.
- [ ] AuditLog universal escribe en cada operación Tier PLATFORM_ADMIN / PARTNER_MEMBER (incluso acciones Channex CRUD); trigger Postgres bloquea UPDATE/DELETE verificado por test.
- [ ] Impersonation banner aparece cuando PARTNER_MEMBER opera onBehalfOf (stripe amber sticky z-50); link "finalizar" funcional.
- [ ] Transparency notif al cliente: en cada acceso/acción onBehalfOf el ORG_OWNER recibe email + AppNotification con `actorRealId` correcto y reason.
- [ ] `NovaActingOrgGuard` rechaza 403 cuando PARTNER_MEMBER no incluye header `X-Acting-Organization-Id` O cuando orgId no está en `assignedOrgIds[]`.

### RBAC enforcement (5-tier)

- [ ] PLATFORM_ADMIN: acceso a TODO (Nova + workspaces cliente + Channex CRUD).
- [ ] PARTNER_ADMIN: acceso Nova landing + members del firm; acceso a workspaces cliente vía impersonation.
- [ ] PARTNER_MEMBER scope=FULL: CRUD Channex pleno dentro de assignedOrgs; 403 fuera del array.
- [ ] ORG_OWNER: rate calendar day-to-day + caps; 403 en Channex CRUD estructural.
- [ ] ORG_STAFF (SUPERVISOR / RECEPTIONIST legacy `SystemRole`): rate calendar matrix supervisor; receptionist solo lee chips post-push.

### Docs + merge

- [ ] CLAUDE.md actualizado con §159-§175 (Nova foundation) + §159-§168 (Channex Command Center decisiones D-CHX-CC-1..10).
- [ ] [docs/architecture/NOVA-architecture.md](../architecture/NOVA-architecture.md) referenciado como ADR permanente.
- [ ] [docs/vision/09-partner-network.md](../vision/09-partner-network.md), [docs/vision/11-multi-tenant-architecture.md](../vision/11-multi-tenant-architecture.md), [docs/vision/13-consultant-setup-wizard.md](../vision/13-consultant-setup-wizard.md) actualizados.
- [ ] [docs/zenix-sales-master.md](../zenix-sales-master.md) sección "Nova — el centro de operaciones del partner" agregada con tabla comparativa + 5 diferenciadores.
- [ ] Preview manual verificado por owner (Nova shell + wizard end-to-end + Channex CRUD + impersonation flow).
- [ ] PR mergeado sin regresiones (305+ tests existentes verde).
