# Multi-country wizard architecture

> **Origen**: pregunta owner 2026-05-25 — "¿Qué pasa si un hostal tiene unidades
> en México y Colombia?"
>
> **Status**: análisis arquitectural, decisión propuesta. NO implementación
> inmediata — incluir en v1.0.0 con scope acotado (ver §6 abajo).
>
> **Referencias previas**: CLAUDE.md §63-§94 (4-level hierarchy + LegalEntity
> + FiscalRegime + IFiscalAdapter Strategy pattern).

---

## 1. Caso de uso real

Cliente Zenix tipo **Selina** (24 países, 90+ hostales) o **boutique chain
LATAM** con properties en MX + CO simultáneo:

- 1 razón social mexicana ("Tulum Hospitality S.A. de C.V.") con 2 hostales en QRoo
- 1 razón social colombiana ("Cartagena Stays SAS") con 1 hostal en Bolívar
- 1 marca paraguas compartida ("Wanderlust Hostels")
- Operación bajo el mismo cluster gerencial (mismo Org Owner ZaharDev consultor)

**Pregunta clave**: ¿el wizard captura los 2 países de un solo flow, o el
consultor activa 2 wizards separados (uno por país)?

---

## 2. Infra que YA existe en schema (§63-§94)

```
Brand "Wanderlust Hostels" (opcional)
  └── Organization "Wanderlust Group" (cliente customer)
        ├── LegalEntity MX "Tulum Hospitality S.A. de C.V."
        │   ├── PAC: MX_FACTURAMA
        │   ├── currency: MXN
        │   ├── regime: PERSONA_MORAL
        │   ├── Tax catalog: ISH QR 6% + IVA 16% + DSA Tulum
        │   ├── Property: Hostal Tulum Centro
        │   └── Property: Hostal Tulum Playa
        └── LegalEntity CO "Cartagena Stays SAS"
            ├── PAC: CO_DIAN
            ├── currency: COP
            ├── regime: SAS
            ├── Tax catalog: IVA CO 19% + INC turismo
            └── Property: Hostal Cartagena Centro Histórico
```

**Schema actual ya soporta esto** (§64 LegalEntity es required for invoicing
+ §89 IFiscalAdapter Strategy + §91-§94 TaxCatalogEntry curated).

Lo que NO existe es el wizard UI flow para capturarlo.

---

## 3. Wizard actual — gap identificado

Wizard Day 14 asume **1 LegalEntity por activation**:
- Step 1 captura Organization (sin country fiscal explícito — usa countryCode default)
- Step 2 Brand opcional
- Step 3 LegalEntity ÚNICA con PAC fijo
- Step 4 Properties (sin asignación explícita a LegalEntity — implícito 1:1)

Para multi-país necesita:
- **Step 3 rediseñado** como "Legal Entities" (plural) con add/remove
- **Step 4 properties** con dropdown selector "Bajo cuál LegalEntity"
- **Tax catalog override per LegalEntity** (Step 3.5 o post-wizard)

---

## 4. 3 opciones arquitectónicas

### Opción A — Single-country wizard (HOY default)

**Wizard activa 1 LegalEntity**. Clientes multi-country corren 2+ wizards
secuencialmente con el mismo Org Owner.

| Pros | Contras |
|---|---|
| Wizard simple (1 país = 95% casos boutique LATAM) | Mal UX para chains multi-país |
| MVP rápido | El segundo wizard requiere "vincular a Org existente" — flow no obvio |
| Cada wizard = 1 activación atómica | Brand layer cross-country requiere agregar manual post-wizard |

**Pattern de industria**: Cloudbeds, Mews, Little Hotelier todos hacen esto
(onboarding 1 country at a time). Selina-tier requiere onboarding manual con
Customer Success Manager dedicado (no self-service ni partner-led).

### Opción B — Multi-LegalEntity wizard

**Wizard captura N LegalEntities en un solo flow**. Step 3 se convierte en
sub-wizard "Add Legal Entity" con loop.

| Pros | Contras |
|---|---|
| 1 sola sesión consultor → cluster completo activado | Wizard complejidad +30% LOC |
| Casos chain como Selina tienen flow nativo | Caso 1 país (95% volumen) ve sub-wizard innecesario |
| Brand layer hace sentido naturalmente | Tax catalog setup × N países en 1 sesión = consultor 90+ min |

### Opción C — Hybrid (RECOMENDADA)

**Wizard primary = single LegalEntity (Opción A)**. Pero deja la puerta
abierta para multi-LegalEntity via:

1. **Botón "Agregar otra LegalEntity"** al final de Step 3 (no obligatorio).
   Loop simple sin sub-wizard.
2. **Post-wizard /nova/settings/legal-entities**: add/edit/remove
   LegalEntities adicionales. Cada uno con su PAC adapter + tax catalog.
3. **Step 4 Properties** muestra dropdown `LegalEntityId` SOLO si hay >1.
   Si solo hay 1 (95% casos) → auto-asigned, dropdown no aparece.

**Por qué Opción C**:
- Mantiene UX simple para los 95% que NO son multi-country.
- Habilita el 5% chain LATAM sin re-arquitectura.
- Post-wizard flow ya tendría que existir (clientes crecen — abren property
  en otro país 6 meses después).

---

## 5. Implementación propuesta — Opción C scope

### Schema (sin cambios — todo ya existe)

```prisma
model Organization {
  id String @id @default(uuid())
  // ...
  legalEntities LegalEntity[]  // 1..N
}

model LegalEntity {
  id            String @id @default(uuid())
  organizationId String
  name          String
  taxId         String
  countryCode   String
  currency      String
  pacAdapterClass String
  // ...
  properties    Property[]
  taxCatalogOverrides TaxCatalogOverride[]
}

model Property {
  id            String @id @default(uuid())
  organizationId String  // denormalizado
  legalEntityId String  // FK explícito
  // ...
}
```

Ya está en schema desde v1.0.5 ORG-HIERARCHY-SEED (§63-§72).

### Wizard changes (Day 15 ó separado)

1. **Step 3 mejorado** — al guardar la primera LegalEntity, mostrar:
   - "✓ Tulum Hospitality S.A. de C.V. añadida"
   - "¿Operará el cliente en otro país?" → checkbox opcional
   - Si yes: loop "Agregar otra Legal Entity" (form repetido)
   - Min 1, max 5 en wizard (más = setup manual post-activación)

2. **Step 4 Properties** — si hay >1 LegalEntity, agregar dropdown
   "LegalEntity owner" per property. Auto-pre-fill con la última usada.

3. **Step 5 Inventory** — templates per-country (México vs Colombia vs CR
   tienen room types y rate plan conventions distintas).

4. **Step 7 Integrations** — health-check loop per LegalEntity:
   - 1 PAC sandbox test per LegalEntity (no per Organization)
   - Stripe test charge en moneda primary del Organization
   - SMTP test único per Organization

### Wizard "Add Legal Entity" post-activation

Endpoint nuevo `/nova/settings/:orgId/legal-entities` con:
- Form: name + taxId + country + PAC adapter + currency
- Health-check único para esa LegalEntity
- Properties existentes pueden re-asignarse via dropdown

---

## 6. Decisión propuesta para v1.0.0

**Scope v1.0.0 GA** (recomendado):
- **Opción A pura** (single-country wizard) — más simple, menos riesgo piloto.
- **Add Legal Entity post-wizard** en `/nova/settings/legal-entities` (1 día-dev extra).
- Diferenciador comercial preservado: consultor puede activar un cliente en
  ~1 día. Chain multi-país queda como flow consultor "activate first
  country, add others later" — total ~2 horas para 2do país.

**Scope v1.0.5** (post-piloto):
- Refactor a **Opción C** completa cuando llegue primer cliente chain real.
- Wizard captura 2+ países en sesión única.
- Brand layer activado por default en accounts multi-country.

**Razón**: el 95% del piloto (3-10 hoteles boutique) NO es multi-país. Hacer
Opción B/C ahora = sobre-construcción para un caso que no aparece hasta v1.1+.

---

## 7. ¿Qué cambia en el wizard de Day 14 actualmente?

**NADA**. El Step 3 actual sigue OK para single-country (México 95%).

**Lo que SÍ agregar para v1.0.0 GA** (sprint corto post Day 20):

1. **Page `/nova/settings/legal-entities`** (1 día-dev):
   - List + add + edit + delete LegalEntity
   - Health-check button per LegalEntity (PAC sandbox)
   - Asignar properties existentes a LegalEntity

2. **Property `legalEntityId` selector** en `/nova/channex` property picker
   (opcional, default first):
   - Header muestra "LegalEntity: Tulum Hospitality" inline cuando hay >1
   - Audit log filtros por legalEntityId

3. **Audit log filter por legalEntityId** (extender query Day 13).

Total: ~1.5 días-dev incremental para multi-country support funcional, sin
refactor del wizard. Esto SÍ entra en v1.0.0.

---

## 8. Decisión a registrar en CLAUDE.md (al ejecutar)

> **§176 D-NOVA-18**: Wizard Zenix Activate v1.0.0 = single-country single-
> LegalEntity por activación. Multi-country via `/nova/settings/legal-entities`
> post-activation. v1.0.5 refactor a wizard multi-LegalEntity nativo cuando
> el primer cliente chain (Selina-tier) lo justifique.
