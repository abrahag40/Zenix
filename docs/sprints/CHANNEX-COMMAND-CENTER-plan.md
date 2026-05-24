# Sprint CHANNEX-COMMAND-CENTER — Multi-OTA control center desde Zenix

> **Branch destino:** `feature/channex-inbound` (continuación del sprint Channex en curso).
> **Estimación:** 12-16 días-dev (1 dev secuencial).
> **Status:** propuesta UX/UI **APROBADA por owner** 2026-05-23 — 3-tier RBAC + arrancar ahora.
> **Bloque 1 v1.0.0 expandido:** ~52-70 días-dev = ~10-13 sem calendar. Target tag jul-sep 2026.
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

## 1. RBAC — 3 tiers (SAP+SuccessFactors model)

### Tier A — Consultor ZaharDev / Partner Certificado

Acceso pleno. Una vez por property o cuando hay cambio estructural.

| Item | Endpoint |
|------|----------|
| Conectar/desconectar channels (handshake con extranet OTA = manual; Channex API no expone connect) | `GET /channels` + redirect manual |
| CRUD Room Types | `GET/POST/PATCH/DELETE /channex/room-types` |
| CRUD Rate Plans | `GET/POST/PATCH/DELETE /channex/rate-plans` |
| Mapping wizard room_type ↔ channel codes | `GET/POST /channex/mappings` |
| Validate mapping integrity | `POST /channex/validate-mappings` (implementar el stub) |
| Tax sets + cancellation policies | `GET/POST/PATCH /channex/tax-sets` (v1.0.2 bundle CFDI) |
| Editar caps de rate ("BAR no puede bajar de $X" — Salesforce Permission Set pattern) | `PATCH /channex/rate-plans/:id/caps` |
| Disparar full-sync manual | `POST /channex/full-sync/:propertyId` (existente) |

### Tier B — Supervisor / Manager del hotel

Day-to-day operations. **No toca estructura.**

| Item | Endpoint |
|------|----------|
| Rate Calendar Matrix — edit per date × channel × room type | `GET/PATCH /channex/rate-calendar` |
| Bulk rate edit (N días × M channels en 1 mutation) | `PATCH /channex/rate-calendar/bulk` |
| Restrictions per channel: CTA / CTD / min-stay / max-stay / stop-sell | `PATCH /channex/restrictions` |
| Rate-parity matrix con alerts (Booking $130, Hostelworld $120 → flag amber) | derivado client-side |
| Pause / unpause channel (stop_sell global temporal) | `POST /channex/channels/:id/pause` |
| Revisar DEAD_LETTER + retry | `POST /channex/outbox/:id/retry` |
| Conflict resolution review | `/channex/conflicts` (existente) |

### Tier C — Receptionist

Solo lectura, dentro del calendar y BookingDetailSheet:
- Chip post-push de cada reserva ("✓ Sincronizado en Booking.com hace 8s") — §151 ya entregado
- Saber qué OTA originó cada booking — chip brand color §149 ya entregado
- Sin acceso a `/settings/channex`

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

---

## 4. Modelo de datos nuevo

```prisma
// Audit log append-only — D-CHX-CC-8
model ChannexAuditLog {
  id                String   @id @default(uuid())
  organizationId    String
  propertyId        String
  actorId           String
  actorTier         String   // 'CONSULTANT' | 'SUPERVISOR' | 'RECEPTIONIST'
  action            String   // 'ROOM_TYPE_CREATE' | 'RATE_EDIT' | 'CHANNEL_PAUSE' | ...
  target            String?  // entity id (room_type_id, rate_plan_id, channel_id, etc.)
  payload           Json     // request body sent to Channex
  channexResponse   Json?    // response received (status + body)
  status            String   // 'SUCCESS' | 'FAILURE' | 'PARTIAL'
  errorMessage      String?
  createdAt         DateTime @default(now())

  @@index([propertyId, createdAt])
  @@index([actorId])
  @@index([action])
  @@map("channex_audit_log")
}

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

## 5. Cronograma sugerido (12-16 días-dev)

| Día | Tarea |
|-----|-------|
| 1 | Migration: ChannexAuditLog + RatePlanCap + ChannexChannelPause + PropertySettings extensions. Generate. |
| 2 | Gateway extensions: createRoomType, updateRoomType, deleteRoomType, createRatePlan, updateRatePlan, deleteRatePlan, listChannels, listRoomTypes (refactor del stub). |
| 3 | Backend: RoomTypesController + Service (CRUD pass-through + write-through Zenix DB) + spec. |
| 4 | Backend: RatePlansController + Service + spec. |
| 5 | Backend: RateCalendarController + aggregator (GET matrix) + bulk PATCH dispatch via outbox existente. |
| 6 | Backend: RestrictionsController + ChannelsController (pause/unpause) + spec. |
| 7 | Backend: MappingsController + Service + health-check + implementación de `validateMappings()` real. |
| 8 | Frontend: refactor ChannexAdminPage → tab layout. StatusTab preservado. RoomTypesTab + RatePlansTab list-only. |
| 9 | Frontend: RoomTypeFormDialog + RatePlanFormDialog (create + edit). Cap form. |
| 10 | Frontend: RateCalendarMatrix (virtual scroll horizontal + vertical, inline edit, popover). |
| 11 | Frontend: BulkRateEditDialog + RateParityIndicator (color-coded delta). |
| 12 | Frontend: RestrictionsTab + ChannelsTab + MappingsTab + AuditLogTab. |
| 13 | Tests: unit (services) + integration (controllers) + e2e sandbox (verify round-trip Channex). |
| 14 | RBAC enforcement: @Roles decorators + frontend tab gating + 403 handling. |
| 15 | QA cross-feature: edit room type → cascade to rate plans? Borrar rate plan en uso? Pause channel mid-booking? Audit log integrity. |
| 16 | Buffer / docs + i18n / pre-merge cleanup. |

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

- [ ] 3 migrations aplicadas (ChannexAuditLog + RatePlanCap + ChannexChannelPause + PropertySettings ext).
- [ ] Gateway con 10 nuevos métodos (room types CRUD, rate plans CRUD, channels list, restrictions bulk).
- [ ] 7 controllers backend con RBAC enforcement + specs (target ≥85% coverage).
- [ ] Multi-tab `/settings/channex` con 8 tabs (Status existente + 7 nuevas).
- [ ] RateCalendarMatrix con virtual scroll, inline edit, bulk edit, rate-parity alerts.
- [ ] Audit log visible Tier A+B con filtros.
- [ ] E2E sandbox: crear room type → push CRS → verify aparece en `staging.channex.io`.
- [ ] RBAC enforcement: receptionist obtiene 403 en endpoints Tier A+B; supervisor 403 en Tier A; consultor todo OK.
- [ ] CLAUDE.md actualizado con §159-§168.
- [ ] zenix-sales-master.md sección "Channel Manager Command Center" con tabla comparativa + 4 diferenciadores.
- [ ] Preview manual verificado por owner.
- [ ] PR mergeado sin regresiones (205+ tests existentes verde).
