# Known Technical Debt — 2026-05-24

> **Origen**: auditoría "siblings forgotten" durante Day 9 hardening del sprint
> NOVA-CHANNEX-COMMAND-CENTER. Hallazgos REALES con análisis, riesgo,
> remediation plan, y sprint de destino.
>
> **Estado**: documentados pero NO bloqueantes v1.0.0 piloto (decisión owner
> pending). Cada uno tiene su sprint destino sugerido.

---

## DEBT-1 — `*Log` tables sin `onDelete: Restrict` (excepto AuditLog)

**Severidad**: 🟠 ALTA · **Sprint destino**: SCHEMA-INTEGRITY (sugerido) o SEC-β
**Esfuerzo**: 1-1.5 día-dev (migration + tests + rollout)

### Contexto

CLAUDE.md §28 declara: *"`PaymentLog` append-only — sin `@updatedAt`, void crea entrada negativa con `voidsLogId`"*.

El append-only se enforce **a nivel app**: el código nunca llama `prisma.paymentLog.delete()`. Pero **a nivel DB**:

```prisma
model PaymentLog {
  ...
  stay        GuestStay   @relation(fields: [stayId], references: [id])
  collectedBy Staff       @relation("PaymentCollectedBy", fields: [collectedById], references: [id])
  ...
}
```

Sin `onDelete: Restrict` explícito, Prisma defaultea a `Cascade` para FKs required. Significa:

- Si alguien borra un `Staff` por SQL directo (ej: dev limpiando dev DB), TODOS sus `PaymentLog` desaparecen.
- Mismo problema con `stayId` → cascade desde GuestStay.
- Visa CRR §5.9.2 chargeback evidence: borrada para siempre.
- USALI 12 ed: violación append-only fiscal-grade.

### Tablas afectadas (audit Day 9)

Comparativa con `AuditLog` (Day 1 schema audit aplicó H1 fix → `onDelete: Restrict`):

| Tabla | Decisión CLAUDE.md | onDelete actual | Riesgo |
|---|---|---|---|
| `AuditLog` | §165 append-only DB trigger | ✅ Restrict en User FKs | OK |
| `PaymentLog` | §28 append-only USALI | ❌ default Cascade | Pérdida evidence chargeback |
| `TaskLog` | §44+ append-only audit task lifecycle | ❌ default | Pérdida audit trail housekeeping |
| `GuestStayLog` | §95-§101 append-only soft-delete | ❌ default | Pérdida audit cancelación |
| `ChannexWebhookLog` | §132 append-only fiscal-grade | ❌ default | Pérdida evidence OTA inbound |
| `ChannexOutboundQueue` | §144 append + outcome | ❌ default | Menor (cola transitoria) |
| `GuestContactLog` | §42 evidence chargeback Visa | ❌ default | Pérdida evidence pre-arrival |
| `StayJourneyEvent` | §126 audit | ❌ default | Pérdida journey audit |
| `MaintenanceTicketLog` | §Mx4 audit trail | ❌ default | Pérdida ticket audit |

### Remediation plan

1. **Migration expand-contract**:
   - Paso A (expand): generar migration que `ALTER CONSTRAINT ... ON DELETE RESTRICT` para cada FK afectada. Sin downtime — opera sobre metadata, sin lock de tabla.
   - Paso B (verify): test integration que intenta `DELETE FROM staff WHERE id = ?` con PaymentLogs existentes y espera error.
   - Paso C (regression guard): permanente.

2. **Trigger DB anti-mutación** (opcional, defense-in-depth):
   Igual que AuditLog (block UPDATE/DELETE), agregar trigger en estas tablas. Más invasivo — solo si compliance/audit lo exige.

3. **Documentar**: nuevo §X en CLAUDE.md "Append-only logs — DB-level enforcement matrix".

### Bypass durante v1.0.0 piloto

Si el sprint SCHEMA-INTEGRITY no se ejecuta antes del piloto, mitigación:
- **Procedure operativa**: ningún Staff/User/GuestStay se elimina por SQL directo en prod.
- **Solo soft-delete** en código (Staff.active=false, GuestStay.cancelledAt set, etc.).
- Aceptable durante piloto con 1-3 hoteles donde el owner controla acceso DB.

---

## DEBT-2 — Mobile app no maneja Nova-tier login graceful

**Severidad**: 🟡 BAJA · **Sprint destino**: QA-α (testing scope) o MOBILE-NOVA-GUARD
**Esfuerzo**: 0.5 día-dev

### Contexto

`apps/mobile/app/(auth)/login.tsx` envía credenciales al mismo `POST /auth/login` que web. Si un PLATFORM_ADMIN/PARTNER_*/ORG_OWNER se autentica desde mobile:

- Backend retorna `AuthResponse` con `propertyId: ''` + `propertyName: null` + `propertyType: null`.
- Mobile asume todo usuario tiene property (TaskListScreen, KanbanScreen, etc.).
- Resultado probable: pantalla blanca, crashes, o flujos de housekeeping vacíos. NO logout-loop como web (mobile no tiene 401-handler global tan agresivo).

### Por qué es BAJA

Nova-tier no es target audience de mobile. La mobile app es deliberadamente para HOUSEKEEPER / RECEPTIONIST (ORG_STAFF). Un consultor que intenta loguearse desde mobile está fuera del happy path documentado.

### Remediation plan

**Opción A — Reject Nova-tier login en mobile** (recomendado):
En `login.tsx` después de `setAuth(data)`, check `data.user.actorTier !== 'ORG_STAFF'` → mostrar error: *"Esta cuenta no tiene acceso desde mobile. Usa el web app en app.zenix.com o nova.zenix.com."* + logout.

**Opción B — Backend rechaza Nova-tier en mobile login**:
Agregar `User-Agent: ZenixMobile` o similar al header en mobile, backend retorna 403 con mensaje claro. Más robusto pero requiere coordinación shipping.

**Decisión**: Opción A trivial — 10 líneas de código. Diferir a QA-α sprint donde añadiremos también logout-on-401 más graceful en mobile.

---

## DEBT-3 — Bootstrap fresh-clone fail (FIXED 2026-05-24)

**Severidad**: ~~🟡 BAJA~~ ✅ FIXED · **Fix commit**: pending

### Contexto

Fresh `git clone` + `npm install` no construye `packages/shared/dist/`. `apps/api` resuelve `@zenix/shared` → `dist/index.js` (per package.json `main`) y falla al arrancar Nest.

### Fix aplicado

Agregado `"prepare": "npm run build"` en `packages/shared/package.json`. NPM ejecuta `prepare` después de cada `install` workspace-aware, regenerando dist sin acción extra del dev.

Verificación post-fix: `npm install` desde fresh clone debe dejar `packages/shared/dist/index.js` listo.

---

## Próxima acción owner

3 opciones para DEBT-1 (la única seria):

1. **Aceptar** durante v1.0.0 piloto (procedure operativa de no-delete) — sprint SCHEMA-INTEGRITY se planea para v1.0.1.
2. **Ejecutar SCHEMA-INTEGRITY antes de GA** — 1-1.5 día-dev, atrasa launch.
3. **Mitigar parcial**: solo `PaymentLog` y `AuditLog` enforced ahora (los más críticos chargeback/fiscal). Resto v1.0.1.

Recomendación: **Opción 3** — `PaymentLog Restrict` migration (~2 horas-dev) antes de GA, resto a v1.0.1. La razón es que PaymentLog es la única tabla con riesgo de pérdida monetaria/chargeback directo; las otras *Log son audit/compliance que NO afectan operación del piloto en 1-3 hoteles.

DEBT-2 a QA-α sprint sin urgencia.
