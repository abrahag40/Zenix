# Modelo de Negocio Zenix — Partner Ecosystem Operacional

> **Audiencia:** ZaharDev dirección, sub-consultoras licenciadas (actuales y prospectos), inversionistas, equipo de ventas.
> **Pre-requisito:** [`docs/strategy/00-vision.md`](00-vision.md).
> **Última revisión:** 2026-05-03

Este documento operacionaliza el modelo SAP PartnerEdge / IBM Business Partner aplicado al mercado hotelero boutique/hostel. Es el blueprint que ZaharDev usa para:

1. Reclutar y onboardear sub-consultoras
2. Definir tiers, márgenes y obligaciones recíprocas
3. Articular la propuesta de valor diferencial vs PMS competidores
4. Determinar qué tareas son responsabilidad de cada nivel del ecosistema

---

## 1. Mapa de actores

```
┌────────────────────────────────────────────────────────────────────────┐
│  ZaharDev (Plataforma — Nivel 1)                                       │
│  • Construye Zenix (PMS) y LMS Zenix Academy                           │
│  • Operates infrastructure (cloud, BD, APIs)                           │
│  • Curates Partner Program (recruiting, certification, evangelism)     │
│  • Owns roadmap del producto                                           │
│  • Maintains LMS de capacitación (curricula + exámenes de certif.)    │
└────────────────────────────────────────────────────────────────────────┘
        │ contrato de licencia + revenue share
        ▼
┌────────────────────────────────────────────────────────────────────────┐
│  Sub-consultoras Licenciadas (Implementation Partners — Nivel 2)       │
│  Tres tiers: Open / Silver / Gold (analogía SAP PartnerEdge)           │
│  • Identifican prospectos en su territorio                             │
│  • Implementan Zenix en hoteles cliente                                │
│  • Capacitan staff del hotel (con Zenix Academy LMS)                   │
│  • Soporte operativo de primer nivel                                   │
│  • Hacen revenue share con ZaharDev (ver §3)                           │
└────────────────────────────────────────────────────────────────────────┘
        │ contrato de servicio + suscripción Zenix
        ▼
┌────────────────────────────────────────────────────────────────────────┐
│  Hoteles Cliente (Nivel 3)                                             │
│  • Pagan suscripción mensual basada en habitaciones activas            │
│  • Reciben implementación, capacitación y soporte de la sub-c          │
│  • Dueños de sus datos operativos y huéspedes                          │
└────────────────────────────────────────────────────────────────────────┘
        │ servicio operacional
        ▼
┌────────────────────────────────────────────────────────────────────────┐
│  Staff Operacional (Nivel 4)                                           │
│  • Recepcionistas, housekeepers, técnicos                              │
│  • Usuarios finales del PMS y mobile app                               │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Partner Tiers — Open / Silver / Gold

Modelo idéntico en estructura a [SAP PartnerEdge](https://www.sap.com/partner.html), adaptado al volumen y complejidad del mid-market hotelero.

### 2.1 Tier comparativo

| Atributo | Open Partner | Silver Partner | Gold Partner |
|----------|--------------|----------------|--------------|
| **Compromiso anual** | Sin mínimo | 15 implementaciones | 50 implementaciones |
| **Hoteles activos esperados** | 1–10 | 10–40 | 40+ |
| **Margen sobre suscripción** | 25% | 35% | 45% |
| **Acceso a leads ZaharDev** | ❌ | ✅ región asignada | ✅ exclusividad regional |
| **Co-branding en UI** | ❌ | ✅ logo en login | ✅ logo + custom domain |
| **Acceso al partner portal** | Básico | Avanzado | Avanzado + métricas BI |
| **Certificación staff requerida** | ≥1 implementador | ≥3 implementadores + 1 supervisor | ≥5 implementadores + 2 supervisores + 1 architect |
| **Soporte ZaharDev** | Email <48h | Email <24h + chat | Email <8h + chat + manager dedicado |
| **Voz en roadmap** | ❌ | Encuestas trimestrales | Advisory board |
| **MDF (Marketing Development Funds)** | ❌ | $5K USD/año | $25K USD/año |
| **Licencia mínima de implementación** | $500 USD por hotel | $300 USD por hotel | $0 (incluido) |

### 2.2 Trayectoria — del Open al Gold

Una sub-consultora promedio toma **18 meses** para llegar de Open a Silver y **36 meses** para Silver → Gold. Esto coincide con los tiempos típicos del SAP PartnerEdge program (referencia: SAP, *PartnerEdge Program Guide*, 2024).

El upgrade es automático cuando se cumplen los thresholds del tier. El downgrade ocurre solo si la sub-c no cumple compromiso anual durante 2 años consecutivos.

---

## 3. Estructura de revenue

### 3.1 Modelo de suscripción base

Hoteles cliente pagan suscripción **mensual** basada en **habitaciones activas** (no usuarios, no transacciones — patrón Mews/Cloudbeds, no Opera).

| Plan | Habitaciones | Precio por hab/mes | Features |
|------|--------------|---------------------|----------|
| **Starter** | 1–20 | $12 USD | PMS + Housekeeping + 1 user role |
| **Professional** | 21–50 | $9 USD | + Channel Manager (Channex) + Multi-property + RBAC completo |
| **Enterprise** | 51+ | $7 USD | + BI dashboards + API access + SLA dedicado |

**ARPU (Average Revenue Per User) esperado:**
- Hotel boutique 25 hab × $9 = $225/mes = $2,700/año
- Hostal 12 hab × $12 = $144/mes = $1,728/año
- Cadena boutique 80 hab × $7 = $560/mes = $6,720/año

### 3.2 Distribución del revenue

Para una suscripción Professional de 30 hab × $9 = $270/mes = $3,240/año:

| Tier | Margen sub-c | ZaharDev | Sub-c gana | ZaharDev gana |
|------|--------------|----------|------------|---------------|
| Open | 25% | 75% | $810/año | $2,430/año |
| Silver | 35% | 65% | $1,134/año | $2,106/año |
| Gold | 45% | 55% | $1,458/año | $1,782/año |

**Punto importante:** el margen de sub-c no se reduce con upgrades de tier — al contrario, **aumenta**. La razón: los Gold partners aportan volumen, brand evangelism y referrals que reducen el CAC (Customer Acquisition Cost) de ZaharDev. Pagamos más a quien escala más, replicando el modelo SAP.

### 3.3 Revenue de implementación (one-time, 100% para sub-c)

La sub-consultora cobra al hotel cliente por la implementación inicial. ZaharDev no participa de este revenue.

| Tipo de implementación | Tarifa típica sub-c |
|------------------------|---------------------|
| Hostal pequeño (≤15 hab, ≤2 días) | $800–$1,500 USD |
| Hotel boutique (16–40 hab, 3–5 días) | $2,000–$5,000 USD |
| Cadena multi-property (3+ props) | $5,000–$15,000 USD + $1K/prop adicional |
| Migración desde otro PMS | +$1,500–$3,000 USD según complejidad |

Esta estructura le da a la sub-c flujo de caja inmediato (implementación) y revenue recurrente (margen sobre suscripción). Es el modelo que sostiene económicamente a las consultoras SAP regionales — no viven solo del MRR; viven de la combinación.

---

## 4. Responsabilidades por nivel

> Esta tabla resuelve la pregunta operativa más frecuente: *"¿quién hace qué cuando algo sale mal?"*. La separación es deliberada y se documenta en cada contrato de licencia.

| Actividad | ZaharDev | Sub-consultora | Hotel |
|-----------|----------|----------------|-------|
| Desarrollo del producto | ✅ | ❌ (puede contribuir feature requests) | ❌ |
| Hosting & infraestructura | ✅ | ❌ | ❌ |
| SLA de uptime (≥99.5%) | ✅ | ❌ | ❌ |
| Roadmap del producto | ✅ (con input de Gold partners) | Voz consultiva | Feature requests |
| Recruiting de sub-consultoras | ✅ | N/A | N/A |
| Capacitación de sub-c (vía LMS) | ✅ | Consume + obtiene certificaciones | N/A |
| Identificar prospects | Genera leads (Silver+) | ✅ principal | N/A |
| Demos comerciales | Materiales | ✅ ejecuta | N/A |
| Negociación contractual | Templates | ✅ ejecuta | Firma |
| **Implementación del PMS** | Soporte L3 | ✅ ejecuta | Provee acceso + datos |
| Configuración inicial (rooms, rates, staff) | ❌ | ✅ | Aprueba |
| **Capacitación de staff del hotel** | LMS Zenix Academy (curricula) | ✅ entrega + facilita | Asigna staff a capacitar |
| Soporte operacional L1 (cómo hacer X) | FAQ + docs | ✅ | Reporta tickets |
| Soporte L2 (bug investigation) | Backup | ✅ primer responder | Reporta tickets |
| Soporte L3 (bug fixes, hotfixes) | ✅ | Escala a ZaharDev | N/A |
| Customización (branding, custom reports) | Plantillas | ✅ ejecuta | Paga si excede scope |
| Integraciones custom (PMS legacy migration) | API + docs | ✅ proyecto | Paga proyecto |
| Operación día-a-día del PMS | ❌ | ❌ | ✅ |
| Datos operativos (reservas, huéspedes) | ❌ (data processor) | ❌ | ✅ data controller |
| Compliance fiscal local (CFDI/SAT/DIAN) | Genera reportes | Audita | ✅ presenta a autoridad |
| Privacy compliance (GDPR/LFPDPPP/LGPD) | ✅ data processor | Audita | ✅ data controller |

### 4.1 La separación crítica — *staff training is the hotel's responsibility*

Una decisión deliberada que diferencia a Zenix de Opera/Mews/Cloudbeds: **la capacitación profunda del staff es responsabilidad del hotel**, no de la sub-c ni de ZaharDev. La sub-c provee:

1. Setup inicial completo (configuración del sistema)
2. **3 sesiones de capacitación inicial** con el staff core (recepción, HK, supervisor)
3. Acceso al **LMS Zenix Academy** para auto-capacitación continua

A partir de ese punto, el hotel onboardea a su nuevo staff usando el LMS. Esto evita el patrón Opera/Mews donde cada rotación de staff genera un ticket de capacitación facturable. El hotel mantiene autonomía operativa; la sub-c se enfoca en crecimiento y nuevos clientes.

**Referencia:** este patrón es el que aplica Salesforce con Trailhead — el partner implementa, el cliente capacita su propia gente con Trailhead. No hay tickets de "cómo crear un report" abiertos a Salesforce o partners (Salesforce, *Trailhead for Customer Onboarding*, 2023).

---

## 5. Diferenciación vs el PMS competitor model

### 5.1 Por qué Opera, Mews, Cloudbeds NO van a copiar este modelo

Tres razones estructurales lo hacen difícil:

1. **Inercia organizacional** — Opera y Cloudbeds tienen equipos de ventas direct-sales con miles de empleados. Migrar a partner-led requeriría restructuring que comprometería revenue Q-on-Q. Las cotizadas (Cloudbeds está VC-backed con presión de exit) no pueden absorber el hit.

2. **Costo de partner enablement** — SAP/IBM invirtieron décadas y centenas de millones en construir sus partner programs. Un competidor PMS tendría que replicar LMS de capacitación, partner portal, MDF, advisory board, certification rigorosa. Es una inversión de 3+ años sin revenue incremental claro.

3. **Cultural mismatch** — Mews y Cloudbeds operan con cultura SaaS PLG (Product-Led Growth) — onboarding self-service, soporte centralizado en chat. El partner model requiere cultura B2B2C orientada a relaciones — más cercana a SAP que a Slack. Es un cambio de ADN.

ZaharDev entra al mercado con esta ventaja estructural desde el día 1.

### 5.2 Cómo se traduce en propuesta de valor para el hotel

| Pregunta del prospect | Respuesta sub-c | Respuesta Opera/Mews |
|-----------------------|-----------------|------------------------|
| "¿Quién va a estar conmigo el día del lanzamiento?" | Nosotros, en sitio o remoto, en tu zona horaria | Soporte centralizado en EU/US, según cola |
| "¿Quién entiende mis temas fiscales locales (CFDI/SAT)?" | Nosotros — somos consultora local certificada | Limitado — requiere integraciones third-party |
| "¿Qué pasa si el sistema falla a las 3 AM?" | Nuestro on-call + ZaharDev L3 | Soporte por ticket, SLA en horas hábiles UTC |
| "¿Puedo hablar con alguien que entienda hotelería boutique?" | Sí — solo trabajamos con boutique/hostels | Sales team genérico |

Cada una de estas respuestas reduce la fricción de venta y el churn post-onboarding. Es la razón estructural por la que sub-consultoras locales ganan deals que Opera/Mews no pueden ganar — no por mejor producto, sino por mejor *whole product* en el sentido de Geoffrey Moore.

---

## 6. Métricas de éxito del Partner Program

### 6.1 KPIs para ZaharDev (operador del programa)

| Métrica | Objetivo año 1 | Objetivo año 3 | Fuente |
|---------|----------------|----------------|--------|
| Partners activos (cualquier tier) | 5 | 30 | Partner portal |
| Hoteles activos en producción | 50 | 750 | BD `Organization.isActive` |
| MRR | $5K USD | $300K USD | Suma de suscripciones activas |
| Churn anual hotel | <15% | <8% | Cohort analysis |
| Time-to-value (firma → live) | <30 días | <14 días | Historial de implementaciones |
| NPS partners | ≥40 | ≥60 | Encuesta semestral |
| NPS hoteles | ≥30 | ≥50 | Encuesta semestral |

### 6.2 KPIs para sub-consultoras (medibles por ZaharDev)

| Métrica | Pass mínimo | Top performer |
|---------|-------------|---------------|
| Hoteles implementados / año | Open: 1, Silver: 15, Gold: 50 | 2x del threshold |
| Implementación on-time | ≥80% | ≥95% |
| Hotel churn rate (post-implementación) | ≤20% | ≤10% |
| CSAT promedio implementación | ≥4.0/5 | ≥4.6/5 |
| Tickets L2 escalados a L3 | ≤30% | ≤10% |

Las sub-consultoras que sostienen "top performer" durante 4 trimestres consecutivos son candidatas naturales a upgrade de tier.

---

## 7. Onboarding de nuevas sub-consultoras

Proceso documentado en [`docs/consulting-playbook/00-partner-onboarding.md`](../consulting-playbook/00-partner-onboarding.md) (a crear). Resumen:

1. **Discovery call** — fit operativo y comercial
2. **Acuerdo de licencia Open Partner** — plantilla legal estándar
3. **Certificación inicial** — al menos 1 persona del partner pasa el examen Zenix Implementer (LMS)
4. **Implementación piloto** — primer hotel con shadowing de ZaharDev
5. **Activación** — partner queda habilitado para implementaciones independientes
6. **Crecimiento** — meeting trimestral de revisión, métricas, plan de upgrade

Tiempo total: **45–90 días** desde discovery hasta implementación independiente.

---

## 8. Referencias

- SAP. (2024). *SAP PartnerEdge Program Guide*. SAP SE.
- IBM. (2024). *IBM Partner Plus — Program Guide*. IBM Corporation.
- Salesforce. (2023). *Partner Community Implementation Guide*. Salesforce, Inc.
- Salesforce. (2023). *Trailhead for Customer Onboarding*. Salesforce, Inc.
- Moore, G. A. (1991). *Crossing the Chasm: Marketing and Selling Disruptive Products to Mainstream Customers*. HarperBusiness.
- Porter, M. E. (1980). *Competitive Strategy: Techniques for Analyzing Industries and Competitors*. Free Press.

---

## 9. Mantenimiento

| Sección | Frecuencia de revisión | Responsable |
|---------|------------------------|-------------|
| Tiers (§2) | Anual | ZaharDev dirección |
| Pricing (§3) | Trimestral | ZaharDev partner success |
| Responsabilidades (§4) | Cuando cambie scope de partner program | ZaharDev partner success |
| Métricas (§6) | Trimestral | ZaharDev BI |

Cualquier cambio sustancial a §3 (pricing) requiere comunicación a partners con 90 días de anticipación, conforme a estándares de SAP/Salesforce partner programs.
