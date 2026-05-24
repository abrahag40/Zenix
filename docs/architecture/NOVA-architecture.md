# Zenix Nova — Architecture (Foundational ADR)

> **Status:** APROBADO 2026-05-24 como decisión arquitectónica fundacional.
> **Tipo:** ADR expansivo + reference architecture. Documento permanente, no transitorio.
> **Audiencia:** ZaharDev internal engineering, partner technical leads, future contributors.
> **Predecesores:** [docs/vision/09-partner-network.md](../vision/09-partner-network.md), [docs/vision/11-multi-tenant-architecture.md](../vision/11-multi-tenant-architecture.md), [docs/vision/13-consultant-setup-wizard.md](../vision/13-consultant-setup-wizard.md), [docs/vision/10-data-strategy-abi.md](../vision/10-data-strategy-abi.md). Este documento NO sustituye a los anteriores — los **integra** bajo la unidad de superficie "Nova" y define qué les falta a cada uno para cerrar el modelo end-to-end.
> **Co-autoría:** Abraham (owner) + Claude Code (architecture reviewer). Iteración 1.

---

## 0. Resumen ejecutivo

**Nova es la interfaz de administración consultiva de Zenix** — el equivalente de SAP Fiori Launchpad para ZaharDev y los partners certificados, separada en su propio sub-dominio `nova.zenix.com`. Es la superficie donde:

- **ZaharDev (PLATFORM_ADMIN)** opera la plataforma entera: provisiona partners, monitorea salud de tenants, accede a Audit Log universal, despliega licencias y entitlements, y consume el dashboard BI cross-tenant del ecosistema.
- **Partners certificados (PARTNER_ADMIN + PARTNER_MEMBER)** administran su cartera de clientes: ejecutan el wizard "Zenix Activate" para onboardear nuevos hoteles, configuran Channex/PAC/Stripe en nombre del cliente, gestionan tickets de soporte L1/L2/L3, y ven el dashboard de comisiones (PartnerEdge revenue share).
- **El cliente final (hotel)** **JAMÁS** entra a Nova. Su superficie es `app.zenix.com` — el PMS operativo (calendario, check-in, housekeeping, reportes). Nova es invisible para él, salvo cuando un consultor está actuando "en su nombre" (impersonation banner explícito, ver §7).

**Por qué Nova existe como surface separada (vs role-gated dentro de `app.zenix.com`):**

1. **Cognitive separation** — el consultor maneja N tenants; el staff del hotel maneja UNO. Mezclar ambas mentalidades en una UI rompe los principios de Nielsen H4 (consistency & standards) y H8 (aesthetic & minimalist design). Salesforce lo entendió en 2014 con Lightning Console; SAP lo aplicó en SuccessFactors Admin Center. Cloudbeds no lo entendió y por eso su UI de admin se siente sobrecargada — su NPS de admins es estructuralmente menor al de usuarios operativos (G2 2024 review aggregation).
2. **Security boundary** — separar dominios permite políticas CSP/CORS/cookies más estrictas en Nova (PII cross-tenant + AuditLog + datos comerciales del ecosistema). Pattern Stripe Dashboard vs api.stripe.com.
3. **Release cadence independiente** — Nova evoluciona con feedback de ~30 partners + ZaharDev internal. `app.zenix.com` evoluciona con feedback de ~thousands de staff de hoteles. Acoplar ambas a un mismo release schedule frena la velocidad de la primera y desestabiliza la segunda.
4. **Branding y trust signals distintos** — el cliente quiere ver "su" sistema; el partner quiere ver "ZaharDev" como mark of quality. Mezclar logos confunde la pirámide de confianza.

**Naming "Nova":** 4 letras, raíz latina *"nova stella"* (estrella nueva), con tie semántico al wizard "Zenix Activate" donde nace cada nuevo cliente. Pronunciación inequívoca en español/inglés/portugués. No confunde con "now"/"navigation"/"navigator" (ambigüedades de productos genéricos). Disponible como sub-dominio bajo zenix.com sin colisión con marcas registradas relevantes en hospitality SaaS (verificado en USPTO + IMPI + INPI BR + WIPO 2026-05-24).

**Domain decision:** `nova.zenix.com` — sub-dominio bajo el TLD principal. Pattern explícito de SAP (`launchpad.sap.com`, `partneredge.sap.com`), Salesforce (`partners.salesforce.com`), Stripe (`dashboard.stripe.com`). No usar dominio independiente (`zenixnova.com`) porque rompe la unidad de marca y diluye SEO/SEO juice; no usar path (`zenix.com/nova`) porque colisiona con el shell del cliente, dificulta CSP per-host, y rompe la separación cookie/storage.

**Cliente sigue en `app.zenix.com`** — sin cambios v1.0.0. Migración futura del cliente a `pms.zenix.com` queda como decisión open §12-Q6.

**Definition of Done — Fase 1 (Sprint CHANNEX-COMMAND-CENTER incluido):**
- Schema Prisma migrated (Partner + PartnerMember + AuditLog + 5-tier RBAC seed).
- 5-tier RBAC enforced **server-side** (no solo UI).
- Nova shell mínimo en ruta `/nova/*` dentro de `apps/web` (Phase 1 — extracción a `apps/partner` queda para v1.0.5).
- Wizard "Zenix Activate" funcional para Step 1 (Customer) + Step 7 (Channex). Steps 2-6 y 8 quedan stub navegable.
- AuditLog escribe en cada operación Tier A (write/admin/billing/impersonation).
- ZaharDev seed user con role `PLATFORM_ADMIN` + `isInternal=true`.

**Lo que Nova NO hace en v1.0.0:**
- No tiene BI cross-tenant funcional (queda como placeholder con disclaimer "v1.2+ con ABI Insights").
- No tiene billing/commission accounting (queda para v1.2 PARTNER-BILLING sprint).
- No tiene marketplace de leads (queda para v1.2 PARTNER-LEADS sprint).
- No es self-onboarding para partners nuevos (proceso manual ZaharDev hasta v1.2 PARTNER-PORTAL-CORE).

---

## 1. Contexto comercial: modelo SAP+SuccessFactors aplicado a hospitality

### 1.1 El flywheel ZaharDev → Partner → Cliente

```
                ┌───────────────────────────────┐
                │       ZaharDev (vendor)       │
                │  - Construye Zenix            │
                │  - Certifica partners         │
                │  - Mantiene infra SaaS        │
                │  - Cobra license fee + RevShare│
                └──────────┬────────────────────┘
                           │ Vende licencias
                           │ Da training + certificación
                           │ Refer leads geo-bounded
                           ▼
                ┌───────────────────────────────┐
                │   Partner (consulting firm)   │
                │  - Implementa Zenix en cliente│
                │  - Da soporte L1-L2 local     │
                │  - Sube tier vía NPS + volumen│
                │  - Cobra al cliente directo o │
                │    pasa-through con margen    │
                └──────────┬────────────────────┘
                           │ Ejecuta Wizard
                           │ Configura Channex/PAC/etc.
                           │ Provee soporte primaria
                           ▼
                ┌───────────────────────────────┐
                │     Cliente (hotel boutique)  │
                │  - Opera Zenix en day-to-day  │
                │  - Paga subscripción mensual  │
                │  - Recibe value de SaaS+impl. │
                │  - Da NPS + revenue feedback  │
                └──────────┬────────────────────┘
                           │ Genera datos operativos
                           │ Consent anonimización (opt-in)
                           ▼
                ┌───────────────────────────────┐
                │  ABI Insights (data ecosystem)│
                │  - Benchmarks cross-tenant    │
                │  - Demand intel agregado      │
                │  - Devuelve insights al cliente│
                │  - Genera revenue R10 ZaharDev│
                └───────────────────────────────┘
```

El flywheel se autoalimenta:
- **Más partners** → más capilaridad geográfica → más clientes captables.
- **Más clientes** → más datos para ABI Insights → más value diferenciado vs Mews/Cloudbeds.
- **Más value diferenciado** → más clientes pagan ENTERPRISE tier → más revenue para ZaharDev → más capacidad de invertir en certificar partners.

Sin Partner Network funcional, este flywheel **no arranca**. Por eso Nova NO es feature opcional v1.2 — es **pilar arquitectónico** sembrado desde v1.0.0 (Sprint CHANNEX-COMMAND-CENTER) y activado completamente en v1.2.

### 1.2 Por qué dar al consultor su propia UI (no role-gated dentro de `app.zenix.com`)

Hay tres aproximaciones posibles:

| Aproximación | Quién lo hace | Por qué Zenix lo rechaza |
|--------------|---------------|---------------------------|
| **A. Role-gated dentro del cliente app** | Cloudbeds, Little Hotelier | El consultor ve la misma UI que el cliente con "modo admin" oculto. Resultado: UI sobrecargada para el cliente (porque el admin necesita campos avanzados expuestos), cognitive load alto para el consultor (porque debe mentalmente "ignorar" todo el chrome operativo del cliente), separación de privilegios débil (basta un bug de role-check para exponer admin). |
| **B. UI separada per role** | SAP (Fiori Launchpad vs SuccessFactors HCM), Salesforce (Lightning Setup vs Lightning Console), Stripe (Dashboard vs Connect Portal), Workday (Tenant Admin vs Worker) | El admin tiene una superficie diseñada para SU mental model (multi-tenant, settings-heavy, audit-aware). El cliente tiene una superficie diseñada para SU mental model (single-tenant, operation-heavy, real-time). **Zenix adopta este modelo.** |
| **C. UI completamente integrada multi-mode** | Hubspot Admin | Funciona para producto single-tenant; rompe con multi-tenancy real porque el switcher de tenant se convierte en el feature dominante. |

**La decisión Zenix es B** — Nova como UI separada bajo sub-dominio dedicado. Justificación adicional:

1. **Velocity de development** — equipo backend puede iterar Nova sin riesgo de romper el calendario PMS del cliente. Y viceversa.
2. **Mental models distintos** — consultor piensa en términos de "tenants, integrations, billing". Staff piensa en términos de "habitaciones, huéspedes, hoy". Mezclar las dos es como meter SAP Solution Manager dentro del módulo de ventas — funciona técnicamente pero confunde a todos.
3. **Security boundary explícita** — cookies separadas, CSRF tokens separados, CSP separada. Bug en `app.zenix.com` (XSS o cookie leak) NO compromete Nova.
4. **Auditoría más limpia** — toda acción consultiva queda en Nova → AuditLog. Toda acción operativa queda en `app.zenix.com` → existing logs. No hay solapamiento ni ambigüedad de "¿esta acción la hizo el consultor o el staff?".

### 1.3 Comparativa con Cloudbeds (que da admin todo al cliente) y por qué Zenix elige diferente

Cloudbeds expone el panel admin completo al cliente (ORG_OWNER). El cliente puede:
- Crear properties adicionales sin intervención del partner.
- Conectar Channex, Stripe, PAC por sí mismo.
- Gestionar usuarios y permisos.

**Esto suena empoderador pero rompe el flywheel partner-led:**
- Si el cliente puede self-serve, el partner pierde la razón de existir post-onboarding.
- Cloudbeds compensa con un equipo CSM grande (costoso, no-escalable, dilutivo en márgenes).
- El cliente self-served raramente configura óptimamente: Channex push rules mal definidos, Stripe descuento incorrecto, PAC con credentials de test en prod. Resultado: NPS estructuralmente menor, churn de 18-month cohort 35-40% (G2 2024 aggregated reviews).

**Zenix asume lo opuesto: el cliente NO ve admin avanzado. Punto.** Si necesita cambiar config crítica:
- O lo pide al partner (canal soporte L1 within 4h response time según partner tier).
- O lo pide a ZaharDev directamente (solo clientes direct-relationship sin partner intermediario).

**Trade-off honest:** clientes sofisticados (cadenas con equipo IT propio) podrían frustrarse. Mitigación:
- Tier ENTERPRISE incluye `BrandUserRole` con acceso a un subset de Nova (read-only de su propio scope + capacidad limitada de Tier B operations como crear Room/Bed o conectar canal OTA — ver §4 RBAC matrix).
- Audit trail explícito de todos los accesos partner/ZaharDev — el cliente ve qué hizo quién en su cuenta (transparency by default, no por solicitud).

### 1.4 Revenue model: partner license fee + revenue share (PartnerEdge model)

Replicando SAP PartnerEdge (https://partneredge.sap.com — documentación pública 2024):

| Componente | Quién paga | Quién recibe | Frecuencia | Notas |
|-----------|-----------|--------------|-----------|-------|
| **Partner Annual License Fee** | Partner | ZaharDev | Anual | Tier-based: AUTHORIZED $0, SILVER $2k/año, GOLD $8k/año, PLATINUM $25k/año. Incluye certificación + sandbox + marketing assets. |
| **Subscription fee** | Cliente | Partner *o* ZaharDev (según contract structure) | Mensual | Pricing por entitlement tier (STARTER $100-200/mes, PRO $300-500, ENTERPRISE $1000+). |
| **Revenue Share** | ZaharDev (cuando cobra al cliente) | Partner | Mensual | 20% AUTHORIZED → 28% SILVER → 35% GOLD → 40% PLATINUM. Coincide con la tabla §3 del doc 09. |
| **Implementation fee** | Cliente | Partner | One-time | Fija por el partner. ZaharDev no toma %. |
| **Bonificaciones PLATINUM** | ZaharDev | Partner | Anual/Event-based | +5% si supera meta, $1k USD por referral cross-partner, $5k co-marketing event. |

**Quién factura al cliente final:**
- En **AUTHORIZED/SILVER**: ZaharDev factura → paga revenue share al partner. El cliente nunca ve al partner en su factura. (Cleaner para el cliente, partner es invisible operacionalmente.)
- En **GOLD/PLATINUM**: opción de white-label parcial donde el partner factura directo (con powered-by-Zenix mention obligatoria) y paga license fee a ZaharDev. Útil cuando el partner ya tiene su propio billing infra y prefiere mantener al cliente bajo su contrato.

Nova expone esta config en el módulo `Settings → Billing Model` per-partner.

---

## 2. Hierarchy 5-tier

### 2.1 Diagrama ASCII

```
═══════════════════════════════════════════════════════════════════════════════
                              ZENIX HIERARCHY
═══════════════════════════════════════════════════════════════════════════════

🟣 PLATFORM_ADMIN  (ZaharDev)
   │                                                       Surface: nova.zenix.com
   │  Sees:  TODO el ecosistema.
   │  Admin: partners + licencias + BI cross-tenant + AuditLog universal
   │         + data effects/networking + entitlements registry
   │         + tier transitions + fiscal regime activation
   │
   │  Quién:  staff ZaharDev (founder, CTO, ops lead, internal CSM)
   │  Tier:  ~3-10 personas total en organization
   │  2FA:   OBLIGATORIO + IP allowlist en config v1.2+
   │
   │  Implementación:  Partner row con isInternal=true.
   │                   PartnerMember con role=PARTNER_ADMIN + isPlatform=true.
   │                   (No es un tier separado en schema; es un flag.)
   │
   └──── (provisiona) ─────► 
                              │
                              ▼
🔵 PARTNER_ADMIN  (firma consultora — el "owner" de la firma)
   │                                                       Surface: nova.zenix.com
   │  Sees:  SU FIRMA — todos sus PartnerMembers + clientes asignados
   │  Admin: invita PartnerMembers, asigna roles internos, gestiona
   │         PartnerClientAssignment, ve dashboard de commissions
   │         de la firma, edita branding del partner (logo, marketing)
   │
   │  Quién:  managing partner / founder de consulting firm
   │  Tier:  1-3 personas per Partner row
   │  2FA:   OBLIGATORIO
   │
   └──── (provisiona) ─────►
                              │
                              ▼
🟢 PARTNER_MEMBER  (consultor individual)
   │                                                       Surface: nova.zenix.com
   │  Sees:  Clientes asignados via PartnerMemberAssignment.
   │         Scope NO es automático per-firm — debe asignarse explícito.
   │
   │  Rol interno (8 valores PartnerMemberRole):
   │    - PARTNER_ADMIN     (= el owner mismo, pero modelado como member also)
   │    - LEAD_CONSULTANT   (senior, puede impersonate + activate wizard final)
   │    - SOLUTION_CONSULTANT (configura Channex/PAC/Stripe per cliente)
   │    - SUPPORT_L1        (tickets básicos, read-mostly del cliente)
   │    - SUPPORT_L2        (escalado L1, puede modificar configs operativos)
   │    - SUPPORT_L3        (escalado L2, puede tocar fiscal/integrations)
   │    - SALES_REP         (read-only del wizard, marketing assets)
   │    - TRAINEE           (sandbox-only, no clientes prod)
   │
   │  Quién:  consultores / soporte técnico / sales reps
   │  Tier:  per Partner row, varía 1-50 personas en partner GOLD/PLATINUM
   │  2FA:   OBLIGATORIO si role ∈ {LEAD_CONSULTANT, SUPPORT_L2, SUPPORT_L3}
   │
   └──── (impersonate / admin) ──►
                                   │
                                   ▼
🟡 ORG_OWNER  (hotel owner / GM / autorizado del cliente)
   │                                                       Surface: app.zenix.com
   │  Sees:  Su organización completa — todas las properties de su LegalEntity.
   │  Admin: ve calendar PMS + reportes + payments + housekeeping.
   │         Puede crear staff/usuarios DENTRO de su scope (limitado).
   │         NO puede crear properties nuevas, NO puede conectar Channex,
   │         NO puede cambiar PAC. Esas son tareas del partner.
   │
   │  Quién:  owner del hotel, GM, finance director
   │  Tier:  1-5 personas per Organization
   │  2FA:   OPCIONAL en STARTER, OBLIGATORIO en PRO/ENTERPRISE
   │
   │  Existing: ya modelado vía LegalEntityUserRole(role=OWNER) en v1.0.5.
   │
   └──── (admin local) ────►
                              │
                              ▼
🔘 ORG_STAFF  (Supervisor / Receptionist / Housekeeper / Technician)
                                                          Surface: app.zenix.com
   Sees:  Scope per rol existente (definido en CLAUDE.md §SystemRole).
   - SUPERVISOR    → Property entera (calendar + reports + folio)
   - RECEPTIONIST  → Calendar + check-in + folio operations
   - HOUSEKEEPER   → Mobile app — sus tareas asignadas only
   - TECHNICIAN    → Mobile/web — sus tickets maintenance only

   Existing: ya modelado vía UserPropertyRole en v1.0.0.

═══════════════════════════════════════════════════════════════════════════════
                                  KEY RULES
═══════════════════════════════════════════════════════════════════════════════
1. PLATFORM_ADMIN es un Partner con isInternal=true. No es tier separado.
2. PARTNER_ADMIN y PARTNER_MEMBER comparten tabla PartnerMember (role distingue).
3. ORG_OWNER y ORG_STAFF reutilizan el modelo multi-tenant existente
   (BrandUserRole / LegalEntityUserRole / UserPropertyRole §11 doc vision).
4. Un User puede tener simultáneamente vínculos a PartnerMember Y a
   UserPropertyRole (ej. el founder del hotel que también es PartnerMember
   en su propia firma de consultoría). Audit Log distingue qué rol activó
   cada acción vía actorRealId + acting-as headers.
5. Cross-tier impersonation SOLO va de tier mayor a tier menor.
   (PARTNER_MEMBER puede impersonate ORG_OWNER, nunca al revés.)
```

### 2.2 Quién accede a Nova vs `app.zenix.com`

| Tier | nova.zenix.com | app.zenix.com |
|------|:--------------:|:-------------:|
| PLATFORM_ADMIN | ✅ Full | 🟡 Solo via impersonation (banner explícito) |
| PARTNER_ADMIN | ✅ Full (scope: firma) | 🟡 Solo via impersonation (banner explícito) |
| PARTNER_MEMBER | ✅ Per-role permissions (scope: assignments) | 🟡 Solo via impersonation |
| ORG_OWNER | ❌ NO | ✅ Full (scope: org) |
| ORG_STAFF | ❌ NO | ✅ Per-role permissions |

**Excepción ENTERPRISE tier:** ORG_OWNER con tier ENTERPRISE puede tener una subset de Nova como "Brand Admin Mode" (read-mostly + limited write — ver §4 RBAC matrix Tier B). Vive bajo `nova.zenix.com/brand/{brandId}` con autenticación y branding distintos del Nova consultivo. Esto se entrega v1.1+ — en v1.0.0 los Brand Admins usan `app.zenix.com` con scope cross-property.

---

## 3. Schema completo Prisma

> **Nota:** estos models extienden los ya definidos en `docs/vision/11-multi-tenant-architecture.md` (Brand, Organization, LegalEntity, Property, BrandUserRole, LegalEntityUserRole, UserPropertyRole). NO los reemplazan. Las relaciones existentes con `User`, `Organization`, etc. se preservan.

### 3.1 Partner (la firma consultora)

```prisma
model Partner {
  id              String        @id @default(uuid())

  // Identidad comercial
  name            String        // "TulumTech Consulting"
  legalName       String        // "TulumTech Consulting S.A. de C.V."
  slug            String        @unique  // "tulumtech" — usado en URLs Nova si aplica
  contactEmail    String
  contactPhone    String?
  websiteUrl      String?

  // Geographic + fiscal
  countryCode     String        // 'MX', 'CO', etc. — primary country
  servingCountries String[]     // países donde puede operar clientes
  taxId           String?       // RFC/NIT del partner para facturación

  // Tier + status
  tier            PartnerTier   @default(AUTHORIZED)
  status          PartnerStatus @default(PROSPECT)

  // ZaharDev internal flag
  isInternal      Boolean       @default(false)
  // ↑ true SOLO para ZaharDev mismo. Garantiza que PLATFORM_ADMIN
  //   no es tier separado en schema — es un Partner especial.
  //   Constraint: máximo 1 row con isInternal=true a nivel global.
  //   (Validado en application layer + check constraint en migration.)

  // Branding (white-label parcial — GOLD/PLATINUM)
  brandingConfig  Json?         // { logoUrl, primaryColor, secondaryColor, customDomain? }
  whitelabelEnabled Boolean     @default(false)
  // ↑ requiere tier >= GOLD para activar.

  // Commercial
  contractStartAt DateTime
  contractEndAt   DateTime?
  annualLicenseFee Decimal      @default(0) @db.Decimal(10,2)
  defaultRevenueSharePct Decimal @db.Decimal(5,4)
  // ↑ override-able per cliente vía PartnerClientAssignment.revenueSharePct

  // Quality metrics (calculados, no editables manualmente)
  npsScore        Int?          // 0-100, calculado mensual desde clientes
  retentionRate   Decimal?      @db.Decimal(5,4)  // 0.85 = 85%
  averageTicketResponseHours Decimal? @db.Decimal(6,2)
  certificationsCount Int       @default(0)

  // Audit
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt
  createdById     String        // PLATFORM_ADMIN user que creó este partner
  deletedAt       DateTime?

  // Relations
  members         PartnerMember[]
  clientAssignments PartnerClientAssignment[]
  certifications  PartnerCertification[]    // existing model §9 doc vision

  @@index([countryCode])
  @@index([tier])
  @@index([status])
  @@unique([isInternal])   // postgres-level constraint para garantizar 1 ZaharDev
  @@map("partners")
}

enum PartnerTier {
  AUTHORIZED   // entry-level. Sin annual fee. Margin 20%.
  SILVER       // 5+ clientes + NPS>50. Fee $2k/yr. Margin 28%.
  GOLD         // 15+ clientes + NPS>70. Fee $8k/yr. Margin 35%. White-label.
  PLATINUM     // 30+ clientes + co-marketing. Fee $25k/yr. Margin 40% + bonos.
}

enum PartnerStatus {
  PROSPECT     // ha aplicado, falta certificarse
  ACTIVE       // en operación
  SUSPENDED    // temporary hold (compliance issue, quality flag)
  TERMINATED   // contract ended (sus clientes pasan a ZaharDev direct o a otro partner)
}
```

**Notas de diseño:**

- **`tier` separado de antes en `docs/vision/09-partner-network.md`:** ahí estaba `BRONZE/SILVER/GOLD/PLATINUM`. Aquí re-nombramos `BRONZE → AUTHORIZED` para alinear con SAP PartnerEdge naming convention (`Authorized Partner` es la entry tier, no "Bronze"). Esto se decide al crear el seed y el enum.
- **`servingCountries: String[]`** permite que un partner MX pueda servir clientes CR/PA. Inversamente, un partner CR no puede tomar leads MX salvo que se le habilite explícitamente.
- **`isInternal` boolean** — solo ZaharDev mismo. Nunca dos rows con `isInternal=true`. La constraint UNIQUE en Postgres (sobre booleano) está soportada pero requiere índice partial: `CREATE UNIQUE INDEX partners_isinternal_unique ON partners(isInternal) WHERE isInternal = true;`. La declaramos en migration manualmente.
- **`whitelabelEnabled`** — guard en application layer + check constraint: solo activable si `tier IN ('GOLD', 'PLATINUM')`.
- **`npsScore`, `retentionRate`, etc.** — campos calculados, no editables. Recalculados por `PartnerMetricsCronService` 1x mensual. Bypasses application-level write check via service-account credential.

### 3.2 PartnerMember (consultor individual)

```prisma
model PartnerMember {
  id                String            @id @default(uuid())
  partnerId         String
  userId            String            @unique
  // ↑ One-to-one con User table. Un user pertenece a máximo 1 Partner.
  //   (Si cambia de partner, se desactiva este row + crea nuevo.)

  role              PartnerMemberRole

  // Flags
  isPlatform        Boolean           @default(false)
  // ↑ true SOLO si Partner.isInternal=true. Asegura que PLATFORM_ADMIN
  //   real es PartnerMember dentro del Partner ZaharDev con role=PARTNER_ADMIN.

  // Authorization
  canImpersonate    Boolean           @default(false)
  // ↑ true para LEAD_CONSULTANT, SUPPORT_L2, SUPPORT_L3, PARTNER_ADMIN.
  //   Auto-derivado de role pero override-able per individual.

  canActivateWizard Boolean           @default(false)
  // ↑ true para LEAD_CONSULTANT, SOLUTION_CONSULTANT, PARTNER_ADMIN.

  canApproveBilling Boolean           @default(false)
  // ↑ true SOLO para PARTNER_ADMIN per cliente.

  // Certifications (per-role requeridas)
  certificationLevels String[]
  // ↑ ej. ['FOUNDATIONS', 'ADVANCED_PMS', 'SOLUTION_ARCHITECT']
  //   Required check pre-activar wizard: PARTNER_MEMBER debe tener ≥FOUNDATIONS.

  // Status
  status            MemberStatus      @default(ACTIVE)
  joinedAt          DateTime          @default(now())
  leftAt            DateTime?

  // 2FA enforcement (auto-derived from role + tier)
  require2FA        Boolean           @default(false)

  // Audit
  invitedById       String            // PARTNER_ADMIN user que invitó
  createdAt         DateTime          @default(now())
  updatedAt         DateTime          @updatedAt

  // Relations
  partner           Partner           @relation(fields: [partnerId], references: [id])
  user              User              @relation(fields: [userId], references: [id])
  clientAssignments PartnerMemberAssignment[]

  @@index([partnerId])
  @@index([role])
  @@index([status])
  @@map("partner_members")
}

enum PartnerMemberRole {
  PARTNER_ADMIN        // owner/managing partner. Full scope del partner.
  LEAD_CONSULTANT      // senior. Activar wizard final, impersonate, tier B writes.
  SOLUTION_CONSULTANT  // configura Channex/PAC/Stripe. Tier B writes limitados.
  SUPPORT_L1           // tickets básicos, read-mostly del cliente.
  SUPPORT_L2           // escalado L1, configs operativos. Tier B writes.
  SUPPORT_L3           // escalado L2, fiscal/integrations. Tier A writes.
  SALES_REP            // read-only del wizard + marketing assets. No clientes prod.
  TRAINEE              // sandbox-only. No clientes prod.
}

enum MemberStatus {
  ACTIVE
  ON_LEAVE       // temporary suspension (vacation, training)
  SUSPENDED      // policy violation, under review
  OFFBOARDED     // dejó el partner. Soft-delete.
}
```

**Notas de diseño:**

- **`role` es enum estricto de 8 valores.** Cada uno mapea a un set de capabilities. No usar bitmask ni JSON capabilities flexibles — el RBAC matrix (§4) está hard-coded en código y testeable.
- **`canImpersonate / canActivateWizard / canApproveBilling`** son flags **override** del default por role. El default se setea por trigger en migration; el override permite casos excepcionales (ej. dar `canImpersonate=true` a un SOLUTION_CONSULTANT senior por demanda del PARTNER_ADMIN). Cada override deja entry en AuditLog.
- **`certificationLevels: String[]`** — list de cert IDs ('FOUNDATIONS', 'ADVANCED_PMS', etc.). Validation pre-activar wizard ocurre en `WizardActivateService.guardCanActivate(memberId)`.
- **`require2FA`** auto-derived from role+tier pero override-able por compliance (ENTERPRISE clientes pueden requerir 2FA en TODOS los partner members que toquen su account, no solo en roles "seniors").

### 3.3 PartnerClientAssignment (firma ↔ cliente)

```prisma
model PartnerClientAssignment {
  id              String          @id @default(uuid())
  partnerId       String
  organizationId  String          @unique
  // ↑ One-to-one: una Organization tiene MÁXIMO un partner activo.
  //   (Si cambia de partner, se cierra este row + crea nuevo.)

  status          AssignmentStatus @default(ACTIVE)
  startedAt       DateTime
  endedAt         DateTime?

  // Comercial
  revenueSharePct Decimal         @db.Decimal(5,4)
  // ↑ override per cliente del default del partner.
  //   Razón override: cliente enterprise con contrato custom, partner negocia.

  billingModel    BillingModel    @default(VENDOR_BILLS)

  // SLA per-tier (auto-derived from partner.tier, override-able)
  ticketResponseSLAHours Int      @default(48)
  // ↑ 48 AUTHORIZED, 24 SILVER, 12 GOLD, 4 PLATINUM (defaults)

  // Quality tracking (per-client)
  clientNPS       Int?            // last NPS recorded
  clientChurnRisk Decimal?        @db.Decimal(5,4)  // 0-1 calculated

  // Audit
  assignedById    String          // PLATFORM_ADMIN o PARTNER_ADMIN que asignó
  reason          String?
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt

  // Relations
  partner         Partner         @relation(fields: [partnerId], references: [id])
  organization    Organization    @relation(fields: [organizationId], references: [id])
  memberAssignments PartnerMemberAssignment[]

  @@index([partnerId])
  @@index([status])
  @@map("partner_client_assignments")
}

enum AssignmentStatus {
  PROSPECTING    // partner está en pipeline con el lead, aún no cliente real
  ONBOARDING     // wizard en curso (Organization existe pero no activated)
  ACTIVE         // production
  PAUSED         // billing on hold (collection issue, dispute)
  TRANSITIONING  // partner saliente, otro entrando — overlap allowed during handover
  ENDED          // contract closed
}

enum BillingModel {
  VENDOR_BILLS       // ZaharDev factura al cliente, paga RevShare al partner
  PARTNER_BILLS      // Partner factura al cliente, paga License Fee a ZaharDev
}
```

**Notas de diseño:**

- **One-to-one con Organization** garantizado vía `@unique`. Transición de partner requiere cerrar el row anterior (`status=ENDED`) y crear nuevo. Overlap controlado via `TRANSITIONING` status durante handover (max 90 días, validado por scheduler).
- **`billingModel`** define el contractual flow (§1.4 sobre revenue model).
- **`reason: String?`** field requerido en application layer si `status` transition implica cambio comercial (PAUSE, ENDED, TRANSITIONING). Audit Log captures.

### 3.4 PartnerMemberAssignment (consultor ↔ cliente)

```prisma
model PartnerMemberAssignment {
  id                       String        @id @default(uuid())
  partnerMemberId          String
  partnerClientAssignmentId String

  // Scope per-member en este cliente
  scope                    MemberAssignmentScope @default(FULL)
  // ↑ FULL = puede actuar en cualquier área del cliente.
  //   TIER_A_ONLY = solo operations admin/fiscal (PAC, Channex, billing).
  //   TIER_B_ONLY = solo operations day-to-day (room mappings, rates).
  //   READ_ONLY = solo lectura (sales rep haciendo demo, trainee observando).

  // Time-bounded (opcional)
  startedAt                DateTime      @default(now())
  endedAt                  DateTime?

  // Audit
  assignedById             String        // PARTNER_ADMIN o LEAD_CONSULTANT
  reason                   String?
  createdAt                DateTime      @default(now())
  updatedAt                DateTime      @updatedAt

  // Relations
  partnerMember            PartnerMember @relation(fields: [partnerMemberId], references: [id])
  clientAssignment         PartnerClientAssignment @relation(fields: [partnerClientAssignmentId], references: [id])

  @@unique([partnerMemberId, partnerClientAssignmentId])
  @@index([partnerMemberId])
  @@index([partnerClientAssignmentId])
  @@map("partner_member_assignments")
}

enum MemberAssignmentScope {
  FULL
  TIER_A_ONLY
  TIER_B_ONLY
  READ_ONLY
}
```

**Notas de diseño:**

- **Compuesto unique (`partnerMemberId, partnerClientAssignmentId`)** — un consultor no puede tener dos rows del mismo cliente. Para cambio de scope, update in-place + audit log.
- **`scope` controla el slice del RBAC matrix (§4) que aplica al consultor en ese cliente.** Un PARTNER_MEMBER con role=LEAD_CONSULTANT y scope=READ_ONLY en cliente X **solo puede leer** ese cliente. En cliente Y con scope=FULL, puede escribir.
- **No hay scope=NONE** porque si no debería tener assignment, el row no existe.

### 3.5 AuditLog (universal, append-only)

```prisma
model AuditLog {
  id                String           @id @default(uuid())

  // Identificadores temporales
  timestamp         DateTime         @default(now())
  // ↑ Indexed. La columna time-series mas calidad importante.

  // Quién ejecutó
  actorRealId       String
  // ↑ ID del User que físicamente disparó la acción. SIEMPRE poblado.
  actorRealType     ActorType        // USER, SYSTEM, CRON, WEBHOOK
  actorRealName     String           // denormalizado para rendering rápido
  actorRealEmail    String?
  actorRealRoles    String[]
  // ↑ snapshot de roles al momento de la acción (forensic)

  // En nombre de quién (impersonation)
  onBehalfOfId      String?
  onBehalfOfName    String?
  onBehalfOfRoles   String[]
  // ↑ Si el actor real es consultor actuando como ORG_OWNER del cliente,
  //   este campo registra la identidad del cliente.
  //   NULL si la acción fue directa (sin impersonation).

  // Razón (REQUIRED si onBehalfOfId está set — SAP impersonation pattern)
  reason            String?
  // ↑ "Wizard activation step 7", "Customer asked help via ticket #4521", etc.
  //   Application layer enforces: if onBehalfOfId IS NOT NULL, reason MUST NOT be null.

  // Qué pasó
  action            String
  // ↑ Verbo + objeto: "wizard.activate", "channex.connect", "user.invite", etc.
  //   Convention: "{domain}.{action}".
  domain            AuditDomain
  // ↑ enum para indexar/filtrar: WIZARD, INTEGRATION, BILLING, FISCAL, USER, etc.

  // Sobre qué objeto
  targetType        String           // 'Organization', 'Property', 'User', 'Channex', etc.
  targetId          String
  targetName        String?
  // ↑ Snapshot del nombre del objeto al momento de la acción.

  // Scope tenant
  organizationId    String?
  legalEntityId     String?
  propertyId        String?
  brandId           String?
  partnerId         String?
  // ↑ Cualquier combinación. Permite filtrar AuditLog per tenant/partner.

  // Datos del cambio (opcional)
  changeDelta       Json?
  // ↑ { before: {...}, after: {...} } para mutations.
  //   NULL para reads.

  // Resultado
  outcome           AuditOutcome     @default(SUCCESS)
  errorMessage      String?

  // Context técnico
  requestId         String?          // para correlacionar con app logs
  ipAddress         String?
  userAgent         String?
  sessionId         String?

  // Compliance retention
  retentionPolicy   RetentionPolicy  @default(SEVEN_YEARS)
  // ↑ Default: 7 años (cubre CFDI 5 años MX + buffer).
  //   Algunas actions especiales: PERMANENT (impersonation), AUDIT_ONLY (Visa 120d+buffer).

  @@index([timestamp])
  @@index([actorRealId, timestamp])
  @@index([onBehalfOfId, timestamp])
  @@index([organizationId, timestamp])
  @@index([partnerId, timestamp])
  @@index([targetType, targetId])
  @@index([domain, action])
  @@map("audit_logs")
}

enum ActorType {
  USER
  SYSTEM       // cron jobs, webhooks ZaharDev internal
  CRON         // scheduled tasks
  WEBHOOK      // inbound (Channex, Stripe, etc.)
  API_KEY      // future v1.2+ external integrations
}

enum AuditDomain {
  WIZARD
  INTEGRATION       // Channex, Stripe, PAC connects/disconnects
  BILLING
  FISCAL            // CFDI emit, cancel, etc.
  USER              // invite, role change, deactivate
  ORG               // org settings
  PROPERTY          // property settings
  PARTNER           // partner internal mgmt
  PMS               // operational (check-in, no-show, payment) — recorded only for impersonation
  SECURITY          // 2FA enabled, password reset, etc.
  DATA              // exports, downloads, GDPR DSAR
}

enum AuditOutcome {
  SUCCESS
  FAILURE
  PARTIAL          // ej. bulk import 80/100 successful
}

enum RetentionPolicy {
  SEVEN_YEARS      // default — CFDI compliance + buffer
  PERMANENT        // impersonation logs, fiscal cancel, partner termination
  TEN_YEARS        // GDPR-relevant ops (consent records, DSAR)
  AUDIT_ONLY_180D  // ephemeral ops (reads, page views — kept short for cost)
}
```

**Notas de diseño:**

- **`actorRealId` + `actorRealName/Email/Roles` snapshot:** snapshot redundante intencional. Si el user es deleted/anonymized en GDPR DSAR, el AuditLog conserva un blob inmutable de la identidad-al-momento-de-la-acción. Compliance + forensic.
- **`onBehalfOfId` distinto de `actorRealId`** es el patrón SAP impersonation. SAP S/4HANA Cloud lo llama "user delegation"; Salesforce lo llama "Login As" (con audit log obligatorio). Zenix copia el patrón. Sin esto, no se puede determinar si un cambio "del cliente" fue real o vía consultor.
- **`reason` REQUIRED cuando hay onBehalfOfId** — application-level check antes de insert. DB-level check constraint además: `CHECK (on_behalf_of_id IS NULL OR reason IS NOT NULL)`.
- **AuditLog es APPEND-ONLY universal.** No tiene `updatedAt`, no tiene `DELETE` exposed. Solo `INSERT`. Compliance.
  - Postgres-level: `REVOKE UPDATE, DELETE ON audit_logs FROM zenix_app_role;` — la app role no tiene permission.
  - Solo `audit_archive_role` (separado, asignado a cron de retention purge) tiene DELETE — pero el cron solo borra rows where `timestamp < now() - retention_period`. Y eso solo aplica a `AUDIT_ONLY_180D`.
- **`retentionPolicy` enum** permite cohabit políticas distintas en la misma tabla. Más limpio que tablas separadas (`audit_logs_short`, `audit_logs_long`).
- **Indices:** carefully chosen. `(actorRealId, timestamp)` para "todo lo que hizo este user". `(onBehalfOfId, timestamp)` para "todo lo que se hizo en nombre de este user" (transparency for clientes ver §7). `(partnerId, timestamp)` para "todo lo que hizo esta firma" (cross-client view en Nova).
- **No FK relations** — los `targetType + targetId` son polymorphic. Justificación: AuditLog debe sobrevivir aunque el target sea hard-deleted (compliance). FK obligaría cascade o restrict.

### 3.6 Extensión a SystemRole (existing)

```prisma
enum SystemRole {
  // Existentes (PMS operativo):
  OWNER
  MANAGER
  SUPERVISOR
  RECEPTIONIST
  HOUSEKEEPER
  TECHNICIAN
  AUDITOR

  // Nuevos en v1.0.0 con Nova (semilla):
  PLATFORM_ADMIN     // ZaharDev internal. Solo asigna-able a PartnerMember.user de Partner.isInternal=true.
  PARTNER_ADMIN      // Owner consulting firm. Asigna-able a PartnerMember.user.
  PARTNER_MEMBER     // Consultor individual. Asigna-able a PartnerMember.user.
}
```

**Notas:**

- `PLATFORM_ADMIN` / `PARTNER_ADMIN` / `PARTNER_MEMBER` son **SystemRole** valid values pero **solo asignables** a users que también tienen un `PartnerMember` row activo. Validation en `AccessControlService.assignSystemRole(userId, role)`.
- Un mismo user puede tener `PARTNER_MEMBER` (en su rol consultivo) **y** `UserPropertyRole(role=SUPERVISOR)` (en su hotel propio si lo tiene). Audit Log distingue qué hat se puso para cada acción vía `actorRealRoles` snapshot.

### 3.7 Constraints y triggers

```sql
-- Garantía 1 solo ZaharDev internal partner
CREATE UNIQUE INDEX partners_isinternal_unique
  ON partners(is_internal) WHERE is_internal = true;

-- Garantía: si onBehalfOfId set, reason no es null
ALTER TABLE audit_logs
  ADD CONSTRAINT audit_logs_reason_required_for_impersonation
  CHECK (on_behalf_of_id IS NULL OR reason IS NOT NULL);

-- Garantía: AuditLog append-only para app role
REVOKE UPDATE, DELETE ON audit_logs FROM zenix_app_role;
GRANT SELECT, INSERT ON audit_logs TO zenix_app_role;

-- Garantía: PartnerMember.isPlatform = true SOLO si Partner.isInternal = true
CREATE OR REPLACE FUNCTION check_partner_member_platform()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_platform = true AND NOT EXISTS (
    SELECT 1 FROM partners WHERE id = NEW.partner_id AND is_internal = true
  ) THEN
    RAISE EXCEPTION 'PartnerMember.isPlatform requires Partner.isInternal=true';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_partner_member_platform
  BEFORE INSERT OR UPDATE ON partner_members
  FOR EACH ROW EXECUTE FUNCTION check_partner_member_platform();

-- Garantía: PartnerClientAssignment.organizationId unique entre ACTIVE
CREATE UNIQUE INDEX partner_client_active_unique
  ON partner_client_assignments(organization_id)
  WHERE status IN ('ACTIVE', 'ONBOARDING');

-- Garantía: whitelabelEnabled requiere tier >= GOLD
ALTER TABLE partners
  ADD CONSTRAINT partners_whitelabel_requires_gold
  CHECK (whitelabel_enabled = false OR tier IN ('GOLD', 'PLATINUM'));
```

### 3.8 Seed inicial (v1.0.0 migration)

```typescript
// Migration: seed ZaharDev as the internal Partner
const zaharDevPartner = await prisma.partner.create({
  data: {
    name: 'ZaharDev',
    legalName: 'ZaharDev S.A. de C.V.',
    slug: 'zahardev',
    contactEmail: 'platform@zenix.com',
    countryCode: 'MX',
    servingCountries: ['MX', 'CO', 'CR', 'PE', 'PA', 'GT', 'SV', 'HN', 'AR', 'BR'],
    tier: 'PLATINUM',
    status: 'ACTIVE',
    isInternal: true,
    contractStartAt: new Date('2024-01-01'),
    annualLicenseFee: 0,
    defaultRevenueSharePct: 0,
    createdById: 'system-bootstrap',
  },
});

// First PLATFORM_ADMIN user
const platformAdminUser = await prisma.user.create({
  data: {
    email: 'abrahag40@gmail.com',
    name: 'Abraham Garcia',
    systemRole: 'PLATFORM_ADMIN',
    passwordHash: await hashPassword(process.env.BOOTSTRAP_ADMIN_PASSWORD!),
    is2FAEnabled: false,  // forced true en first login
  },
});

await prisma.partnerMember.create({
  data: {
    partnerId: zaharDevPartner.id,
    userId: platformAdminUser.id,
    role: 'PARTNER_ADMIN',
    isPlatform: true,
    canImpersonate: true,
    canActivateWizard: true,
    canApproveBilling: true,
    require2FA: true,
    status: 'ACTIVE',
    invitedById: 'system-bootstrap',
  },
});

// Audit
await prisma.auditLog.create({
  data: {
    actorRealId: 'system-bootstrap',
    actorRealType: 'SYSTEM',
    actorRealName: 'Bootstrap Migration',
    actorRealRoles: ['SYSTEM'],
    action: 'partner.create',
    domain: 'PARTNER',
    targetType: 'Partner',
    targetId: zaharDevPartner.id,
    targetName: 'ZaharDev',
    partnerId: zaharDevPartner.id,
    outcome: 'SUCCESS',
    retentionPolicy: 'PERMANENT',
  },
});
```

---

## 4. RBAC matrix completa

> Esta matriz es **canónica**. Toda decisión de "¿puede X hacer Y?" en código debe consultarla. Cualquier nueva acción del sistema debe añadirse aquí ANTES de implementarse — no después.

### 4.1 Convenciones

- **PLAT** = PLATFORM_ADMIN (ZaharDev internal)
- **P_A** = PARTNER_ADMIN
- **P_M_LC** = PARTNER_MEMBER role=LEAD_CONSULTANT
- **P_M_SC** = PARTNER_MEMBER role=SOLUTION_CONSULTANT
- **P_M_S1** = PARTNER_MEMBER role=SUPPORT_L1
- **P_M_S2** = PARTNER_MEMBER role=SUPPORT_L2
- **P_M_S3** = PARTNER_MEMBER role=SUPPORT_L3
- **P_M_SR** = PARTNER_MEMBER role=SALES_REP
- **P_M_TR** = PARTNER_MEMBER role=TRAINEE
- **ORG_O** = ORG_OWNER
- **ORG_SUP** = ORG_STAFF Supervisor
- **ORG_REC** = ORG_STAFF Receptionist
- **ORG_HK** = ORG_STAFF Housekeeper
- **ORG_TEC** = ORG_STAFF Technician

- ✅ = permitted
- ❌ = denied
- 🟡 = permitted with restrictions (described in Notes)
- 🔒 = permitted only via impersonation (AuditLog requirement)

### 4.2 Matrix — administración del ecosistema

| Acción | PLAT | P_A | P_M_LC | P_M_SC | P_M_S1 | P_M_S2 | P_M_S3 | P_M_SR | P_M_TR | ORG_O | ORG_SUP |
|--------|:----:|:---:|:------:|:------:|:------:|:------:|:------:|:------:|:------:|:-----:|:-------:|
| Crear nuevo Partner row | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Upgradear tier de Partner | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Suspender / Terminar Partner | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Invitar PartnerMember al partner propio | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Cambiar role de PartnerMember | 🟡 | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Suspender/Offboard PartnerMember | 🟡 | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Asignar PartnerMember a cliente (PartnerMemberAssignment) | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Activar entitlement nuevo en plataforma | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Activar fiscal regime nuevo país | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Modificar PAC adapter class | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

**Notas:**
- **PLAT puede 🟡 cambiar role/suspender** PartnerMember en cualquier Partner pero solo via impersonation del PARTNER_ADMIN correspondiente, con `reason` documentado (compliance scenarios).

### 4.3 Matrix — gestión de clientes (Organization, Brand, LegalEntity)

| Acción | PLAT | P_A | P_M_LC | P_M_SC | P_M_S1 | P_M_S2 | P_M_S3 | P_M_SR | P_M_TR | ORG_O | ORG_SUP |
|--------|:----:|:---:|:------:|:------:|:------:|:------:|:------:|:------:|:------:|:-----:|:-------:|
| Crear nueva Organization (cliente) | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Asignar Organization a Partner (PartnerClientAssignment) | ✅ | ✅ | 🟡 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Cambiar plan tier de Organization | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Activar entitlement individual de Organization | ✅ | ✅ | 🟡 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Crear Brand | ✅ | ✅ | ✅ | 🟡 | ❌ | ❌ | ❌ | ❌ | ❌ | 🔒 | ❌ |
| Crear LegalEntity | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | 🟡 | ❌ | ❌ | 🔒 | ❌ |
| Editar legalAddress / fiscal data | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | 🔒 | ❌ |
| Conectar PAC credentials | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Activar / Desactivar LegalEntity | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Crear Property | ✅ | ✅ | ✅ | ✅ | ❌ | 🟡 | ✅ | ❌ | ❌ | 🔒 | ❌ |
| Eliminar Property (soft-delete) | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |

**Notas:**
- **`P_M_LC` 🟡 asignar Organization a su firma:** sí, pero solo a su propio Partner (no a otros). UI lo enforza, además del server-side check.
- **`P_M_LC` 🟡 activar entitlements:** solo dentro del plan tier ya contratado del cliente. Upgradear plan (STARTER → PRO) requiere PARTNER_ADMIN o PLATFORM_ADMIN.
- **`P_M_SC` 🟡 crear Brand:** sí pero requiere co-firm de PARTNER_ADMIN si el cliente es PRO/ENTERPRISE tier.
- **`P_M_S2` 🟡 crear Property:** solo para clientes STARTER/PRO. ENTERPRISE requiere LEAD_CONSULTANT o PARTNER_ADMIN.
- **`P_M_S3` 🟡 crear LegalEntity:** sí para issues fiscales urgentes, pero requiere AuditLog reason explícito + notificación al PARTNER_ADMIN.
- **`ORG_OWNER` 🔒 crear Brand / LegalEntity / Property:** solo via solicitud al partner (ticket → consultor lo crea). Cliente no tiene UI para hacerlo direct.

### 4.4 Matrix — inventario (Rooms, Beds, RoomTypes)

| Acción | PLAT | P_A | P_M_LC | P_M_SC | P_M_S1 | P_M_S2 | P_M_S3 | P_M_SR | P_M_TR | ORG_O | ORG_SUP |
|--------|:----:|:---:|:------:|:------:|:------:|:------:|:------:|:------:|:------:|:-----:|:-------:|
| Crear RoomType | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | 🔒 | ❌ |
| Editar RoomType (capacity, baseRate) | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | 🔒 | ❌ |
| Crear Room individual | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | 🔒 | ❌ |
| Crear Bed individual (hostal) | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | 🔒 | ❌ |
| Bulk import CSV rooms | ✅ | ✅ | ✅ | ✅ | ❌ | 🟡 | ✅ | ❌ | ❌ | 🔒 | ❌ |
| Cambiar status de Room (AVAILABLE/OOO/OOS) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ |

**Notas:**
- **Bulk import 🟡 P_M_S2:** sí, pero solo si el cliente es STARTER/PRO. ENTERPRISE bulk import requiere LEAD_CONSULTANT.
- **Cambiar status Room ✅ ORG_SUP** porque es operación day-to-day del supervisor (NO requiere consultor).

### 4.5 Matrix — integraciones (Channex, Stripe, etc.)

| Acción | PLAT | P_A | P_M_LC | P_M_SC | P_M_S1 | P_M_S2 | P_M_S3 | P_M_SR | P_M_TR | ORG_O | ORG_SUP |
|--------|:----:|:---:|:------:|:------:|:------:|:------:|:------:|:------:|:------:|:-----:|:-------:|
| Conectar Channex (API token) | ✅ | ✅ | ✅ | ✅ | ❌ | 🟡 | ✅ | ❌ | ❌ | ❌ | ❌ |
| Crear Channex Room Type mapping | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Crear Channex Rate Plan mapping | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Activar canal OTA (Booking, Airbnb) | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Editar rate per channel (operational) | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ |
| Desconectar Channex (purga mappings) | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Conectar Stripe Connect | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Conectar Conekta (MX) | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Conectar WhatsApp Business | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Webhook configuration (channex.io) | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |

**Notas:**
- **🟡 P_M_S2 conectar Channex:** sí, pero solo bajo supervisión audit-logged. Initial connect del cliente requiere LEAD_CONSULTANT o SOLUTION_CONSULTANT (que tienen cert ADVANCED_PMS).
- **Editar rate per channel ✅ ORG_SUP:** esto es Tier B operativo — el supervisor del cliente sí puede ajustar rates dia-a-dia. NO conectar el canal en sí.

### 4.6 Matrix — impersonation y observabilidad

| Acción | PLAT | P_A | P_M_LC | P_M_SC | P_M_S1 | P_M_S2 | P_M_S3 | P_M_SR | P_M_TR | ORG_O | ORG_SUP |
|--------|:----:|:---:|:------:|:------:|:------:|:------:|:------:|:------:|:------:|:-----:|:-------:|
| Impersonate ORG_OWNER del cliente | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | — | — |
| Impersonate ORG_SUP del cliente | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | — | — |
| Impersonate ORG_REC del cliente | ✅ | ✅ | ✅ | ✅ | 🟡 | ✅ | ✅ | ❌ | ❌ | — | — |
| Ver AuditLog del cliente (su scope) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |
| Ver AuditLog cross-tenant | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Modificar AuditLog | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Export AuditLog del cliente CSV | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ | ❌ |
| Ver BI cross-tenant (ABI Insights) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Ver BI single-tenant (su cliente o suyo) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 🟡 | ❌ | ✅ | 🟡 |

**Notas:**
- **🟡 P_M_S1 impersonate REC:** sí pero solo durante ticket activo (tracking de ticket → impersonation context). No discrecional.
- **Modificar AuditLog: ❌ universal.** Ni siquiera PLATFORM_ADMIN. Append-only enforced at DB level (§3.7).
- **BI cross-tenant es ZaharDev only.** Partners solo ven su slice. ORG users solo ven el suyo.
- **🟡 P_M_SR ver BI cliente:** solo para demos comerciales — read-only de un subset reducido (occupancy + revenue trend) sin guest PII.
- **🟡 ORG_SUP ver BI:** subset reducido del dashboard (operational metrics), no incluye revenue management ni rate analytics (esos son ORG_OWNER scope).

### 4.7 Matrix — billing y comercial

| Acción | PLAT | P_A | P_M_LC | P_M_SC | P_M_S1 | P_M_S2 | P_M_S3 | P_M_SR | P_M_TR | ORG_O | ORG_SUP |
|--------|:----:|:---:|:------:|:------:|:------:|:------:|:------:|:------:|:------:|:-----:|:-------:|
| Ver pricing/licensing del cliente | ✅ | ✅ | ✅ | 🟡 | 🟡 | 🟡 | 🟡 | ✅ | ❌ | ✅ | ❌ |
| Approve partner tier upgrade | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Approve revenueSharePct override | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Aplicar discount/coupon | ✅ | ✅ | 🟡 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Generar invoice manual | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Ver commission del partner | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Pausar billing del cliente | ✅ | ✅ | 🟡 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

**Notas:**
- **🟡 P_M_* ver pricing/licensing:** subset reducido — ven que el cliente está en tier PRO con add-on X, no ven el precio exacto que paga ZaharDev al partner.
- **🟡 LEAD_CONSULTANT aplicar discount:** solo dentro de límites configurados por PARTNER_ADMIN (default 10% max).
- **🟡 LEAD_CONSULTANT pausar billing:** solo con razón documentada + notif al PARTNER_ADMIN.

### 4.8 Matrix — wizard "Zenix Activate"

| Acción | PLAT | P_A | P_M_LC | P_M_SC | P_M_S1 | P_M_S2 | P_M_S3 | P_M_SR | P_M_TR | ORG_O | ORG_SUP |
|--------|:----:|:---:|:------:|:------:|:------:|:------:|:------:|:------:|:------:|:-----:|:-------:|
| Iniciar wizard (Step 1) | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Avanzar Steps 2-6 | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Avanzar Step 7 (Integrations) | ✅ | ✅ | ✅ | ✅ | ❌ | 🟡 | ✅ | ❌ | ❌ | ❌ | ❌ |
| Avanzar Step 8 (Activation) | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Re-ejecutar Step (modificar post-activación) | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Sandbox wizard (training) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |

**Notas:**
- **Step 8 activación final es destructiva** (marca Organization.activatedAt, dispara billing recurrente). Solo LEAD_CONSULTANT o equivalents puede ejecutar.
- **🟡 P_M_S2 Step 7:** sí pero solo para STARTER/PRO. ENTERPRISE Step 7 requiere SOLUTION_CONSULTANT con cert ADVANCED_PMS.
- **Sandbox wizard ✅ todos los partner members:** training environment, no produce datos reales.

### 4.9 Tabla de capabilities derivadas (canonical reference)

```typescript
// apps/api/src/auth/rbac/nova-capabilities.ts
// SINGLE SOURCE OF TRUTH for Nova RBAC.

export const NOVA_CAPABILITIES = {
  PLATFORM_ADMIN: {
    partners: { create: true, upgrade: true, suspend: true, view: 'all' },
    organizations: { create: true, view: 'all', upgrade_plan: true },
    audit_log: { view: 'all', export: true, modify: false },
    bi: { view_cross_tenant: true, view_partner_metrics: true },
    wizard: { initiate: true, activate: true },
    impersonate: { tiers_below: 'all', reason_required: true },
  },
  PARTNER_ADMIN: {
    partners: { create: false, upgrade: false, view: 'own_only' },
    members: { invite: true, change_role: true, suspend: true },
    organizations: { create: true, view: 'assigned_only', upgrade_plan: true },
    audit_log: { view: 'assigned_clients', export: true, modify: false },
    bi: { view_cross_tenant: false, view_partner_metrics: 'own' },
    wizard: { initiate: true, activate: true },
    impersonate: { tiers_below: 'org_owner', reason_required: true },
  },
  // ... 8 PartnerMemberRole entries
  // ... ORG_* (delegado a existing AccessControlService)
} as const;
```

Esta tabla es **consultada en runtime** vía `NovaAccessControlService.canDoAction(actor, action, scope)`. Tests obligatorios per acción nueva (Jest matrix testing pattern).

---

## 5. UI architecture

### 5.1 Sub-domain `nova.zenix.com` con shell propio

**Phase 1 (v1.0.0 — entregable en Sprint CHANNEX-COMMAND-CENTER):**

- Nova vive como ruta `/nova/*` dentro de `apps/web` (single bundle React+Vite).
- Routing condicional: si `window.location.hostname === 'nova.zenix.com'` o `pathname.startsWith('/nova')`, renderiza Nova Shell. Caso contrario, renderiza app cliente.
- Auth check: cualquier ruta `/nova/*` requiere user con `systemRole IN ('PLATFORM_ADMIN', 'PARTNER_ADMIN', 'PARTNER_MEMBER')`. Si no, redirect a `/`.
- Single deployment, dual routing.

**Phase 2 (v1.0.5 — Sprint NOVA-EXTRACT):**

- Extraer Nova a `apps/partner` (Vite build separado).
- DNS apunta `nova.zenix.com` → bundle apps/partner.
- `app.zenix.com` → bundle apps/web sin código Nova (reducción ~30-40% bundle size cliente).
- Cookies separadas: `app.zenix.com` usa `cookie domain=app.zenix.com`; `nova.zenix.com` usa `cookie domain=nova.zenix.com`. NO compartidas.
- CSP separada (más estricta en Nova).
- Sessions separadas: un user logueado en Nova NO está auto-logueado en app, y viceversa. (Aunque user puede tener mismos credentials.)

### 5.2 Layout principal (mockup ASCII)

```
┌────────────────────────────────────────────────────────────────────────────────┐
│ 🟣 ZENIX NOVA   [logo]                              [👤 Abraham · ZaharDev ▼]  │
├────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  🏢 Hotel Monica Tulum ▼  [Switch tenant]    📋 AuditLog  🔔 3   ⚙️ Settings   │
│  ─────────────────────────────────────────────────────────────────────────────  │
│                                                                                 │
│  ┌──────────────────┐  ┌────────────────────────────────────────────────────┐ │
│  │                  │  │                                                     │ │
│  │  Nova Sidebar    │  │  Workspace area                                     │ │
│  │                  │  │                                                     │ │
│  │  🏠 Overview     │  │  (changes per route)                                │ │
│  │  ⚡ Cmd Center   │  │                                                     │ │
│  │  🪄 Wizard       │  │  e.g. Channex Command Center:                       │ │
│  │  🔌 Integrations │  │   ┌─ Channex status ─┐ ┌─ Outbox queue ─┐         │ │
│  │  👥 Staff/Users  │  │   │ Connected ✅      │ │ 0 pending      │         │ │
│  │  💰 Billing      │  │   │ Last sync 30s ago │ │ 0 failed       │         │ │
│  │  📊 BI (limit.)  │  │   └───────────────────┘ └────────────────┘         │ │
│  │  📋 AuditLog     │  │                                                     │ │
│  │  ⚙️ Settings     │  │   Room mappings, rate plans, OTA channels...        │ │
│  │                  │  │                                                     │ │
│  │  ──────────      │  │                                                     │ │
│  │                  │  │                                                     │ │
│  │  Switch context: │  │                                                     │ │
│  │  ◯ View cliente  │  │                                                     │ │
│  │  ◯ Acting as     │  │                                                     │ │
│  │   ORG_OWNER 🔒  │  │                                                     │ │
│  │                  │  │                                                     │ │
│  └──────────────────┘  └────────────────────────────────────────────────────┘ │
│                                                                                 │
└────────────────────────────────────────────────────────────────────────────────┘

Top-bar persistente:
- Logo ZENIX NOVA (link a /nova landing)
- Tenant Chip "Hotel Monica Tulum ▼" → dropdown con switcher
- AuditLog quick-access (relevante en Nova, no oculto)
- Notifications (limited to Nova-specific: ticket alerts, wizard reminders)
- User menu (cambiar password, 2FA, log out)

Sidebar items expandidos:
- 🏠 Overview         → /nova/clientes/{orgId}                    (default)
- ⚡ Command Center   → /nova/clientes/{orgId}/channex            (Tier B operational)
- 🪄 Wizard           → /nova/clientes/{orgId}/wizard             (8 steps Zenix Activate)
- 🔌 Integrations     → /nova/clientes/{orgId}/integrations
- 👥 Staff/Users      → /nova/clientes/{orgId}/staff
- 💰 Billing          → /nova/clientes/{orgId}/billing
- 📊 BI (limited)     → /nova/clientes/{orgId}/bi
- 📋 AuditLog         → /nova/clientes/{orgId}/audit
- ⚙️ Settings         → /nova/clientes/{orgId}/settings

Switch context:
- View cliente: renderiza datos sin impersonation (read-mostly del consultor)
- Acting as ORG_OWNER: dispara impersonation flow (reason required modal)
  → todas las acciones siguientes graban onBehalfOfId en AuditLog.
  → Banner orange persistente: "🔒 Actuando como Carlos García · razón: Resolver ticket #4521 · [Finalizar]"
```

### 5.3 Landing `/nova` — lista de clientes filtrada por tier

```
┌────────────────────────────────────────────────────────────────────────────────┐
│ 🟣 ZENIX NOVA                                                  [👤 Abraham ▼] │
├────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  🏠 Tus clientes                                          [➕ Nuevo cliente]   │
│                                                                                 │
│  Filtros: [Todos ▼] [Status: Todos ▼] [Buscar: ___________________]            │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │ 🏨 Hotel Monica Tulum                                                    │  │
│  │ MX · CFDI 4.0 · 1 property · STARTER tier · Active 6m                   │  │
│  │ Channex ✅ · Stripe ⚠️ test mode · PAC ✅ · NPS 78                      │  │
│  │                                              [Abrir →] [Wizard] [Audit] │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │ 🏨 Hotel Azúcar Tulum                                                    │  │
│  │ MX · CFDI 4.0 · 2 properties · PRO tier · Active 2y                     │  │
│  │ Channex ✅ · Stripe ✅ · PAC ✅ · NPS 85                                 │  │
│  │                                              [Abrir →] [Wizard] [Audit] │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │ 🌴 Selina Tulum                                                          │  │
│  │ MX · CFDI 4.0 · 1 property · ENTERPRISE tier · Active 1y                │  │
│  │ ⚠️ Webhook fallando hace 2h · NPS 72                                    │  │
│  │                                              [Abrir →] [Wizard] [Audit] │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │ 🆕 Hotel Casa de Marina (onboarding)                                     │  │
│  │ CO · DIAN · 0 properties · PRO tier · Wizard step 3 of 8                │  │
│  │                                              [Continuar →] [Audit]      │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
└────────────────────────────────────────────────────────────────────────────────┘
```

**Filtros disponibles:**
- Status: ACTIVE / ONBOARDING / PAUSED / TERMINATED
- Country: per LegalEntity countryCode
- Tier: STARTER / PRO / ENTERPRISE
- Health: All / At risk (Channex failing | NPS<50 | webhook failing >1h)

**Sorting:**
- Recently active (default)
- Alphabetical
- Tier
- Onboarding date

**Empty state:**
- Si user es nuevo PARTNER_MEMBER sin assignments → CTA "Solicita assignment a tu PARTNER_ADMIN"
- Si PLATFORM_ADMIN → CTA "Provisionar primer partner" (entry point al onboarding partner flow)

### 5.4 Workspace per-cliente `/nova/clientes/{orgId}/*`

Cada cliente abre en su workspace con:
- Top-bar persistente con tenant chip activo (§5.2).
- Sidebar de tools.
- Workspace area con contenido per ruta.

**Rutas:**

```
/nova                                  Landing (lista clientes)
/nova/clientes                         Same as landing
/nova/clientes/new                     ➕ Nuevo cliente (entry al wizard step 1)
/nova/clientes/{orgId}                 Overview del cliente
/nova/clientes/{orgId}/wizard          Wizard 8 steps
/nova/clientes/{orgId}/wizard/{step}   Step específico (1-8)
/nova/clientes/{orgId}/channex         Command Center Channex (Sprint CHANNEX-COMMAND-CENTER)
/nova/clientes/{orgId}/integrations    Stripe, PAC, WhatsApp, etc.
/nova/clientes/{orgId}/staff           Users + Staff del cliente
/nova/clientes/{orgId}/billing         Subscription + invoices + commission del partner
/nova/clientes/{orgId}/bi              BI (limited scope, per RBAC §4.6)
/nova/clientes/{orgId}/audit           AuditLog del cliente
/nova/clientes/{orgId}/settings        Legal entity, brand, etc.

/nova/admin                            Solo PLATFORM_ADMIN
/nova/admin/partners                   Partners management
/nova/admin/partners/{partnerId}
/nova/admin/entitlements               Catalog de entitlements
/nova/admin/fiscal-regimes             FiscalRegime catalog
/nova/admin/bi-cross                   ABI Insights (v1.2+)

/nova/firma                            Solo PARTNER_ADMIN
/nova/firma/members                    PartnerMembers de su firma
/nova/firma/clients                    Su cartera (= landing pero scoped)
/nova/firma/commissions                Dashboard de commissions
/nova/firma/branding                   White-label config (GOLD/PLATINUM)
```

### 5.5 Tipografía y design system

Nova hereda el design system de Zenix (Tailwind + Radix UI + shadcn/ui patterns documentados en CLAUDE.md §Animaciones + §Principio Rector de Diseño). Pero con **identidad visual distinta** para reinforcing la separación cognitiva:

- **Color principal Nova:** indigo-700 (#3730A3) — distinto del emerald-600 del cliente. Inspirado en SAP Fiori indigo Branding.
- **Accent color:** purple-500 (#A855F7) para PLATFORM_ADMIN-only features.
- **Sidebar background:** dark slate (slate-900) — modo "admin" vs el slate-50 light del cliente.
- **Top-bar:** slate-100 con shadow soft.
- **Iconografía:** Lucide (mismo que cliente) pero con variantes "filled" para nav items activos.
- **Tipografía:** Inter (system fallback) — mismo que cliente para consistency.
- **Mode:** dark sidebar + light workspace por default (pattern Stripe Dashboard, Linear, Notion Admin).

Sin animaciones (consistent con §119 — herramientas operativas, no aplicaciones de marketing).

---

## 6. Wizard "Zenix Activate" integration

### 6.1 8 etapas (resumen — detalle completo en docs/vision/13)

| Step | Nombre | Forcing function pre-avance | Quién puede ejecutar |
|------|--------|-----------------------------|----------------------|
| 1 | Customer Account | Plan tier + entitlements + email validated | PLAT, P_A, P_M_LC |
| 2 | Brand (opcional) | Saltable. Si NO, brandId=NULL. | PLAT, P_A, P_M_LC, P_M_SC |
| 3 | Legal Entity | ≥1 LegalEntity con PAC test = pass | PLAT, P_A, P_M_LC, P_M_SC, P_M_S3 |
| 4 | Properties | ≥1 Property con timezone IANA válido | PLAT, P_A, P_M_LC, P_M_SC, P_M_S2 |
| 5 | Inventory | ≥1 RoomType y ≥1 Room creados | PLAT, P_A, P_M_LC, P_M_SC, P_M_S2 |
| 6 | Staff + Users | ≥1 SUPERVISOR del cliente creado | PLAT, P_A, P_M_LC, P_M_SC |
| 7 | Integrations | Channex test push = pass + Stripe test charge = pass (si aplica) | PLAT, P_A, P_M_LC, P_M_SC, P_M_S3 |
| 8 | Activation | Todos los health checks pasados o explícitamente skipped | PLAT, P_A, P_M_LC, P_M_S3 |

### 6.2 Forcing functions per step (más detalle)

**Step 1 — Customer Account:**
- Email format valid + DNS MX record exists (skip si email del staff ZaharDev por convención).
- Slug único globalmente en `organizations` table.
- Plan tier seleccionado.
- ≥1 entitlement marcado (al menos el base PMS).
- Contact phone WhatsApp-capable (regex E.164).

**Step 3 — Legal Entity (CRÍTICO):**
- Tax ID format valid per country (regex per countryCode — ver doc 13).
- FiscalRegime activado en ZaharDev (`fiscalRegimes.active=true`). Si no, error "País todavía no soportado, contactar PLATFORM_ADMIN".
- PAC credentials encrypted via `pgcrypto` antes de insert.
- **Test factura sandbox** — `WizardService.testPacEmission(legalEntityId)` llama al PAC adapter con datos dummy. Si responde con XML válido + UUID, success. Si error, mostrar el error específico (NO genérico) + "Reintentar test" button.

**Step 7 — Integrations:**
- **Channex test push** — `ChannexGateway.testPush(propertyId)` ejecuta un push minimal contra sandbox. Success requiere HTTP 200 + UUID confirmación.
- **Stripe test charge** — `StripeAdapter.testCharge($1, refund=true)` en test mode. Success requiere charge_id + refund_id.
- **Webhooks configured** — verificar que `channex.io` webhook tiene URL `https://api.zenix.com/v1/webhooks/channex` (o staging equivalent) registrada.
- Health checks de Step 7 escriben a `WizardSession.healthChecks` JSON field para audit.

**Step 8 — Activation:**
- TODOS los previous steps marked completed en `WizardSession.completedSteps`.
- TODOS los health checks de Step 8 (ver doc 13 §3.8) pasan ✅ o tienen explicit skip + reason.
- Activation Report PDF generado + enviado por email.
- `Organization.activatedAt = now()` + `WizardSession.completedAt = now()`.
- AuditLog entry con action `wizard.activate`, domain=WIZARD, retentionPolicy=PERMANENT.

### 6.3 Replica de configs manuales actuales

Step 7 Integrations - Channex sub-flow replica lo que hoy hacemos manualmente:
1. Conectar Channex (API token Channex).
2. Crear properties en Channex.io dashboard (manual). **Nova futura:** API call automática a Channex `POST /properties`.
3. Crear room types en Channex.
4. Crear rate plans.
5. Mapear Zenix RoomType ↔ Channex RoomTypeId.
6. Mapear Zenix RatePlan ↔ Channex RatePlanId (futuro RATES-METRICS-COMPSET-CORE sprint).
7. Configurar OTAs (Booking, Airbnb, Expedia, Despegar) — Channex dashboard manual aún en v1.0.0.
8. Configurar webhook URL en Channex → Zenix.
9. Test push inventory.
10. Test push availability.
11. Test inbound (booking_new desde sandbox).

Cada paso es un sub-step del wizard Step 7 con su propio forcing function.

### 6.4 Activation Report PDF

Ver doc 13 §3.8 — generación automática al completar Step 8. Componentes:
- Customer info + Brand + LegalEntities + Properties summary.
- Inventory counts por RoomType.
- Staff + Users invited.
- Integrations status (✅/⚠️/❌ per cada uno con detalle de test result).
- Entitlements activated + plan pricing.
- Test booking sample (synthetic, ya creado).
- Test CFDI sample (XML emitted).
- Next steps + soporte contact.
- Firma electrónica ZaharDev + Partner si aplica.

PDF generado con Puppeteer pool (§ADR-0001 PDF rendering). Stored en R2/S3 + link en email + descargable from Nova.

### 6.5 Cliente recibe credenciales SOLO al final del wizard

**Política no-negociable:** durante el wizard, el cliente NO tiene credenciales activas. Los usuarios fueron `invited` pero el magic link NO funciona hasta Step 8.activate.

**Razón:** prevenir que el cliente entre a `app.zenix.com` mientras el partner aún está configurando Channex/PAC/Staff. Si entra antes:
- Ve calendar vacío → confusión.
- Intenta crear reserva manualmente → conflictos con Channex que aún no está conectado.
- Reporte NPS sale bajo desde día 1.

Step 8 activación marca todos los `InvitationLink.activatedAt` con now() y envía un mail unificado "Tu cuenta está lista".

---

## 7. Impersonation pattern (SAP-style)

### 7.1 Modelo conceptual

Cuando un consultor necesita actuar en nombre del cliente (típicamente para resolver un ticket de soporte, demo flow durante onboarding, o testear cambios pre-go-live), Nova **NO** le da las credentials del cliente. En lugar de eso, Nova:

1. Verifica que el consultor tiene `canImpersonate=true` y scope sobre el cliente.
2. Pide al consultor un **reason** (textarea required, min 10 chars).
3. Pide identificar el **target user** del cliente al cual impersonate (ej. ORG_OWNER, SUPERVISOR específico).
4. Crea una session especial con `actorRealId = consultorId`, `actingAsUserId = targetClientUserId`.
5. Inyecta un banner persistente UI: "🔒 Actuando como **Carlos García** · razón: **Resolver ticket #4521** · [Finalizar]".
6. Cada acción durante la session graba `actorRealId` + `onBehalfOfId` + `reason` en AuditLog.
7. **Notifica al cliente** (configurable per cliente — default ON): email + in-app notification "Un consultor de [Partner Name] está revisando tu cuenta — razón: …".
8. Session expira en **30 minutos** auto-end (configurable up to 4h max).

### 7.2 UI flow

```
Nova Workspace de Hotel Monica Tulum
├── User clicks "Switch context: Acting as ORG_OWNER"
│
▼
Modal: "Iniciar sesión en nombre del cliente"
├── Target user: [dropdown of cliente users — pre-filtered por scope]
├── Reason: [textarea required, min 10 chars]
├── Duration: [15min / 30min (default) / 1h / 4h]
├── Notify cliente: [✓ (default ON, gris si cliente policy=NEVER_NOTIFY)]
└── [Cancel] [Iniciar sesión 🔒]
│
▼
Confirmation: AuditLog entry created
- actorRealId: Abraham (consultor)
- onBehalfOfId: Carlos García (ORG_OWNER cliente)
- reason: "Resolver ticket #4521 — Channex push falla"
- action: impersonation.start
- domain: SECURITY
- retentionPolicy: PERMANENT
│
▼
UI re-renders:
- Banner orange persistente top of screen:
  "🔒 Actuando como Carlos García (Hotel Monica Tulum) ·
   razón: Resolver ticket #4521 · termina en 28:42 · [Finalizar ahora]"
- Toda la UI cambia a la PERSPECTIVA del target user
- Sidebar muestra navigation as if logged in as Carlos García
- All API calls inject header `X-Acting-As-User: {targetUserId}`
- Backend resolves both `actorRealId` (from JWT) and `actingAsUserId` (from header)
│
▼
Consultor ejecuta acciones (registra reservas, cobra pagos, etc.)
- Cada API call: AuditLog row con actorRealId=consultor, onBehalfOfId=cliente, reason=arrastrado
│
▼
Sesión termina (timer expira o consultor clicks "Finalizar")
- AuditLog entry: action=impersonation.end, includes summary stats
- UI vuelve a la perspectiva del consultor (Nova workspace)
- Banner persistente desaparece
- Cliente recibe email "Tu sesión impersonation con [Partner] finalizó. Resumen: 4 acciones. Ver detalle."
```

### 7.3 Cliente: transparency by default

```
app.zenix.com (perspectiva del cliente Carlos García)
├── In-app notification badge: "Un consultor está revisando tu cuenta"
│   ├── Click → modal con detalle:
│   │   • Quién: Abraham García (ZaharDev consultant)
│   │   • Desde: 14:23 (hace 8 min)
│   │   • Termina: 14:53 (en 22 min)
│   │   • Razón: "Resolver ticket #4521 — Channex push falla"
│   │   • Acciones realizadas hasta ahora: ver lista
│   │   • [Solicitar finalización inmediata]
│
├── Email (one-shot, at start of session):
│   Subject: "ZaharDev está revisando tu cuenta — Hotel Monica Tulum"
│   Body: Razón + Duration + Quién + Cómo cancelar + Link to AuditLog
│
└── AuditLog viewable: /audit en su propia app
    ├── Filter "Acciones de consultores": shows ALL onBehalfOfId entries
    └── Export CSV para compliance/legal
```

**Override del cliente:** ENTERPRISE tier puede configurar en Settings:
- `Notification policy: ALWAYS_NOTIFY (default) | NEVER_NOTIFY (compliance scenarios) | ONLY_TIER_A`.
- `Auto-revoke after`: tras inactividad, terminar session automáticamente (default 5 min).
- `Require dual-approval`: impersonation requires consent del cliente (URL one-click). Para clientes ultra-sensitive (Visa CRR forensic, GDPR DSAR sensitivos).

### 7.4 Audit queries

```sql
-- Toda intervención consultor sobre Hotel Monica Tulum en últimos 30 días
SELECT
  timestamp,
  actor_real_name AS consultor,
  on_behalf_of_name AS cliente_user,
  reason,
  action,
  target_type,
  target_name
FROM audit_logs
WHERE organization_id = '{hotel_monica_tulum_org_id}'
  AND on_behalf_of_id IS NOT NULL
  AND timestamp > now() - interval '30 days'
ORDER BY timestamp DESC;

-- Top consultores con más impersonations este mes (red flag si alguien excede threshold)
SELECT
  actor_real_name,
  COUNT(*) AS impersonation_count,
  COUNT(DISTINCT on_behalf_of_id) AS distinct_users_acted_as,
  COUNT(DISTINCT organization_id) AS distinct_orgs_touched
FROM audit_logs
WHERE on_behalf_of_id IS NOT NULL
  AND action = 'impersonation.start'
  AND timestamp > date_trunc('month', now())
GROUP BY actor_real_name
ORDER BY impersonation_count DESC
LIMIT 20;

-- Forensic: todo lo que hizo Abraham mientras impersonating ANY user en ANY org
SELECT *
FROM audit_logs
WHERE actor_real_id = '{abraham_user_id}'
  AND on_behalf_of_id IS NOT NULL
  AND timestamp BETWEEN '{ticket_open_date}' AND '{ticket_close_date}'
ORDER BY timestamp;
```

### 7.5 Constraints técnicas

- Impersonation NUNCA va cross-partner. Un consultor de Partner A NO puede impersonate ORG_OWNER de cliente asignado a Partner B. Check en `NovaAccessControlService.canImpersonate(actorId, targetOrgId)`.
- Impersonation NUNCA crea credentials nuevas para el cliente. Sesión es ephemeral.
- Impersonation NO puede modificar `User.password`, `User.email`, `User.is2FAEnabled` del target user. Check en application layer + DB.
- Impersonation NO puede aceptar acceptance flows tipo "Yo, el cliente, acepto los T&C" — porque legalmente no es el cliente. Application layer rechaza.

---

## 8. Tenant switcher UX

### 8.1 Patterns analizados

| Plataforma | Pattern | Pros | Cons |
|------------|---------|------|------|
| **Salesforce** | Switcher full-screen al login + sidebar collapsed para switch posterior | Clear separation de tenants | Switch posterior toma 3-4 clicks |
| **SAP Fiori Launchpad** | Tenant chip persistente top-bar + filter on landing | Always visible, low-friction switch | Chip puede esconder info útil en mobile |
| **Stripe Dashboard** | Dropdown account switcher top-bar (similar SAP) + Search Cmd+K | Cmd+K es power-user friendly | Si N > 50 accounts, dropdown se vuelve unmanageable |
| **Workday** | Sub-tenant tabs en top bar (max 5 visible) + "more" overflow | Visual + multi-tenant simultaneous view | No scale beyond 10 |

### 8.2 Decisión: híbrido SuccessFactors

Zenix adopta el **híbrido SuccessFactors-style**:
1. **Landing** `/nova/clientes` = lista clickeable filtrada (§5.3).
2. **Top-bar chip persistente** dentro del workspace de un cliente (§5.2):
   - Click chip → dropdown con últimos 5 clientes accedidos + search box ("Buscar cliente...") + link "Ver todos".
   - Cmd+K shortcut abre el dropdown.
   - Dropdown muestra max 50 items; scroll si >50.

```
┌──────────────────────────────────────────────────────────┐
│ Top-bar tenant chip dropdown:                            │
│                                                           │
│ 🏨 Hotel Monica Tulum ▼          (current — highlighted) │
│   ──────────────────────────                              │
│   🔍 [Buscar cliente_________________]                    │
│   ──────────────────────────                              │
│   Recientes:                                              │
│   🏨 Hotel Azúcar Tulum                                  │
│   🌴 Selina Tulum                                        │
│   🆕 Hotel Casa Marina (onboarding)                      │
│   🏖️ Hotel Playa del Carmen                              │
│   ──────────────────────────                              │
│   📋 Ver todos los clientes →                            │
└──────────────────────────────────────────────────────────┘
```

### 8.3 Estado scope per tier

- **PLATFORM_ADMIN:** ve TODOS los partners + TODOS los clientes (filterable). Landing default ordering: por activity recency.
- **PARTNER_ADMIN:** ve sus PartnerMembers + sus clientes asignados (filtered `partner_client_assignments.partnerId = myPartnerId`). Landing default ordering: por client tier (ENTERPRISE primero).
- **PARTNER_MEMBER:** ve solo clientes en `partner_member_assignments.partnerMemberId = myId`. Si scope=READ_ONLY, dropdown muestra clientes con marca read-only.

### 8.4 Loading state

Switch de tenant dispara:
1. Navigate to `/nova/clientes/{orgId}` (route change).
2. React Query invalida cache de queries scoped al previous tenant.
3. New queries fire para el new tenant.
4. Loading skeleton durante ~200-500ms.

Pattern Stripe Dashboard: NO bloquea la navegación con full-screen spinner. Skeleton inline.

---

## 9. Comparativa SAP / IBM / Salesforce / Stripe (deep dive)

### 9.1 SAP — el modelo más cercano

**Cómo manejan partner network:**
- **SAP PartnerEdge** — programa global con 25,000+ partners. 4 tiers (Open / Silver / Gold / Platinum) basados en revenue + certifications + customer satisfaction.
- Partners obtienen acceso a SAP Partner Portal (https://partneredge.sap.com) — separate subdomain.
- Cada partner tiene su "Partner ID" + employees registered como "Partner Users" con cert IDs individuals.

**Cómo manejan tenant isolation:**
- SAP S/4HANA Cloud usa **shared schema multi-tenant** (mismo modelo que Zenix elige §11 doc vision).
- Cada tenant tiene su "Customer ID" + isolation enforced at middleware layer (similar TenantContextService).
- Cross-tenant queries son privilegio SAP internal only.

**Cómo manejan internal partner hierarchy:**
- **SAP Universal Authentication** permite a un partner employee tener access a múltiples customer tenants vía "delegate access".
- Audit log granular: cada API call captura "SAP Partner ID + Partner User + Customer ID".

**Cómo manejan wizard/activation:**
- **SAP Activate methodology** — 6 phases (Discover, Prepare, Explore, Realize, Deploy, Run).
- Implementación típica 6-12 semanas con dedicated SAP Cloud Architect + Partner Consultant.
- Tools: SAP Solution Manager + SAP Best Practices Explorer.

**Qué Zenix copia:**
- 4 tiers Partner (AUTHORIZED / SILVER / GOLD / PLATINUM) — direct copy.
- Tier benefits ladder (annual fee + revenue share + support level).
- Certification requirement per role.
- Audit log universal con actorRealId + onBehalfOfId pattern.
- Partner Portal separate subdomain (`nova.zenix.com` ≈ `partneredge.sap.com`).
- Wizard 8-step methodology (compressed version de SAP Activate).

**Qué Zenix cambia:**
- 30-min wizard vs SAP 6-12 semanas (scope acotado — PMS vs ERP).
- Sin "Solution Manager" complexity — single Nova surface.
- Pricing transparente vs SAP opaque negotiation.

**Qué Zenix evita:**
- SAP Partner Finder marketplace — Zenix lo deferimos a v1.2 PARTNER-LEADS sprint (no es v1.0 priority).
- SAP Universal Authentication SSO con multi-IdP — Zenix usa simple JWT con scope. SSO via SAML/OIDC reservado para v1.3+.

### 9.2 Salesforce — modelo de partner community

**Cómo manejan partner network:**
- **Salesforce Partner Community** — portal separate (https://partners.salesforce.com).
- **Salesforce Consulting Partners** — 5,000+ firmas registered.
- AppExchange para ISV partners (tangencial — ZaharDev no es AppExchange-equivalent en v1.0).

**Cómo manejan tenant isolation:**
- Salesforce usa **Org-per-tenant** (cada customer = un "Salesforce Org" con su propio schema metadata).
- NO shared schema. Each org es isolated DB tenant.
- **Trade-off:** mejor isolation, peor cross-org analytics, costo mayor.
- Zenix **NO copia** este modelo — shared schema es más eficiente para boutique LATAM scale.

**Cómo manejan internal partner hierarchy:**
- **Salesforce Login As** feature — admin puede impersonate cualquier user con AuditLog obligatorio.
- "Setup Audit Trail" registra TODA acción admin.

**Cómo manejan wizard/activation:**
- **Setup Assistant** + **Trailhead** training.
- "Salesforce Foundations" template para new customers.

**Qué Zenix copia:**
- Login As pattern → Nova impersonation con reason required (§7).
- Setup Audit Trail → AuditLog universal (§3.5).
- Partner Community subdomain pattern → `nova.zenix.com`.

**Qué Zenix cambia:**
- Single shared schema vs org-per-tenant (§11 doc vision — costo + simplicidad).
- Wizard pre-built per industry (HOSTAL/BOUTIQUE/CABAÑAS/BUSINESS templates) vs Salesforce blank-org-then-customize.

**Qué Zenix evita:**
- AppExchange marketplace complexity — reservado a Zenix Marketplace v1.4+.
- Multi-IdP SSO en v1.0 — deferred.

### 9.3 Stripe — modelo Connect platform

**Cómo manejan partner network:**
- **Stripe Connect** — platform model donde "connected accounts" pueden ser customers o partners.
- Partners verified obtienen badge + lead distribution.

**Cómo manejan tenant isolation:**
- **Stripe Accounts** — cada customer es una "Stripe Account" con isolated data.
- Connect platforms ven sub-accounts via API scoping.

**Cómo manejan internal partner hierarchy:**
- **Stripe Teams** dentro de account — users con roles (Owner / Admin / Developer / etc.).
- Audit log via "Events API" (durable, queryable).

**Cómo manejan wizard/activation:**
- **Stripe Onboarding** — 5-10 min self-service flow para STARTER customer.
- Connect platform onboarding tiene custom UI.

**Qué Zenix copia:**
- Connect platform model conceptual — Nova ≈ "Connect platform" de ZaharDev, clientes ≈ "Connected accounts".
- Dashboard subdomain pattern (`dashboard.stripe.com` ≈ `nova.zenix.com`).
- Events API pattern para AuditLog query-friendly.

**Qué Zenix cambia:**
- Wizard 30-min consultor-led vs Stripe 10-min self-service. Razón: PMS es más complejo de configurar correctamente.
- Partner verification via certification (no Stripe partner badge equivalent en v1.0).

**Qué Zenix evita:**
- Self-service onboarding como default (deferred v1.3+).
- API-first activation (Zenix v1.0 es UI-led, API-led queda para v1.4+ Headless mode).

### 9.4 IBM — modelo Business Partner Program

**Cómo manejan partner network:**
- **IBM Partner Plus** — programa global, 4 tiers (Registered / Silver / Gold / Platinum).
- Similar a SAP PartnerEdge.

**Cómo manejan tenant isolation:**
- IBM Cloud uses **separate IBM Cloud accounts** per tenant.
- Cross-account access vía IAM federation.

**Cómo manejan wizard/activation:**
- **IBM Watson Assistant** y otros productos tienen Guided Setup específicos per producto.
- Implementación enterprise via certified IBM Business Partners (similar SAP model).

**Qué Zenix copia:**
- Tier ladder + naming convention.
- Certification gates.

**Qué Zenix evita:**
- IBM Cloud accounts complexity (separate billing, IAM, networking).
- IBM Watson Assistant patterns (overkill para PMS).

### 9.5 Resumen comparativo

| Característica | SAP | Salesforce | Stripe | IBM | **Zenix Nova** |
|----------------|-----|------------|--------|-----|----------------|
| Partner tier ladder | 4 tiers | 4 tiers | 1 tier | 4 tiers | **4 tiers (Authorized/Silver/Gold/Platinum)** |
| Tenant isolation | Shared schema | Org-per-tenant | Account-per-tenant | Account-per-tenant | **Shared schema** |
| Partner portal subdomain | partneredge.sap.com | partners.salesforce.com | n/a (combined) | partnerplus.ibm.com | **nova.zenix.com** |
| Impersonation w/ reason+audit | ✅ | ✅ Login As | 🟡 limited | ✅ | **✅ Required reason + audit** |
| Wizard setup | 6-12 weeks | 2-4 weeks (consultant) | 10 min (self-service) | 4-8 weeks | **30 min - 2 weeks** |
| Certification required | ✅ | ✅ | 🟡 limited | ✅ | **✅** |
| Revenue share model | Yes (varied) | Yes (varied) | Yes (Connect %) | Yes (varied) | **20-40% per tier** |
| AppExchange/Marketplace | Yes | Yes | Yes (Apps) | Yes | **v1.4+ Zenix Marketplace** |
| Self-service onboarding | ❌ | 🟡 limited | ✅ | ❌ | **❌ v1.0, ✅ v1.3+** |

---

## 10. Data ownership + ABI (referencia 10-data-strategy-abi.md)

### 10.1 Capas de access a datos

```
                         ┌──────────────────────────┐
                         │  Cliente (hotel)         │
                         │  Ve: SUS datos completos │
                         └──────────────────────────┘

                         ┌──────────────────────────┐
                         │  Partner (su cliente)    │
                         │  Ve: cliente data scoped │
                         │  Vía: impersonation +    │
                         │       limited write      │
                         └──────────────────────────┘

                         ┌──────────────────────────┐
                         │  Partner (cross-client)  │
                         │  Ve: aggregated NPS,     │
                         │      retention, churn    │
                         │  Vía: dashboard PartnerEdge│
                         └──────────────────────────┘

                         ┌──────────────────────────┐
                         │  ZaharDev (PLATFORM)     │
                         │  Ve: TODO + ABI cross    │
                         │  Vía: BI dashboards      │
                         │       impersonation      │
                         │       data exports       │
                         └──────────────────────────┘

                         ┌──────────────────────────┐
                         │  ABI Insights consumers  │
                         │  Ve: aggregated only,    │
                         │      k-anonymity ≥5      │
                         │      consent opt-in      │
                         │  Vía: ABI Insights API   │
                         └──────────────────────────┘
```

### 10.2 Consent model

Para que un cliente data participe en ABI Insights cross-tenant:
1. **Opt-in explícito** en Settings (default OFF).
2. **Anonymization rules:** k-anonymity ≥5 properties before publishing aggregation. (Si solo 3 hostales QR participan, no se publica.)
3. **Categories of consent:** occupancy data / ADR data / OTA mix / cancellation rates / guest demographics (separable).
4. **Right to withdraw:** cliente puede revocar consent anytime, retroactive data anonymized en 30 días.

Audit Log graba consent changes con retentionPolicy=TEN_YEARS.

### 10.3 Partner BI scope

Partner GOLD/PLATINUM ven dashboard de **sus** clientes con:
- Aggregated metrics (occupancy, ADR, NPS) per cliente y across all clientes.
- Drill-down per cliente individual (respecting PartnerMemberAssignment scope).
- NO access a otros partners' data.
- NO access a guest PII de sus clientes salvo via impersonation con reason.

Partner SILVER/AUTHORIZED ven solo metrics agregadas (no drill-down).

### 10.4 ZaharDev BI scope

PLATFORM_ADMIN ve:
- ABI Insights dashboard cross-tenant con k-anonymity ≥5.
- Partner performance dashboard (todos los partners, todas sus métricas).
- Tenant health monitoring (channel failures, payment failures, audit anomalies).
- Revenue and licensing dashboard.

NO ve PII guest-level salvo via impersonation + ticket abierto.

### 10.5 Compliance LATAM

- **GDPR** (UE users sospitched, ej. turistas alemanes): Right to erasure → data anonymization preserving fiscal records (CFDI requires retention but can mask PII).
- **LGPD Brasil:** similar GDPR.
- **LFPDPPP México:** notification obligations + data subject rights.
- **DSAR (Data Subject Access Request) endpoints:** clientes pueden solicitar export de SUS datos (incluyendo audit trail de impersonations sobre su cuenta). Cumple obligación legal.

Ver doc 10 para detalle completo.

---

## 11. Migration path v1.0 → v1.0.5 → v1.2

### 11.1 Phase 1 — v1.0.0 (Sprint CHANNEX-COMMAND-CENTER)

**Scope:**
- Schema migrated: Partner + PartnerMember + PartnerClientAssignment + PartnerMemberAssignment + AuditLog + extended SystemRole enum.
- Seed ZaharDev as `Partner.isInternal=true` + 1 PLATFORM_ADMIN user (Abraham).
- 5-tier RBAC enforced server-side via `NovaAccessControlService` + tests matrix.
- Nova shell mínimo en ruta `/nova/*` dentro de `apps/web`:
  - Landing `/nova/clientes` (lista filtered).
  - Workspace `/nova/clientes/{orgId}` con sidebar nav stub.
  - Tenant chip top-bar.
- Wizard "Zenix Activate" funcional para:
  - Step 1 (Customer Account) — completo.
  - Step 7 (Integrations) — sub-flow Channex completo (replica config manual actual).
- Steps 2-6 y 8 quedan stub navegable con TODO markers.
- AuditLog escribe en cada Wizard step.activate, cada Channex.connect, cada impersonation.start/end.
- Impersonation funcional **mínimo viable**:
  - Switch context UI + banner persistente.
  - AuditLog inject header X-Acting-As-User.
  - Sin notification al cliente aún (queda Phase 2).

**Out-of-scope Phase 1:**
- BI dashboards (placeholder con disclaimer "v1.2+").
- Billing/commission (placeholder).
- Marketplace de leads.
- Partner self-onboarding (PLATFORM_ADMIN crea manualmente).
- White-label branding per partner.

**Estimated effort:** ~10-15 días-dev dentro del sprint CHANNEX-COMMAND-CENTER (~25-30 días total con resto del sprint).

### 11.2 Phase 2 — v1.0.5 (Sprint NOVA-EXTRACT + WIZARD-COMPLETE)

**Scope:**
- Extract Nova a `apps/partner` Vite build separado.
- DNS `nova.zenix.com` apunta a apps/partner.
- Cookies separadas + CSP per-host.
- Wizard 8 steps completos (Steps 2-6 y 8 funcionales).
- Activation Report PDF (Puppeteer pool §ADR-0001).
- Impersonation notifications al cliente (email + in-app).
- ENTERPRISE Brand Admin Mode (subset Nova accessible para ORG_OWNER tier ENTERPRISE).
- Compatible con Wizard FX-LATAM (multi-país adapters per LegalEntity).

**Estimated effort:** ~3-4 semanas dentro de v1.0.5.

### 11.3 Phase 3 — v1.2 (Sprint PARTNER-PORTAL-CORE)

**Scope:**
- Partner self-onboarding flow (`partners.zenix.com/apply` → manual review → Authorized tier).
- White-label branding per partner GOLD/PLATINUM.
- Lead marketplace + lead-distribution rules (§09 doc vision).
- Commission accounting + automated invoicing.
- Multi-IdP SSO (SAML, OIDC) per ENTERPRISE customer.
- Marketplace de leads cross-partner.
- Co-marketing assets portal.
- Documentation portal per certification level.

**Estimated effort:** ~17 semanas, ver §09 doc vision §8.

### 11.4 Phase 4 — v1.3+ (Future)

- Self-service customer onboarding (sin consultor, STARTER tier only).
- API-led activation (headless mode for partners building custom UIs).
- White-label full (custom domain per partner, brand-stripped UI).
- ABI Insights API público para customers consumir aggregated benchmarks.
- Mobile Nova app (consultor en-the-go).

---

## 12. Risks + open questions

### 12.1 Risks identificados

**R1 — Partner-quality drift:** un partner certificado puede degradar over time (turnover de consultores senior, certifications expiring). Mitigación: NPS monitoring monthly + auto-suspend if NPS < 40 sustained 2 meses + re-cert obligatorio cada 18 meses.

**R2 — Cliente reclamando "yo no autoricé esa acción":** ambiguity sobre quién hizo qué cambio. Mitigación: AuditLog universal con `actorRealId + onBehalfOfId + reason` REQUIRED. Banner persistente impersonation. Notification al cliente. Forensic queries available (§7.4).

**R3 — Partner se va con su cartera de clientes:** consulting firm decide construir su propio PMS, intenta migrar clients. Mitigación: contratos cliente directamente con ZaharDev (no con partner) §09 NN6. AuditLog inmutable. Migration path para tomar clientes direct si partner termina.

**R4 — Cross-partner data leak:** bug en PartnerMemberAssignment scope check podría exponer clientes de Partner B a Partner A. Mitigación: server-side enforcement en `NovaAccessControlService` + integration tests matrix per tier + pre-commit hooks que verifican no direct DB queries sin scope.

**R5 — Wizard activation race condition:** dos consultores ejecutando wizard simultáneo en el mismo cliente nuevo. Mitigación: `WizardSession` row con `currentStep` + optimistic locking (`updatedAt` check). UI muestra "Otro consultor está ejecutando wizard, espera o tomá control".

**R6 — AuditLog table growth unbounded:** 7-year retention + thousands de events/day per cliente activo. Mitigación: partitioning por `timestamp` (Postgres native partitioning), archive a cold storage (S3 Glacier) after 1 año, purge after retention policy expires.

**R7 — 2FA fatigue:** require2FA en LEAD_CONSULTANT + SUPPORT_L2 + SUPPORT_L3 + PARTNER_ADMIN + PLATFORM_ADMIN puede causar friction. Mitigación: trust devices 30 días + WebAuthn passkeys preferred over SMS/TOTP.

**R8 — Tenant switcher confusion:** consultor cree estar viewing cliente A pero está en cliente B (mistake costoso). Mitigación: tenant chip persistente always-visible + color coding del workspace (hash del orgId → border color) + confirmation modal para destructive actions ("Confirmá que querés modificar Hotel Monica Tulum").

**R9 — Impersonation abuse:** consultor abusing impersonation para acceder a guest PII sin causa legítima. Mitigación: PLATFORM_ADMIN dashboard "Top impersonators this month" (§7.4) + threshold alerts + monthly random audit of 10% impersonation sessions + contractual NDAs.

**R10 — Forced multi-tenancy testing:** features nuevas pueden olvidar el scope check. Mitigación: `RbacMatrixTest` suite en CI/CD que valida cada nueva endpoint contra la matriz §4. Pre-commit hook que rechaza endpoint nuevo sin entrada en matriz.

### 12.2 Open questions (decisiones pendientes)

**Q1 — ¿Sub-partners pueden existir (white-label full chain)?**
Caso: Partner Gold contrata sub-contractors (freelance consultants) que actúan en su nombre. Schema actual no lo soporta — un user = una PartnerMember row. Decisión: postponed a v1.3+. Por ahora freelancers se registran como PartnerMember role=SOLUTION_CONSULTANT con explicit assignment.

**Q2 — ¿Cómo manejar partners en diferentes países con regulaciones distintas?**
Caso: Partner MX vs Partner BR — labor laws + tax laws + data sovereignty distintos. Decisión: `Partner.countryCode` define jurisdicción principal. `servingCountries` define expansion possible. Compliance per partner es responsabilidad del partner mismo (Zenix no es employer-of-record). Documentar en partner contract.

**Q3 — ¿Cliente puede cambiar de partner?**
Decisión: Sí, vía `PartnerClientAssignment.status=TRANSITIONING` durante handover (max 90 días overlap). Después closed antiguo + active nuevo. Cliente debe firmar consent form (contractual obligation). Audit log permanente.

**Q4 — ¿Audit log retention para impersonation = realmente PERMANENT?**
Decisión preliminar: SÍ — PERMANENT retention para impersonation logs. Razón: Visa CRR forensic + GDPR DSAR + partner contract disputes pueden surgir 5-10 años post-event. Costo storage marginal (text rows en cold storage).
Open: revisar con legal advisor MX/EU pre-v1.2 production launch.

**Q5 — ¿Cliente puede ver el audit log de SU cuenta full o solo summary?**
Decisión preliminar: ORG_OWNER puede ver TODO el audit log de su scope (incluyendo impersonation sessions). Export CSV available. Transparency by default. ENTERPRISE tier puede configurar retention extended para legal compliance.
Open: confirmar si ORG_SUP debe ver audit log también (today: ❌ — ORG_SUP no ve, solo ORG_OWNER).

**Q6 — ¿Migrar cliente de `app.zenix.com` a `pms.zenix.com` algún día?**
Caso: si Nova vive en `nova.zenix.com`, simétrico sería `pms.zenix.com` para el cliente. Decisión: postponed. Cost de cambiar domain del cliente (SEO, bookmarks, contratos) > benefit en v1.0.0. Re-evaluate v2.0.

**Q7 — Single Sign-On (SSO) entre Nova y app.zenix.com?**
Caso: consultor logueado en Nova hace impersonation → debería poder switch a app.zenix.com como si fuera cliente sin re-login. Decisión: NO inicialmente — sessions separadas por design (§5.1). Pero impersonation flow inyecta token temporal para app.zenix.com via deep link.

**Q8 — Localization de Nova (i18n)?**
Caso: partners CR/PE/PA pueden no hablar español MX dialect. Decisión: v1.0.0 Nova solo español neutro. v1.1+ inglés. v1.2+ portugués (Brasil expansion).

**Q9 — Mobile Nova app?**
Decisión: postponed. Web Nova responsive es suficiente para tablet del consultor. Mobile native app reserved v1.3+.

**Q10 — Integration con tickets externos (Zendesk, Intercom, Jira)?**
Caso: partners ya usan Zendesk para tickets. Decisión: v1.2+ via webhooks. v1.0.0 tickets are out-of-Nova (partner uses external system, audit log references ticket ID as text only).

---

## 13. Definition of Done — Fase 1 (Sprint CHANNEX-COMMAND-CENTER)

### 13.1 Backend deliverables

- [ ] Schema migration `add-nova-partner-model` ejecutada en local + staging.
- [ ] Tables creadas: `partners`, `partner_members`, `partner_client_assignments`, `partner_member_assignments`, `audit_logs`.
- [ ] Enums seeded: `PartnerTier`, `PartnerStatus`, `PartnerMemberRole`, `MemberStatus`, `AssignmentStatus`, `BillingModel`, `MemberAssignmentScope`, `ActorType`, `AuditDomain`, `AuditOutcome`, `RetentionPolicy`.
- [ ] SystemRole enum extended: `PLATFORM_ADMIN`, `PARTNER_ADMIN`, `PARTNER_MEMBER`.
- [ ] DB constraints + triggers (§3.7).
- [ ] Seed script: ZaharDev Partner (isInternal=true) + 1 PLATFORM_ADMIN user (abrahag40@gmail.com) + bootstrap AuditLog entry.
- [ ] `NovaAccessControlService` con method `canDoAction(actor, action, scope)` driven by `NOVA_CAPABILITIES` constant.
- [ ] RBAC matrix tests (§4) — 1 spec per tier per action.
- [ ] AuditLogService con method `record(actor, action, target, options)` — captures actorRealId, onBehalfOfId, reason, etc.
- [ ] Impersonation guard: `X-Acting-As-User` header inspection + scope validation + AuditLog inject.
- [ ] Endpoints nuevos (mínimo viables):
  - `POST /v1/nova/partners` (PLATFORM_ADMIN only) — creates Partner row.
  - `GET /v1/nova/partners/me` — current user's Partner (if any).
  - `POST /v1/nova/clientes` — create Organization + assign to partner.
  - `GET /v1/nova/clientes` — list scoped por tier.
  - `GET /v1/nova/clientes/:id` — fetch detail.
  - `POST /v1/nova/impersonation/start` — start session (requires reason).
  - `POST /v1/nova/impersonation/end` — terminate session.
  - `GET /v1/nova/audit-log` — query AuditLog (filtered por scope).
  - `POST /v1/nova/wizard/sessions` — start wizard.
  - `POST /v1/nova/wizard/sessions/:id/step/:step/save` — save step data.
  - `POST /v1/nova/wizard/sessions/:id/step/7/channex-test` — test push Channex.
  - `POST /v1/nova/wizard/sessions/:id/activate` — final activation.

### 13.2 Frontend deliverables

- [ ] Routing condicional en `apps/web` para `/nova/*`.
- [ ] Auth gate: redirect non-Nova roles a `/`.
- [ ] Nova Shell layout (sidebar + top-bar + workspace).
- [ ] `/nova/clientes` landing (list filtered).
- [ ] `/nova/clientes/new` → wizard step 1.
- [ ] `/nova/clientes/{orgId}` workspace.
- [ ] `/nova/clientes/{orgId}/wizard` con step navigation (Step 1 + Step 7 funcionales; resto stub).
- [ ] `/nova/clientes/{orgId}/channex` Command Center (subject of CHANNEX-COMMAND-CENTER sprint detail).
- [ ] `/nova/clientes/{orgId}/audit` viewer.
- [ ] Tenant chip dropdown switcher.
- [ ] Impersonation modal flow + persistent banner.
- [ ] Visual differentiation: dark sidebar slate-900 + indigo accents.

### 13.3 QA + tests

- [ ] Integration tests: Partner CRUD + scope enforcement.
- [ ] Integration tests: impersonation flow + AuditLog grabs onBehalfOfId.
- [ ] Integration tests: wizard Step 1 + Step 7 happy path.
- [ ] RBAC matrix unit tests (suite per tier).
- [ ] E2E test: PLATFORM_ADMIN crea Partner → PARTNER_ADMIN invita PARTNER_MEMBER → PARTNER_MEMBER ejecuta wizard step 1 para nuevo cliente → activate → cliente registrado.

### 13.4 Documentation

- [ ] Este doc (`NOVA-architecture.md`) versionado en repo.
- [ ] Schema diagram actualizado en `docs/architecture/`.
- [ ] CLAUDE.md §63-94 actualizado con referencia a este doc para nuevos contributors.
- [ ] Runbook ops: cómo crear nuevo partner manualmente vía SQL/API.

---

## 14. Definition of Done — Fase 2 (v1.0.5)

### 14.1 Extraction `apps/partner`

- [ ] New Vite project `apps/partner/` con tsconfig propio.
- [ ] Bundle de Nova movido a `apps/partner/` (sin código del cliente).
- [ ] Bundle de `apps/web` purgado de código Nova (verify ~30% bundle size reduction).
- [ ] DNS `nova.zenix.com` configurado en Vercel/Cloudflare → apps/partner build.
- [ ] Cookies separadas: `cookie domain=nova.zenix.com` solo para Nova.
- [ ] CSP separada y más estricta para Nova.
- [ ] Sessions separadas: login en Nova NO auto-loguea en app.zenix.com.

### 14.2 Wizard completo (8 steps)

- [ ] Step 2 Brand funcional (logo upload + colors + brand book PDF).
- [ ] Step 3 LegalEntity completo (FX-LATAM adapters, PAC test, validation per country).
- [ ] Step 4 Properties (timezone autoselect via city geo lookup).
- [ ] Step 5 Inventory (4 templates HOSTAL/BOUTIQUE/CABAÑAS/BUSINESS + bulk CSV import).
- [ ] Step 6 Staff + Users (bulk CSV + magic link invitations).
- [ ] Step 7 Integrations (Channex completo + Stripe + Conekta + WhatsApp + PAC cross-check).
- [ ] Step 8 Activation con health checks suite + Activation Report PDF (Puppeteer).
- [ ] WizardSession persistence + resume.
- [ ] Audit log per step.activate.

### 14.3 BI básico cross-client (dashboard partner)

- [ ] `/nova/firma/dashboard` para PARTNER_ADMIN — aggregated metrics: total clientes activos, occupancy promedio cross-portfolio, NPS promedio, commission this month estimated.
- [ ] Drill-down per cliente (respecting PartnerMemberAssignment scope).

### 14.4 Tenant switcher con chip persistente

- [ ] Chip top-bar funcional con dropdown recientes.
- [ ] Cmd+K shortcut.
- [ ] Search box en dropdown.

### 14.5 Impersonation notifications

- [ ] Email al cliente at impersonation.start.
- [ ] In-app notification badge en `app.zenix.com`.
- [ ] AuditLog viewable por ORG_OWNER en `/audit` con filter "Acciones de consultores".

---

## 15. Referencias

### 15.1 Docs internos

- [docs/vision/01-vision-zahardev-zenix.md](../vision/01-vision-zahardev-zenix.md) — modelo de negocio Zenix↔ZaharDev (flywheel)
- [docs/vision/02-product-family.md](../vision/02-product-family.md) — naming framework + bundles tiered
- [docs/vision/03-roadmap-v1-v2.md](../vision/03-roadmap-v1-v2.md) — roadmap detallado
- [docs/vision/09-partner-network.md](../vision/09-partner-network.md) — Partner Network SAP/SuccessFactors model (precursor de este doc)
- [docs/vision/10-data-strategy-abi.md](../vision/10-data-strategy-abi.md) — política de datos + ABI
- [docs/vision/11-multi-tenant-architecture.md](../vision/11-multi-tenant-architecture.md) — modelo 4-level Brand→Org→LegalEntity→Property
- [docs/vision/12-infrastructure-devops.md](../vision/12-infrastructure-devops.md) — 4 fases de infra + DevOps practices
- [docs/vision/13-consultant-setup-wizard.md](../vision/13-consultant-setup-wizard.md) — Zenix Activate wizard 8 etapas
- [docs/vision/14-payment-currency-tax-architecture.md](../vision/14-payment-currency-tax-architecture.md) — PAY-CORE/CFDI-CORE
- [docs/architecture/01-multi-tenancy.md](./01-multi-tenancy.md) — implementación multi-tenant técnica
- [docs/architecture/ADR-0001-pdf-rendering.md](./ADR-0001-pdf-rendering.md) — Puppeteer pool decision
- [CLAUDE.md §63-94](../../CLAUDE.md) — non-negotiable decisions multi-tenant + payment + tax

### 15.2 Referencias externas (verificables)

- **SAP PartnerEdge program:** https://partneredge.sap.com — public partner program docs.
- **SAP S/4HANA Cloud Multi-Tenant:** https://help.sap.com/docs/SAP_S4HANA_CLOUD — public arch docs.
- **SAP Activate methodology:** https://help.sap.com/docs/SAP_ACTIVATE — public methodology docs.
- **IBM Partner Plus:** https://www.ibm.com/partnerplus — public partner program docs.
- **Salesforce Partner Community:** https://partners.salesforce.com — public.
- **Salesforce Setup Audit Trail:** https://help.salesforce.com/s/articleView?id=sf.admin_monitorsetup.htm — public.
- **Stripe Connect platform docs:** https://stripe.com/docs/connect — public.
- **Stripe Events API:** https://stripe.com/docs/api/events — public.
- **Workday Adaptive Implementation:** Workday Community public docs.
- **Microsoft Citus multi-tenancy patterns:** https://docs.citusdata.com/en/v11.1/use_cases/multi_tenant.html — public.
- **Bytebase 2026 multi-tenant patterns survey:** https://www.bytebase.com/blog/multi-tenant-database-design-patterns/ — public.
- **NN/g H4 Consistency & Standards:** https://www.nngroup.com/articles/ten-usability-heuristics/ — Jakob Nielsen 1994/rev 2020.
- **GDPR Article 17 Right to Erasure:** https://gdpr-info.eu/art-17-gdpr/ — public EU regulation text.
- **Visa Core Rules / Dispute Management Guidelines:** Visa Public Documentation 2024.
- **CFDI 4.0 Anexo 20:** Servicio de Administración Tributaria (SAT) México — public.

### 15.3 Glossary

- **AuditLog** — append-only universal log of all actions.
- **Brand** — optional commercial entity grouping organizations.
- **LegalEntity** — fiscal entity with tax ID per country.
- **Nova** — Zenix admin console surface for ZaharDev + Partners.
- **ORG_OWNER** — hotel owner or authorized person at cliente.
- **ORG_STAFF** — operational staff at cliente (Supervisor/Receptionist/etc.).
- **Partner** — consulting firm registered with ZaharDev.
- **PartnerEdge** — SAP partner program model that Zenix replicates.
- **PartnerMember** — individual consultor at a Partner.
- **PLATFORM_ADMIN** — ZaharDev internal staff with full ecosystem access.
- **Tier A operation** — admin/fiscal/billing operation (high-impact).
- **Tier B operation** — operational day-to-day operation (lower-impact).
- **Tenant chip** — UI element showing current cliente scope.
- **Zenix Activate** — 8-step onboarding wizard.

---

## 16. Bitácora de revisiones

- **2026-05-24** — Documento creado por Abraham + Claude Code review. Establece Nova como surface arquitectónica fundacional separada del cliente PMS. Define schema completo Partner + PartnerMember + AuditLog + 5-tier RBAC matrix + impersonation pattern + wizard integration + migration path v1.0→v1.0.5→v1.2. Integra y referencia (sin duplicar) los predecesores en `docs/vision/09`, `11`, `13`, `10`. Reemplaza el BRONZE tier de §09 por AUTHORIZED (alineación con SAP PartnerEdge naming). Adds AuditLog universal model (`actorRealId + onBehalfOfId + reason`) — pattern SAP impersonation no presente en docs predecesores. Establece Definition of Done Fase 1 dentro de Sprint CHANNEX-COMMAND-CENTER (~10-15 días-dev backend + ~10 días-dev frontend de los ~25-30 días total del sprint). 10 risks identified + 10 open questions registered para resolver pre-v1.2.

---

**Fin del documento.** Para feedback o updates: editar este archivo en branch `feature/nova-architecture` y abrir PR con label `architecture-decision`.
