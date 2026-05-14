# Zenix — Visión y Misión

> **Audiencia:** ZaharDev dirección, sub-consultoras licenciadas, partners estratégicos, inversionistas potenciales.
> **Última actualización:** 2026-05-03
> **Estado:** documento fundacional — toda decisión arquitectónica, comercial o de producto debe ser coherente con esta visión.

---

## 1. Misión

> **ZaharDev construye el sistema operativo definitivo para la hotelería independiente y boutique global, distribuyéndolo a través de una red de sub-consultoras licenciadas que aportan implementación, capacitación y soporte local.**

Zenix es el producto. ZaharDev es la consultora dueña del producto. Las sub-consultoras son los socios de implementación que llevan Zenix al mercado en sus respectivos territorios.

## 2. El problema que resuelve

La industria hotelera global está bifurcada en dos tiers tecnológicos:

| Tier | Producto | Realidad |
|------|----------|----------|
| **Enterprise** | Opera Cloud (Oracle), Infor HMS, Sabre SynXis | Funcional pero costoso ($800–$2,500/hab/año), licencias largas, implementación de 3–9 meses, requiere staff dedicado |
| **Mid-market** | Mews, Cloudbeds, Clock PMS+, Stayntouch | Modernos pero con gaps críticos: multi-timezone bugs documentados, sin LATAM fiscal compliance, sin diferenciación per-bed para hostales, soporte centralizado en EU/US |
| **Long tail** | Excel + WhatsApp + Booking.com extranet | El 60% del inventario hotelero LATAM opera así (estimación basada en SECTUR 2023, Mintur Argentina 2023, FNG Colombia 2023) |

La oportunidad de mercado es el **mid-market boutique/hostel LATAM/España/sureste asiático**: propiedades de 10–80 habitaciones que no pueden pagar Opera, no son atendidas operativamente por Mews/Cloudbeds (zona horaria, idioma, fiscal), y operan hoy con herramientas inadecuadas que les cuestan revenue.

**Tamaño del mercado direccionable (TAM, fuentes públicas):**
- México: ~25,000 hoteles + ~5,000 hostales (SECTUR 2023, INEGI 2023)
- Colombia: ~12,000 establecimientos formales (DANE 2023)
- Argentina: ~14,500 establecimientos (Mintur 2023)
- España: ~16,000 hoteles + ~3,500 hostales (INE España 2023)
- Sureste asiático combinado: estimado >80,000 propiedades

A un ARPU conservador de $1,200/año (mid-market), el TAM directo supera $180M USD anuales solo en LATAM + España.

## 3. La estrategia: replicar el modelo SAP PartnerEdge

### 3.1 Por qué el modelo de partners es la única forma de escalar

[Geoffrey Moore, *Crossing the Chasm* (1991)](https://en.wikipedia.org/wiki/Crossing_the_Chasm) demostró que el cruce del *chasm* (early adopters → mainstream) requiere un *whole product*, no solo software. Un *whole product* incluye implementación, capacitación, soporte local, customizaciones e integraciones. Una sola consultora no puede entregar *whole product* a miles de hoteles globalmente.

[SAP PartnerEdge](https://www.sap.com/partner.html) lo resuelve con tres tiers (Open / Silver / Gold) y separación funcional clara: SAP construye software; los partners construyen negocio sobre el software. [IBM Business Partner Program](https://www.ibm.com/partnerworld/) opera el mismo patrón desde 1981.

**Ningún PMS competidor opera así hoy.** Opera, Mews, Cloudbeds y Clock PMS+ hacen ventas y soporte directo. Esto es su limitante de escala y la oportunidad estructural de Zenix.

### 3.2 Las cuatro capas de la red

```
┌─────────────────────────────────────────────────────────────┐
│ Capa 1 — ZaharDev (México)                                   │
│ Construye el producto. Define la roadmap. Certifica partners.│
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ Capa 2 — Sub-consultoras licenciadas (territoriales)          │
│ Ej: ZaharPartner CDMX, ZaharPartner Bogotá, ZaharPartner BCN.│
│ Onboarding hoteles, configuración inicial, capacitación.     │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ Capa 3 — Hotel admin (cliente final)                         │
│ Configura su propia operación: staff, tarifas, políticas.    │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ Capa 4 — Operación diaria (recepción, HK, mantenimiento)     │
│ Ejecutan el día-a-día con la app Zenix.                      │
└─────────────────────────────────────────────────────────────┘
```

Esta estructura es **arquitectónicamente vinculante desde el día uno** del modelo de datos: multi-tenancy, RBAC con scope jerárquico, audit trail por capa. Ver `docs/architecture/02-rbac-blueprint.md`.

### 3.3 Tiers de partner inspirados en SAP PartnerEdge

| Tier | Compromiso anual | Capacidades | Margen partner |
|------|------------------|-------------|----------------|
| **Authorized** | 5+ hoteles onboarded | L1 support, configuración estándar | 25% |
| **Premier** | 20+ hoteles + certificación 2 consultores | L1 + L2, customización guiada | 35% |
| **Strategic** | 50+ hoteles + 5 consultores certificados + co-marketing | L1 + L2 + algunos L3, input en roadmap | 45% |

ZaharDev mantiene siempre L3 (cambios al core), licenciamiento, y certificación.

## 4. Posicionamiento competitivo (resumen — desarrollo en `competitive-intelligence/`)

### 4.1 Discipline of Market Leaders ([Treacy & Wiersema, 1995](https://en.wikipedia.org/wiki/The_Discipline_of_Market_Leaders))

Tres disciplinas mutuamente excluyentes: *operational excellence* (low cost), *product leadership* (mejor producto), *customer intimacy* (relación profunda).

- **Opera Cloud, Sabre SynXis** → operational excellence (escala enterprise)
- **Mews, Cloudbeds** → operational excellence (escala mid-market)
- **Clock PMS+** → customer intimacy (Europa Este)
- **Zenix** → **product leadership** delegando customer intimacy a sub-consultoras locales

Esta combinación es Blue Ocean ([Kim & Mauborgne, 2005](https://en.wikipedia.org/wiki/Blue_Ocean_Strategy)): nadie ofrece simultáneamente product leadership técnico con customer intimacy local.

### 4.2 Diferenciadores estructurales actuales (verificables en código)

Ver `CLAUDE.md` § "Audit Trail como Diferenciador Competitivo" y § "Análisis del Flujo No-Show". Síntesis:

1. **Night audit multi-timezone real con `Intl.DateTimeFormat`** (CLAUDE.md §14). Opera/Cloudbeds tienen este bug documentado para propiedades fuera de UTC server-time.
2. **`GuestContactLog` append-only** (CLAUDE.md §35). Evidencia dispute-grade Visa Core Rules §5.9.2. Ningún PMS del mercado tiene este registro estructurado.
3. **Per-bed task granularity** (CLAUDE.md §2). Mews tiene parcial; el resto opera per-room. Crítico para hostales con dormitorios.
4. **2-fase checkout (planning AM + confirmation PM)** (CLAUDE.md §1). Ningún competidor lo tiene.
5. **Pre-arrival warming WhatsApp** (CLAUDE.md sprint 5/6). Único en el mercado.
6. **USALI 12th Edition fiscal compliance + CFDI 4.0 export** (CLAUDE.md §"Requisitos Fiscales"). Mews/Opera no lo tienen LATAM-nativo.

### 4.3 Diferenciadores estratégicos (modelo de negocio)

7. **Sub-consultora network** — ningún PMS competidor opera así.
8. **LMS adyacente para staff training** (producto separado ZaharDev). Cierra el gap "no es nuestra responsabilidad capacitar al staff hotelero" sin renunciar al revenue.
9. **Data Network Effects** — con ~50 propiedades activas, los benchmarks anonimizados cross-property se vuelven producto B2B independiente (modelo STR/CoStar). Ver `docs/business-intelligence/02-benchmarking.md`.

## 5. La doctrina de calidad

Zenix no es un MVP barato; es un producto consultor de élite. Esto se traduce en estándares no-negociables:

| Pilar | Estándar | Documentación |
|-------|----------|---------------|
| Diseño UX | Nielsen Heuristics 1994 (rev. 2020), Apple HIG 2024, ISO 9241-110:2020, WCAG 2.1 AA | `CLAUDE.md` § "Principio Rector de Diseño" |
| Datos | Inmon CIF 2005 + Kimball 2013 | `docs/business-intelligence/00-data-strategy.md` |
| RBAC | NIST SP 800-162 + ANSI INCITS 359-2012 + Ferraiolo & Kuhn 1992 | `docs/architecture/02-rbac-blueprint.md` |
| Fiscal | USALI 12th ed. (2024) + CFDI 4.0 + DIAN + SUNAT | `docs/standards/01-fiscal-compliance.md` |
| Privacidad | GDPR + LGPD + LFPDPPP | `docs/standards/02-data-privacy.md` |
| Seguridad | SOC 2 Type II roadmap + PCI DSS para payments | `docs/standards/04-security.md` |
| Documentación | Diátaxis + ISO/IEC/IEEE 26515:2018 + Docs-as-Code | este archivo + `docs/README.md` |
| Industria | AHLEI / HFTP / ISAHC / HEDNA | `docs/standards/00-industry-alignment.md` |

Cada uno de estos pilares no es decoración — es lo que un cliente cadena, un auditor fiscal, o una sub-consultora premier exige antes de firmar.

## 6. Métricas estratégicas (North Star Metrics)

| Métrica | Definición | Horizonte 12 meses | Horizonte 36 meses |
|---------|-----------|-------------------|-------------------|
| **Active Properties** | Hoteles con tareas creadas en últimos 30 días | 100 | 1,500 |
| **Authorized Sub-consultancies** | Partners certificados con ≥1 hotel activo | 3 | 25 |
| **NRR** (Net Revenue Retention) | Revenue retenido + expansión / revenue base | 105% | 115% |
| **Implementation Time** | Días desde firma a go-live | < 21 días | < 14 días |
| **Partner-led revenue %** | % revenue originado por sub-consultoras | 30% | 70% |
| **NPS sub-consultora** | NPS del partner program | > 40 | > 60 |

## 7. Riesgos estructurales reconocidos

1. **Concentración de plataforma**: dependencia de Channex.io para distribución OTA. Mitigación: arquitectura `ChannexGateway` desacoplada permite swap a SiteMinder o RateGain en <2 sprints (CLAUDE.md §30).
2. **Riesgo regulatorio LATAM**: cambios en CFDI, DIAN, SUNAT son frecuentes. Mitigación: módulo fiscal en `apps/api/src/fiscal/` planificado para Sprint 11+ con adaptadores por país.
3. **Conflicto sub-consultora vs. ZaharDev directa**: si ZaharDev vende directo a un hotel en territorio de partner, daña la red. Mitigación: política territorial explícita en `docs/strategy/02-partner-program.md` con compensación al partner afectado.
4. **Riesgo de talento**: arquitectura compleja requiere senior engineers. Mitigación: documentación quirúrgica permite onboarding rápido + LMS interno.

## 8. Lo que NO somos (anti-positioning)

Para mantener foco estratégico, lo siguiente es explícitamente fuera de scope hasta que la dirección decida lo contrario:

- ❌ **No somos un PMS para resorts grandes** (>200 habitaciones con múltiples F&B + spa + golf). Ese es el dominio de Opera Cloud y Infor HMS. Podemos atenderlos vía sub-consultoras pero no es el ICP.
- ❌ **No somos un Channel Manager**. Zenix consume Channex.io; no compite con Channex/SiteMinder.
- ❌ **No somos un Booking Engine standalone**. Integramos con motores de terceros (futuro Sprint 12+); no construimos el motor.
- ❌ **No somos un sistema de capacitación**. El LMS es producto separado de ZaharDev — diferentes flows, diferentes audiencias, diferente go-to-market.
- ❌ **No somos un PMS gratis**. Nuestro tier de entrada ($X/hab/mes) está intencionalmente arriba del low-cost de Cloudbeds porque entregamos valor superior medible.

## 9. Compromiso de revisión

Este documento se revisa **trimestralmente** por la dirección de ZaharDev. Cualquier desviación detectada en producto, marketing, ventas o partner program se reconcilia aquí o se actualiza este documento — nunca se ignora la inconsistencia.

---

## Referencias

- Geoffrey Moore. *Crossing the Chasm* (1991), HarperBusiness. ISBN 978-0066620022.
- Geoffrey Moore. *Inside the Tornado* (1995), HarperBusiness.
- Michael Treacy & Fred Wiersema. *The Discipline of Market Leaders* (1995), Addison-Wesley.
- W. Chan Kim & Renée Mauborgne. *Blue Ocean Strategy* (2005), Harvard Business Review Press.
- Michael Porter. *Competitive Strategy* (1980), Free Press.
- SAP PartnerEdge program documentation, https://www.sap.com/partner.html
- IBM PartnerWorld program documentation, https://www.ibm.com/partnerworld/
- AHLA + HFTP. *Uniform System of Accounts for the Lodging Industry*, 12th Edition (2024).
- Daniele Procida. *Diátaxis Framework*. https://diataxis.fr (2017).
- ISO/IEC/IEEE 26515:2018 *Systems and software engineering — Developing user documentation in an agile environment*.
- SECTUR México (2023), INEGI México (2023), DANE Colombia (2023), Mintur Argentina (2023), INE España (2023) — datos de inventario hotelero por país.
