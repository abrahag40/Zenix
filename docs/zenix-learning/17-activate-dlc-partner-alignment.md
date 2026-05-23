# Zenix Learning — Activate wizard ↔ DLC ↔ Partner network alignment

> Cómo se conectan los 3 conceptos: Zenix Activate wizard (onboarding) + TenantDLC (subscription tracking) + Partner Network (consultores SAP-style).
> Estado honesto + plan de integración + casos de uso multi-property.
> **Última actualización:** 2026-05-21

---

## 0. La pregunta del usuario, sin maquillaje

Tres preguntas combinadas:

1. *"¿El Zenix Activate wizard ya tiene contemplado el manejo y activación de los módulos opcionales?"*
2. *"¿Si un hotel con 4 hoteles me lo compra, al activarlo se activa en sus 4 hoteles?"* + *"¿es posible de que el dueño quiera lanzar solo un curso en solo uno o dos de esos 4 hoteles?"*
3. *"¿El Zenix Activate wizard sirve para cuando venda licencias y mis subconsultores puedan realizar las respectivas configuraciones sin depender de mí?"*

---

## 1. Estado honesto pre-este-sprint

### 1.1 Zenix Activate wizard

| Componente | Estado |
|------------|--------|
| Doc estratégico [docs/vision/13](../../docs/vision/13-consultant-setup-wizard.md) | ✅ Existe (8 etapas: Customer Account → Brand → LegalEntity → Properties → Inventory → Staff+Users → Integrations → Activación) |
| Código backend (`apps/api/src/activate/`) | ❌ NO existe (`find . -path "*activate*"` vacío) |
| Código frontend (`apps/web/src/modules/activate/`) | ❌ NO existe |
| Etapa "Add-Ons / DLCs" en el doc | ❌ NO documentada todavía (etapa 6 es Staff, 7 es Integrations, 8 es Activación final) |

### 1.2 Multi-property + DLC scope

| Caso | Antes este sprint | Después este sprint |
|------|---|---|
| Cliente con 4 hoteles, DLC activo en todos por default | ✅ con `TenantDLC` per-org | ✅ sin cambio |
| Lanzar curso solo en hotel 1 + 2 (de 4) | ✅ `LearningAssignmentRule.matchPropertyType[]` o `LearningCourse.propertyId` | ✅ sin cambio |
| DLC NO aparece en hotel 3 | ❌ no soportado | ✅ `TenantDLC.scopedPropertyIds: String[]` |
| Pagar solo por 1 de 4 hoteles | ⚠️ parcial (per-staff-active §137 indirecto) | ✅ `scopedPropertyIds` + billing futuro consciente |

### 1.3 Partner network SAP-style

| Componente | Estado |
|------------|--------|
| Doc [docs/vision/09-partner-network.md](../../docs/vision/09-partner-network.md) | ✅ Existe (tiers, portal, certificación) |
| `BrandUserRole` schema (§67) | ✅ Existe — permite scope cross-org via Brand |
| `LegalEntityUserRole` schema (§67) | ✅ Existe — permite scope cross-property via LegalEntity |
| `AccessControlService` UNION ALL 3 niveles | ✅ Existe — resuelve "¿user X tiene acceso a property Y?" |
| `JwtPayload.scope: 'BRAND' \| 'LEGAL_ENTITY' \| 'PROPERTY'` | ✅ Existe |
| `StaffRole.ZENIX_CONSULTANT` o equivalente | ❌ NO existe — falta role específico de consultor partner |
| UI "selector de cliente" para consultor | ❌ NO existe |
| Audit trail "partner X activó DLC Y para cliente Z" | ⚠️ Parcial — `TenantDLC.activatedById` existe (staffId) pero no diferenciamos partner vs internal |
| Billing/comisión tracking | ❌ NO existe — v1.2+ |

---

## 2. Integración Activate ↔ DLC (a documentar en doc vision/13)

### 2.1 Nueva Etapa 7.5 propuesta para el wizard

Entre Etapa 7 (Integrations) y Etapa 8 (Activación final), agregar:

**Etapa 7.5 — Add-Ons / DLCs**

```
Pregunta: ¿qué Add-Ons del catálogo Zenix activa este cliente?

┌──────────────────────────────────────────────────────────────────┐
│  Add-Ons disponibles                                              │
│                                                                    │
│  ☐ Zenix Learning Core                  $7 USD/staff activo/mes  │
│     LMS + DC-3 STPS + 3 cursos MVP                                │
│     ☐ Gift bundled: "Distintivo H + NOM-035" (1 año gratis)      │
│     Scope: ◉ Todas las properties  ○ Selección manual            │
│            └─ [✓ Hotel CDMX] [✓ Tulum] [☐ Cancún] [☐ Mérida]     │
│                                                                    │
│  ☐ Zenix Booking Engine                 $12 USD/property/mes      │
│     Direct Booking + Widget + WordPress plugin                    │
│     Scope: ◉ Todas las properties  ○ Selección manual            │
│                                                                    │
│  ☐ Zenix POS (v1.3+)                    Disponible 2026 Q3        │
│                                                                    │
│  Total estimado: $0/mes (ningún add-on activo)                    │
│                                                                    │
│  [Saltar — el cliente activará después]    [Configurar y siguiente]│
└──────────────────────────────────────────────────────────────────┘
```

**Flujo backend al confirmar:**
```typescript
for (const addOn of selectedAddOns) {
  await dlcService.activate(organization.id, {
    dlcCode: addOn.code,
    billingMode: addOn.billingMode,
    pricePerUnit: addOn.price,
    metadata: addOn.metadata,
    scopedPropertyIds: addOn.scopeMode === 'manual' ? addOn.selectedProperties : [],
  }, consultantActor)
}
```

**Caso del usuario "4 hoteles, lanzar curso solo en 1-2":**
- En etapa 7.5: Scope = "Selección manual" → selecciona hotel 1 + 2 → `scopedPropertyIds = ['prop1', 'prop2']`
- Hotel 3 y 4 quedan sin acceso al módulo Learning
- Si cliente cambia de opinión después: edita en `/settings/dlc/scope/LEARNING_CORE` (Fase 1.1 frontend)

### 2.2 Skip flow — cliente decide después

Si en etapa 7.5 el consultor click "Saltar":
- No se crean rows `TenantDLC`
- `LearningModule` retorna 402 a cualquier request
- En Settings page del cliente aparece sección "Add-Ons disponibles" con botón "Activar Zenix Learning"
- Cliente puede activar en cualquier momento sin re-correr el wizard

---

## 3. Partner network — qué hace falta para que un sub-consultor opere

### 3.1 Schema gaps (extensión futura v1.2+ — NO en este sprint)

```prisma
enum SystemRole {
  // ... existentes (RECEPTIONIST, HOUSEKEEPER, SUPERVISOR, etc.)

  // v1.2+ Partner Network roles:
  ZENIX_INTERNAL_CONSULTANT  // ZaharDev staff full access
  ZENIX_PARTNER_CONSULTANT   // Partner certificado externo
  ZENIX_PARTNER_OWNER        // Founder/admin de la firma partner
}

model Partner {
  id              String   @id @default(uuid())
  name            String   // "ZaharDev" | "Consultora ABC"
  type            String   // 'INTERNAL' | 'EXTERNAL'
  tier            String   // 'GOLD' | 'SILVER' | 'BRONZE' — paridad SAP
  certificationDate DateTime?
  contractEndsAt  DateTime?
  commissionPct   Decimal  @db.Decimal(5, 2) @default(0)
  // ...
}

model PartnerCustomer {
  // Vincula un Partner con un Organization (cliente que el partner administra)
  partnerId         String
  organizationId    String
  primaryConsultantStaffId String
  startedAt         DateTime
  endedAt           DateTime?
  @@unique([partnerId, organizationId])
}

model PartnerCommissionLog {
  // Audit trail: "Partner X cobró comisión por activación de DLC Y para cliente Z"
  // Append-only.
}
```

### 3.2 Flujo de partner ejecutando Activate

```
Consultor partner login → ve "Mis clientes" (PartnerCustomer rows)
                       → selecciona "Hotel Las Brisas (en setup)"
                       → asume scope=BRAND temporal para esa Organization
                       → ejecuta wizard Activate completo
                       → Etapa 7.5: marca DLCs + scope manual
                       → DLCService.activate() registra `activatedById = consultorStaffId`
                       → TenantDLCLog audit: "consultor X activó LEARNING_CORE el día Y"
                       → Comisión calculada automáticamente (Fase v1.2+)
```

### 3.3 Qué SÍ funciona HOY (con la arquitectura actual)

Aunque `Partner` model no existe todavía, el **caso minimalista de partner** SÍ funciona:

1. Crear un `User` con `BrandUserRole.role=SUPERVISOR` sobre el Brand del cliente
2. El `User` puede invocar `POST /v1/dlc/activate` sobre la Organization del cliente
3. El audit log `TenantDLC.activatedById` registra quién hizo la activación
4. `AccessControlService.canUserAccessProperty` autoriza cross-property al partner

**Limitaciones del workaround:**
- ❌ No hay diferenciación "partner externo" vs "internal user del cliente"
- ❌ No hay tracking de comisión
- ❌ No hay UI "selector de cliente" — el partner navega manualmente
- ❌ No hay certificación/onboarding del partner

**Conclusión:** la arquitectura **soporta el concepto base** (cross-org auth, audit log). La **orquestación comercial** (`Partner`, `PartnerCustomer`, `PartnerCommissionLog`) llega en **v1.2+**.

---

## 4. Decisión §147 reservada — Scoped DLC per-property

**Texto para CLAUDE.md al cierre del sprint:**

> **§147** `TenantDLC.scopedPropertyIds: String[]` resuelve el caso multi-property del cliente que tiene varios hoteles y quiere activar el DLC selectivamente. Array vacío = activo en TODAS las properties de la org (default). Array poblado = solo esas properties. `DLCService.isActive(orgId, dlcCode, propertyId?)` valida match cuando propertyId viene. `DLCGuard` retorna 402 `DLC_NOT_ENABLED_FOR_PROPERTY` si `actor.propertyId` no está en el scope.
>
> Validación: si el array contiene propertyIds que NO pertenecen a la organizationId, `DLCService.activate()` lanza ConflictException (tests Fase 1.5).
>
> Billing per-staff-active §137 se restringe a staff de las properties scoped — no se cobra por staff de properties fuera del scope.

---

## 5. Roadmap claro

### Fase 1.1 (este sprint LEARNING-CORE)
- ✅ `TenantDLC.scopedPropertyIds` agregado (este commit)
- ✅ `DLCGuard` respeta scopedPropertyIds (este commit)
- 🔄 **Frontend Settings DLC page** — UI para activar/cancelar/cambiar scope (próximas líneas de este commit)
- 🔄 **Frontend Dashboard learner + Catalog + Course detail** (próximas líneas de este commit)
- 📋 Update `docs/vision/13` con Etapa 7.5 propuesta

### Fase 1.4 (post-LEARNING-CORE base, ~v1.0.1 PAY-CORE)
- 📋 Stripe webhook → DLCService sync
- 📋 Zenix Activate wizard frontend etapas 1-7 (no solo 7.5)
- 📋 Activation Report PDF al cerrar wizard

### v1.2+ Partner Network
- 📋 Schema: `Partner`, `PartnerCustomer`, `PartnerCommissionLog`
- 📋 Role `ZENIX_PARTNER_CONSULTANT`
- 📋 UI consultor: "Mis clientes" + "Crear nuevo cliente"
- 📋 Comisión tracking + Stripe Connect payout
- 📋 Certificación partner (curso + examen tipo "Zenix Activate Specialist")

---

## 6. Bitácora

- **2026-05-21** — Doc creado tras 3 preguntas críticas del usuario sobre Activate, multi-property y partner model. Schema `scopedPropertyIds` agregado en mismo commit. Decisión §147 reservada.
