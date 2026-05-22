# Zenix Learning (LMS) — Carpeta master

> Documentación estratégica + técnica del módulo Zenix Learning (LMS embebido al PMS).
> **Versión target:** v1.0.0 (rama `claude/zenix-learning-lms-v1-2qz8l`) o v1.1.0 fallback.
> **Modelo comercial:** Add-On / DLC pago. Curso de regalo como hook de cierre comercial.
> **Última actualización:** 2026-05-22 — añadidos docs 21 (arquitectura engine/content) + 22 (modelo comercial Cialdini+SDT + Pool completo Tier 1-5) + arranque producción Día 1 Curso 1 Distintivo H+NOM-035 (Módulo 1 completo).

---

## Por qué existe Zenix Learning

Tres razones objetivas (no marketing):

1. **Compliance legal real LATAM.** La LFT mexicana (Art. 153-A a 153-X) obliga al patrón a capacitar y conservar evidencia auditable por STPS. NOM-035-STPS-2018 lo extiende a riesgos psicosociales. Equivalentes en Colombia (SENA), Costa Rica (INA), Perú (SUNAFIL), etc. Sin LMS el hotel resuelve esto a punta de Excel + carpetas físicas → vulnerable en auditoría.
2. **Combo PMS+LMS es diferenciador real.** Cloudbeds, Mews, Opera, RoomRaccoon, Little Hotelier NO traen LMS. Los hoteles compran TalentLMS / iSpring / Moodle por fuera y duplican rosters de staff. Zenix entrega un solo punto de verdad: `Staff` del PMS = `Learner` del LMS.
3. **Hook comercial blando.** "Te regalo el curso Distintivo H si firmas" cierra prospectos indecisos (Cialdini 1984 — reciprocidad). El costo marginal de regalar un curso ya producido es ~$0; el costo de perder el prospecto es ~$2-5k/año MRR.

---

## Índice

| Doc | Contenido | Audiencia |
|-----|-----------|-----------|
| [01-vision-zenix-learning.md](01-vision-zenix-learning.md) | Visión estratégica, posicionamiento, tiers, modelo de negocio | Founder, comercial, partners |
| [02-legal-compliance-research.md](02-legal-compliance-research.md) | LFT México + NOM-035 + STPS DC-3/DC-4 + equivalentes LATAM (Colombia/CR/PE/etc.) | Producto, legal, comercial |
| [03-competitor-analysis.md](03-competitor-analysis.md) | SuccessFactors deep dive + TalentLMS/iSpring/Docebo/Moodle + LMS hotelería (AHLEI/eHotelier) — lo que aman, odian, piden | Producto, ingeniería, UX |
| [04-architecture-plan.md](04-architecture-plan.md) | Schema Prisma + endpoints API + módulos NestJS + multi-tenant (4-level §63-§72) + integraciones | Ingeniería |
| [05-ui-ux-patterns.md](05-ui-ux-patterns.md) | Learner / Manager / Admin flows + wireframes texto + accesibilidad WCAG 2.1 AA | Producto, UX |
| [06-courses-catalog-mvp.md](06-courses-catalog-mvp.md) | Los 3 cursos MVP: "Distintivo H + NOM-035", "Front Office Excellence (AHLEI)", "Housekeeping Standards" — syllabi + evaluación + bibliografía | Producto, contenido, comercial |
| [07-psychopedagogy-foundation.md](07-psychopedagogy-foundation.md) | Andragogía Knowles + Bloom revisada + Microlearning Kapp + Spaced Repetition + Cognitive Load Sweller + SDT Deci&Ryan | Producto, contenido |
| [08-gamification-roadmap.md](08-gamification-roadmap.md) | Fase 1 ligera → Fase 2 media → Fase 3 profunda. Ética anti-crowding-out. 8 drives Octalysis. Métricas para gatillar fases. | Producto, ingeniería |
| [09-mobile-integration.md](09-mobile-integration.md) | Cómo se integra con `apps/mobile` (Expo) — offline-first, sync queue, push reminders, audio-first para HK | Ingeniería mobile |
| [10-implementation-plan.md](10-implementation-plan.md) | Sprint LEARNING-CORE: fases, días, dependencias, riesgos, decisión de rebase a v1.0.0 vs v1.1.0 | Ingeniería, producto |
| [11-pricing-bundling.md](11-pricing-bundling.md) | Pricing DLC, bundling con Zenix Activate, modelo de "curso regalo", marketplace cursos externos (Fase 2) | Comercial, producto |
| [12-standards-alignment.md](12-standards-alignment.md) | Honestidad arquitectónica: mapping Caliper/SCORM/xAPI/LTI/OBv3 + gaps por fase + roadmap certificación | Ingeniería, producto |
| [13-competitive-positioning-hostelsphere.md](13-competitive-positioning-hostelsphere.md) | Investigación HostelSphere + competidores hosteleros + recomendación "categoría nueva Operational Learning" | Comercial, producto |
| [14-dlc-architecture.md](14-dlc-architecture.md) | Plugin/DLC lifecycle: ACTIVE→SUSPENDED→ARCHIVED + preservación data + reactivación. TenantDLC genérico para Learning + futuros DLCs | Ingeniería, producto |
| [15-hostelsphere-lessons-social-learning.md](15-hostelsphere-lessons-social-learning.md) | Qué TOMAR del modelo HostelSphere + SAP JAM lessons learned + Social Learning Hooks ancladas a curso | Producto, ingeniería |
| [16-standards-utilization-commitment.md](16-standards-utilization-commitment.md) | Compromisos ejecutables de alineamiento a estándares LMS sin certificación formal (Fase 1) — checklist por fase | Ingeniería, producto |
| [17-activate-dlc-partner-alignment.md](17-activate-dlc-partner-alignment.md) | Activate wizard ↔ DLC ↔ Partner network alignment + estado honesto + Etapa 7.5 propuesta + Partner roadmap v1.2+ | Producto, comercial, ingeniería |
| [18-pricing-billing-detail.md](18-pricing-billing-detail.md) | Cómo se cobra exactamente — per-active-staff + casos concretos + comparativa competencia + edge cases pendientes Fase 1.4 | Comercial, producto |
| [19-pedagogical-foundations-official-validation.md](19-pedagogical-foundations-official-validation.md) | Validación quirúrgica de fundamentos pedagógicos oficialmente reconocidos (APA/ATD/ISO/UNESCO/LATAM). Tabla Tier 1-4 + métodos PROHIBIDOS + frase comercial maestra | Producto, comercial, ingeniería |
| [20-content-production-plan.md](20-content-production-plan.md) | Plan ejecutable Fase 1.3 redacción 3 cursos — 31 fuentes públicas + plantilla editorial canónica + cronograma 12 días + quality bar | Producto, contenido |
| [21-lms-architecture-content-separation.md](21-lms-architecture-content-separation.md) | **Arquitectura no negociable Engine vs Content** — el LMS es motor estable, los cursos son contenido versionado. Patrón Moodle/Canvas/Articulate. Anti-patrones prohibidos. Roadmap evolutivo. | Ingeniería, producto |
| [22-sales-negotiation-model.md](22-sales-negotiation-model.md) | **Modelo comercial Cialdini + SDT + variantes del doble hook + Pool completo Tier 1-5** — referencias verificables, métricas Year 1, anti-patrones comerciales prohibidos. Master del equipo comercial. | Comercial, founder |
| [courses/01-distintivo-h-nom-035/](courses/01-distintivo-h-nom-035/) | **Curso 1 en producción Día 1 (2026-05-22)** — Outline + Módulo 1 redactado completo (3 lessons) + question bank inicial. | Contenido |

---

## Reglas de uso

1. **Rama de trabajo:** `claude/zenix-learning-lms-v1-2qz8l`. Toda PR del módulo Learning sale de aquí. Mergea a `main` cuando el módulo esté listo (target v1.0.0, fallback v1.1.0).

2. **CLAUDE.md NO duplica este detalle.** Solo registra las decisiones no-negociables (§128+ reservado para Learning) y agrega el sprint al Pending.

3. **`docs/vision/02-product-family.md` y `docs/zenix-sales-master.md` deben actualizarse** cuando el módulo se mueva de "research" a "in dev" — el equipo comercial necesita el SKU.

4. **Decisiones legales por país viven aquí en `02-legal-compliance-research.md`**, no en cada módulo afectado (a diferencia de Books/People que sí distribuyen). Razón: la justificación legal es transversal al producto Learning, no por sub-módulo.

5. **No introducir formatos de curso fuera de los listados en `04-architecture-plan.md`.** Cualquier formato nuevo (SCORM, xAPI, AICC, cmi5) requiere update simultáneo del schema + tests + este doc.

---

## Estado actual (2026-05-21)

| Sección | Status |
|---------|--------|
| Vision + posicionamiento | 🟢 Doc 01 escrito |
| Research legal LFT/STPS | 🟡 Agent corriendo |
| Research competencia LMS | 🟡 Agent corriendo |
| Research contenido 3 cursos | 🟡 Agent corriendo |
| Research psicopedagogía | 🟡 Agent corriendo |
| Architecture plan | ⏳ Pendiente (depende de research) |
| UI/UX patterns | ⏳ Pendiente |
| Gamification roadmap | ⏳ Pendiente (depende de Agent D) |
| Mobile integration | ⏳ Pendiente |
| Implementation plan / Sprint LEARNING-CORE | 🟡 Skeleton creado |
| Pricing & bundling | ⏳ Pendiente |

---

## Documentos hermanos

- **CLAUDE.md** (raíz) — sección Pending registra Sprint LEARNING-CORE y decisiones §128+ no-negociables del módulo
- **docs/vision/02-product-family.md** — debe agregar "Zenix Learning" al naming framework cuando salga de research
- **docs/vision/03-roadmap-v1-v2.md** — debe ubicar el módulo en la ladder (v1.0.0 ideal / v1.1.0 fallback)
- **docs/zenix-sales-master.md** — debe registrar el SKU + pitch + curso-regalo como hook
- **docs/prices-packages.md** — debe registrar pricing DLC Learning
