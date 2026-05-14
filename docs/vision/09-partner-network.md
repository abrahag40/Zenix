# 09 · Partner Network — Modelo SAP/SuccessFactors

> Versión activación: **v1.2 (Q1 2027)**
> Streams: **R13 (Partner License + Revenue Share), R14 (Training + Certification)**
> App nueva: `apps/partner`

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

## 3. Sistema de tiers de partner

| Tier | Requisitos | Margen | Soporte | Posicionamiento |
|------|-----------|--------|---------|-----------------|
| **Bronze** | Certificación básica + 1 cliente | 20% | Email (48h) | Independiente |
| **Silver** | 5+ clientes + NPS >50 + cert avanzada | 28% | Email + chat (12h) | Especialista regional |
| **Gold** | 15+ clientes + NPS >70 + 2 certs | 35% | Email + chat + manager dedicado (4h) | Líder regional |
| **Platinum** | 30+ clientes + co-marketing comprometido | 40% + bonos | Manager + co-selling (1h) | Strategic Partner |

### Progresión típica de un partner

- **Año 1:** Bronze — partner cierra 1-2 clientes mientras se certifica
- **Año 2:** Silver — 5-10 clientes, especialización en mercado local
- **Año 3:** Gold — 15+ clientes, equipo de implementación propio
- **Año 4+:** Platinum — multi-país, co-marketing con ZaharDev, exclusividad regional

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

### Schema delta (sembrar en v1.1, expandir en v1.2)

```prisma
model Partner {
  id              String      @id @default(uuid())
  name            String
  legalName       String
  tier            PartnerTier @default(BRONZE)
  status          PartnerStatus @default(ACTIVE)
  contactEmail    String
  countryCode     String      // 'MX', 'CO', etc.
  brandingConfig  Json?       // logo, colors para white-label
  contractStartAt DateTime
  contractEndAt   DateTime?
  organizations   Organization[]
  certifications  PartnerCertification[]
  users           User[]
  // ...
}

model Organization {
  // existente:
  id String @id @default(uuid())
  name String
  // ...
  // nuevo:
  partnerId String?  // null = cliente directo de ZaharDev
  partner   Partner? @relation(fields: [partnerId], references: [id])
}

model PartnerCertification {
  id              String   @id @default(uuid())
  partnerId       String
  userId          String   // miembro del partner
  type            String   // "FOUNDATIONS", "POS_SPECIALIST", etc.
  obtainedAt      DateTime
  expiresAt       DateTime
  score           Int?
  // ...
}

model PartnerLead {
  id              String      @id @default(uuid())
  partnerId       String?     // null si todavía no asignado
  prospectName    String
  prospectEmail   String
  prospectCountry String
  prospectCity    String
  propertyType    String?
  status          LeadStatus  @default(NEW)
  source          String      // 'ZAHARDEV', 'PARTNER_OWN', 'WEBSITE'
  assignedAt      DateTime?
  closedAt        DateTime?
  // ...
}

model PartnerCommission {
  id              String   @id @default(uuid())
  partnerId       String
  organizationId  String
  periodStart     DateTime
  periodEnd       DateTime
  revenueAmount   Decimal  @db.Decimal(12,2)
  commissionRate  Decimal  @db.Decimal(5,4)  // 0.25, 0.30, etc.
  commissionAmount Decimal @db.Decimal(12,2)
  paidAt          DateTime?
  // ...
}

enum PartnerTier { BRONZE, SILVER, GOLD, PLATINUM }
enum PartnerStatus { PROSPECT, ACTIVE, SUSPENDED, TERMINATED }
enum LeadStatus { NEW, ASSIGNED, IN_PROGRESS, WON, LOST }
```

### Nuevos roles en `SystemRole`

```prisma
enum SystemRole {
  // existentes:
  OWNER, MANAGER, AUDITOR
  // nuevos en v1.1 (semilla):
  PARTNER_ADMIN      // gestiona todos los hoteles del partner
  PARTNER_OPERATOR   // implementa hoteles específicos del partner
  PARTNER_BILLING    // ve facturación pero no gestiona clientes
  ZAHARDEV_STAFF     // empleado ZaharDev con acceso master
}
```

### App nueva: `apps/partner`

- Stack: React + Vite + Tailwind (mismo que `apps/web` para reusar componentes)
- Dominio propio: `partners.zenix.com` o subdomain del partner (white-label)
- Auth flow separado del staff de hoteles
- Componentes compartidos en `packages/ui` (cuando se cree)

---

## 5. Reglas no-negociables para que el modelo SAP funcione

### NN1 — Aislamiento estricto entre partners
- Partner A NO puede ver datos de partner B aunque ambos vendan a hoteles en Cancún
- ZaharDev SÍ ve todo (admin master)
- Cliente final (hotel) ve solo su propiedad
- **Cumplido vía `partnerId` en Organization + JWT scope estricto**

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

- **2026-05-13** — Documento creado. Modelo SAP/SuccessFactors consolidado como pilar arquitectónico desde v1.1 (seed) + v1.2 (activación completa).
