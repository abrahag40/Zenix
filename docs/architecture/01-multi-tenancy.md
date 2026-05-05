# Arquitectura Multi-Tenant de Zenix

> **Audiencia:** desarrolladores ZaharDev + sub-consultoras técnicas + auditores de seguridad.
> **Última revisión:** 2026-05-03
> **Pre-requisito:** lectura previa de [`/CLAUDE.md`](../../CLAUDE.md) y [`docs/strategy/00-vision.md`](../strategy/00-vision.md).

Zenix opera como sistema multi-tenant desde el día uno. Toda decisión arquitectónica debe respetar la jerarquía de cuatro niveles que se documenta aquí. Este documento es **canónico** y precede a cualquier conversación operativa sobre RBAC, branding, o aislamiento de datos.

---

## 1. Modelo conceptual — los cuatro niveles

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Nivel 1 — ZaharDev Master (root operator)                              │
│  └── ve toda Organization, todo Property, todos los datos sin redactar  │
│      No tiene homólogo en el modelo SAP — es el equivalente a SAP CSP   │
│      (Cloud Service Provider) operando la plataforma.                   │
└─────────────────────────────────────────────────────────────────────────┘
                                 │ contrata y entrena
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Nivel 2 — Sub-consultora (Implementation Partner)                      │
│  └── ve N Organization de su portafolio                                 │
│      Equivalente a SAP PartnerEdge / IBM Business Partner               │
│      Implementa, capacita, soporta. NO accede a datos de partners       │
│      hermanos — el aislamiento entre sub-consultoras es no negociable.  │
└─────────────────────────────────────────────────────────────────────────┘
                                 │ implementa para
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Nivel 3 — Hotel Admin (Organization owner)                             │
│  └── ve sus Property[], su staff, sus reportes                          │
│      En cadenas con varias propiedades, este nivel ve todas.            │
│      No accede a otras Organization (aún siendo de la misma sub-c).     │
└─────────────────────────────────────────────────────────────────────────┘
                                 │ asigna roles a
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Nivel 4 — Operational Staff (housekeeper, recepcionista, técnico)      │
│  └── ve solo lo que su rol y propiedad le permiten                      │
│      RoomBlock.internalNotes (nivel supervisor) ≠ RoomBlock.notes       │
│      (visible a housekeeping). Granularidad por campo cuando aplique.   │
└─────────────────────────────────────────────────────────────────────────┘
```

**Por qué cuatro niveles y no tres:** un hotel chain (Nivel 3) puede tener su propio departamento de IT que NO debe ver datos de otras cadenas implementadas por la misma sub-consultora. El nivel 2 es la línea de aislamiento que impide que la sub-consultora B vea datos de la sub-consultora A, aún cuando ambas operan bajo ZaharDev (Nivel 1).

Referencia industrial: este patrón es el que SAP llama "tenant hierarchy" en SAP S/4HANA Cloud Multi-Tenant Edition (SAP, *Multi-Tenancy in SAP S/4HANA Cloud*, white paper 2022) y el que IBM documenta como "managed service provider hierarchy" (IBM, *IBM Cloud Pak for Multicloud Management Architecture Guide*, 2023).

---

## 2. Implementación técnica — `Organization` como tenant root

### 2.1. Anchor model

El modelo `Organization` (definido en [`apps/api/prisma/schema.prisma`](../../apps/api/prisma/schema.prisma)) es el ancla de tenancy. Toda tabla operacional contiene `organizationId` como columna denormalizada (no FK transitiva vía `propertyId`). Razones:

1. **Performance** — toda query operacional puede filtrarse por `organizationId` directamente, sin JOIN intermedio. Para una propiedad con 50.000 reservas anuales × 30 propiedades en una sub-consultora, el ahorro de JOINs en el tablero de un sub-c es significativo.
2. **Aislamiento defensivo** — si un bug introduce una query sin filtro de `propertyId`, la denormalización con `organizationId` impide que una sub-consultora vea datos de otra. Es un *belt-and-suspenders* aplicado deliberadamente (Joshua Bloch, *Effective Java* 3rd ed., Ítem 50: defensive copies; analogía aplicada a multi-tenancy en Saas Pegasus, *Multi-Tenant Architecture Patterns*, 2023).
3. **Migration path a sharding** — cuando una Organization grande requiera shard dedicado (escenario v2.x), `organizationId` es la clave de sharding natural.

### 2.2. `TenantContextService`

Toda request HTTP autenticada resuelve un `TenantContextService.current()` que retorna `{ organizationId, propertyId, userId, role }`. Los servicios NestJS NUNCA aceptan `organizationId` como parámetro directo — siempre lo obtienen del contexto. Esto previene ataques tipo IDOR (Insecure Direct Object Reference, OWASP Top 10 A01:2021).

```typescript
// ✅ Correcto
async findTickets() {
  const { organizationId, propertyId } = this.tenant.current()
  return this.prisma.maintenanceTicket.findMany({
    where: { organizationId, propertyId, status: { not: 'CLOSED' } }
  })
}

// ❌ Incorrecto — el cliente puede enviar otro organizationId
async findTickets(@Query('organizationId') organizationId: string) {
  return this.prisma.maintenanceTicket.findMany({ where: { organizationId } })
}
```

### 2.3. Index strategy

Cada tabla operacional tiene índice compuesto que arranca con `organizationId`:

```prisma
@@index([organizationId])
@@index([organizationId, propertyId])
@@index([organizationId, propertyId, status])  // cuando hay queries de status por propiedad
```

Este patrón es el recomendado por PostgreSQL para tenant-first queries (PostgreSQL Documentation, *Indexes — Index-Only Scans*, sec. 11.9).

---

## 3. Aislamiento por nivel — qué puede ver cada uno

| Recurso | Nivel 1 (ZaharDev) | Nivel 2 (Sub-c) | Nivel 3 (Hotel admin) | Nivel 4 (Staff) |
|---------|--------------------|-----------------|-----------------------|------------------|
| `Organization` lista | ✅ todas | ✅ las suyas | ❌ solo la propia | ❌ |
| `Property` lista | ✅ todas | ✅ las de sus orgs | ✅ las de su org | ❌ solo la propia |
| `GuestStay` (PII) | ⚠️ con audit log | ❌ por defecto | ✅ solo de su org | ⚠️ enmascarado |
| `PaymentLog` | ⚠️ con audit log | ❌ | ✅ solo de su org | ❌ |
| `MaintenanceTicket` | ✅ | ❌ | ✅ solo de su org | ✅ solo de su prop |
| `StaffShiftClock` | ✅ | ❌ | ✅ solo de su org | ✅ solo el suyo |
| `AppNotification` | ✅ | ❌ | ✅ las dirigidas a su org | ✅ las dirigidas a él/rol/prop |
| Reportes fiscales (CFDI) | ⚠️ con consentimiento | ❌ | ✅ solo de su org | ❌ |

**Símbolos:**
- ✅ acceso completo
- ⚠️ acceso restringido (audit log obligatorio o data enmascarada)
- ❌ sin acceso

### 3.1. Por qué Nivel 2 no ve datos del huésped por defecto

La sub-consultora implementa, capacita y soporta — pero **no opera el hotel**. El acceso a PII de huéspedes (nombre, documento, email) requeriría:
- Cumplimiento GDPR (EU), LGPD (BR), LFPDPPP (MX), CCPA (US)
- Acuerdo bilateral entre el hotel y la sub-consultora
- Audit trail por acceso

Para evitar fricción legal y costos de compliance que no aportan al servicio típico de soporte (configuración, tarifas, RBAC), el acceso de Nivel 2 a PII es **opt-in por organización** y queda fuera del scope v1.0.0. La sub-consultora soporta vía screen-share guiado por el hotel, no acceso directo a datos.

Referencia: este patrón es el que aplica Salesforce en su Partner Portal — los partners gestionan configuración (Lightning Pages, Flows, custom objects) sin acceso a Account/Contact data del cliente final por defecto (Salesforce, *Partner Community Implementation Guide*, 2023, sec. "Data Access for Partners").

---

## 4. Branding y personalización por tenant

### 4.1. Niveles de personalización

| Personalización | Nivel 1 | Nivel 2 | Nivel 3 |
|------------------|---------|---------|---------|
| Logo en login | Zenix | Sub-consultora (co-branded) | Hotel (co-branded con sub-c) |
| Color primario | Zenix emerald | Configurable per sub-c | Configurable per org |
| Dominio | `zenix.cloud` | `<sub-c>.zenix.cloud` | `<org>.zenix.cloud` o custom |
| Email transaccional sender | `noreply@zenix.cloud` | Configurable | Configurable |

La capa de branding vive en `Organization.brandConfig Json?` (a implementar en v1.1.0). Los assets se sirven desde CDN. NUNCA hardcodear assets de marca en el código del frontend — siempre leer de la configuración del tenant resuelto.

### 4.2. Multi-property dentro de una Organization

Una `Organization` tipo cadena (e.g., "Hostales Tulum SA de CV") puede tener N `Property` (Tulum centro, Tulum playa, Cancún). El switcher de propiedades en la UI sigue el patrón de Slack workspace picker (Slack Engineering, *Building the Workspace Picker*, 2019): top-bar con avatar + dropdown, cambio de propiedad < 200ms.

---

## 5. Auditoría de aislamiento — pre-release v1.0.0

Antes del cutover a producción, se ejecuta el **Tenant Isolation Audit** documentado en [`docs/engineering/05-tenant-isolation-audit.md`](../engineering/05-tenant-isolation-audit.md) (a crear). Consiste en:

1. **Static analysis** — script que recorre todo `*.service.ts` y reporta cualquier `prisma.<model>.findMany/findFirst/findUnique` sin `organizationId` en el `where`.
2. **Penetration test sintético** — usuario de Org A intenta leer datos de Org B vía manipulación de IDs en URLs y bodies.
3. **Audit log review** — verificación de que toda mutación crítica registra `actorId` y `actorOrganizationId`.

**Criterio de pass:** 0 hits del static analysis (excepto whitelisted en `apps/api/src/admin/`), 0 leaks en pen test sintético, 100% de mutaciones críticas con audit log.

---

## 6. Referencias

- SAP. (2022). *Multi-Tenancy in SAP S/4HANA Cloud — Architecture White Paper*. SAP Press.
- IBM. (2023). *IBM Cloud Pak for Multicloud Management — Architecture Guide*.
- Salesforce. (2023). *Partner Community Implementation Guide*. Sec. "Data Access for Partners".
- OWASP. (2021). *Top 10 — A01:2021 Broken Access Control*.
- PostgreSQL. (2024). *Documentation 16 — Indexes (Index-Only Scans)*. Sec. 11.9.
- Saas Pegasus. (2023). *Multi-Tenant Architecture Patterns*. Cory Zue.
- Bloch, J. (2018). *Effective Java*, 3rd ed., Ítem 50: Defensive Copies.

---

## 7. Mantenimiento de este documento

Cualquier cambio en el modelo `Organization`, `User`, `UserPropertyRole`, o en `TenantContextService` requiere actualizar este documento en el mismo PR. Sin actualización del documento, el PR no merge — esta regla está documentada en [`docs/engineering/01-pull-request-workflow.md`](../engineering/01-pull-request-workflow.md) (a crear).
