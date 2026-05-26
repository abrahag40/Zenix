# Destructive Action Decision Matrix

> **Origen**: 2026-05-24, decisión owner durante Day 9 hardening.
> Esta matriz dicta CUÁNDO aplicar type-to-confirm vs otras formas de
> confirmación. Aplica a apps/web (PMS cliente) y apps/web/src/nova (Nova consultor).

---

## Principio rector

> *"Un manager es manager porque tiene capacidad de decisión. No le pongas
> fricción innecesaria a operaciones que hace todos los días — eso es
> sub-estimar su autoridad y volver el sistema lento. Reserva el
> type-to-confirm para acciones realmente catastróficas e irreversibles."*

— Owner Zenix, 2026-05-24

---

## Decisión matriz

### TIER A — `DestructiveConfirmDialog` (modal completo type-to-confirm)

**Criterios — TODOS deben cumplirse:**

1. ✅ La acción es **IRREVERSIBLE** (sin soft-delete, sin restore window, sin undo)
2. ✅ El blast radius es **CATASTRÓFICO** (cascade a múltiples entidades, destruye audit/fiscal evidence)
3. ✅ La acción es **RARA** (<1 vez por mes por property, idealmente <1 por año)
4. ✅ Un mis-click cuesta **horas-días** de soporte para recuperar (o no se recupera)

**Ejemplos válidos:**

| Acción | Por qué | Confirmation text |
|---|---|---|
| Hard-delete Property (post 365d retention v1.0.3+) | Irreversible. Cascade total. Annual | Property.name |
| Hard-delete Organization (downgrade cliente) | Idem | Organization.slug |
| Hard-delete LegalEntity (cierre fiscal) | Idem | LegalEntity.taxId |
| Hard purge guest PII GDPR Art. 17 cumplimiento legal | Irreversible per ley | "DELETE PII GUEST <id>" |
| Cierre permanente de cuenta partner (PartnerEdge) | Rara, contractual | Partner.name |

**Ejemplos INCORRECTOS (sobre-construye fricción):**

❌ Cancelar reserva — diaria, supervisor autorizado, OTA flow estandarizado
❌ Anular pago / void payment — diaria, contiene reason + audit, restaurable contable
❌ Confirmar no-show — diaria, 48h revert window, parte del flow operativo
❌ Eliminar block / RoomBlock — frecuente, recreable
❌ Marcar task DEFERRED — daily ops
❌ Soft-delete Property/Room — reversible via restore window
❌ Cancel rate plan — daily revenue management

---

### TIER B — `ConfirmDialog tone='destructive'` (modal simple sin type)

**Cuándo:**

1. Acción **REVERSIBLE** dentro de una ventana (ej: soft-delete con restore 7d)
2. **Frecuencia operativa** (cualquier cosa >1/semana por property)
3. El **manager IS la autoridad** — no necesita probar nada, su click es suficiente
4. Ya hay **reason picker / audit log** registrando el por qué

**Ejemplos:**

| Acción | Pattern actual | Por qué basta el modal simple |
|---|---|---|
| Cancel reservation | `CancelReservationDialog` 2-step + OTA forcing + reason | Daily ops + supervisor authority + 7d restore window §96 |
| Void payment | `VoidPaymentDialog` reason + notes | Daily ops + creates negative entry (no destroy) + audit |
| Confirm no-show | `NoShowConfirmModal` warning + revert hint | Daily + 48h revert window §16 |
| Soft-delete Property/Room | `ConfirmDialog destructive` + reason | Reversible via deletedAt=null + audit log |
| Delete Block | `ConfirmDialog destructive` | Recreable en segundos |
| Mark task DEFERRED | `ConfirmDialog destructive` | Reversible, HK supervisor authority |
| Override no-show (revert) | `ConfirmDialog destructive` | Restoring previous state |

---

### TIER C — Sin confirmación adicional (click directo)

**Cuándo:**

1. Acción **trivialmente reversible** (toggle, edit field con history)
2. **Frecuencia muy alta** (>10/día por user)
3. Mis-click sin consecuencia significativa (≤1 minuto para revertir)

**Ejemplos:**

| Acción | Por qué |
|---|---|
| Edit guest name / phone | Edit inline, history preserved |
| Toggle paid checkbox | Reversible 1-click |
| Reassign cleaning task | Diaria, soft change |
| Mark task IN_PROGRESS / DONE | Daily housekeeping lifecycle |
| Switch property | Reversible 1-click |

---

## Manager authorization vs type-to-confirm

**No confundir las dos cosas:**

| Mecanismo | Para qué sirve | Ejemplo |
|---|---|---|
| **RBAC roles** (`@Roles(SUPERVISOR)`) | Restringir QUIÉN puede ejecutar | Recepcionista NO puede cancelar reserva con saldo |
| **Manager authorization code** | Pedir override de policy (POS-style) | Aplicar 50% descuento fuera del límite del rate plan |
| **Reason picker + notes** | Documentar POR QUÉ (audit) | Anular pago → razón "Duplicado del POS" |
| **Forcing function checkbox** | Confirmar comprensión de un side-effect | "Entiendo que Booking.com será notificado" |
| **2-step dialog** | Step 1 elegir tipo + Step 2 confirmar consecuencias | Admin error vs cancel real |
| **Type-to-confirm** | Prevenir mis-click en acción catastrófica irreversible | Hard-delete Hotel |

**El error que cometimos 2026-05-24** (corregido en commit que sigue):

Apliqué type-to-confirm a Cancel/Void/No-show — los tres son operaciones DIARIAS donde el supervisor YA TIENE autoridad reconocida por su `@Roles`. Agregar fricción de teclear el nombre del huésped sub-estima al manager, ralentiza recepción (10-30 reservas canceladas/mes en hotel boutique vs 1 hotel borrado/año), y va contra el principio rector.

---

## Lista actual de aplicaciones type-to-confirm en Zenix

### Activas hoy

| Sitio | Confirmation text | Capa backend |
|---|---|---|
| `PropertiesService.remove` (hard-delete eventual post-365d) | Property.name | ✅ Backend valida `confirmation` field |
| `RoomsService.remove` | Room.number | ✅ Backend valida |
| `DestructiveConfirmDialog` primitive | (variable) | (variable per caller) |
| `TypeToConfirmGate` primitive | (variable) | (variable per caller) |

### Reservado para futuro (cuando exista la acción)

| Sitio | Trigger | Estimated frequency |
|---|---|---|
| Hard-purge guest PII (GDPR sprint v1.0.4 IMG) | Cliente solicita derecho al olvido | <5/año |
| Cierre permanente cuenta Partner | Owner ZaharDev decide cerrar partner | <5/año |
| Hard-delete Property post-retention | Scheduler purge automatic + manual review | <10/año |
| Hard-delete Organization (downgrade exit) | Owner ZaharDev decide | <5/año |
| Hard-delete LegalEntity (cierre fiscal MX) | Compliance | <5/año |

---

## Anti-patterns documentados

❌ **NO uses type-to-confirm para:**
- Cualquier acción que ocurra >1 vez/mes por property
- Acciones reversibles (soft-delete, undo dentro de window)
- Acciones donde el reason picker + audit es suficiente para compliance
- Acciones donde el manager es la única autoridad (su click ES la decisión)
- Cancel reservation, void payment, mark no-show, delete block, cancel rate plan
- Cualquier flow del Channex Command Center que no sea borrar el ChannexProperty entero

❌ **NO acumules layers de fricción:**
- Si el dialog ya tiene 2-step + reason picker + OTA forcing checkbox, NO añadas type-to-confirm encima
- 5 friction points = manager se rinde y aprende a hacer click rápido = peor que sin nada

❌ **NO uses type-to-confirm como excuse para no implementar RBAC bien:**
- Si la solución a "evitar mis-click" es teclear el nombre, mejor agrega `@Roles SUPERVISOR` o requiere manager authorization code

---

## Decisión registrada

Esta matriz se incorpora a CLAUDE.md como decisión non-negotiable. Cualquier PR que agregue type-to-confirm a una acción de Tier B o C requiere justificación explícita citando este doc + aprobación owner.

Para el sprint NOVA-CHANNEX-COMMAND-CENTER Day 10+, la regla aplica:

- Delete Channex Room Type / Rate Plan → Tier B (reversible recreando el row vía POST). `ConfirmDialog destructive`.
- Pause Channel → Tier B (reversible via unpause). `ConfirmDialog destructive`.
- Bulk Rate Calendar update → Tier C (cada cell es editable individualmente). Preview + simple confirm.

No reintroducir type-to-confirm en Channex flows.
