# Sprint CHANNEX-AUTO-PROVISION — Plan técnico

> **Estado:** Propuesta · pendiente de approval owner para arranque
> **Branch propuesta:** `feature/channex-auto-provision`
> **Estimación:** 5-7 días-dev (1 dev secuencial)
> **Bloquea:** v1.0.0 — sin esto, el wizard activa cliente pero el inventario queda manual

---

## 0. Arquitectura multi-tenant Channex (decidido 2026-05-27)

**Modelo elegido para Fase 1 (piloto)**: D adaptado — **1 Channex master account + Groups por Organization + Zenix middleware enforces RBAC**.

**Por qué no Modelo A (master único sin Groups)**:
- Si un consultor PARTNER_MEMBER comprometido, accede a todas las properties del master.
- No hay manera de auditar accesos por consultor.

**Por qué no Modelo B (Channex Partner Program) hoy**:
- Requiere firma de Partner agreement con Channex (proceso comercial 2-4 semanas).
- Costo Partner negociado (commission %) puede no compensar para <10 clientes activos.
- Va a Fase 2 (post-piloto) cuando tengamos 5-10 orgs activas.

**Por qué no Modelo C (BYO cliente propio)**:
- Onboarding 3x más largo (cliente debe contratar Channex separadamente).
- Cliente paga doble (Zenix $X + Channex $Y).
- Va a Fase 3 (enterprise) como opcional.

**Implementación del Modelo D adaptado**:
1. ZaharDev mantiene 1 Channex master account (cuenta corporativa).
2. Cada Zenix Organization tiene su propio Channex **Group** (Channex feature nativa para sub-tenancy lógica).
3. API key Channex vive SOLO en `.env` server-side, NUNCA expuesta al frontend ni a consultores.
4. Consultor JAMÁS accede direct a Channex — toda interacción es via Zenix UI.
5. Zenix middleware (`NovaActingOrgGuard` existente) valida que cualquier mutation en Channex sea sobre properties dentro de `assignedOrgIds` del consultor.
6. OTAs credentials del cliente (Booking, Airbnb usernames/passwords) viven encriptadas en Channex API + opcionalmente cached en Zenix DB con `Property.otaCredentialsEncrypted`.

**Security guarantees**:
- Consultor jamás ve API key Channex.
- Consultor jamás puede listar/mutar properties fuera de su scope.
- Si consultor comprometido → ZaharDev rota API key Channex (1 acción global).
- Audit trail completo en Channex + en `ChannexAuditLog` de Zenix (existente).

**Migration path a Fase 2 (Partner Program)**:
- Backend ya está agnóstico al modelo: solo necesita cambiar la API key per-Organization (campo `LegalEntity.channexApiKey` nullable).
- Si `LegalEntity.channexApiKey` set → usa esa (Fase 2/3). Si null → usa master + Group (Fase 1).
- Sin breaking changes — switching gradual cliente por cliente.

**Referencias**:
- Pattern usado por RoomRaccoon (master + Groups) en su piloto inicial 2019.
- Cloudbeds migró del modelo D al B en 2021 cuando llegó a 5k clientes.
- Mews usa Modelo C (BYO) por filosofía enterprise pero limita su mercado SMB.

---

## 1. Problema

Hoy el `WizardActivationService` crea en BD:
- Organization + Brand + LegalEntity + Properties + Org Owner
- RoomTypes + RatePlans (del template inventory elegido en Step 5)
- Stripe Subscription (Step 7.5)

Pero **NO empuja nada a Channex**. Resultado: el cliente activado tiene cero presencia en OTAs hasta que el consultor o el cliente abre `/settings/channex` y mapea manualmente.

Gap detectado por owner 2026-05-27 ("creí que dentro del plan teníamos contemplado que el wizard empuje el inventario a Channex automáticamente").

---

## 2. Scope del sprint

### Day 1 — DTOs + adapter audit
- `WizardActivateDto` extendido con campo `channexPushEnabled: boolean` (default `true`)
- Audit `apps/api/src/integrations/channex/` para confirmar que `ChannexGateway` tiene los métodos requeridos:
  - `createProperty()` ✅ (existe)
  - `createRoomType()` — verificar
  - `createRatePlan()` — verificar
  - `pushRestrictions()` — verificar (rates)
- Identificar gaps en el gateway, completarlos si faltan

### Day 2 — ChannexProvisionService
Nuevo service `apps/api/src/nova/wizard/channex-provision.service.ts`:
```typescript
async provisionFromWizard(input: ProvisionInput): Promise<ProvisionResult>
```
Llamado outside-tx desde `WizardActivationService.activate()` después del `$transaction`.

Por cada property creada:
1. Crear property en Channex si el consultor NO proveyó `channexPropertyId` existente (caso nuevo cliente sin presencia OTA previa)
2. Mapear `Property.channexPropertyId` ← response
3. Por cada RoomType del template: crear en Channex via `POST /api/v1/room_types` con capacity + occupancy
4. Mapear `Room.channexRoomTypeId` ← response (bulk update)
5. Por cada RatePlan del template: crear en Channex via `POST /api/v1/rate_plans` con currency + parent room type
6. Mapear `RatePlan.channexRatePlanId`
7. Setear precios base via `POST /api/v1/restrictions/bulk_update` (rate per room_type_rate_plan)

### Day 3 — Error handling + idempotency
- Si Channex falla mid-provisioning, NO rollback la Organization (ya activada). En su lugar: mark `Property.channexProvisioningStatus = 'failed'` + AuditLog `CHANNEX_PROVISION_FAILED` con detalle del error.
- Botón "Reintentar Channex" en `/settings/channex` para casos failed.
- Idempotency: si re-trigger, verificar si la Property ya tiene `channexPropertyId` y skip create (idempotent UPSERT pattern).

### Day 4 — Wizard Step 5 enhancement
Step 5 (Inventory) hoy solo elige template. Agregar:
- Toggle "Empujar a Channex automáticamente al activar" (default ON)
- Si OFF: el consultor configurará manualmente después (escape hatch para casos sin Channex partnership)
- Si ON: chip warning si Channex API key del cliente no está configurada (verificar en Step 7 Integrations health check)

### Day 5 — Channel mappings (OTAs)
El cliente típicamente quiere Booking + Airbnb + Expedia activos desde día 1. Agregar Step 5.5 (o subsección Step 5):
- Multiselect de canales OTA a habilitar
- Por cada canal seleccionado: crear `ChannelMapping` en Channex via `POST /api/v1/channels`
- Al activar el wizard, los canales quedan habilitados (pero no published — eso requiere onboarding adicional con cada OTA)

### Day 6 — Wizard Step 8 (Activación) UI update
Step 9 (Activación) ahora muestra preview de lo que se va a empujar a Channex:
- "5 RoomTypes serán creados en Channex"
- "12 RatePlans serán creados"
- "3 canales OTA habilitados (Booking / Airbnb / Expedia)"
- Botón "Activar" ahora dice "Activar cliente + provisionar Channex"

Después de activar, la response del wizard incluye:
- `channexProvisioning: { status: 'completed' | 'partial' | 'failed', errors: [] }`
- Si `partial` o `failed`: mostrar warning al consultor con CTA "Revisar en /settings/channex"

### Day 7 — Tests + docs
- Mock `ChannexGateway` en tests del `ChannexProvisionService`
- Integration test: provision flow end-to-end con Channex sandbox real (`staging.channex.io`)
- Documentar el flow en `docs/architecture/channex-provisioning-flow.md`
- Actualizar `CLAUDE.md` con decisiones D-CHX-AP-1..6 numeradas

---

## 3. Decisiones a registrar (D-CHX-AP-*)

1. **D-CHX-AP-1** — Provisioning es best-effort outside-tx. Falla NO bloquea activación del cliente. Re-trigger manual disponible.
2. **D-CHX-AP-2** — Si consultor proveyó `channexPropertyId` en Step 4 (cliente con presencia OTA previa), NO crear property nueva — solo mapear room types + rate plans.
3. **D-CHX-AP-3** — Idempotency vía verificación previa de mappings existentes antes de cualquier create.
4. **D-CHX-AP-4** — `channexPushEnabled: false` permite escape hatch para clientes pilotos sin Channex.
5. **D-CHX-AP-5** — Auditoría: cada call Channex se loguea en `ChannexAuditLog` con request + response (existing pattern Day 2 CHANNEX-INBOUND).
6. **D-CHX-AP-6** — Channel mappings se crean inactive por default — el consultor activa cada uno desde `/settings/channex` después de confirmar con el cliente.

---

## 4. No-goals (scope exclusivo)

- ❌ NO se publica inventario en OTAs (Booking/Airbnb) durante el wizard. Eso requiere onboarding adicional con cada OTA + content moderation. Day 7 deja todo listo para que el consultor finalize en `/settings/channex`.
- ❌ NO se sincroniza disponibilidad o reservas durante el wizard. CHANNEX-INBOUND ya maneja eso post-activación.
- ❌ NO se reconfigura rate plans existentes si el consultor cambia el template. Eso requiere migration tool separada.

---

## 5. Dependencias

- ✅ Channex Gateway funcional (`ChannexModule` Sprint CHANNEX-INBOUND/OUTBOUND closed)
- ✅ Wizard activation transactional (`WizardActivationService` Day 16 NOVA-CHANNEX-COMMAND-CENTER closed)
- ⚠️ Channex API key del cliente debe estar configurada en Step 7 Integrations health check antes de Step 9

---

## 6. Documentos referenciados

- [docs/sprints/CHANNEX-INBOUND-plan.md](./CHANNEX-INBOUND-plan.md)
- [docs/sprints/CHANNEX-OUTBOUND-CERT-plan.md](./CHANNEX-OUTBOUND-CERT-plan.md)
- [docs/sprints/NOVA-CHANNEX-COMMAND-CENTER-plan.md](./CHANNEX-COMMAND-CENTER-plan.md)
- [apps/api/src/integrations/channex/](../../apps/api/src/integrations/channex/)
- Channex API docs: https://docs.channex.io/

---

## 7. Cuándo arrancar

Recomendación: después del sprint **BILLING-DISCOUNT-CODES** (en curso). Razón:
- BILLING-DISCOUNT-CODES resuelve un riesgo de UX (cliente ve cap durante setup)
- CHANNEX-AUTO-PROVISION es completeness del wizard (UX no degrada sin esto, pero requiere acción manual extra del consultor post-activación)
- Ambos son bloqueantes para v1.0.0; orden basado en riesgo (UX > completeness)
