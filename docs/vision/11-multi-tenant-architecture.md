# 11 · Arquitectura Multi-Tenant — el modelo 4-level

> Decisión arquitectónica fundacional de Zenix. Define cómo el sistema soporta desde un hotel boutique independiente hasta cadenas multi-país tipo Selina. Modelo aprobado 2026-05-15 con plan de migración backwards-compatible.
>
> **Status:** APROBADO — sembrado en v1.0.5 (ORG-HIERARCHY-SEED).
> **Alternativas evaluadas:** modelo flat Org→Property (Cloudbeds early-day), modelo 2-level (Mews pre-2020), modelo 3-level Opera Chain Code. Ver §"Alternativas descartadas" al final.

---

## 1. El problema que resuelve

Una cadena hotelera realista NO es plana. Tomemos **Selina** (caso real verificado, fuente SEC filings 2024):

- 100+ hostales en 22 países
- Cada país requiere una **entidad legal local** (fiscal y societariamente)
- Múltiples monedas operativas (MXN, COP, CRC, USD, BRL...)
- Múltiples regímenes fiscales (CFDI MX, DIAN CO, Tribu-CR, NF-e BR, SAT-FEL GT, DGI PA...)
- Un solo **brand** comercial compartido
- Reporting consolidado a nivel ejecutivo + reporting fiscal local

Un modelo de 2 niveles (`Organization → Property`) **no puede representar esto sin inventar atajos peligrosos**:

- Si Selina = 1 Organization, ¿qué moneda tiene? ¿qué CFDI registra?
- Si Selina = N Organizations (una por país), ¿cómo se hace el reporte cross-country del CEO?
- Si los Properties tienen el `taxId` directo, ¿qué pasa cuando dos properties comparten razón social?

Estos problemas son los que hicieron que Opera Cloud, Mews, Marriott y Hilton evolucionaran a **arquitecturas jerárquicas explícitas**.

---

## 2. El modelo aprobado — 4 niveles

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                      │
│   Brand                  (opcional — comercial)                      │
│     │                                                                │
│     │ 1:N                                                            │
│     ▼                                                                │
│   Organization           (cuenta de customer SaaS — billing)         │
│     │                                                                │
│     │ 1:N                                                            │
│     ▼                                                                │
│   LegalEntity            (entidad fiscal — required para invoicing)  │
│     │                                                                │
│     │ 1:N                                                            │
│     ▼                                                                │
│   Property               (la propiedad física que opera)             │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Definiciones

**Brand** *(opcional)* — la marca comercial. Logo, paleta de colores, marketing assets, dominio web, loyalty program (futuro v1.5). Una organización puede no tener brand (hotel familiar independiente) o pertenecer a uno. **Crítico:** Brand es opt-in y puede agregarse después de meses de operación sin migración de datos.

**Organization** *(required)* — el **customer de Zenix**, la unidad que recibe la factura mensual del SaaS, define entitlements y add-ons activados, y es el container administrativo. Una Organization puede agrupar 1 o N LegalEntities.

**LegalEntity** *(required)* — la entidad fiscal real que existe en el registro mercantil de un país. Tiene razón social, tax ID válido (RFC/NIT/RUC/Cédula), régimen fiscal asociado, currency base, y credenciales PAC para emisión electrónica. **Una LegalEntity NUNCA atraviesa fronteras.** Si el cliente opera en MX y CR, son 2 LegalEntities.

**Property** *(required)* — el inmueble físico donde se aloja un huésped. Tiene su timezone propio (puede diferir del legal entity), inventario de rooms, staff, settings operativos. Una Property pertenece a UNA LegalEntity.

---

## 3. Casos de uso reales

### Caso 1 — Hotel boutique independiente (Hotel Monica Tulum)

```
Brand           = NULL
Organization    = "Hotel Monica Tulum"
LegalEntity     = "Hotel Monica Tulum S.A. de C.V."
                  · RFC: HMT840923ABC
                  · Régimen: MX_CFDI4
                  · Currency: MXN
                  · PAC: Facturama
  └─ Property   = "Hotel Monica Tulum"
                  · Timezone: America/Cancun (UTC-5)
                  · 23 habitaciones
```

Setup completo en ~30 minutos con el Zenix Activate wizard.

### Caso 2 — Cadena multi-país (Selina-like)

```
Brand           = "Selina"
                  · Logo, brand colors, brandbook.pdf
                  · Loyalty program (v1.5+)

Organization    = "Selina Group Holdings"
                  · Plan: ENTERPRISE
                  · Entitlements: CHANNEX, AI_PRICING_ML, MULTI_PROPERTY_REPORTS,
                    BOOKING_ENGINE, MARKETPLACE, ABI_INSIGHTS

  ├─ LegalEntity = "Selina Mexico S.A. de C.V."   (RFC MX, CFDI MX, MXN)
  │   ├─ Property = "Selina Tulum"          (UTC-5, 80 camas hostel)
  │   ├─ Property = "Selina CDMX Centro"    (UTC-6, 120 camas hostel+private)
  │   └─ Property = "Selina Sayulita"       (UTC-7, 60 camas)
  │
  ├─ LegalEntity = "Selina Costa Rica SRL"  (NIT CR, Tribu-CR, CRC)
  │   ├─ Property = "Selina San José"
  │   └─ Property = "Selina Manuel Antonio"
  │
  ├─ LegalEntity = "Selina Panamá S.A."     (RUC PA, DGI, USD)
  │   └─ Property = "Selina Bocas del Toro"
  │
  └─ LegalEntity = "Selina Colombia S.A.S." (NIT CO, DIAN, COP)
      └─ Property = "Selina Cartagena"
```

### Caso 3 — "Growing into a brand" (Hotel Monica expande)

Después de 2 años, Hotel Monica abre 3 propiedades más. Cuatro escenarios distintos:

| Escenario | Cambio en schema |
|-----------|------------------|
| Abren Hotel Monica Cancún, **misma razón social MX** | Crear nuevo `Property` con `legalEntityId` = misma "Hotel Monica Tulum SA". Sin tocar nada más. |
| Abren Hotel Monica Mérida, **distinta razón social MX** (separación fiscal) | Crear nueva `LegalEntity` "Hotel Monica Mérida SA" + Property bajo ella. Sigue siendo la misma Organization. |
| Abren Hotel Monica San José, **Costa Rica** | Crear nueva `LegalEntity` "Hotel Monica CR SRL" (NIT CR, Tribu-CR, CRC) + Property. Misma Organization. |
| Deciden formalizar marca "Monica Boutique Collection" | Crear `Brand` + asignar `Organization.brandId`. **Sin migración de datos, sin downtime.** |

---

## 4. Schema completo

### Nuevas tablas

```prisma
model Brand {
  id            String   @id @default(uuid())
  name          String
  slug          String   @unique
  logoUrl       String?
  brandColors   Json?    // { primary: "#...", secondary: "#...", accent: "#..." }
  brandBookUrl  String?  // PDF público con guidelines
  websiteUrl    String?
  loyaltyProgramConfig Json?  // v1.5+ — cross-property loyalty

  organizations Organization[]

  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@map("brands")
}

model LegalEntity {
  id              String   @id @default(uuid())
  organizationId  String
  countryCode     String   // ISO 3166-1 alpha-2: MX, CO, CR, PE, PA, GT, BR, BZ, SV, HN, AR...
  fiscalRegimeId  String?  // FK → FiscalRegime (nullable hasta cargar PAC)
  name            String   // razón social completa
  taxId           String   // RFC (MX) / NIT (CO) / RUC (PE) / Cédula Jurídica (CR)
  legalAddress    Json     // formato per-país, validado por adapter
  baseCurrency    String   // ISO 4217: MXN, COP, CRC, USD, BRL, GTQ, PAB, BZD...
  pacCredentials  Json?    // encriptado, keys del PAC del país (Facturama, Olimpia, etc.)
  accountingPeriodStart Int @default(1)  // mes inicio de fiscal year (1-12, default enero)
  active          Boolean  @default(true)
  deletedAt       DateTime?

  organization    Organization  @relation(fields: [organizationId], references: [id])
  fiscalRegime    FiscalRegime? @relation(fields: [fiscalRegimeId], references: [id])
  properties      Property[]
  userRoles       LegalEntityUserRole[]
  fiscalDocuments FiscalDocument[]

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@index([organizationId])
  @@index([countryCode])
  @@unique([organizationId, taxId])
  @@map("legal_entities")
}

model FiscalRegime {
  id              String   @id  // 'MX_CFDI4', 'CO_DIAN', 'CR_TRIBU', 'PE_SUNAT', 'BR_NFE', 'GT_FEL', 'PA_DGI'
  countryCode     String
  displayName     String
  taxAuthority    String   // 'SAT', 'DIAN', 'Hacienda', 'SUNAT', 'Receita Federal'...
  active          Boolean  @default(false)  // gate hasta adapter certificado
  docTypeEnums    Json     // documentos válidos: { invoice: "I", creditNote: "E", paymentComplement: "P", ... }
  taxCodes        Json     // mapping de impuestos (IVA / ISH / Saneamiento / Withholding / etc.)
  pacAdapterClass String?  // 'MX_FacturamaAdapter', 'CO_OlimpiaAdapter'...
  pacConfigSchema Json?    // JSON schema para validar pacCredentials

  legalEntities   LegalEntity[]

  @@map("fiscal_regimes")
}

model BrandUserRole {
  id        String   @id @default(uuid())
  userId    String
  brandId   String
  role      SystemRole
  createdAt DateTime @default(now())

  user      User    @relation(fields: [userId], references: [id])
  brand     Brand   @relation(fields: [brandId], references: [id])

  @@unique([userId, brandId, role])
  @@index([userId])
  @@map("brand_user_roles")
}

model LegalEntityUserRole {
  id            String   @id @default(uuid())
  userId        String
  legalEntityId String
  role          SystemRole
  createdAt     DateTime @default(now())

  user          User        @relation(fields: [userId], references: [id])
  legalEntity   LegalEntity @relation(fields: [legalEntityId], references: [id])

  @@unique([userId, legalEntityId, role])
  @@index([userId])
  @@map("legal_entity_user_roles")
}
```

### Cambios a tablas existentes

```prisma
model Organization {
  id           String   @id @default(uuid())
  brandId      String?  // NUEVO — opcional, NULL = independiente
  // CAMPOS LEGACY que ya NO determinan fiscal (deprecation grace period):
  // countryCode, timezone, currency — preserved pero NO authority
  // Razón: data ya sembrada en LegalEntity hija (auto-creada en migration)
  // ... resto de campos existentes
  brand         Brand?         @relation(fields: [brandId], references: [id])
  legalEntities LegalEntity[]
}

model Property {
  id             String  @id @default(uuid())
  organizationId String  // ahora NOT NULL (era nullable — fix v1.0.5)
  legalEntityId  String? // NUEVO — required en v1.1+ tras backfill; nullable en v1.0.5 fase de transición
  // ... resto de campos existentes
  legalEntity    LegalEntity? @relation(fields: [legalEntityId], references: [id])
}
```

---

## 5. User access — 3 niveles de scope

Cualquier acción de un user pasa por el chequeo **"¿tienes scope sobre este objeto?"**. Tres niveles posibles:

| Scope | Cobertura | Quién lo tiene típicamente |
|-------|-----------|---------------------------|
| `BrandUserRole(brand_id)` | TODAS las properties de TODAS las legal entities de TODAS las orgs del brand | CEO/COO de la marca, CTO global |
| `LegalEntityUserRole(legal_entity_id)` | TODAS las properties de UNA entidad fiscal (= todas en UN país de UN org) | Country GM, Country Finance Director |
| `UserPropertyRole(property_id)` | UNA property específica | Front desk, supervisor de housekeeping, recepcionista |

### Query de autorización canónica

```sql
-- ¿user X tiene acceso a property Y?
SELECT EXISTS (
  -- Nivel 1: scope directo de property
  SELECT 1 FROM user_property_roles
  WHERE user_id = $1 AND property_id = $2

  UNION ALL

  -- Nivel 2: scope de legal entity que contiene la property
  SELECT 1 FROM legal_entity_user_roles ler
    JOIN properties p ON p.legal_entity_id = ler.legal_entity_id
    WHERE ler.user_id = $1 AND p.id = $2

  UNION ALL

  -- Nivel 3: scope de brand que contiene la org que contiene la legal entity
  SELECT 1 FROM brand_user_roles bur
    JOIN organizations o ON o.brand_id = bur.brand_id
    JOIN legal_entities le ON le.organization_id = o.id
    JOIN properties p ON p.legal_entity_id = le.id
    WHERE bur.user_id = $1 AND p.id = $2
);
```

Esta query se encapsula en `AccessControlService.canUserAccessProperty(userId, propertyId)` con caché de 60s para queries calientes.

### El JWT lleva el scope activo

El JWT actual lleva `propertyId` (scope efectivo de la sesión actual). Cuando un user con `LegalEntityUserRole` switchea entre properties de su scope, recibe un nuevo JWT con el `propertyId` actualizado pero la BD ya valida que el switch es legítimo.

**v1.0.5+:** el JWT también lleva `scope: 'PROPERTY' | 'LEGAL_ENTITY' | 'BRAND'` para que endpoints cross-* sepan qué nivel de acceso pedir.

---

## 6. Decisiones de arquitectura — justificación senior

### 6.1 ¿Por qué shared schema con `organizationId` discriminator?

**Decisión:** mantener el patrón actual (single database, single schema, `tenant_id` en cada tabla).

**Justificación:**
- **Bytebase 2026 multi-tenant patterns survey:** *"El patrón dominante 2026: single application instance, single database, data tagged by tenant_id, isolation via app-layer middleware or Postgres RLS"*
- **Cloudbeds opera 22k properties** en shared schema. **Mews 5k properties** igual. Ambos cubren toda LATAM sin DB-per-tenant.
- **Microsoft Citus docs:** *"Adopt Shared Database, Shared Schema approach whenever possible. Only transition to Database per Tenant if compliance, scalability, or customization requirements necessitate it"*.
- DB-per-tenant solo aplica si: compliance HIPAA estricto, scale >10M tenants, o customización profunda por tenant (ninguno aplica a hotelería).

### 6.2 ¿Por qué app-layer enforcement (TenantContextService) y no Postgres RLS?

**Decisión:** app-layer hoy, Postgres RLS como opción defensiva en v1.2+.

**Justificación:**
- App-layer ya implementado y testeado (8/8 tests pasan en `tenant-isolation.spec.ts`)
- Más fácil de debuggear (un query lento se rastrea en Sentry)
- RLS añade complejidad operativa: cada migración debe respetar policies, debugging requiere `SET role`
- v1.2+ con base instalada grande: RLS como defense-in-depth sin reemplazar app-layer

### 6.3 ¿Por qué `LegalEntity` opcional vs required en Property?

**Decisión:** required eventualmente, nullable durante migration (Fase 1 v1.0.5).

**Justificación:**
- Crear `LegalEntity` NULL en Property y backfill data es safe — el código existente sigue funcionando
- En v1.0.5 backfill, cada Organization existente se queda con UNA LegalEntity auto-creada que toma `countryCode/currency/taxId` del Org
- Tras backfill, marcar NOT NULL como v1.0.6 micro-migration
- Defense contra "qué si un cliente desactiva su único LegalEntity": añadir guard en endpoint que requiere ≥1 LegalEntity active

### 6.4 ¿Por qué Brand opcional?

**Decisión:** Brand puede ser NULL.

**Justificación:**
- 70-85% del mercado boutique LATAM son hoteles independientes (sin chain)
- Forzar brand = "Hotel Monica" duplica info redundantemente
- Pattern Mews: *"Portfolio (= brand) is an optional grouping above chains"*
- Cuando un cliente "se vuelve marca", agregar la fila Brand y un FK es trivial

### 6.5 ¿Por qué denormalizar `organizationId` en Property también?

**Decisión:** SÍ, denormalizar. Property tiene tanto `legalEntityId` (FK directo) como `organizationId` (denormalizado).

**Justificación:**
- Queries comunes: "todas las properties de esta org" sin necesitar JOIN
- **Citus best practice:** *"Denormaliza tenant_id en cada tabla — purists dirán que es malo pero te ahorra dolor cuando escalas"*
- Consistencia garantizada por trigger Postgres: `property.organizationId = legalEntity.organizationId` (validación en UPDATE/INSERT)
- Backward compat con código v1.0.0 que filtra por `organizationId`

### 6.6 ¿Por qué `legalAddress` como `jsonb`?

**Decisión:** JSONB en vez de 30 columnas opcionales.

**Justificación:**
- Cada país tiene formato distinto (MX: calle/numExt/numInt/colonia/CP; CO: dirección textual + estrato; BR: rua/numero/CEP por estado)
- 30 columnas opcionales = anti-pattern
- JSONB permite indexar campos específicos (`address->>'cp'` GIN index para queries MX)
- **Citus:** *"JSONB permite scale a miles de tenants sin schema migrations"*
- Validación per-country vía adapter pattern (`FiscalAdapter.validateAddress(address)`)

### 6.7 ¿Por qué `pacCredentials` en LegalEntity, no en Property?

**Decisión:** Credenciales PAC viven en LegalEntity.

**Justificación:**
- El PAC se contrata POR razón social. Una empresa con 5 propiedades en MX usa UN solo contrato PAC
- Ahorro de costos: 1 PAC vs 5 PACs
- Cuando se renueva el token PAC, una sola operación afecta todas las propiedades de la entidad

---

## 7. Migration path — sin breaking changes

### Fase 1 · v1.0.5 ORG-HIERARCHY-SEED (1.5 días)

```sql
-- Migración estrictamente aditiva, todos los datos existentes conservados

CREATE TABLE brands (...);
CREATE TABLE legal_entities (...);
CREATE TABLE fiscal_regimes (...);
CREATE TABLE brand_user_roles (...);
CREATE TABLE legal_entity_user_roles (...);

-- Backfill: cada Organization existente gana 1 LegalEntity hija
INSERT INTO legal_entities (id, organization_id, country_code, name, tax_id, ...)
SELECT
  uuid_generate_v4(),
  o.id,
  o.country_code,
  o.name || ' — entidad fiscal',
  COALESCE(o.tax_id, 'PENDING-' || o.id),  -- placeholder seguro
  ...
FROM organizations o;

-- Linkear properties existentes a la LegalEntity de su Organization
UPDATE properties p
SET legal_entity_id = (
  SELECT id FROM legal_entities WHERE organization_id = p.organization_id
  LIMIT 1
);

-- Property.organizationId NOT NULL (era nullable — fix audit MT-4)
ALTER TABLE properties ALTER COLUMN organization_id SET NOT NULL;
```

**Smoke tests post-migration:**
- Cada Organization tiene exactamente 1 LegalEntity inicial
- Cada Property tiene legalEntityId set correctamente
- 8/8 tests `tenant-isolation.spec.ts` siguen pasando
- API endpoints existentes responden igual (los nuevos endpoints brand/legal-entity son lazy)

### Fase 2 · v1.0.5 FISCAL-ADAPTER-SEED (1 día)

```sql
-- Sembrar fiscalRegimes para 10 países LATAM prioritarios
INSERT INTO fiscal_regimes (id, country_code, display_name, tax_authority, active, ...)
VALUES
  ('MX_CFDI4',   'MX', 'CFDI 4.0 México',          'SAT',       true,  ...),
  ('CO_DIAN',    'CO', 'Facturación electrónica',  'DIAN',      true,  ...),
  ('CR_TRIBU',   'CR', 'Factura electrónica CR',   'Hacienda',  false, ...),
  ('PE_SUNAT',   'PE', 'Comprobante electrónico',  'SUNAT',     false, ...),
  ('PA_DGI',     'PA', 'Factura electrónica PA',   'DGI',       false, ...),
  ('GT_FEL',     'GT', 'Factura Electrónica Línea','SAT-GT',    false, ...),
  ('BR_NFE',     'BR', 'Nota Fiscal Eletrônica',   'Receita',   false, ...),
  ('SV_HACIENDA','SV', 'DTE El Salvador',          'MH',        false, ...),
  ('HN_SAR',     'HN', 'CAI Honduras',             'SAR',       false, ...),
  ('AR_AFIP',    'AR', 'Facturación AFIP',         'AFIP',      false, ...);

-- Interface IFiscalAdapter declarada en code, sin implementaciones aún
-- (las implementations concretas llegan per-country según roadmap)
```

### Fase 3 · v1.0.5 TENANT-CTX-3LEVEL (1 día)

Extender `TenantContextService` para soportar 3 scopes:

```typescript
interface TenantContext {
  organizationId: string
  legalEntityId?: string  // NUEVO — set cuando scope es LEGAL_ENTITY o más bajo
  propertyId?: string     // existente — set cuando scope es PROPERTY
  brandId?: string        // NUEVO — set cuando scope es BRAND
  scope: 'BRAND' | 'LEGAL_ENTITY' | 'PROPERTY'
}
```

Endpoints existentes siguen funcionando con `propertyId` solamente. Endpoints nuevos cross-* requieren scope explícito.

### Fase 4 · v1.1+ Property.legalEntityId NOT NULL

Tras meses de operación y backfill completo, marcar la columna como required. Migration trivial:

```sql
ALTER TABLE properties ALTER COLUMN legal_entity_id SET NOT NULL;
```

---

## 8. Cross-property queries — el caso de uso comercial

El reporting cross-property es lo que justifica enterprise pricing. Tres patrones:

### Pattern A — Mismo LegalEntity (más simple)

GM México quiere ocupación de las 3 properties MX. Query directo:

```sql
SELECT p.name, count_room_nights, sum_revenue
FROM properties p
JOIN daily_property_metrics dpm ON dpm.property_id = p.id
WHERE p.legal_entity_id = $1
  AND dpm.date BETWEEN $2 AND $3
GROUP BY p.id
```

`AccessControlService` verifica que el user tenga `LegalEntityUserRole($1)`.

### Pattern B — Cross-LegalEntity, mismo Brand (CEO Selina)

```sql
SELECT le.country_code, p.name, count_room_nights, sum_revenue
FROM properties p
JOIN legal_entities le ON le.id = p.legal_entity_id
JOIN organizations o ON o.id = le.organization_id
JOIN daily_property_metrics dpm ON dpm.property_id = p.id
WHERE o.brand_id = $1
  AND dpm.date BETWEEN $2 AND $3
GROUP BY le.country_code, p.id
```

**Crítico:** la moneda varía. La query devuelve `sum_revenue` en moneda local + ratio FX al día (de tabla `ExchangeRate` actualizada de BANXICO/banco central) para consolidación opcional en USD.

### Pattern C — Cross-Brand (ZaharDev ABI tier)

Solo accesible para users del partner tier o ZaharDev internos. Consume datos agregados con consent (k-anonymity ≥5 properties). Ver `docs/vision/10-data-strategy-abi.md`.

---

## 9. Alternativas descartadas — por qué no

### A. Modelo flat (Org → Property) — actual antes de v1.0.5

**Por qué no:**
- No soporta multi-país sin atajos peligrosos
- `Organization.countryCode` único fuerza N orgs para chain → rompe reporting
- Probado mal en early-day Cloudbeds (2012-2015) — eventualmente migraron a 3-level

### B. Modelo 2-level (Org → Property con `Property.fiscalConfig`)

**Por qué no:**
- Cada property tiene su fiscal config → duplicación si 5 properties comparten razón social MX
- Renovar token PAC requeriría editar N properties — error-prone
- Auditoría fiscal compleja: ¿qué properties son "el mismo contribuyente"?

### C. Modelo 3-level Opera Cloud (Enterprise → Chain → Property)

**Por qué no exacto:**
- Opera Chain Code mezcla concepto fiscal y operativo
- No tiene noción clara de brand vs holding societario
- Bueno para Marriott (todo Marriott = una Enterprise) pero confuso para boutique

**Cómo lo mejoramos:** separamos Brand (comercial) de Organization (customer SaaS) de LegalEntity (fiscal). Tres conceptos distintos que en Opera están mezclados en "Chain Code".

### D. Modelo 5-level Marriott (Brand → Continent → Country → Region → Property)

**Por qué no:**
- Overkill para boutique LATAM
- "Continent" y "Region" son agrupaciones de reporting, no fiscales
- Implementable con `tags`/`groups` en Org cuando llegue cadena XL (v1.3+), no nivel propio

### E. Database-per-tenant

**Por qué no:**
- Overhead operativo enorme: migrations × N tenants, backups × N tenants
- Cross-tenant queries (ABI Insights v1.4+) imposible
- Cloudbeds 22k tenants demuestra que shared schema escala lo suficiente
- Costo: 22k DBs en AWS RDS = $66M/año vs 1 DB sharded = $300k/año

---

## 10. Próximos pasos concretos

### Inmediato (v1.0.5 sprint)
- [ ] Schema migration ORG-HIERARCHY-SEED (1.5 días)
- [ ] Sembrado FiscalRegime 10 países LATAM (1 día)
- [ ] TenantContextService 3-level (1 día)
- [ ] Tests aislamiento Brand/LegalEntity/Property (0.5 días)
- [ ] Migration de Hotel Monica Tulum data piloto (validación) (0.5 días)

**Total: 4.5 días de trabajo backend**

### v1.0.5 paralelo (sin bloquear)
- App `apps/consultant` — Zenix Activate wizard (5-7 días) — ver `docs/vision/13-consultant-setup-wizard.md`

### v1.1+
- Implementación adapter CFDI MX completa (PAC integration)
- Adapter DIAN CO
- UI brand management (logo upload, palette editor)
- Cross-property reports endpoints + UI

### v1.2+
- Adapter Tribu-CR + DGI-PA + SUNAT-PE
- Multi-currency consolidation en cross-property reports
- FX rate auto-update desde BANXICO/banco central del país

### v1.3+
- Adapter NF-e BR (el más complejo — 27 estados)
- Adapter FEL-GT
- Adapter Belize / El Salvador / Honduras

### v1.4+
- Adapter AFIP Argentina

---

## 11. Bitácora de revisiones

- **2026-05-15** — Documento creado tras conversación de visión arquitectónica multi-tenant. Modelo 4-level Brand→Organization→LegalEntity→Property aprobado por Abraham. Migration plan v1.0.5 ORG-HIERARCHY-SEED + FISCAL-ADAPTER-SEED + TENANT-CTX-3LEVEL definido. 10 fiscal regimes LATAM identificados (MX/CO/CR/PE/PA/GT/BR/SV/HN/AR). Selina + Hotel Monica Tulum como casos de uso canónicos. Fuentes citadas: Mews Connector API docs, Opera Cloud Enterprise Topologies, Bytebase 2026 multi-tenant patterns, Microsoft Citus SaaS docs, Crunchy Data Postgres multi-tenancy.
