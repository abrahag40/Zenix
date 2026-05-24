# 09 · Partner Network — Modelo SAP/SuccessFactors

> Semilla: **v1.0.0** (schema + ZaharDev como Partner interno, vive bajo `nova.zenix.com` dentro de `apps/web/src/pages/nova/*`).
> Extracción dedicada: **v1.0.5** (`apps/partner` o re-uso del mismo Nova bajo dominio dedicado para GOLD/PLATINUM).
> Activación marketplace + portal certificación pública: **v1.2 (Q1 2027)**.
> Streams: **R13 (Partner License + Revenue Share), R14 (Training + Certification)**.
>
> **Doc fundacional vinculante:** [docs/architecture/NOVA-architecture.md](../architecture/NOVA-architecture.md) — schema canónico, RBAC matrix, impersonation pattern y AuditLog universal. Este documento es la **lente de negocio** (tiers, revenue share, onboarding, riesgos). El schema técnico autoritativo está en NOVA.

---

## 1. Por qué el Partner Network es pilar arquitectónico (no solo feature)

Hay dos formas de tener partners:

| **"Tener partners" (lo que muchos PMS hacen)** | **"Ser plataforma de partners" (modelo SAP — lo que ZaharDev quiere)** |
|------------------------------------------------|-------------------------------------------------------------------------|
| Revendedor compra licencias y revende | Partner tiene su propio CRM dentro del sistema |
| Soporte L1 lo da el partner, L2-L3 el vendor | Partner factura a sus hoteles directamente (white-label parcial) |
| Margen partner 10-15% | Partner tiene certificación obligatoria |
| Sin sistemas propios para el partner | Partner accede a templates de implementación + scripts |
| | Partner participa en pipeline ZaharDev (referrals bidireccionales) |
| | Margen partner 25-40% + bonificación por upsells |

**ZaharDev escoge el modelo SAP.** Esto no es feature de v1.2 — es el **pilar arquitectónico de todo Zenix**. Sin Partner Network, ZaharDev no escala más allá de LATAM.

**Referencia de mercado:** SAP SuccessFactors tiene 2,500+ partners. Salesforce AppExchange tiene 5,000+. HubSpot Solutions Partner Program 6,000+. Todos siguen el mismo patrón: software vendor + portal de partners + certificación + revenue share.

---

## 2. Funcionalidad del Partner Portal

### Para el partner (sub-consultora)

| Sub-feature | Qué hace | Equivalente SAP |
|-------------|----------|-----------------|
| **Multi-hotel CRM** | Pipeline + clientes activos del partner | Salesforce-style |
| **White-label config** | Logo + colores + dominio propio (limitado) | SAP Partner branding |
| **Implementation templates** | Configs pre-armadas por tipo de hotel | SAP Best Practices |
| **Training tracker** | Cursos completados + certificación vigente | SAP Learning Hub |
| **Billing dashboard** | Revenue del partner + comisiones ZaharDev | SAP Partner Finder |
| **Support tickets** | Escalado L2/L3 al equipo ZaharDev | SAP Service Marketplace |
| **Demo environment** | Sandbox completo con datos sintéticos | SAP Trial Landscape |
| **Marketplace de leads** | ZaharDev redirige clientes a partners geográficamente | SAP PartnerEdge |
| **Documentation portal** | Acceso a docs técnicos + sales decks | SAP Help Portal |
| **Co-marketing kit** | Logos, slides, case studies, video assets | HubSpot Partner Resources |

### Para ZaharDev (admin master)

- **Pipeline cross-partner** — qué deals están abiertos en toda la red
- **Performance scorecard** — partners más rentables, NPS por partner
- **Quality monitoring** — NPS de clientes finales por partner
- **Pricing controls** — descuentos máximos por tier
- **Certification revocation** — si partner pierde calidad
- **Lead distribution** — ZaharDev recibe lead → asigna a partner por geo + capacidad
- **Audit trail** — quién hizo qué cambio en qué cuenta del partner

---

## 3. Sistema de tiers de partner — SAP PartnerEdge alineado

> **Nota de naming v1.0.0:** el tier base se renombra `BRONZE → AUTHORIZED` alineado con SAP PartnerEdge "Authorized Partner" (entry-tier, no implica calidad inferior — implica "habilitado contractualmente"). Refs: SAP PartnerEdge framework (2024 edition), Salesforce Consulting Partner Program Tiers, HubSpot Solutions Partner Tiers. Esto se refleja en el `enum PartnerTier` de `docs/architecture/NOVA-architecture.md` §3.1.

### 3.1 Tabla de tiers, requisitos, benefits y revenue share

| Tier | Annual fee | Clientes mín. | NPS mín. | Cert. requeridas | Revenue share | Lead share ZaharDev | Training credits/yr | Marketing co-op fund | Deal registration discount | SLA soporte | White-label |
|------|-----------:|--------------:|---------:|------------------|--------------:|--------------------:|-------------------:|---------------------:|---------------------------:|------------:|-------------|
| **AUTHORIZED** | $0 | 1 | n/a | FOUNDATIONS (1 cert) | 20% | 0 leads/yr | 2 cert seats | $0 | 0% | 48h email | ❌ |
| **SILVER** | $2,000 USD | 5 | 50 | FOUNDATIONS + 1 advanced (cualquiera) | 28% | 4-6 leads/yr regionales | 5 cert seats | hasta $2k/yr matching 1:1 | 5% | 24h email+chat | ❌ |
| **GOLD** | $8,000 USD | 15 | 70 | FOUNDATIONS + 2 advanced + 1 SOLUTION_ARCHITECT | 35% | 12-18 leads/yr + priority en geo | 10 cert seats | hasta $8k/yr matching 1:1 | 10% | 12h con account manager | ✅ logo+colors+subdomain |
| **PLATINUM** | $25,000 USD | 30 | 75 | FOUNDATIONS + 3 advanced + 1 ARCHITECT + Trainer | 40% + bonos | leads exclusivos por territorio + co-selling | 25 cert seats | hasta $25k/yr matching 1:1 | 15% | 4h + co-selling | ✅ full incl. custom domain |

**Benefits detallados por tier** (research SAP PartnerEdge "Sell" + "Service" track benefits 2024 + Salesforce Consulting Partner tier matrix + HubSpot Solutions Partner Program 2024):

| Beneficio | AUTHORIZED | SILVER | GOLD | PLATINUM |
|-----------|:----------:|:------:|:----:|:--------:|
| Sandbox demo environment | ✅ | ✅ | ✅ | ✅ |
| Implementation templates (HOSTAL/BOUTIQUE/etc.) | ✅ | ✅ | ✅ | ✅ |
| Documentation portal (docs técnicos) | ✅ | ✅ | ✅ | ✅ |
| Discount Nova seats internos | n/a | 10% | 25% | 40% |
| Bring-your-own-leads margin boost | n/a | +2% | +3% | +5% |
| Joint case study (Zenix promueve al partner) | ❌ | 1/yr | 2/yr | 4/yr + video |
| Co-marketing eventos (booth, webinar) | ❌ | ❌ | $2k/event hasta 2/yr | $5k/event ilimitado |
| Roadmap influence (3 votos/yr en feature prioritization) | ❌ | ❌ | ✅ 1 voto | ✅ 3 votos + advisory board seat |
| Beta access (sprints en alpha) | ❌ | ❌ | ✅ | ✅ + design partner status |
| Partner Manager dedicado (PM) | ❌ | shared | dedicated | dedicated senior |
| Sub-partner relationships (white-label downstream) | ❌ | ❌ | ❌ | ✅ |
| Quarterly Business Review (QBR) presencial | ❌ | virtual | virtual+anual presencial | trimestral presencial |

**Referencias de benchmark:**
- SAP PartnerEdge Open Ecosystem Guide 2024 — define 4 tracks (Sell / Build / Service / Run) × 4 tiers; Zenix simplifica a 1 track unificado.
- Salesforce Consulting Partner Program — "Registered / Cloud Alliance / Crest" benefits asymmetric, ZaharDev replica el patrón con AUTHORIZED/SILVER/GOLD/PLATINUM.
- HubSpot Solutions Partner Program — "Solutions Partner / Gold / Platinum / Diamond / Elite" — el deal registration discount + tiered margin son patrones tomados de aquí.

### 3.2 Progresión típica de un partner

- **Año 1:** AUTHORIZED — partner cierra 1-2 clientes mientras se certifica. Revenue compartido suficiente para validar el modelo de su lado.
- **Año 2:** SILVER — 5-10 clientes, especialización en mercado local, primera marketing co-op activada (cap $2k/yr).
- **Año 3:** GOLD — 15+ clientes, equipo de implementación propio, white-label parcial activado, advisory voto en roadmap.
- **Año 4+:** PLATINUM — multi-país O multi-vertical, co-marketing trimestral con ZaharDev, exclusividad por territorio (negociable), sub-partner relationships habilitadas (un PLATINUM puede reseller a AUTHORIZEDs locales).

### Programa de certificación

| Certificación | Contenido | Duración | Precio |
|--------------|-----------|----------|--------|
| **Zenix Foundations** | PMS + Housekeeping + Maintenance básico | 16h online | $300 USD |
| **Zenix Advanced PMS** | Calendar avanzado, no-shows, payments, Channex | 24h online + práctico | $500 USD |
| **Zenix POS Specialist** | POS + KDS + recipe management | 16h online + práctico | $400 USD |
| **Zenix Books Specialist** | Contabilidad + país específico (MX, CO, etc.) | 32h + examen país | $800 USD |
| **Zenix Solution Architect** | Diseño multi-property + integraciones complejas | 40h + caso real | $1,200 USD |
| **Zenix Trainer** | Habilita para entrenar a su propio equipo | 16h online + train-the-trainer | $600 USD |

Las certificaciones tienen **vigencia 18 meses** y requieren re-certificación. Esto:
- Garantiza calidad continua
- Genera revenue recurrente para ZaharDev (R14)
- Mantiene partners al día con cambios de producto

---

## 4. Arquitectura técnica

> **Schema canónico:** ver [docs/architecture/NOVA-architecture.md §3](../architecture/NOVA-architecture.md#3-schema-completo-prisma). No duplicamos aquí los models — solo describimos las relaciones y los conceptos de negocio que el schema implementa.

### 4.1 Tablas centrales (resumen, schema en NOVA §3)

| Modelo | Propósito | Cardinalidad | Notas |
|--------|-----------|--------------|-------|
| `Partner` | Firma consultora (o ZaharDev mismo si `isInternal=true`) | 1 | Tier + status + branding + métricas calculadas |
| `PartnerMember` | Consultor individual perteneciente a un Partner | 1:N Partner | Role enum 8 valores + flags `canImpersonate/canActivateWizard/canApproveBilling` |
| `PartnerClientAssignment` | Vínculo firma ↔ Organization cliente | N:M lógica vía tabla, pero **1 ACTIVE por Organization** | Define `billingModel` + `revenueSharePct` override |
| `PartnerMemberAssignment` | Vínculo consultor ↔ asignación cliente | N:M | Define `scope` (FULL/TIER_A_ONLY/TIER_B_ONLY/READ_ONLY) del consultor en ese cliente |
| `PartnerCertification` | Cert obtenida por un member | 1:N PartnerMember | Vigencia 18 meses, re-certificación obligatoria |
| `AuditLog` (universal) | Bitácora append-only de toda acción | global | Captura `actorRealId + onBehalfOfId + reason` para impersonation SAP-style |

Diagrama de relaciones:

```
Partner (firma)
  │
  │ 1:N
  ├──── PartnerMember (consultor)
  │       │
  │       │ 1:N
  │       └──── PartnerMemberAssignment ─── N:1 ──── PartnerClientAssignment
  │                                                          │
  │                                                          │ N:1
  │                                                          ▼
  │ 1:N                                                Organization (cliente)
  └──── PartnerClientAssignment ◄─────────────────────────────┘
         (mismo row apuntando por ambos lados — N:M materializada)
```

### 4.2 ZaharDev como Partner con `isInternal=true`

Decisión arquitectónica fundacional: **PLATFORM_ADMIN no es un tier separado en schema — es un Partner especial.**

- Un único row en `partners` table tiene `isInternal=true` (constraint Postgres UNIQUE índice parcial — ver NOVA §3.7).
- Los staff ZaharDev son `PartnerMember` de ese Partner row con `isPlatform=true`.
- Ese Partner row tiene `tier=PLATINUM` automáticamente, `annualLicenseFee=0`, `defaultRevenueSharePct=0`.
- El bootstrap migration v1.0.0 crea ese row + el primer PLATFORM_ADMIN user (Abraham) — ver NOVA §3.8.
- Audit log y RBAC matrix tratan ZaharDev como cualquier Partner — la única diferencia es el flag, no reglas paralelas.

**Por qué importa:** evita ramas duplicadas en código (`if isPlatformAdmin … else if isPartner …`). Todo el RBAC se ejecuta uniformemente sobre el grafo `Partner → Member → Assignment → Org`. PLATFORM tiene scope global porque su Partner.servingCountries incluye todos los países y porque las constraints adicionales (deal registration, lead routing) no aplican a Partners internos. Patrón equivalente: Microsoft "First Party Tenants" en Azure AD (Microsoft mismo es un tenant más, con flags especiales).

### 4.3 Sub-partner relationships (PLATINUM only)

> Habilitado solo para tier `PLATINUM` desde v1.2 marketplace. Permite que un partner GOLD/PLATINUM regional resellee a partners locales más pequeños bajo white-label.

Esquema lógico:

```
PLATINUM Partner "LatamHotelTech" (MX)
  │
  │ parentPartnerId
  ├──── AUTHORIZED Partner "TulumLocalConsult" (sub-partner)
  ├──── AUTHORIZED Partner "BogotaHospConsult" (sub-partner)
  └──── AUTHORIZED Partner "LimaTechBoutique" (sub-partner)
```

Para v1.2 se agrega al model `Partner`:

```prisma
parentPartnerId   String?   // FK self-referente. NULL = top-level.
subPartners       Partner[] @relation("SubPartners")
parentPartner     Partner?  @relation("SubPartners", fields: [parentPartnerId], references: [id])
```

Reglas no-negociables sub-partner:

- **Solo tier PLATINUM puede tener sub-partners.** Application-level check + DB constraint.
- **Revenue cascade:** sub-partner cobra su margen; PLATINUM cobra el suyo sobre el residual; ZaharDev cobra el resto. Ejemplo: cliente paga $200 → AUTHORIZED 20% = $40 → PLATINUM 10% sobre $160 = $16 → ZaharDev neto $144 (72%).
- **AuditLog conserva ambos partners** (campos `partnerId` + futuro `parentPartnerId`) para reporting cross-jerarquía.
- **Soporte L3 escala al PLATINUM**, luego a ZaharDev. Sub-partner solo cubre L1-L2.
- **Termination cascada controlada:** si PLATINUM termina, sub-partners pasan automáticamente a ZaharDev como AUTHORIZED directos (no quedan huérfanos).

Patrón equivalente: SAP PartnerEdge "Reseller Partner" model + Salesforce "Sub-OEM" agreements.

### 4.4 Roles en `SystemRole` y `PartnerMemberRole`

`SystemRole` extiende con 3 valores nuevos (ver NOVA §3.6):

```prisma
enum SystemRole {
  // PMS operativo (existentes):
  OWNER, MANAGER, SUPERVISOR, RECEPTIONIST, HOUSEKEEPER, TECHNICIAN, AUDITOR
  // Nova v1.0.0 (semilla):
  PLATFORM_ADMIN     // ZaharDev. Solo asignable a PartnerMember de Partner.isInternal=true.
  PARTNER_ADMIN      // Owner consulting firm.
  PARTNER_MEMBER     // Consultor individual.
}
```

`PartnerMemberRole` (interno al partner, 8 valores, ver NOVA §3.2):

| Role | Responsabilidades | Puede impersonate | Puede activate wizard | Puede approve billing | 2FA obligatorio |
|------|-------------------|:-----------------:|:---------------------:|:---------------------:|:---------------:|
| `PARTNER_ADMIN` | Managing partner / founder firma. Invita members, gestiona PartnerClientAssignments, ve billing dashboard, edita branding del partner. | ✅ | ✅ | ✅ | ✅ |
| `LEAD_CONSULTANT` | Senior consultant. Cierra wizard final, impersonate clientes, tier B writes amplios. Owner técnico de cuentas ENTERPRISE. | ✅ | ✅ | ❌ | ✅ |
| `SOLUTION_CONSULTANT` | Configura Channex/PAC/Stripe per cliente. Tier B writes limitados a integraciones + inventory + staff invites. | ❌ | ✅ | ❌ | ✅ |
| `SUPPORT_L1` | Tickets básicos, read-mostly del cliente. Crea reservas de prueba, troubleshoot housekeeping/no-shows. | ❌ | ❌ | ❌ | recomendado |
| `SUPPORT_L2` | Escalado L1. Modifica configs operativos (rates, restrictions, staff schedule). Tier B writes. | ✅ | ❌ | ❌ | ✅ |
| `SUPPORT_L3` | Escalado L2. Toca fiscal/integrations sensibles (re-conectar Channex, reset PAC). Tier A writes. | ✅ | ❌ | ❌ | ✅ |
| `SALES_REP` | Read-only del wizard + marketing assets. Demo a prospectos. No accede clientes prod salvo demo sandbox. | ❌ | ❌ | ❌ | recomendado |
| `TRAINEE` | Sandbox-only. Cero acceso clientes prod. Acompaña a un LEAD/SOLUTION en sesiones de impersonation (audit log marca dual presence). | ❌ | ❌ | ❌ | no |

Defaults se aplican vía trigger en migration; overrides individuales requieren AuditLog entry (NOVA §3.2 notas de diseño).

### 4.5 Surface técnico: `nova.zenix.com` (subdomain pattern SAP/Salesforce)

- **v1.0.0:** Nova vive como rutas `/nova/*` dentro de `apps/web` con guard `NovaAccessGuard` que verifica `SystemRole IN (PLATFORM_ADMIN, PARTNER_ADMIN, PARTNER_MEMBER)`. Dominio definitivo `nova.zenix.com` apuntando al mismo deploy con Vercel host rewrite.
- **v1.0.5:** extracción a app separada `apps/partner` (o `apps/nova`, naming a decidir en sprint dedicado). Stack idéntico (React + Vite + Tailwind + Radix UI) para reusar componentes ya construidos. Deploy independiente en Vercel.
- **v1.2:** marketplace público + portal certificación abierta en `partners.zenix.com` (subdomain distinto, landing público + signup flow), separado del Nova operativo (`nova.zenix.com`).

Razón del subdomain (no path): SAP usa `partneredge.sap.com`, Salesforce `partners.salesforce.com`, HubSpot `partners.hubspot.com`. Patrón industry para separar el dominio cliente del dominio partner — mejora SEO independiente, permite branding distinto, y aísla incidentes (un outage del PMS no necesariamente afecta el portal partner).

---

## 4.6 ConsultantAssignment workflow — cómo un partner se asigna a un cliente

El acto de "este partner ahora atiende a este cliente" se materializa en un row `PartnerClientAssignment` + N rows `PartnerMemberAssignment`. El workflow tiene 4 momentos canónicos:

### Momento 1 — Lead llega

Origen del lead (campo futuro `PartnerLead.source`):

- `WEBSITE` — formulario zenix.com (`partners.zenix.com` v1.2 marketplace).
- `ZAHARDEV_DIRECT` — sales rep ZaharDev recibe un email/llamada y lo entra en Nova.
- `PARTNER_OWN` — partner trae su propio cliente del network local.
- `PARTNER_REFERRAL` — partner A refiere a partner B (bonificación, ver §6).
- `MARKETPLACE` — v1.2 marketplace público con app listings.

### Momento 2 — Lead routing

```
┌────────────────────────────────────────────────────────────────────┐
│ Lead routing rules (orden de aplicación):                          │
│                                                                     │
│ 1. Si lead.partnerOriginId IS NOT NULL                              │
│    → asignación directa al partner originario (PARTNER_OWN/REFERRAL)│
│                                                                     │
│ 2. Si lead.countryCode tiene PLATINUM con exclusividad              │
│    → routing al PLATINUM (notif al partner manager dedicado)        │
│                                                                     │
│ 3. Si lead.countryCode tiene ≥1 GOLD activo + lead.propertyType en  │
│    GOLD.specializations                                             │
│    → round-robin entre GOLDs cualificados (load-balanced)           │
│                                                                     │
│ 4. Si lead.countryCode tiene ≥1 SILVER activo                       │
│    → round-robin entre SILVERs                                      │
│                                                                     │
│ 5. Si lead.countryCode tiene solo AUTHORIZED activos                │
│    → notify a PLATFORM_ADMIN para asignación manual                 │
│                                                                     │
│ 6. Default fallback                                                 │
│    → ZaharDev internal CSM atiende como Partner.isInternal=true     │
└────────────────────────────────────────────────────────────────────┘
```

Reglas de transparencia (Visa/Mastercard deal registration patterns):

- **Deal registration:** un partner puede "reservar" un lead nominal por 30 días antes de cerrar contrato. Otro partner no puede ofertarle en ese período (deal-protection window — patrón SAP PartnerEdge "Deal Registration").
- **Auditabilidad:** toda decisión de routing queda en `AuditLog` con `domain=PARTNER, action=lead.route`, incluyendo qué regla aplicó y por qué.

### Momento 3 — Provisioning (creación del PartnerClientAssignment)

Solo `PLATFORM_ADMIN` (ZaharDev) o `PARTNER_ADMIN` del partner destino pueden crear el row. Datos requeridos:

- `partnerId` (firma asignada)
- `organizationId` (puede no existir todavía — se crea junto en mismo `$transaction` si el cliente es nuevo)
- `status` = `PROSPECTING` (default) o `ONBOARDING` si ya empieza el wizard
- `billingModel` — `VENDOR_BILLS` (ZaharDev factura, paga RevShare) o `PARTNER_BILLS` (Partner factura, paga License Fee)
- `revenueSharePct` — toma default del partner.tier, override si negociación custom
- `assignedById` — PLATFORM_ADMIN o PARTNER_ADMIN que firmó la asignación
- `reason` — texto requerido si status implica transición comercial

Side effects automáticos:

1. AuditLog entry `domain=PARTNER, action=client.assign, retentionPolicy=PERMANENT`.
2. Notif al PARTNER_ADMIN del partner asignado.
3. Si `status=ONBOARDING`, side-channel notif a los `LEAD_CONSULTANT/SOLUTION_CONSULTANT` con `canActivateWizard=true`.

### Momento 4 — Member assignment (consultor ↔ cliente)

Una vez creado el PartnerClientAssignment, el `PARTNER_ADMIN` (o un `LEAD_CONSULTANT` autorizado) asigna consultores específicos al cliente vía rows `PartnerMemberAssignment`:

- Típicamente 1 LEAD_CONSULTANT (`scope=FULL`) + 1-2 SOLUTION_CONSULTANT (`scope=TIER_A_ONLY` o `FULL`) + 1 SUPPORT_L1/L2 (`scope=READ_ONLY` o `TIER_B_ONLY`).
- TRAINEE puede ser asignado con `scope=READ_ONLY` para observación supervised.
- Cada asignación deja AuditLog entry; cada removal también.

### Transition / re-assignment (cambio de partner)

Cliente cambia de Partner A → Partner B (causas típicas: A terminó contrato, A tiene NPS bajo, cliente prefiere expertise local de B):

1. Row de A cambia `status → TRANSITIONING` (no se cierra todavía).
2. Row nuevo de B se crea con `status=ACTIVE, startedAt=now`.
3. Window overlap máx. 90 días (validado por scheduler) durante el cual ambos partners tienen scope para el handover.
4. Al cumplir 90 días o al marcar `transitionCompletedAt`, A se cierra (`status=ENDED, endedAt=now`).
5. AuditLog captura transición con metadata cross-link `previousPartnerId` + `newPartnerId`.

Patrón SAP "Customer License Transfer" + Salesforce "Account Transfer".

---

## 4.7 Partner Onboarding Process — del prospect al primer cliente

Onboarding de un partner nuevo es paralelo (no idéntico) al onboarding de un cliente Zenix. Pasa por 5 fases. Análogo a SAP PartnerEdge "Become a Partner" journey:

### Fase 1 — Application (Semana 0-1)

- Partner aplica vía `partners.zenix.com/apply` (v1.2 marketplace). En v1.0.0, vía email + intro call con ZaharDev BD.
- Inputs: legal name, country, target serving countries, equipo (#consultores + roles), portfolio existente (hoteles consultados/implementados), referencias.
- AuditLog entry `domain=PARTNER, action=partner.apply`.
- Status inicial: `Partner.status=PROSPECT`.

### Fase 2 — Evaluation (Semana 1-2)

ZaharDev evalúa:

- **Reputational check:** referencias verificadas (3 hoteles previos), reviews en HotelTechReport/Capterra del consultant si aplica.
- **Geographic fit:** ¿ZaharDev necesita cobertura en ese país/región? Si ya hay 1 PLATINUM exclusivo, evaluar si el nuevo agrega valor (diferente vertical, idioma, ciudad).
- **Technical baseline:** entrevista 60min con 1-2 consultants del partner. Verifica conocimiento básico de PMS, Channex, fiscal LATAM, hospitality ops.
- **Compliance check:** NDA firmado, anti-corruption clauses (FCPA/Ley Federal Anticorrupción MX), KYC del legal entity.

Decision matrix:

| Outcome | Action |
|---------|--------|
| APPROVED | Avanza a Fase 3 |
| REJECTED | Email rechazo + razón. AuditLog con `outcome=FAILURE, errorMessage=...`. |
| CONDITIONAL | Lista de requisitos previos (ej. "termina cert FOUNDATIONS antes de aplicar de nuevo en 6 meses"). |

### Fase 3 — Contract + Provisioning (Semana 2-4)

1. Contract firmado (digital, vía DocuSign o Mifiel para MX). Incluye:
   - PartnerEdge terms (revenue share, deal registration, sub-partner clauses si aplica)
   - Anti-fork clause (NN2 §5)
   - Termination clauses + non-compete 2 años post-termination
   - Data Processing Agreement (DPA) GDPR/LFPDPPP
2. ZaharDev crea el `Partner` row con `status=PROSPECT → ACTIVE, tier=AUTHORIZED`.
3. ZaharDev crea el primer `PartnerMember` con `role=PARTNER_ADMIN` para el contacto principal.
4. Magic link enviado al PARTNER_ADMIN para activar cuenta + 2FA setup obligatorio.
5. Sandbox environment provisionado (subset de Zenix con datos sintéticos — patrón SAP Trial Landscape).

### Fase 4 — Certification (Semana 4-8)

Partner debe completar **al menos FOUNDATIONS** antes de tomar primer cliente real:

- `Zenix Foundations` (16h online) — PMS + Housekeeping + Maintenance basics
- Examen final con ≥80% required
- Cert obtenida → row en `PartnerCertification` con `obtainedAt + expiresAt (18 meses)`

Pre-FOUNDATIONS completed, el partner solo accede sandbox + sales materials. NO puede ejecutar Step 8 del wizard ni acceder a clientes prod.

### Fase 5 — First Client (Semana 8-10)

1. ZaharDev rutea primer lead (puede ser un cliente WAITLIST específicamente reservado para el partner).
2. Partner ejecuta wizard "Zenix Activate" supervised (un PLATFORM_ADMIN observa los Steps 7-8 vía impersonation read-only con `scope=READ_ONLY`).
3. Cliente activado → `PartnerClientAssignment` con `status=ACTIVE`.
4. ZaharDev marca el partner como "first-client-graduated" → habilita full wizard access sin supervised.

### Lead time típico

**6-10 semanas** entre application y first client closed. Alineado con SAP PartnerEdge typical 8-12 weeks y HubSpot Solutions Partner ~6 weeks.

### Health checks pre-tier-upgrade

Tier upgrade (AUTHORIZED → SILVER, SILVER → GOLD, etc.) es **automático** cuando se cumplen requisitos pero requiere validación humana ZaharDev:

- Cron mensual `PartnerTierEvaluatorScheduler` evalúa cada partner contra los thresholds (clientes, NPS, certs).
- Si cumple → notif al PLATFORM_ADMIN con propuesta de upgrade.
- PLATFORM_ADMIN confirma o defers. Si confirma, `Partner.tier` se actualiza y AuditLog entry capturada.
- Si NPS cae bajo threshold del tier actual → mismo cron propone downgrade (con grace period 90 días para recuperar).

---

## 5. Reglas no-negociables para que el modelo SAP funcione

### NN1 — Aislamiento estricto entre partners
- Partner A NO puede ver datos de partner B aunque ambos vendan a hoteles en Cancún
- ZaharDev (Partner con `isInternal=true`) SÍ ve todo (admin master)
- Cliente final (hotel) ve solo su propiedad
- **Cumplido vía `PartnerClientAssignment` + `PartnerMemberAssignment` + JWT scope estricto** (ver NOVA §3 + RBAC matrix §4). Toda query del lado partner pasa por `PartnerScopeGuard` que verifica `PartnerMemberAssignment.scope` vigente. Sin row de assignment = sin acceso, sin excepción.

### NN2 — Cláusula anti-fork en contrato
Partner no puede:
- Crear producto derivado de Zenix
- Hacer reverse engineering del API
- Sublicenciar a terceros sin aprobación ZaharDev
- Mostrar Zenix como "su producto" (white-label parcial, no full)

### NN3 — Acceso solo a "vista" del partner, no BD
Partner accede a Zenix vía API/UI con scope limitado a sus clientes. **Nunca acceso directo a Postgres ni a backups.**

### NN4 — Calidad medida automática
- NPS del cliente final tracked
- Tiempo de respuesta a tickets
- Tasa de retention de clientes
- Si baja de threshold → notificación → demote tier → revocation eventual

### NN5 — Certificación obligatoria para vender
Partner sin Foundations certified no puede cerrar cliente. Bloqueo automático en lead-distribution.

### NN6 — Sustituibilidad
Si un partner se va, ZaharDev puede tomar sus clientes directamente. Esto requiere:
- Documentación de configuración en Zenix (no en cabeza del partner)
- Acceso ZaharDev master a cualquier instancia
- Hand-over contractual definido

---

## 6. Revenue split detallado

### Caso típico: Silver partner vende Tier Growth ($179/mes) a hotel boutique

| Componente | Monto |
|-----------|-------|
| Cliente paga | $179/mes |
| Partner Silver margen 28% | $50.12/mes |
| ZaharDev neto | $128.88/mes |
| Costo infraestructura ZaharDev | ~$15/mes |
| **Margen contribución ZaharDev** | **$113.88/mes (63%)** |

Si ZaharDev vendiera directo:
| Componente | Monto |
|-----------|-------|
| Cliente paga | $179/mes |
| Costo venta directa ZaharDev (sales rep + marketing) | ~$60/mes promediado |
| Costo infraestructura | ~$15/mes |
| **Margen contribución directa** | **$104/mes (58%)** |

**Conclusión:** vender vía partner Silver es **más rentable** que vender directo, porque el costo de adquisición lo absorbe el partner (que está geo-cerca, habla idioma, tiene relaciones).

### Bonificaciones de Platinum

- 40% margen base
- +5% si supera meta anual
- +$1K USD bono por cada referral a otro partner
- +$5K USD bono co-marketing por evento conjunto

---

## 7. Onboarding de un partner nuevo

```
Semana 1   → Partner aplica vía partners.zenix.com
Semana 2   → ZaharDev evalúa: country, experience, NDA, contract
Semana 3   → Contract firmado, acceso a Foundations certification
Semana 4-6 → Partner toma Foundations + 1 caso de implementación práctica
Semana 7   → Partner certificado Bronze, sandbox activo, lead asignado
Mes 3+     → Partner cierra primer cliente real
Mes 6+     → Si cumple NPS y volumen → upgrade Silver
```

**Lead time típico para activar un partner:** 6-8 semanas. Esto está alineado con el ciclo de adopción enterprise.

---

## 8. Esfuerzo estimado (v1.2)

| Sprint | Alcance | Semanas |
|--------|---------|---------|
| **PARTNER-SEED** (en v1.1) | Schema + JWT scope + migration safe | 1 |
| **PARTNER-PORTAL-CORE** | App `apps/partner` con CRM básico + branding | 5 |
| **PARTNER-CERT** | Programa certificación online (LMS lite) | 4 |
| **PARTNER-LEADS** | Sistema lead distribution + assignment rules | 2 |
| **PARTNER-BILLING** | Commission tracking + automated invoicing | 3 |
| **PARTNER-DOCS** | Documentation portal + sales kit + co-marketing assets | 2 |

**Total v1.2 (Partner Portal completo): ~17 semanas (~4 meses).**

---

## 9. Riesgos y mitigaciones

### Riesgo 1 — Partners venden mal y dañan reputación Zenix
**Mitigación:** certificación obligatoria + NPS monitoring + tier revocation.

### Riesgo 2 — Partner se va con sus clientes
**Mitigación:** contratos de los clientes son directamente con ZaharDev (no con partner). Partner es revendedor + implementador, no dueño de relación.

### Riesgo 3 — Disputas entre partners por mismo lead
**Mitigación:** lead-distribution rules transparentes (primero geo, después tier, después capacidad).

### Riesgo 4 — Partner construye su propio PMS con código aprendido
**Mitigación:** cláusulas IP en contrato + non-compete 2 años post-termination.

---

## 10. Bitácora de revisiones

- **2026-05-23** — Actualización mayor alineada con sprint Zenix Nova. Cambios clave: (1) naming tier `BRONZE → AUTHORIZED` alineado con SAP PartnerEdge nomenclatura. (2) Tabla de tiers expandida con annual fee, lead share, training credits/yr, marketing co-op fund, deal registration discount, white-label scope — researched contra SAP PartnerEdge 2024, Salesforce Consulting Partner Program, HubSpot Solutions Partner Program. (3) Nueva §3.2 tabla de beneficios cruzada (10 categorías). (4) Schema técnico de §4.1 ahora referencia [docs/architecture/NOVA-architecture.md §3](../architecture/NOVA-architecture.md#3-schema-completo-prisma) como source of truth — eliminado duplicado de models. (5) Nueva §4.2 ZaharDev como Partner con `isInternal=true` (decisión fundacional: no es tier separado, es un row especial con constraint Postgres). (6) Nueva §4.3 sub-partner relationships PLATINUM-only con cascade revenue + termination behavior + ejemplo concreto. (7) Nueva §4.4 tabla 8-valores `PartnerMemberRole` con responsabilidades + flags (`canImpersonate / canActivateWizard / canApproveBilling`) + 2FA requirements. (8) Nueva §4.5 surface técnico migration path (v1.0.0 `/nova/*` paths → v1.0.5 `apps/partner` extracción → v1.2 `partners.zenix.com` marketplace público). (9) Nueva §4.6 ConsultantAssignment workflow con 4 momentos canónicos (lead arrives, routing rules, provisioning, member assignment) + transition / re-assignment behavior. (10) Nueva §4.7 Partner Onboarding Process 5 fases (Application → Evaluation → Contract → Certification → First Client) + lead time 6-10 semanas + tier upgrade automation. (11) NN1 actualizada para reflejar enforcement via `PartnerClientAssignment + PartnerMemberAssignment` (no `partnerId` directo en Organization).
- **2026-05-13** — Documento creado. Modelo SAP/SuccessFactors consolidado como pilar arquitectónico desde v1.1 (seed) + v1.2 (activación completa).
