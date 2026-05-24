---
Audiencia: Owner + dev del próximo sprint
Tipo: Plan quirúrgico anti-rechazo Stage 4
Status: Activo — derivado del audit estricto 2026-05-22
Padre: docs/sprints/CHANNEX-OUTBOUND-CERT-plan.md
Última actualización: 2026-05-22
Estimación total: 8-10 semanas calendar (1 dev secuencial)
---

# Plan Quirúrgico — Certificación Channex Stage 4

> **Misión**: cubrir CADA punto del audit estricto. Modo cero-tolerancia: si
> un item está en el audit, está en este plan con file:line + estimación +
> criterio de validación.
>
> **Resultado esperado**: Stage 4 live screenshare en primer intento.

---

## Estructura

3 fases secuenciales + 1 paralela:

| Fase | Items | Duración | Cuándo |
|---|---|---|---|
| **A — Hard blockers** | P0-1, P0-2, P0-3, P1-1, P1-2, P1-3 | 5-6 semanas | Inmediato (depende de RATES sprint) |
| **B — Cert risks** | P1-4, P1-5, P1-6 | 1-2 semanas | Post-fase A |
| **C — Production hardening** | P2-1, P2-2, P2-3, P2-4, P2-5, P2-6, P2-7, P2-8, P2-9, P2-10, P2-12, P2-13, P2-14 | 2-3 semanas | Paralelizable con B |
| **D — Minor cleanup** | P3-* | 0.5 semana | Cualquier momento, junto con cert request |

Total realista: **8-10 semanas calendar** con 1 dev secuencial.

---

## FASE A — Hard cert blockers (semanas 1-6)

### A1. Completar RATES-METRICS-COMPSET-CORE sprint
**Cubre**: P0-1 (codepath rate update no existe)

- **Plan padre**: [docs/sprints/RATES-METRICS-COMPSET-CORE-plan.md](RATES-METRICS-COMPSET-CORE-plan.md)
- **Entregables clave para cert**:
  - `RatePlan` model + migration
  - `RateOverride` + `RateSeason` + `RateRestriction` models
  - `RatesService` con métodos `updateRate`, `batchUpdateRates`, `applyRateSeason`, `applyPromotion`
  - `RestrictionsService` con `setMinStay`, `setStopSell`, `setClosedToArrival`, etc.
  - `Room.channexRoomTypeId` ya existe en schema (Sprint 8 legacy) — NO toca
  - `RatePlan.channexRatePlanId String?` field nuevo
  - UI `/settings/rates` con grid calendar + bulk update
- **Estimado**: 20-23 días-dev (per plan original)
- **Criterio de validación**:
  - [ ] Manager puede cambiar precio en `/settings/rates` UI
  - [ ] Cambio crea entry en `RateOverride` table
  - [ ] `RatesService.batchUpdateRates([{...3 rates...}])` retorna sin error
- **Owner**: Sprint dedicado siguiente

---

### A2. Wirear emisión events RatesService → ChannexOutbound
**Cubre**: P0-1 (rate update no llega a Channex)

- **Doc handoff**: [docs/sprints/CHANNEX-OUTBOUND-CERT-handoff-to-rates.md](CHANNEX-OUTBOUND-CERT-handoff-to-rates.md)
- **Archivos a modificar** (post-RATES sprint):
  - `apps/api/src/pms/rates/rates.service.ts`:
    - Inyectar `EventEmitter2`
    - En `updateRate` post-commit: `this.events.emit(CHANNEX_RESTRICTION_UPDATED, event)`
    - En `batchUpdateRates`: agrupar por `propertyId`, emit 1 event por property con TODAS las entries
  - `apps/api/src/pms/restrictions/restrictions.service.ts` (cuando exista):
    - Mismo patrón para min_stay, stop_sell, CTA, CTD
- **Estimado**: 0.5-1 día-dev
- **Criterio de validación**:
  - [ ] Test integration: llamar `RatesService.updateRate(...)` → row `ChannexOutboundQueue` kind=`RATES_RESTRICTIONS` aparece
  - [ ] Worker drena el row → `POST /restrictions` a sandbox → HTTP 200
  - [ ] `channex.cert-tests.integration.spec.ts` Tests 2-8 ahora corren (no `describe.skip`)
- **Dependencia**: A1 debe estar mergeado

---

### A3. Sandbox property seed productivo
**Cubre**: P0-2 (sandbox vacía), P0-3 (env vars setup)

- **Archivos a crear**:
  - `apps/api/prisma/seed-channex-sandbox.ts` — script idempotente
  - `docs/ops/channex-sandbox-seed.md` ya existe — extender con automation
- **Acción manual en Channex sandbox extranet**:
  - Crear 2 room types: "Twin Room" + "Double Room" (max_occ 2 c/u)
  - Crear 4 rate plans: Twin>BAR ($100), Twin>BB ($120), Double>BAR ($100), Double>BB ($120)
  - Anotar UUIDs → setear en `apps/api/.env`:
    ```
    CHANNEX_SANDBOX_PROPERTY_ID=ef0bdedf-...
    CHANNEX_SANDBOX_ROOM_TYPE_ID=<twin-uuid>
    CHANNEX_SANDBOX_RATE_PLAN_ID=<twin-bar-uuid>
    ```
- **Acción Zenix DB** (seed script):
  - Crear `Room` rows con `channexRoomTypeId` mapeado
  - Crear `RatePlan` rows (post-A1) con `channexRatePlanId` mapeado
  - Generar 20 reservas test distribuidas en próximos 60 días con `bookingLeadDays` varied
  - Variación rates: weekday base, fri +20%, sat +30%, sun +10%
  - Min stay 2 noches en weekends, 3 noches en holidays
  - 1 stop sell en fecha de mantenimiento programado
- **Estimado**: 0.5-1 día-dev
- **Criterio de validación**:
  - [ ] `npx jest channex.cert-tests.integration --runInBand` corre 14/14 tests verde (no skips)
  - [ ] `gateway.listBookingRevisionsFeed()` retorna data variada
  - [ ] Channex sandbox extranet muestra rates distintos per day-of-week
- **Dependencia**: A1 (RatePlan model existe)

---

### A4. Cerrar fail-open de `ChannexAuthGuard`
**Cubre**: P1-1 (vector inyección)

- **Archivo**: `apps/api/src/integrations/channex/inbound/channex-auth.guard.ts:65-73`
- **Cambio**: agregar `PropertySettings.channexWebhookSecretRequired: Boolean @default(true)` field
  - Default true en producción
  - Si secret null Y required=true → throw `UnauthorizedException`
  - Si secret null Y required=false → fail-open con WARN (solo dev/sandbox)
- **Migration**: `2026_channex_auth_strict_default`
- **Estimado**: 0.5 día-dev
- **Criterio de validación**:
  - [ ] Property sin secret en producción → POST webhook responde 401
  - [ ] Property sandbox con required=false → fail-open con WARN log

---

### A5. UI config Channex en SettingsPage
**Cubre**: P1-2 (no UI para webhookSecret)

- **Archivo nuevo**: `apps/web/src/pages/settings/ChannexConfigSection.tsx`
- **Backend endpoints nuevos**:
  - `GET /v1/settings/channex/property` — retorna config actual masked
  - `PATCH /v1/settings/channex/property` — actualiza channexPropertyId
  - `POST /v1/settings/channex/rotate-secret` — genera nuevo secret aleatorio + retorna 1× (no se vuelve a mostrar)
  - `PATCH /v1/settings/channex/rooms/:roomId/mapping` — actualiza Room.channexRoomTypeId
- **UI sections** (en `/settings`, tab "Channex"):
  - Property mapping: input channexPropertyId + status "Connected/Disconnected"
  - Secret rotation: botón "Rotate webhook secret" — copy-once display
  - Room mappings: tabla rooms con dropdown channexRoomTypeId (lookup against `gateway.listRoomTypes`)
  - RatePlan mappings (post-A1): igual pattern
  - Health check: ping endpoint que verifica `gateway.listProperties()` HTTP 200
- **Estimado**: 2-3 días-dev
- **Criterio de validación**:
  - [ ] SUPERVISOR puede rotate secret sin SQL
  - [ ] SUPERVISOR puede mapear Room ↔ channex room_type via dropdown
  - [ ] Mostrar warning si mapping inconsistente (Room A1 mapped to type X but type X doesn't exist en Channex)

---

### A6. Feed scheduler ajuste 30 → 15 min
**Cubre**: P1-3 (fuera del rango docs Channex)

- **Archivo**: `apps/api/src/integrations/channex/inbound/channex-feed.scheduler.ts:51`
- **Cambio**: `@Cron(CronExpression.EVERY_30_MINUTES)` → `@Cron(CronExpression.EVERY_15_MINUTES)`
- **Justificación inline**: comment "doc oficial 2024-12 recommends 15-20 min"
- **Estimado**: 5 minutos
- **Criterio de validación**:
  - [ ] Cron corre cada 15 min en producción (verificar logs)
  - [ ] Feed empty calls cost ~1 HTTP/15min = negligible

---

## FASE B — Cert risks (semanas 6-7)

### B1. Multi-room bookings auto-process
**Cubre**: P1-4 (5-15% bookings OTA → manual)

- **Archivo**: `apps/api/src/integrations/channex/inbound/handlers/booking-new.handler.ts:131`
- **Cambio**: en vez de routear a `MULTI_ROOM_BOOKING` conflict:
  - Detectar `revision.rooms.length > 1`
  - Iterar cada `room`:
    - Resolve `Room.channexRoomTypeId === room.room_type_id`
    - Check availability per room
    - Crear `GuestStay` + `StayJourney` + `StaySegment` por room
  - Linkar todas las stays con el mismo `bookingRef` MX-OTA-PROPCODE-YYMM-NNNN-A/B/C
  - O usar nuevo field `groupBookingId: String?` para agrupar
- **Edge cases**:
  - Si ALGUNAS rooms están disponibles y otras no → conflict parcial: persist disponibles, mark las que no como `PARTIAL_MULTI_ROOM_CONFLICT`
  - Si 0 disponibles → mismo behavior actual (`AVAILABILITY_OVERLAP`)
- **Estimado**: 3-4 días-dev
- **Criterio de validación**:
  - [ ] Booking.com test "family booking 2 rooms" → 2 stays creadas en Zenix
  - [ ] Calendar muestra ambos stays linkados
  - [ ] Cancel del booking parent cancela ambos stays (cascade via groupBookingId)

---

### B2. organizationId null safety
**Cubre**: P1-5 (booking lost en DEAD_LETTER)

- **Acción 1**: backfill script — todos los `Property` con `organizationId=null` reciben asignación válida via Activate wizard
- **Acción 2**: agregar AppNotif crítica cuando un Channex DEAD_LETTER es causado por `organizationId null` (es señal de bug data, no de Channex down)
- **Archivo**: `apps/api/src/integrations/channex/outbound/channex-outbound-notif.service.ts`
- **Cambio**: distinguir error reason → si `lastError` contains "NULL organizationId" → priority URGENT (en vez de HIGH) + body especial: "Data integrity issue — Property X has null org. Contact ops."
- **Estimado**: 1 día-dev
- **Criterio de validación**:
  - [ ] Test: simular org null → DEAD_LETTER con metadata reason="DATA_INTEGRITY"
  - [ ] AppNotif body mentions "data integrity" explicitly

---

### B3. CANCEL_AT_OTA: outbound primero, local después
**Cubre**: P1-6 (double-booking real si outbound falla)

- **Archivo**: `apps/api/src/integrations/channex/inbound/channex-conflicts.service.ts:198-225`
- **Cambio**: invertir orden + transaction:
  ```typescript
  if (propagateToChannex && stay.channexBookingId) {
    try {
      await this.gateway.cancelBookingAtChannex(stay.channexBookingId, reason)
      // Solo si Channex acked → commit local
    } catch (err) {
      // Failure → NO commit local, throw to controller
      throw new HttpException(
        'Channex rejected the cancellation. No local change committed. Retry or cancel via OTA extranet manually.',
        503,
      )
    }
  }
  // ... local cancel writes ...
  ```
- **Trade-off**: si Channex está lento, supervisor espera +500ms-2s en el modal
- **Aceptable**: supervisor está revisando UN conflict, no es ruta hot. Mejor que double-booking.
- **Estimado**: 1-2 días-dev (con tests update)
- **Criterio de validación**:
  - [ ] Test: simular Channex 500 → local stay NO se marca cancelled, supervisor ve error
  - [ ] Test: happy path → ambos commited

---

## FASE C — Production hardening (semanas 5-8, paralelizable)

### C1. TokenBucket Redis-backed
**Cubre**: P2-1 (in-memory multi-pod issue)

- **Pre-req**: Redis deployment (parte de fase 2 infra §73-§75)
- **Archivo**: `apps/api/src/integrations/channex/outbound/channex-token-bucket.service.ts`
- **Cambio**: swap `Map<string, BucketState>` por Redis-backed sliding window via Lua script
- **Library**: `ioredis` + Lua script atomicity
- **Estimado**: 3-4 días-dev (incluye Redis setup)
- **Criterio de validación**:
  - [ ] Test con 2 pods simultaneous → bucket counts compartido correctamente
  - [ ] Survive 1 pod restart → bucket state preservado
- **Decisión owner**: si v1.0.0 sigue single-pod, **podemos diferir esto a v1.0.5**

---

### C2. `availability_modify` webhook handler
**Cubre**: P2-2 (webhook ignorado)

- **Archivo**: `apps/api/src/integrations/channex/inbound/channex-revision-puller.service.ts:80-100`
- **Cambio**: agregar case en switch:
  ```typescript
  case 'availability_modify':
    // Confirmation de nuestro propio push. Log + ack para drain queue.
    this.logger.debug(`[Channex puller] availability_modify ack for ${revision.id}`)
    handlerResultKind = 'availability_confirmed'
    break
  ```
- **Estimado**: 0.5 día-dev
- **Criterio de validación**:
  - [ ] Webhook con event=availability_modify → outbox SUCCEEDED + log entry

---

### C3. FullSyncOrchestrator transaction safety
**Cubre**: P2-3 (crash mid-process → double outbox row)

- **Archivo**: `apps/api/src/integrations/channex/outbound/channex-full-sync.orchestrator.ts:122-155`
- **Cambio**: envolver `runForProperty` en `$transaction`:
  ```typescript
  await this.prisma.$transaction(async (tx) => {
    // 1. mark channexLastFullSyncAt PRIMERO (claim slot)
    await tx.propertySettings.update({...})
    // 2. luego enqueue
    await this.builder.enqueue({...})
  })
  ```
- Si crashea entre 1 y 2 → al recovery, lastFullSyncAt ya marcado, cron skip TOO_RECENT, enqueue se pierde
  - Mitigación: si lastFullSyncAt > 23h ago AND no outbox row reciente con `kind=AVAILABILITY` → re-enqueue manual
  - O: scheduler de health check detecta esto y dispara
- **Estimado**: 1 día-dev
- **Criterio de validación**:
  - [ ] Test: simular crash post-mark, pre-enqueue → cron sig retick re-enqueue
  - [ ] Idempotency: 2 ticks consecutivos = solo 1 enqueue

---

### C4. ChannexWebhookLog purge cron
**Cubre**: P2-4 (unbounded retention)

- **Archivo nuevo**: `apps/api/src/integrations/channex/inbound/channex-purge.scheduler.ts`
- **Cron**: `@Cron(CronExpression.EVERY_DAY_AT_4AM)`
- **Política**:
  - DELETE `channex_webhook_logs` WHERE `receivedAt < NOW() - 90 days` AND `result='succeeded'`
  - PRESERVE: rows con `signatureValid=false` o `result='conflict'` (compliance permanente, eviden de chargeback)
  - Patrón análogo a `NotificationPurgeScheduler` §101
- **Estimado**: 0.5 día-dev
- **Criterio de validación**:
  - [ ] Test: 91 rows insertados con `receivedAt` históricos → cron borra los success
  - [ ] Test: rows con conflict result preservados

---

### C5. Guided supervisor UI post-checkin modify/cancel
**Cubre**: P2-5, P2-6 (decisión vaga)

- **Archivos**:
  - `apps/web/src/pages/ChannexConflictsPage.tsx` — extender card con sub-acciones específicas
  - Backend: `ChannexConflictsService.resolve` agregar 3 nuevas actions:
    - `COMP_STAY` — registrar como cortesía (totalAmount=0 + audit) + cancel local
    - `EARLY_CHECKOUT` — disparar early-checkout flow + refund calculation
    - `DISPUTE_OTA` — log "supervisor escalates to OTA" + AppNotif al manager
- **UI**: cuando conflict reason is `CANCEL_GUEST_ALREADY_CHECKED_IN`, mostrar 3 botones:
  - "Comp la estadía" (con razón obligatoria)
  - "Early checkout" (refund calc)
  - "Disputar con OTA" (link a OTA extranet + record action)
- **Estimado**: 2-3 días-dev
- **Criterio de validación**:
  - [ ] Cada acción graba un `GuestStayLog` event específico
  - [ ] El stay queda en estado coherente (no half-applied)

---

### C6. Calendar conflict overlap visual fix
**Cubre**: P2-7 (2 blocks en mismo room confuso)

- **Archivo**: `apps/web/src/modules/rooms/components/timeline/BookingBlock.tsx`
- **Cambio**: cuando `channexConflict=true`:
  - Render con `z-index` más bajo que el block normal
  - Render con `opacity: 0.4` + diagonal stripes pattern
  - Click → modal con "Esta reserva está en conflicto. Resuelve en /channex/conflicts."
- **Alternativa**: render conflict stays en una "fila ghost" superior del row (visual separation)
- **Estimado**: 1 día-dev
- **Criterio de validación**:
  - [ ] Visual diff: 2 blocks en mismo room NO se confunden — el conflict es claramente "ghost"
  - [ ] Click en conflict → modal helpful

---

### C7. Channel mapping integrity check
**Cubre**: P2-8 (typos silenciosos)

- **Archivo**: `apps/api/src/integrations/channex/outbound/channex-admin.service.ts` — extender con `validateMappings(propertyId)`
- **Lógica**:
  - Query `gateway.listRoomTypes(propertyId)` (nuevo método)
  - Cross-check con `Room.channexRoomTypeId` rows en DB
  - Retornar `MappingIssue[]`: typed errors per Room
- **UI**: en `/settings/channex` admin page, banner amber si issues > 0
- **Estimado**: 1 día-dev
- **Criterio de validación**:
  - [ ] Test: setear Room con channexRoomTypeId='typo-uuid' → admin page muestra warning
  - [ ] Healthcheck endpoint reporta integrity status

---

### C8. Hostel dorm full-sync correct counts ★ CRÍTICO para Monica Tulum
**Cubre**: P2-9 (revenue lost en dorms)

- **Archivo**: `apps/api/src/integrations/channex/outbound/channex-full-sync.orchestrator.ts:294-374` (`buildAvailabilityEntries`)
- **Cambio**: detectar `Room.category === 'SHARED'`:
  - Para SHARED rooms, contar `Unit` rows (camas), no rooms
  - Total per channex_room_type_id = SUM(units per room en grupo)
  - Occupied count per date = active beds (StaySegment.unitId si existe)
- **Reusar lógica**: `computeAndPushInventory` ya lo hace correctamente — extraer función pura compartida
- **Estimado**: 1-2 días-dev
- **Criterio de validación**:
  - [ ] Hotel Monica Tulum sandbox: dorm 4 camas → availability=4 en full-sync (NO 1)
  - [ ] Después de 1 reserva en cama 2 → availability=3

---

### C9. Guarantee virtual card persistence
**Cubre**: P2-10 (chargeback defense impaired)

- **Schema migration**: `GuestStay.channexGuaranteeMeta: Json?`
- **Archivo**: `apps/api/src/integrations/channex/inbound/channex-booking.mapper.ts` — agregar al mapping:
  ```typescript
  channexGuaranteeMeta: revision.guarantee ? {
    cardType: revision.guarantee.card_type,
    masked: revision.guarantee.card_number,  // ya viene enmascarada por Channex
    expirationDate: revision.guarantee.expiration_date,
    isVirtual: revision.guarantee.is_virtual,
    meta: revision.guarantee.meta ?? null,
  } : null
  ```
- **Frontend**: en BookingDetailSheet, si guarantee.isVirtual, mostrar "Virtual Card · Active days [X-Y]"
- **Estimado**: 1 día-dev
- **Criterio de validación**:
  - [ ] Booking con virtual card → row guarda meta enmascarada
  - [ ] PCI audit: no PAN clear-text en logs / DB

---

### C10. `channel_activate` / `channel_deactivate` webhook handlers
**Cubre**: P2-12 (ignored events)

- **Archivo**: `apps/api/src/integrations/channex/inbound/channex-revision-puller.service.ts`
- **Cambio**: agregar casos no-revision pero log-trackeable:
  - `channel_activate` → AppNotif INFORMATIONAL al SUPERVISOR
  - `channel_deactivate` → AppNotif ACTION_REQUIRED al SUPERVISOR (canal desconectado = revenue impact)
- **Estimado**: 0.5 día-dev
- **Criterio de validación**:
  - [ ] Webhook channel_deactivate → SUPERVISOR ve notif HIGH

---

### C11. Metrics export (Prometheus / Datadog)
**Cubre**: P2-13 (no production observability)

- **Library**: `@willsoto/nestjs-prometheus`
- **Métricas a exponer**:
  - `channex_webhook_received_total{event_type, signature_valid}` counter
  - `channex_outbox_processing_seconds` histogram
  - `channex_outbound_queue_size{kind, status}` gauge
  - `channex_token_bucket_remaining{property, kind}` gauge
  - `channex_dead_letter_total{kind}` counter
- **Endpoint**: `GET /metrics` exposed
- **Estimado**: 2-3 días-dev (incluye deployment config)
- **Criterio de validación**:
  - [ ] curl `/metrics` retorna Prometheus format
  - [ ] Grafana dashboard básico funcional
- **Decisión**: **puede diferir** post-Stage 4 si boutique reviewer no insiste

---

### C12. Test 12 demo en codepath productivo
**Cubre**: P2-14 (solo unit test del bucket)

- **Pre-req**: A1 + A2 (RatesService existe)
- **Test integration nuevo**: `channex-rate-burst.integration.spec.ts`
  - Llamar `RatesService.updateRate` ×30 en 1 minuto via `runInBand`
  - Verificar que 10 son SUCCEEDED en queue + 20 quedan PENDING con `nextAttemptAt > now`
- **Estimado**: 0.5 día-dev (depende A1+A2)
- **Criterio de validación**:
  - [ ] Stage 4 reviewer puede ver el throttle en vivo

---

## FASE D — Minor cleanup (P3)

### D1. Verificar ack 422 contra docs Channex actuales
**Archivo**: `channex.gateway.ts:368`
**Acción**: contactar soporte Channex o test empírico con sandbox para confirmar si 422 ocurre en ack idempotente
**Estimado**: 1h investigación

### D2. Localizar "Guest (unnamed)"
**Archivo**: `channex-booking.mapper.ts:181`
**Cambio**: `"Guest (unnamed)"` → `"Huésped sin nombre"`
**Estimado**: 5 minutos

### D3. HYBRID_DEPOSIT enum cleanup
**Decisión**: o remover el valor del enum (si nunca lo usaremos en v1.0.x) o documentar/implementar el path
**Estimado**: 30 min - 2h

### D4. Webhook controller 200 semantics comment
**Archivo**: `channex-webhook.controller.ts`
**Cambio**: comment explícito sobre por qué siempre respondemos 200 después de auth ok (Channex queue mgmt)
**Estimado**: 5 min

---

## Calendario integrado

```
Semana   │ Fase A (cert blockers)  │ Fase B (risks)    │ Fase C (hardening)
─────────┼─────────────────────────┼───────────────────┼──────────────────────
1-4      │ A1 RATES sprint         │                   │ C2 availability_modify
         │ (20-23d total)          │                   │ C4 webhook purge
         │                         │                   │ C9 virtual card persist
         │                         │                   │ C10 channel_activate
5        │ A1 cierre + A2 wiring   │                   │ C8 hostel dorm fix ★
         │ A3 sandbox seed         │                   │ C7 channel mapping check
6        │ A4 auth strict          │ B1 multi-room     │ C5 guided supervisor UI
         │ A5 settings UI          │ B2 org null safety│
         │ A6 feed 15min           │ B3 CANCEL_AT_OTA  │
7        │                         │ B1, B2, B3 cierre │ C6 calendar conflict viz
         │                         │                   │ C3 fullSync tx safety
8        │ D1-D4 minor cleanup     │                   │ C11 metrics (opcional)
         │                         │                   │ C12 Test 12 integration
9        │ Stage 4 cert request    │                   │
         │ Live screenshare        │                   │
```

**Total realista**: 8-9 semanas calendar (1 dev).

---

## Definición de "Stage 4 ready"

Checklist final antes de pedir live screenshare:

### Cert tests
- [ ] 14/14 cert integration tests verde (no skips)
- [ ] Sandbox property tiene 2 room types + 4 rate plans + 20+ reservas test
- [ ] CHANNEX_SANDBOX_* env vars todas seteadas
- [ ] Grep tests AP-1..AP-2.8 todos pasan

### UI demo paths verified
- [ ] Cambiar rate en `/settings/rates` → outbox row aparece → sandbox HTTP 200
- [ ] Set min_stay en `/settings/rates` → outbox row + sandbox HTTP 200
- [ ] Crear walk-in reserva → availability push event → sandbox HTTP 200
- [ ] OTA test booking arrives → calendar refresca en <5s
- [ ] OTA test cancel → calendar block desaparece <5s
- [ ] Manual full-sync trigger → 2 HTTP calls, ambos 200

### Anti-patrones verified
- [ ] AP-5 grep: 0 UUIDs hardcoded en `src/` non-test
- [ ] AP-2.2 grep: 0 direct `gateway.pushX` desde save handlers
- [ ] AP-2.6 grep: 0 references a `/v1/bookings` endpoint (legacy)
- [ ] AP-3: full sync 24h guard + 03-05 local window funcionando
- [ ] AP-4: gateway methods toman arrays (TypeScript enforced)

### Observability
- [ ] `/settings/channex` admin page funcional
- [ ] DEAD_LETTER → AppNotif aparece en bell badge
- [ ] Mobile push para SUPERVISOR llega vía Expo
- [ ] Conflict review queue (`/channex/conflicts`) lista los pendientes

### Documents
- [ ] `docs/ops/channex-test-14-declarations.md` reflejando feature set REAL post-cleanup
- [ ] `docs/ops/channex-cert-stage4-walkthrough.md` script verificado paso a paso

### Production readiness
- [ ] `channexWebhookSecret` config obligatorio en producción (fail-closed)
- [ ] ChannexWebhookLog purge cron activo
- [ ] Hostel dorm counts correctos en full-sync
- [ ] Multi-room bookings auto-process (no 100% conflict)
- [ ] CANCEL_AT_OTA Channex-first ordering

---

## Riesgos del plan

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| RATES sprint se atrasa | Media | Crítico | Sprint dedicado siguiente, owner asigna prioridad |
| Channex sandbox limita full-sync 500d | Baja | Medio | Documentar 100d como fallback en test, demostrar scaling |
| Multi-room implementation introduce bugs en flow existente | Media | Alto | Feature flag + parallel testing periodo |
| Redis deployment cost / complexity | Media | Bajo | Diferir C1 a v1.0.5 si single-pod |
| Reviewer pide CRS booking push (P2-11) | Baja | Crítico | Out-of-scope cert, derivar a BOOKING-ENGINE sprint roadmap |
| Manager piloto cambia mind sobre alguna decisión | Baja | Medio | Review checkpoints semanales |

---

## Lo que esto NO cubre (out-of-scope cert)

- Booking CRS push (PMS → OTA bookings) — sprint BOOKING-ENGINE v1.2.x
- Pricelabs / dynamic pricing — third-party v1.1+
- Airbnb-specific features (Listing Promotions, CoHost Payout) — v1.1+
- Brand-level multi-property sync — v1.0.5 multi-tenant
- Webhook log stats API (Channex 2026-04-13) — nice-to-have post-cert

---

## FASE E — UI/UX functional gaps (post audit relación 2026-05-22)

> Audit Channex × Zenix UI/UX detectó 18 gaps donde la **infraestructura
> backend existe pero falta UX operacional** para completar el caso de uso.
> 3 son cert blockers reales (operacionalmente — un piloto fallaría sin
> ellos aunque el reviewer técnico apruebe la cert).

### E1. **Extensión OTA stay → push CRS a Channex** 🔴 P0
**Audit ref**: GAP #9
**Caso de uso**: Guest OTA llamó al hotel y pidió quedarse 2 noches más. Recepcionista usa `extendNewRoom`/`extendSameRoom` desde BookingDetailSheet. **Channex NO se entera** → OTA revende la habitación → overbooking real.

**Lo que falta**:
- Gateway nuevo: `ChannexGateway.updateBookingDates(bookingId, newCheckOut, newRate?)` que llame `PUT /api/v1/bookings/:id` con nuevo departure_date + rates per night
- Hook en `StayJourneyService.extendSameRoom`, `extendNewRoom`: si parent stay tiene `channexBookingId` → push update
- UI: modal de confirmación de extensión muestra warning "Esta reserva vino de Booking.com — Channex será notificado del cambio"
- Audit log entry `CHANNEX_EXTENSION_PUSHED` con response status
- Si Channex push falla (5xx/4xx) → outbox row + retry (mismo patrón que CANCEL_AT_OTA outbound-first B3)

**Estimado**: 2 días-dev
**Criterio validación**: extender reserva Booking.com test → Channex sandbox refleja nueva departure_date

---

### E2. **Cancel manual OTA stay → push CRS** 🔴 P0
**Audit ref**: GAP #11
**Caso de uso**: Recepcionista cancela desde BookingDetailSheet (NO desde `/channex/conflicts`) una reserva con channexBookingId. **Channex NO se entera** → OTA factura comisión + reseña 1★ porque guest no fue notificado.

**Lo que falta**:
- En `GuestStaysService.cancelStay`: si `stay.channexBookingId` exists → preguntar "¿Notificar Channex/OTA?" con default YES
- Reusar `gateway.cancelBookingAtChannex` (ya existe del CANCEL_AT_OTA flow)
- Mismo ordering B3: Channex push PRIMERO, local cancel DESPUÉS
- UI: CancelReservationDialog muestra checkbox "Notificar a [OTA name]" preselected (con warning si paymentModel=OTA_COLLECT)
- Audit log

**Estimado**: 1 día-dev

---

### E3. **Multi-room family booking auto-process** 🔴 P0
**Audit ref**: GAP #8 = B1 surgical plan
**Caso de uso**: Booking.com permite reservar 2-3 habitaciones bajo el mismo customer. Hoy Zenix marca como `MULTI_ROOM_BOOKING` conflict → supervisor debe crear las habs adicionales manualmente.

**Lo que falta**:
- BookingNewHandler: detectar `revision.rooms.length > 1` → iterar y crear N stays linkadas
- Schema: `GuestStay.groupBookingId String?` field para agrupar
- Calendar: mostrar visual de grupo (mismo color stripe + tooltip "Family booking de 3 habs")
- BookingDetailSheet: mostrar "Stays vinculadas: Hab A1, A2, A3"
- Cancel propagation: cancel del parent cancela todas las stays del grupo

**Estimado**: 3-4 días-dev (incluye journey wiring per room)

---

### E4. UI guiada "OTA pidió extender post-checkin" 🟠 P1
**Audit ref**: GAP #1
**Caso de uso**: BookingModifyHandler detecta date change en guest checked-in → notif "DATE_CHANGE_POST_CHECKIN". Supervisor debe decidir manualmente.

**Lo que falta**:
- Pantalla en `/channex/conflicts` con sub-action "Honor extension" (crea segment) o "Reject" (mantener fechas + log)
- Diff visual: dates previas → propuestas
- Rate comparison

**Estimado**: 1-2 días-dev

---

### E5. Modification history en BookingDetailSheet 🟠 P1
**Audit ref**: GAP #2
**Caso de uso**: OTA modifica una reserva (cambio de pax, dates, contact). Hoy supervisor NO ve qué cambió.

**Lo que falta**:
- Nuevo tab "Historial" en BookingDetailSheet
- Query `GuestStayLog` con event in ['MODIFIED', 'CHANNEX_MODIFIED']
- Diff visual: campo X anterior → nuevo
- Filtro: solo OTA changes

**Estimado**: 1 día-dev

---

### E6. UI guiada "OTA canceló guest in-house" 🟠 P1
**Audit ref**: GAP #3 = C5 surgical plan
**Caso de uso**: OTA cancela reserva con guest ya checked-in. Supervisor decide: comp / early-checkout / disputar.

**Lo que falta**:
- 3 botones explícitos en `/channex/conflicts` para conflict reason `CANCEL_GUEST_ALREADY_CHECKED_IN`:
  - "Comp la estadía" (razón obligatoria + audit)
  - "Early checkout" (refund calculation)
  - "Disputar con OTA" (link extranet + log evidence)
- Cada acción crea `GuestStayLog` event específico

**Estimado**: 2-3 días-dev

---

### E7. Channel status panel 🟠 P1
**Audit ref**: GAP #6
**Caso de uso**: Supervisor necesita saber qué OTAs están conectados sin esperar el deactivate notif.

**Lo que falta**:
- Sección "Canales conectados" en `/settings/channex` admin page
- Lista de OTAs con badge "Connected" / "Disconnected" + last activity timestamp
- History de activate/deactivate events

**Estimado**: 1 día-dev

---

### E8. Refund flow para OTA cancels 🟠 P1
**Audit ref**: GAP #4
**Caso de uso**: OTA cancela reserva con amountPaid > 0. `requiresFiscalReview=true` se setea pero no hay UI para procesar el refund.

**Lo que falta**:
- v1.0.1 PAY-CORE territory — defer
- UI placeholder en /channex/conflicts: "Refund pendiente — gestionar en v1.0.1 PAY-CORE"

**Estimado**: 2 días-dev (v1.0.1)

---

### E9. Room move pushe a Channex 🟠 P1
**Audit ref**: GAP #10
**Caso de uso**: Recepcionista mueve guest OTA de "Standard" a "Deluxe Suite" (cambia room_type_id). Channex no se entera.

**Lo que falta**:
- Detectar cambio de channexRoomTypeId en MoveRoom flow
- Push availability update para AMBOS room types (libera el anterior, ocupa el nuevo)
- Push booking dates update con nuevo room_type_id

**Estimado**: 1 día-dev

---

### E10. No-show charge Booking.com virtual card 🟠 P1
**Audit ref**: GAP #12
**Caso de uso**: Guest no se presenta. Booking.com tiene policy que permite charge contra virtual card. Zenix marca no-show pero no notifica ni cobra.

**Lo que falta**:
- ChannexGateway.markBookingNoShowAtChannex(bookingId)
- Charge flow contra channexGuaranteeMeta.meta.virtual_card_*
- AppNotif "Booking.com no-show charge processed"

**Estimado**: 2 días-dev

---

### E11. Folio segmentation OTA-paid vs direct-extra 🟠 P1
**Audit ref**: GAP #17
**Caso de uso**: Guest OTA extiende 2 noches. Folio debe distinguir noches OTA (PAID) vs noches direct (PENDING).

**Lo que falta**:
- StaySegment.paymentSource: 'OTA' | 'DIRECT'
- Folio UI agrupa por source
- Checkout flow cobra solo segments DIRECT

**Estimado**: 1-2 días-dev (v1.0.1 PAY-CORE)

---

### E12. Virtual card incidentals charge 🟠 P1
**Audit ref**: GAP #16
**Caso de uso**: OTA Genius virtual card con $200 disponibles para incidentals. Guest consume minibar. Hotel debe cobrar contra esa card.

**Lo que falta**:
- UI muestra "Virtual card · activa X-Y · balance available $N" en BookingDetailSheet
- Charge flow integrado con `channexGuaranteeMeta.meta.virtual_card_current_balance`
- Audit del charge

**Estimado**: 2-3 días-dev (v1.0.1+ PAY-CORE)

---

### E13. OTA payout reconciliation 🟠 P1
**Audit ref**: GAP #15
**Caso de uso**: Booking.com paga al hotel mensualmente vía bank transfer. Zenix debe matchear payout report con reservas.

**Lo que falta**:
- Importar CSV de Booking.com payouts
- Match per booking_id
- Discrepancy report

**Estimado**: 3-4 días-dev (v1.0.1+)

---

### E14. Historial de outbound pushes 🟡 P2
**Audit ref**: GAP #5
**Caso de uso**: Supervisor curioso de qué pushea Channex de su lado.

**Lo que falta**:
- Tab "Outbound history" en /settings/channex
- Query ChannexOutboundQueue ordenado por createdAt desc
- Filter por status

**Estimado**: 1 día-dev

---

### Resumen Fase E

| Sub-fase | Items | Severidad | Días total |
|---|---|---|---|
| **E1-E3** | Push CRS extension + cancel + multi-room | 🔴 P0 cert blockers ops | **6-7d** |
| **E4-E7** | UX guiada operacional | 🟠 P1 | 5-7d |
| **E8-E13** | Financial flows OTA | 🟠 P1 (v1.0.1 PAY-CORE) | 12-15d |
| **E14** | Outbound history | 🟡 P2 | 1d |

**Pre-cert Stage 4 obligatorio**: E1 + E2 + E3 + E5 (modification history) + E7 (channel status) = **8-9 días-dev adicionales** al surgical plan original.

**Post-cert v1.0.1+**: E8-E13 financial flows.

### Calendario integrado revisado

```
Semana   │ Plan original         │ Fase E nueva                     │ Total
─────────┼───────────────────────┼─────────────────────────────────┼──────
1-5      │ A1 RATES sprint       │                                  │
6        │ A2-A6 + Fase C        │                                  │
7        │ B1, B2, B3            │ E3 multi-room (B1 alias)        │
8        │ Fase C continúa       │ E1 extension push                │
         │                       │ E2 cancel push                   │
9        │ Fase D + Stage 4 req │ E5 modification history          │
         │                       │ E7 channel status panel          │
10       │                       │ E4 + E6 UX guiada operacional   │
─────────┼───────────────────────┼─────────────────────────────────┼──────
         │ Stage 4 cert request                                     │
```

Total: 9-10 semanas calendar (vs 8-10 original).
