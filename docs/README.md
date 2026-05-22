# Documentación Zenix

> **Audiencia:** developers de ZaharDev, sub-consultoras licenciadas, hoteles cliente, auditores externos.
> **Última actualización:** 2026-05-22 (Plans RATES-METRICS-COMPSET-CORE + DEMAND-INTELLIGENCE creados en `sprints/`. Sprint principal Bloque 1 v1.0.0; sprint futuro v1.1.x+ DLC).

Zenix es el **Property Management System** especializado en hotelería boutique y hostales LATAM que **ZaharDev** distribuye vía red de sub-consultoras licenciadas (modelo SAP PartnerEdge).

Esta carpeta contiene la documentación canónica del producto, arquitectura, estándares, y metodología consultora. Organizada por **audiencia** siguiendo [Diátaxis Framework](https://diataxis.fr) (Procida 2017) y [ISO/IEC/IEEE 26515:2018](https://www.iso.org/standard/74604.html).

---

## 🎯 Empieza acá

| Si eres... | Lee primero |
|-----------|-------------|
| **Founder / dirección** | [vision/01-vision-zahardev-zenix.md](vision/01-vision-zahardev-zenix.md) — modelo de negocio |
| **Developer nuevo** | [../CLAUDE.md](../CLAUDE.md) — guía operativa + decisiones técnicas |
| **Comercial / partner** | [vision/02-product-family.md](vision/02-product-family.md) + [zenix-sales-master.md](zenix-sales-master.md) |
| **Auditor / legal** | [vision/10-data-strategy-abi.md](vision/10-data-strategy-abi.md) + standards/ |
| **Sub-consultor partner** | [vision/09-partner-network.md](vision/09-partner-network.md) + consulting-playbook/ |

---

## Mapa de Navegación

| Carpeta / Archivo | Audiencia primaria | Qué contiene |
|-------------------|-------------------|--------------|
| **[vision/](vision/)** ⭐ | **Founders, partners, dirección, producto** | **Visión maestra v1.0→v2.0 — 5 capas de negocio, 14 streams, módulos del ecosistema, naming, pricing** |
| [zenix-sales-master.md](zenix-sales-master.md) | Comercial + partners | Pitch completo del PMS (alimentado por vision/) |
| [prices-packages.md](prices-packages.md) | Comercial + partners | Packaging y pricing detallado |
| [engineering-playbook.md](engineering-playbook.md) | Developers | Patrones de implementación, sprint methodology |
| [eas-push-setup.md](eas-push-setup.md) | DevOps | Setup de Expo Push notifications |
| [research-dashboard-v3.md](research-dashboard-v3.md) | Producto + design | Research vigente dashboard adaptativo |
| [research-housekeeping-hub.md](research-housekeeping-hub.md) | Producto + mobile dev | Research vigente Hub Recamarista |
| [sprints/](sprints/) | Developers | Planes técnicos de sprint (ej. mx-1-maintenance-plan.md, SIGN-DLC-plan.md, CHANNEX-INBOUND-plan.md, FX-LATAM-plan.md, BOOKING-ENGINE-plan.md) |
| [architecture/](architecture/) | Tech Lead + arquitectos | Arquitectura técnica, RBAC, multi-tenancy, integraciones + **ADRs** (Architecture Decision Records, formato MADR 3.0 — ej. `ADR-0001-pdf-rendering.md`) |
| [standards/](standards/) | Auditores + legal | AHLEI / HFTP / USALI, fiscal, GDPR/LGPD, accesibilidad, seguridad + **JSON Schemas canónicos** (ej. `toc-linter-schema.json` para Zenix Sign) |
| [business-intelligence/](business-intelligence/) | ZaharDev BI | Data strategy operativa (complementa vision/10) |
| [engineering/](engineering/) | Developers | Estándares de código, quality gates |
| [consulting-playbook/](consulting-playbook/) | Sub-consultoras | Onboarding de hoteles, fases de implementación |
| [competitive-intelligence/](competitive-intelligence/) | ZaharDev + ventas | Análisis comparativo PMS, actualización trimestral |
| [archive/](archive/) | Histórico | Research de fase MVP + strategy-old (anterior a vision/) |

---

## Reglas de mantenimiento

1. **`vision/` es la fuente de verdad estratégica.** Cualquier decisión sobre módulos futuros, pricing, partners, naming → ahí.
2. **`CLAUDE.md` (raíz del repo) es la fuente de verdad operativa.** Decisiones técnicas ejecutables, principios rector, decisiones no-negociables §1-§62.
3. **No duplicar contenido.** Si una decisión aparece en CLAUDE.md y en vision/, es bug — elegir una y referenciar la otra.
4. **Archivar, no borrar.** Docs históricos van a `archive/` para preservar contexto sin contaminar navegación.
5. **Numeración consistente.** Files dentro de cada carpeta empiezan con `NN-` indicando orden de lectura. Pattern de HashiCorp Learn + Kubernetes Docs.

---

## Convenciones

### Citaciones

Toda afirmación no trivial cita fuente verificable: estándar industrial (con código), paper académico (autor + año), framework legal, o documentación de proveedor.

### Idioma

- **Español** para contenido de dominio hotelero y narrativa.
- **Inglés** solo para identificadores técnicos (NestJS, Prisma, RBAC) y citas directas en inglés.

### Audiencia explícita

Cada documento empieza con frontmatter o sección indicando audiencia + fecha de última actualización.

---

## Frecuencia de revisión

| Documento | Frecuencia | Responsable |
|-----------|-----------|-------------|
| `vision/` | Trimestral (o cuando hay decisión estratégica mayor) | ZaharDev dirección |
| `architecture/` | Por sprint relevante | Tech Lead |
| `standards/` | Anual + cuando cambia regulación | Compliance / legal |
| `competitive-intelligence/` | Trimestral | Investigación de mercado |
| `consulting-playbook/` | Por sub-consultora onboarded | ZaharDev partner success |
| `zenix-sales-master.md` | Cuando se agrega/modifica funcionalidad (regla CLAUDE.md) | Producto |

Los documentos vencidos llevan badge `> ⚠️ Última revisión: YYYY-MM-DD — pendiente de actualización`.

---

## Cambios recientes

- **2026-05-22** — Dos sprint plans nuevos:
  - [`sprints/RATES-METRICS-COMPSET-CORE-plan.md`](sprints/RATES-METRICS-COMPSET-CORE-plan.md) — sprint principal del Bloque 1 (20-23 días-dev) que combina 3 capas: rate plans + seasons + day-of-week + restrictions + promotions, dashboard métricas con MetricsDailySnapshot, Compset Card MVP con scraping DIY + adapter pattern abierto a Lighthouse partnership, LocalEvent con scope replicable LATAM 4-niveles (country→region→city→lat/lng radius), Events Curator role.
  - [`sprints/DEMAND-INTELLIGENCE-plan.md`](sprints/DEMAND-INTELLIGENCE-plan.md) — sprint futuro (30-40 días-dev) v1.1.x+ DLC tier "Demand Intelligence Premium": flight APIs Amadeus + vacation calendars per source country + DemandScore heurístico weighted-sum + Recommendations engine no-auto-apply. Pricing $80-150/property/mes.
- **2026-05-21** — Sprint **BITACORA-UNIFICATION** cerrado + plan **SIGN-DLC** documentado. Tres artefactos nuevos:
  - [`sprints/SIGN-DLC-plan.md`](sprints/SIGN-DLC-plan.md) — plan técnico módulo DLC v1.1.x (digital check-in + e-signature + NOM-151 + chargeback Evidence Package). ~12 días-dev. Pricing Starter $25 / Pro $40 / NOM-151 add-on $10.
  - [`architecture/ADR-0001-pdf-rendering.md`](architecture/ADR-0001-pdf-rendering.md) — primera ADR formal del repo (formato MADR 3.0). Decisión Puppeteer + pool sobre wkhtmltopdf/pdfkit/SaaS externos. Documenta mitigación de memoria, determinismo del hash via pdf-lib, Browserless.io como escape hatch.
  - [`standards/toc-linter-schema.json`](standards/toc-linter-schema.json) — JSON Schema 2020-12 del LinterReport del ToC linter de Zenix Sign. 10 reglas con citas regulatorias (PROFECO LFPC Art. 90, HFTP Handbook 2023, Visa CRR 13.7/10.4).
  - Módulo 8 — Zenix Sign agregado en [`zenix-sales-master.md`](zenix-sales-master.md) con tabla comparativa vs PMS competidores, ROI documentado, 3 speech quotes.
- **2026-05-13** — Refactor mayor. Visión estratégica completa consolidada en `vision/` (11 archivos). 12 docs obsoletos movidos a `archive/`. Carpeta `strategy/` anterior renombrada a `archive/strategy-old`. CLAUDE.md slim (3970 → 700 líneas).
- **2026-05-04** — Sprint 8I + 9-HK refactor docs creados.
- **2026-05-03** — Estructura Diátaxis-aligned introducida.
