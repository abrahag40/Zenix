# Zenix Learning — Arquitectura DLC (Plugin/Add-On lifecycle)

> Cómo Zenix Learning vive como plugin/DLC: activación post-Activate, lifecycle ACTIVE→SUSPENDED→ARCHIVED, preservación de data en cancelación, reactivación sin pérdida.
> Diseño genérico — sirve también para Booking Engine, POS, Procure, etc.
> **Última actualización:** 2026-05-21

---

## 0. Por qué este doc existe

Pregunta directa del usuario (2026-05-21):

> *"¿Cómo nos estamos asegurando de que el LMS sea un plugin o un DLC? ¿Qué sucede si el cliente lo quiere después de la implementación de su PMS? El sistema debe estar listo para que al desarrollar esos DLC se puedan agregar/activar o desactivar/quitar sin mucha complicación, si un cliente lo tiene y después ya no lo quiere no se debería borrar su data en la BD para dejarlo como histórico por si lo quiere alguna vez en el futuro."*

**Estado al iniciar la pregunta:**
- ❌ `LearningModule` registrado en `app.module.ts` siempre ON, sin guard
- ❌ Sin tabla `TenantDLC` / subscription tracking
- ❌ Sin lifecycle ACTIVE/SUSPENDED/ARCHIVED
- ❌ Sin política de retención de data en cancelación
- ❌ Sin flujo "cliente cambia de opinión y reactiva"

**Después del fix (este sprint):**
- ✅ Modelo `TenantDLC` + `TenantDLCLog` genérico (sirve para Learning + futuros DLCs)
- ✅ `DLCService` con activate/suspend/cancel/reactivate y cache TTL 60s
- ✅ `@RequiresDLC('LEARNING_CORE')` decorator + `DLCGuard` aplicados a controllers Learning
- ✅ Lifecycle 4 estados con preservación de data (5 años LFT compliance)
- ✅ `DLCArchiveScheduler` cron 4am Mx → auto-archive post grace period
- ✅ Endpoint público `/v1/learning/certificates/:serial` sigue accesible aunque DLC suspendido (auditor STPS necesita verificar QR)

---

## 1. Lifecycle del DLC

```
                  [Activate wizard / Stripe checkout / Manual ZaharDev]
                                       ↓
                                  ACTIVATED
                                       │
                                       ▼
                              ┌─────ACTIVE─────┐
                              │ Endpoints OK   │
                              │ Billing al día │
                              │ Data viva      │
                              └────────┬───────┘
                                       │
                              [Pago falla / Admin / Customer cancela]
                                       ▼
                              ┌──SUSPENDED────┐
                              │ Endpoints 402 │
                              │ Data preserved│
                              │ Grace 30d     │
                              └────────┬──────┘
                                       │
                          ┌─Cliente reactiva─┐
                          ▼                  ▼
                       ACTIVE          [Cron 4am Mx — grace expired]
                                              │
                                              ▼
                                     ┌──ARCHIVED────┐
                                     │ Endpoints 402│ + UI link "Reactivar"
                                     │ Data preserved (≥5 años LFT)
                                     │              │
                                     └──────┬───────┘
                                            │
                                  [Reactivación cualquier momento]
                                            ▼
                                         ACTIVE (data intacta — UPDATE row §141)
                                            │
                                            ▼
                              [Cron retención fiscal +5 años]
                                            ▼
                                         PURGED (hard-delete + tombstone)
```

### 1.1 Estados detallados

| Status | Endpoints | Data | UI | Billing |
|--------|-----------|------|----|---------|
| `ACTIVE` | 200/2xx normal | Viva | Full LMS | Stripe charge mensual |
| `SUSPENDED` | 402 Payment Required | **Preservada** | Banner "Reactiva — 28 días" | Sin charge nuevo |
| `GRACE_PERIOD` | 402 | **Preservada** | Banner "Tu data se elimina en X días si no reactivas" | Sin charge |
| `ARCHIVED` | 402 con `dataPreserved: true` | **Preservada** ≥5 años | "Reactivar (recupera tu data)" | Sin charge |
| `PURGED` | 402 con `dataPreserved: false` | Hard-deleted | "Empieza de cero" | N/A |

**Política de retención §140:**
- Justificación LFT Art. 30 CFF: registros fiscales (DC-3, enrollments, certificates, exam attempts) deben conservarse **5 años**.
- Política Zenix: data ARCHIVED se mantiene **5 años desde `archivedAt`**.
- Después de 5 años: cron retention futuro (no implementado Fase 1) puede hard-delete con tombstone.

### 1.2 Reactivación — caso del usuario

> *"si un cliente lo tiene y después ya no lo quiere no se debería borrar su data en la BD para dejarlo como histórico por si lo quiere alguna vez en el futuro"*

**Cómo lo resuelve §141:**

1. Cliente cancela → `TenantDLC.status = SUSPENDED` + `cancellationReason` + `gracePeriodEndsAt = now + 30d`
2. Todas las tablas Learning de su org permanecen intactas en BD: `LearningCourse`, `LearningEnrollment`, `LearningCertificate`, `LearningAttempt`, `LearningEnrollmentLog`, etc.
3. Endpoints retornan 402 con payload accionable. UI muestra banner "Reactivar — tu data está preservada".
4. Si pasan 30 días sin reactivar → cron auto-archive a `ARCHIVED`. Sin cambio en data.
5. **En cualquier momento** (día 5, día 60, año 4) el cliente puede llamar `POST /v1/dlc/activate` con `dlcCode='LEARNING_CORE'` → `DLCService.activate()` hace **UPDATE del row existente** preservando `id` (y todas las FKs del histórico log) + nuevo `TenantDLCLog event=REACTIVATED` con metadata snapshot.
6. Todos los certificates emitidos previamente siguen accesibles. Todos los progress, attempts, audit logs intactos. El staff que ya completó "Distintivo H" antes ve su certificate sin re-enrollar.

**Lo que NO sucede:** no hay "re-import" de data, no hay "merge" complicado, no se duplican rows. Es simplemente toggle `status: ACTIVE` + clear de los timestamps de suspensión.

---

## 2. Cómo se activa cuando el cliente NO lo quiso al inicio

### 2.1 Flujo "Cliente reflota la idea 6 meses después"

Hoy (con el fix de este sprint):

1. **Cliente:** "Oye, hablamos hace 6 meses del LMS — ahora sí lo quiero, mi auditoría STPS está cerca."
2. **ZaharDev sales:** "Perfecto — agrégalo desde Settings > Add-Ons en tu Zenix. O si prefieres lo activo yo."
3. **Vía Settings page UI (a implementar Fase 1.1):**
   - Cliente va a `/settings/dlc` → ve catálogo de DLCs disponibles
   - Click "Activar Zenix Learning ($7 USD/staff/mes)" → flujo Stripe Checkout
   - Stripe webhook `checkout.session.completed` llega a Zenix → `DLCService.activate({...})`
   - DLC se crea con `status=ACTIVE`, `LearningModule` queda accesible para esa org
   - Email + push notificación a manager: "Bienvenido a Zenix Learning. Hemos enrollado a tu equipo al curso de regalo..."
4. **Vía API (admin ZaharDev / activación manual):**
   - `POST /v1/dlc/activate { dlcCode: 'LEARNING_CORE', billingMode: 'PER_STAFF_ACTIVE', pricePerUnit: 7.00 }`
   - Resto del flujo idéntico

**El que NUNCA tuvo Learning** (no estaba en el wizard original): mismo flujo. La tabla `TenantDLC` no existe para esa org-dlcCode → primera activación crea row nuevo. Schema garantiza unique constraint `[organizationId, dlcCode]`.

### 2.2 Zenix Activate wizard etapa 6 — opcional

Si el cliente lo quiere al onboarding, el wizard activa el GIFT automáticamente:

```typescript
// En el sprint Activate (futuro v1.0.5+)
await dlcService.activate(organizationId, {
  dlcCode: 'LEARNING_GIFT',
  billingMode: 'ONE_TIME_GIFT',
  metadata: { giftCourseSlug: 'distintivo-h-nom-035', activatedDuringActivate: true },
}, actor)
```

Si NO lo quiere ese día, no pasa nada — no se crea `TenantDLC`, `LearningModule` retorna 402 si alguien lo invoca. El cliente puede activar después sin penalty arquitectónico.

### 2.3 Estado "fácil de agregar/quitar"

| Operación | Esfuerzo cliente | Esfuerzo ingeniería Zenix |
|-----------|-------------------|---------------------------|
| Activar Learning post-PMS-onboard | 3 clicks en Settings → Stripe Checkout | 0 (ya implementado) |
| Cancelar Learning | 2 clicks en Settings → confirmation | 0 |
| Reactivar Learning post-cancel | 2 clicks en Settings → Stripe restore | 0 |
| Reactivar Learning post-ARCHIVED (año 1+) | 3 clicks (mismo flujo activation) | 0 |
| Reactivar Learning post-PURGED (año 5+) | Contactar soporte | 1-2 días ZaharDev (restore desde backup frío si lo hay) |

---

## 3. Arquitectura técnica

### 3.1 Schema (migration `20260521180000_dlc_subscription_model`)

```prisma
model TenantDLC {
  id                String         @id @default(uuid())
  organizationId    String         // §66 paridad multi-tenant
  dlcCode           DLCCode        // enum: LEARNING_CORE | LEARNING_PRO | LEARNING_GIFT | BOOKING_ENGINE | POS | ...
  status            DLCStatus      // ACTIVE | SUSPENDED | GRACE_PERIOD | ARCHIVED | PURGED
  billingMode       DLCBillingMode // ONE_TIME_GIFT | FLAT_MONTHLY | PER_STAFF_ACTIVE | PER_TRANSACTION
  pricePerUnit      Decimal?

  // Lifecycle timestamps
  activatedAt       DateTime  @default(now())
  suspendedAt       DateTime?
  gracePeriodEndsAt DateTime?
  archivedAt        DateTime?
  reactivatedAt     DateTime?

  // Audit + Stripe FKs
  activatedById            String?
  cancellationReason       String?
  suspensionReason         String?
  stripeSubscriptionId     String?
  stripeSubscriptionItemId String?
  stripeCustomerId         String?

  metadata          Json?

  @@unique([organizationId, dlcCode]) // 1 row por DLC; UPSERT al reactivar
}

model TenantDLCLog {
  // append-only audit. Eventos: ACTIVATED | SUSPENDED | GRACE_PERIOD_STARTED |
  // REACTIVATED | TIER_CHANGED | ARCHIVED | STRIPE_SYNC | METADATA_UPDATED
}
```

### 3.2 Auth flow

```
HTTP Request
     │
     ▼
JwtAuthGuard ──→ valida token, popula req.user
     │
     ▼
TenantGuard ──→ popula TenantContextService (org/property)
     │
     ▼
PropertyScopeGuard ──→ valida ?propertyId= match JWT (anti-IDOR)
     │
     ▼
DLCGuard ──→ si el endpoint @RequiresDLC('X'):
              ↳ DLCService.getStatus(orgId, dlcCode)
              ↳ si status !== ACTIVE → 402 Payment Required con accionable
              ↳ si status === ACTIVE → pasa
     │
     ▼
Controller method
```

`DLCGuard` se aplica selectivamente vía `@UseGuards(DLCGuard) + @RequiresDLC('LEARNING_CORE')` en cada controller del módulo. NO se registra como `APP_GUARD` global porque la mayoría de endpoints del PMS (calendar, checkin, payments, housekeeping) NO requieren ningún DLC — el PMS base es siempre activo.

### 3.3 Endpoints del DLC module

| Método | Path | Auth | Acción |
|--------|------|------|--------|
| `GET` | `/v1/dlc` | LEARNER+ | Lista DLCs de mi org (todos los status) |
| `GET` | `/v1/dlc/:dlcCode` | LEARNER+ | Status de un DLC específico |
| `POST` | `/v1/dlc/activate` | SUPERVISOR | Activar un DLC (Stripe checkout o GIFT) |
| `POST` | `/v1/dlc/:dlcCode/cancel` | SUPERVISOR | Cancelar (status → SUSPENDED + grace period) |

Endpoints adicionales en Fase 1.4 PAY-CORE:
- `POST /v1/webhooks/stripe/dlc` — recibe eventos Stripe `customer.subscription.deleted`, `invoice.payment_failed`, etc.

### 3.4 DLCGuard error response shape (§142)

```json
HTTP 402 Payment Required
{
  "code": "DLC_NOT_ACTIVE",
  "dlcCode": "LEARNING_CORE",
  "status": "ARCHIVED",
  "suspensionReason": "CUSTOMER_REQUESTED",
  "cancellationReason": "Solo necesitábamos por temporada alta",
  "gracePeriodEndsAt": "2026-06-15T00:00:00Z",
  "message": "El add-on LEARNING_CORE está en estado ARCHIVED. Tu data se preserva — puedes reactivarlo desde Settings > Add-Ons.",
  "activateUrl": "/settings/dlc/reactivate/LEARNING_CORE",
  "dataPreserved": true
}
```

El frontend debe interpretar este shape (igual que `ApiError.code` machine-readable §122) y mostrar UI de "Reactivar" con un click.

---

## 4. Excepciones intencionales

### 4.1 `GET /v1/learning/certificates/:serialNumber` SIN @RequiresDLC

**Por qué:** Auditor STPS escanea QR del DC-3 emitido cuando el cliente AÚN tenía LEARNING_CORE activo. Si el cliente canceló después, ese certificate NO debe dejar de ser verificable — el documento legal sigue siendo válido para la auditoría que se hizo en su momento.

§131 lo declara explícitamente: verificación pública sin auth + sin DLC check.

### 4.2 Webhooks externos

Los webhooks de Stripe NO pasan por `DLCGuard` (son endpoints `@Public` con HMAC verify). Razón: si el cliente canceló y queremos procesar `invoice.payment_succeeded` (caso edge: reactivación implícita), necesitamos llegar al `DLCService` aunque DLC esté SUSPENDED.

---

## 5. Decisiones reservadas §138-§144 (consolidar en CLAUDE.md al cerrar sprint)

**§138** `TenantDLC.status` determina autorización runtime de Add-Ons (no consultar Stripe directo). Defensa in-depth contra webhooks fallidos o lag. Cache 60s en `DLCService` paralela a `AccessControlService`.

**§139** `GRACE_PERIOD` default 30 días configurable per-DLC via `metadata.gracePeriodDays`. Cron `DLCArchiveScheduler` corre 4am `America/Mexico_City` daily — idempotente. Justificación 30d: industry standard SaaS (Stripe Billing default + B2B norms).

**§140** `ARCHIVED` preserva data **≥5 años** (LFT Art. 30 CFF retención registros fiscales). Hard-delete (`PURGED`) solo via cron retention futuro (no implementado Fase 1), nunca vía cancelación normal del cliente.

**§141** Reactivación post-cualquier-status no crea row nuevo — hace UPDATE del existente preservando `id` + FK histórico log. `reactivatedAt = now`, `status = ACTIVE`, timestamps de suspensión clear. Nuevo `TenantDLCLog event=REACTIVATED` con snapshot de razón previa de suspensión.

**§142** `DLCGuard` fail-soft con HTTP 402 Payment Required + payload accionable `{ code, dlcCode, status, message, activateUrl, dataPreserved }`. NUNCA crash el endpoint con 500 si falta DLC — siempre respuesta estructurada.

**§143** Stripe webhook `checkout.session.completed` / `customer.subscription.deleted` / `invoice.payment_failed` → `DLCService.syncFromStripe()` con idempotency-key del event ID. (Implementación Fase 1.4 PAY-CORE.)

**§144** Curso GIFT al cierre PMS crea `TenantDLC { dlcCode: 'LEARNING_GIFT', billingMode: 'ONE_TIME_GIFT' }` auto. Si después el cliente quiere LEARNING_CORE pago, se crea OTRO row con `dlcCode='LEARNING_CORE'` — son DLCs distintos. El gift queda preserved como histórico de prospección.

---

## 6. Lo que falta (roadmap por fase)

| Item | Fase | Bloqueante |
|------|------|------------|
| Frontend Settings page `/settings/dlc` con catálogo + activate/cancel UI | Fase 1.1 | Sí para self-serve |
| Stripe Checkout integration + webhooks | Fase 1.4 (depende v1.0.1 PAY-CORE) | No bloqueante v1.0.0 si activación manual via API |
| Cron `PurgeScheduler` post-5años | v1.0.5+ | No bloqueante — solo necesario en año 2027+ |
| Soft-suspension automática por payment_failed | Fase 1.4 | No bloqueante (manual hoy) |
| DLC metering per-staff-active (§137) | Fase 1.4 | No bloqueante v1.0.0 |
| Backup frío post-PURGED para restore via soporte | v1.2+ | Mitigación futura |

---

## 7. Tests obligatorios pre-merge

- [ ] `DLCService.activate()` crea row con status=ACTIVE + emit log ACTIVATED
- [ ] `DLCService.activate()` idempotente — re-activación en ACTIVE no falla
- [ ] `DLCService.activate()` reactiva desde SUSPENDED — preserva original `activatedAt`, nuevo `reactivatedAt`
- [ ] `DLCService.suspend()` → status=SUSPENDED + `gracePeriodEndsAt = now + 30d` + log
- [ ] `DLCService.archiveExpiredGracePeriods()` archiva solo SUSPENDED con grace vencido
- [ ] `DLCGuard` retorna 402 con shape correcto cuando status !== ACTIVE
- [ ] `DLCGuard` retorna 200 normal cuando status === ACTIVE
- [ ] `@Public` + `@RequiresDLC` — guard NO se aplica a public (caso public verify certificate)
- [ ] Cache 60s funciona — invalidación tras upsert
- [ ] Multi-tenant: cliente A activando LEARNING_CORE no afecta a cliente B

---

## Bitácora

- **2026-05-21** — Doc creado tras pregunta directa del usuario sobre arquitectura plugin/DLC. Schema TenantDLC + service + guard + scheduler implementados. Decisiones §138-§144 reservadas para cierre sprint.
