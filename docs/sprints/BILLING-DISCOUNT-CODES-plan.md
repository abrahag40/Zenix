# Sprint BILLING-DISCOUNT-CODES — Plan técnico

> **Estado:** ACTIVO 2026-05-27 — owner aprobó arranque
> **Branch:** `feature/billing-discount-codes` (sale de `feature/billing-core`)
> **Estimación:** 4-5 días-dev
> **Justificación estratégica:** owner detectó que el slider de descuento expone el cap del partner tier durante setup con cliente presente. Pattern Salesforce CPQ + Stripe Promotion Codes elimina ese riesgo.

---

## 1. Problema concreto

Hoy `apps/web/src/nova/components/wizard/StepPlanDiscount.tsx` muestra durante el wizard (que el consultor ejecuta con frecuencia frente al cliente):
- Slider 5%-50% del descuento
- Chip "Hasta 50% · permanente permitido" (PLATINUM/PLATFORM tier)
- 3 cards de duración + razón textarea

**Riesgo de negociación** documentado:
> *"Disclosing the full discount range during negotiation transfers anchoring power to the buyer."* — Cialdini 1984 + Gartner B2B Sales Tools Magic Quadrant 2024.

El cliente ve "hasta 50%" y demanda más, o el consultor debe físicamente ocultar la pantalla (que se ve sospechoso).

## 2. Solución: pattern Salesforce CPQ + Stripe Promotion Codes

### Flujo nuevo

**ANTES de la reunión** (Nova → Billing → Códigos, privado al consultor):
```
+ Crear código
  Nombre interno:  PILOTO-TULUM-Q3-2026
  % descuento:     15%
  Duración:        3 meses
  Justificación:   Cliente piloto referido, descuento bienvenida
  → [Crear código]
```

**DURANTE la reunión** (Wizard Step 7.5, frente al cliente):
```
┌─ Descuento (opcional) ─────────────────────┐
│                                            │
│  Aplicar código:                           │
│  [PILOTO-TULUM-Q3-2026         ] [Aplicar] │
│                                            │
│  ✓ Código aplicado · -15% por 3 meses     │
│    Justificación: Cliente piloto…         │
│                                            │
│  ▸ Configurar descuento manual            │ ← collapsed
│    (visible al cliente — usar solo en     │
│     emergencias)                          │
└────────────────────────────────────────────┘
```

El cliente NUNCA ve "hasta 50% disponible". Solo ve el código aplicado y su valor concreto.

## 3. Backend (Day 1)

### Schema — ya existe
`apps/api/prisma/schema.prisma`:
- `ConsultorDiscountTemplate` ✅ (Day 4 BILLING-CORE creó saveTemplate/listTemplates/deleteTemplate)
- Tiene: id, consultorId (User), name, percentOff, duration, durationInMonths, isFavorite, createdAt

### Endpoints — ya existen, verificar
`apps/api/src/billing/nova-billing.controller.ts`:
- `GET /v1/nova/billing/discount-templates` — listar mis códigos
- `POST /v1/nova/billing/discount-templates` — crear
- `DELETE /v1/nova/billing/discount-templates/:id` — borrar

### Necesidades adicionales (Day 1)
- Endpoint `POST /v1/nova/billing/discount-templates/:id/apply` → toma el template + subscription target + retorna { discount: Coupon ID, promotionCode }. Wrapper sobre `DiscountCodeService.generate` que extrae los params del template en vez de DTO inline.
- Validation: el cap se valida en `apply` time (no en `create` — el consultor puede crear un código que excede su cap, pero al aplicarlo generará approval request).

## 4. Frontend — /nova/billing landing + Codes page (Day 2-3)

### Day 2 — Nova Billing landing skeleton
- Ruta `/nova/billing` — placeholder con 4 StatTiles (MRR, ARR, churn, mora) — los datos reales son Day 9 del BILLING-CORE original, pero el routing + shell ahora.
- Sidebar Nova actualizado: nuevo item "Billing" con sub-items "Dashboard / Códigos / Aprobaciones / Pricing".

### Day 3 — Códigos de descuento page
Ruta `/nova/billing/codigos`:
- Lista de códigos del consultor (current user)
- Filtros: favoritos / activos / archivados
- CTA "+ Crear código"
- Modal `CreateDiscountCodeDialog`:
  - Nombre interno (visible solo al consultor)
  - % descuento (slider con cap visual)
  - Duración (once / repeating + months / forever)
  - Justificación (textarea)
  - Toggle "Marcar como favorito"
- Row actions: copiar nombre · marcar favorito · archivar

## 5. Wizard refactor (Day 4)

`StepPlanDiscount.tsx`:
- Sección "Descuento negociado" rediseñada como:
  - Input "Aplicar código" con autocomplete sobre los códigos del consultor
  - Una vez aplicado, chip "✓ Código X · -Y% por Z meses" + razón
  - Botón "× Quitar código"
- Sección **"Configurar descuento manual"** collapsed por default:
  - Warning amber: "Esta sección es visible al cliente. Considera crear un código antes de la reunión para mayor privacidad."
  - Cuando expanded: el slider + duration cards + razón actuales

### Store changes
`useWizardStore`:
- Nuevo campo: `discountTemplateId?: string` (si se aplicó un código)
- Mantenemos campos `discountEnabled`, `discountPercentOff`, etc. para el modo manual override
- Helper: `applyDiscountTemplate(template)` setea todos los campos del template

### Backend wizard activate
`WizardActivationService`:
- Si `dto.discountTemplateId` presente → `DiscountCodeService.applyTemplate(templateId, subscriptionId)`
- Si `dto.discount` presente (manual mode legacy) → flow actual

## 6. Tests (Day 5)

- Backend specs: `discount-template-apply.service.spec.ts` (5 tests)
  - Apply template within cap → applied
  - Apply template exceeding cap → pending approval
  - Apply template archived → 404
  - Apply template of another consultor → 403
  - Apply template + active subscription not in valid status → 409
- Frontend: smoke test del flow `/nova/billing/codigos` → crear → aplicar en wizard
- Integration test E2E: consultor crea código offline → ejecuta wizard → activate con código → Stripe Subscription real con Coupon real

## 7. Decisiones D-DC-1..N (a registrar al cerrar)

1. **D-DC-1** — Discount codes son PRIVADOS por consultor. Otro consultor NO puede ver/usar mis códigos. Pattern Salesforce ownership.
2. **D-DC-2** — Override manual sigue existiendo (collapsed) para emergencias. NO es default.
3. **D-DC-3** — Cap validation al APPLY time, no al CREATE. El consultor puede armar códigos a futuro que excederán su cap actual (e.g. anticipando promoción Black Friday con tier upgrade pending).
4. **D-DC-4** — Aplicar un código a una subscription es idempotente: si ya estaba aplicado el mismo coupon, retorna OK sin crear duplicate.
5. **D-DC-5** — Códigos son reutilizables — un mismo código puede aplicarse a múltiples subscriptions (Stripe Promotion Code usage limit configurado a unlimited por default).

## 8. Out-of-scope (NO en este sprint)

- ❌ Approval queue UI (`/nova/billing/aprobaciones`) — separate Day 12 del BILLING-CORE original
- ❌ Códigos compartidos entre consultores del mismo Partner — futuro v1.0.x si surge requirement
- ❌ Expiration date en códigos — futuro (hoy son siempre válidos hasta archivar)
- ❌ Bulk apply (aplicar el mismo código a N subscriptions de una) — caso edge

## 9. Dependencias

- ✅ DiscountCodeService completo (Day 4 BILLING-CORE) — generate / approveRequest / saveTemplate / listTemplates
- ✅ ConsultorDiscountTemplate schema migrated (Day 4)
- ✅ Wizard scaffold + Step 7.5 (Day 6-8 BILLING-CORE)
- ⚠️ Nova → Billing routing — no existe aún (parte del Day 9 original); este sprint lo arranca con skeleton

## 10. Timeline

| Día | Entregable |
|---|---|
| 1 | Audit + endpoint `applyTemplate` + DTO updates |
| 2 | Nova → Billing landing skeleton + routing + sidebar |
| 3 | `/nova/billing/codigos` CRUD (list + create modal + actions) |
| 4 | Wizard Step 7.5 refactor — input código + manual override collapsed |
| 5 | Tests + integration E2E + docs |

Target merge: feature/billing-discount-codes → feature/billing-core → main en ~5 días.
