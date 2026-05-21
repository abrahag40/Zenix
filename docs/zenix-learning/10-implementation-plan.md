# Sprint LEARNING-CORE — Plan de implementación

> Plan técnico ejecutable del módulo Zenix Learning Fase 1. Rama `claude/zenix-learning-lms-v1-2qz8l`.
> Target merge: v1.0.0 (ideal) / v1.1.0 (fallback).
> **Última actualización:** 2026-05-21

---

## 0. Decisiones bloqueantes ya tomadas

| Decisión | Valor | Doc |
|----------|-------|-----|
| Timing | Rama independiente; merge a v1.0.0 si llega, fallback v1.1.0 | 01 §3, 11 |
| Formato Fase 1 | Solo nativo Zenix HTML5/audio/video/PDF. SCORM/xAPI Fase 2 | 04 §1, 09 §5 |
| 3 cursos MVP | Distintivo H + NOM-035 · Front Office (AHLEI-aligned) · Housekeeping Standards | 06 |
| Gamificación Fase 1 | Ligera (puntos, badges, progress, opt-in streaks). Roadmap a profunda documentado | 08 |
| Mobile | Tab nuevo en `apps/mobile`, NO nueva app. Offline-first, audio-first | 09 |
| Pricing | $7 USD/staff/mes L1. GIFT con curso regalo. | 11 |
| Multi-tenant | 4-level §63-§72. Reporting por LegalEntity. | 04 §3 |

---

## 1. Roadmap del sprint LEARNING-CORE (Fase 1)

### Fase 1.0 — Fundación schema + módulo NestJS · 5-7 días

| Día | Trabajo | Entregable |
|-----|---------|-----------|
| 1 | Migración Prisma: 14 modelos nuevos (`LearningCourse`, `LearningModule`, `LearningLesson`, `LearningEnrollment`, `LearningAttempt`, `LearningLessonProgress`, `LearningEnrollmentLog`, `LearningCertificate`, `LearningAssignmentRule`, `LearningAssessment`, `LearningBadge`, `LearningBadgeAward`, `LearningStreak`, `LearningPreferences`) + 6 enums | `migrations/2026XXXXXX_learning_core_init/` aplicable |
| 1 | Extension `pg_trgm` para fuzzy search | Migration adicional |
| 2 | Módulo NestJS `apps/api/src/learning/` con submodulos catalog/enrollments/lessons/attempts/certificates/assignment-rules/gamification/reporting/adapters/schedulers | `learning.module.ts` registrado en `app.module.ts` |
| 2 | DTOs validados con class-validator | `dto/*.ts` |
| 2-3 | Service layer base: `LearningCatalogService`, `EnrollmentsService`, `LessonsService`, `AttemptsService`, `CertificatesService` con TenantContext §35 paridad | Servicios con unit tests básicos |
| 3 | SSE event types nuevos en `ALL_SSE_TYPES` | Tests SSE singleton §124 |
| 4 | `MxStpsAdapter` para DC-3 (Strategy pattern §89 paridad) | Adapter + tests |
| 4 | DC-3 PDF generator service (puppeteer o pdfkit con layout STPS) | PDF generado en sandbox |
| 5 | Schedulers: `RecertificationScheduler` (cron diario) + `ReminderScheduler` (cron 9am local per-property) + `AssignmentRulesScheduler` | Tests scheduler con jest fake timers |
| 5-6 | Authorization matrix completa (doc 04 §5) — guards + unit tests por rol | Tests cross-role |
| 6 | Seed inicial: 3 cursos esqueleto con módulos placeholder + 1 staff seed enrollado al GIFT | Seed corre clean |
| 7 | Test coverage > 70% del módulo backend | CI verde |

### Fase 1.1 — Frontend web learner + manager · 6-8 días

| Día | Trabajo | Entregable |
|-----|---------|-----------|
| 1 | Routing `/learning/*` + Sidebar nav item + auth guards | `apps/web/src/modules/learning/` |
| 1-2 | Dashboard learner (Continue + Due + Assigned + Recommended) | Pantalla funcional con seed data |
| 2-3 | Catalog grid con fuzzy search (debounced, llama backend) + filtros | Pantalla funcional |
| 3-4 | Lesson player (HTML5/video/audio/PDF switch) con sidebar de módulos | Player funcional |
| 4-5 | Quiz inline + Examen final con re-take logic + feedback informativo §39 | Tests quiz |
| 5-6 | Manager dashboard (Compliance + Who's falling behind + Nudge button) | Pantalla funcional |
| 6 | Compliance report STPS + export Excel/PDF (bulk DC-3 ZIP) | Tests export |
| 7 | Certificate viewer + share LinkedIn | Pantalla funcional |
| 7-8 | Animations canónicas Zenix (§Principio Rector Animaciones) + accesibilidad WCAG 2.1 AA | axe scan clean |

### Fase 1.2 — Mobile (apps/mobile) · 5-7 días

| Día | Trabajo | Entregable |
|-----|---------|-----------|
| 1 | Tab Learning en navegación Hub + badge "due soon" | Tab funcional |
| 2 | Dashboard + Catalog screens (paridad web) | Pantallas funcionales |
| 3 | Lesson player con SCORM-/xAPI-ready architecture (Fase 1 solo HTML5/audio/video/PDF) | Player en device |
| 3-4 | Audio-first player con background playback (`expo-av staysActiveInBackground`) | Audio funciona con lock screen |
| 4-5 | Offline-first: `learning-sync-queue.ts`, `lesson-prefetch.ts`, `media-cache.ts` | Tests offline scenarios |
| 5-6 | Push notifications integration: `LearningReminder` category + timing inteligente basado en `Shift.startTime` | Push llega a device seed |
| 6 | Certificate viewer + share | Pantalla funcional |
| 7 | Detox E2E smoke test + jest-expo unit tests | CI verde QA-α |

### Fase 1.3 — Contenido de los 3 cursos · 8-12 días

> Este es el bloqueante real. Sin contenido publicable, el LMS está vacío.

| Día | Trabajo | Entregable |
|-----|---------|-----------|
| 1-3 | **Curso 1 — Distintivo H + NOM-035**: redactar contenido modules 1-8 según syllabus doc 06 §1 | JSON blocks de 24 lessons + audio recordings |
| 4-6 | **Curso 2 — Front Office Excellence**: redactar modules 1-9 doc 06 §2 | JSON blocks de ~20 lessons + audio |
| 7-9 | **Curso 3 — Housekeeping Standards**: redactar modules 1-10 doc 06 §3 | JSON blocks de ~25 lessons + audio |
| 10 | Question banks por curso (mínimo 100 preguntas por curso para evitar overlap) | JSON pools |
| 11 | Reviewer experto firma off cada curso (consultor SECTUR para curso 1, AHLEI partner para 2-3) | Acta firmada |
| 12 | Seed productive: cursos publicados con `status=PUBLISHED` + Q&A oficial | Seed v1.0 |

**Estimado contenido:** ~70 lessons totales × 4 min audio promedio = ~4.5 hrs audio + ~30k palabras texto + ~50 imágenes/diagramas. Producible con redactor experto + voice talent (~$8-15k USD producción inicial).

### Fase 1.4 — Integraciones + activación · 3-5 días

| Día | Trabajo | Entregable |
|-----|---------|-----------|
| 1 | Integration con Zenix Activate wizard etapa 6 (toggle + GIFT enrollment auto) | Wizard funcional con LMS |
| 2 | Update Settings page con tab "Aprendizaje" (preferences, billing, manager dashboard link) | Pantalla funcional |
| 2-3 | Notif Center integration: nueva category `LEARNING_REMINDER` con purge 7d post-expiry (§101) | Tests notif lifecycle |
| 3 | Activation Report PDF includes Learning section (doc 11 §3) | PDF generado |
| 4 | Health checks pre-activación: DC-3 PDF generation, public verification URL, push delivery | Health check pass |
| 4-5 | Stripe billing (per-staff-active counting + monthly invoice) - **opcional v1.0.0**, posible defer v1.0.1 con PAY-CORE | Billing funcional o feature flag |

### Fase 1.5 — Pulido + QA + docs · 3-5 días

| Día | Trabajo | Entregable |
|-----|---------|-----------|
| 1 | Bug bash interno (smoke + edge cases) | Bug list + fixes |
| 2 | Performance: <2s load del dashboard, <500ms response API endpoints | Apdex measured |
| 2-3 | Accesibilidad WCAG 2.1 AA full audit (axe + manual screen reader test VoiceOver/TalkBack) | Reporte axe clean |
| 3 | Update `docs/zenix-sales-master.md` (sección Capacitación) | Sales doc actualizado |
| 4 | Update `docs/prices-packages.md` (SKUs LRN) | Pricing doc actualizado |
| 4 | Update `docs/vision/02-product-family.md` (Zenix Learning en bundles) | Vision actualizado |
| 4 | Update `docs/vision/03-roadmap-v1-v2.md` (Learning ubicado en ladder) | Roadmap actualizado |
| 5 | PR final → main + walkthrough video para sales team | PR mergeable |

### Total estimado Sprint LEARNING-CORE

- **Backend**: 7 días
- **Web frontend**: 8 días
- **Mobile**: 7 días
- **Contenido cursos**: 12 días
- **Integraciones + pulido**: 8 días

**Total: 42 días = ~8.5 semanas focused work.**

Paralelizable a ~6 semanas wall-clock con 2 devs (1 backend/web, 1 mobile/contenido).

---

## 2. Dependencias críticas externas

| Dependencia | Riesgo | Mitigación |
|-------------|--------|-----------|
| Consultor SECTUR / Distintivo H expert para reviewer | Alto — sin esto no se publica curso 1 con seguridad legal | Empezar búsqueda DÍA 1. Costo ~$1k-3k USD. Lista contactos en doc 11 |
| AHLEI partner approval para emitir "alineado AHLEI" en cursos 2-3 | Medio — sin esto el material es Zenix-internal solo | Disclaimer "alineado a estándares AHLEI" + plan v1.1 para certificación oficial |
| Voice talent para audio de 70 lessons | Medio — producción audio toma 2 sem si artesanal | Opciones: (a) voice talent profesional MX (~$50/min) (b) IA TTS premium (ElevenLabs $99/mes — ético si declarado) |
| Diseñador gráfico para iconos/diagramas | Bajo | Brief simple, ~5 días freelance |
| DC-3 PDF layout official validation | Alto — si STPS rechaza formato en auditoría real, problema | Validar con abogado laboral antes de release. Compartir con consultor SECTUR |

---

## 3. Criterios de salida (Definition of Done)

El sprint LEARNING-CORE puede declararse "ready to merge" cuando:

- [ ] Schema Prisma migrado en clean db y rollback testeado
- [ ] Backend tests > 70% coverage del módulo, todos verdes
- [ ] Frontend web smoke tests E2E (Playwright o similar) verdes
- [ ] Mobile Detox E2E smoke test verde + jest-expo unit tests verdes
- [ ] 3 cursos publicados con contenido real, reviewer experto firmado
- [ ] DC-3 PDF se genera correctamente y reviewer legal lo valida
- [ ] Compliance report STPS exportable a Excel + ZIP de DC-3 individuales
- [ ] Mobile offline-first funcional (test scenarios: airplane mode + reconnect sync)
- [ ] Notif Center integration con purge 7d post-expiry tested
- [ ] Activate wizard etapa 6 muestra toggle Learning con GIFT default ON
- [ ] Sales master + pricing docs + vision docs actualizados
- [ ] Bug bash session con stakeholders sin bloqueantes
- [ ] Accesibilidad WCAG 2.1 AA validada (axe + screen reader manual)
- [ ] Performance: dashboard load <2s, API endpoints <500ms p95
- [ ] CLAUDE.md actualizado con decisiones §128+ del sprint
- [ ] Walkthrough video grabado para sales team (5-7 min)

---

## 4. Riesgos del sprint identificados

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|-----------|
| **Contenido de cursos no listo a tiempo** (sin reviewer experto, no se publica) | Alta | Crítico (LMS vacío) | Empezar búsqueda reviewer + redactor desde DÍA 1. Tener Plan B: lanzar con curso 1 solo si 2-3 no llegan |
| **Schema cambia mid-sprint** (descubrimos que falta `LearningSkill` o `LearningPath`) | Media | Medio | Schema sobre-modelado deliberadamente en v1.0. JSON `metadata` en lugar de columnas nuevas |
| **DC-3 PDF rechazado por STPS real** | Baja-Media | Crítico | Validar formato con abogado laboral pre-release. Tener fallback "PDF informativo + indicar usuario llena DC-3 oficial" |
| **Mobile offline sync conflict bugs** | Media | Alto (data loss) | Tests aggressive de scenarios. Conflict resolver con audit log |
| **Stripe billing complex (per-active-staff)** | Media | Medio | Defer v1.0.1 PAY-CORE si bloquea. Lanzar con billing manual ZaharDev en piloto |
| **Performance bajo con seed real de muchos cursos** | Baja | Medio | Paginación + lazy load desde día 1. PostgreSQL indexes en schema |
| **Conflict con People (v1.7) por duplicar Skill** | Media | Bajo | Schema `LearningCompetency` ya pensado para extender en People |
| **Crowding-out effect al usar gamificación incorrecta** | Media | Medio | Doc 08 explícito; reviewer interno antes de release |
| **Scope creep "agreguemos SCORM ya"** | Alta | Alto (delay) | Decisión §128 estricta — SCORM/xAPI es Fase 2 v1.1.x. NO se relaja en LEARNING-CORE |
| **Bug en MultiTenant cross-leak** (org A ve cursos de B) | Baja | Crítico | TenantContext §35 + tests cross-org explícitos |

---

## 5. Decisiones técnicas no-negociables (candidatas §128+ CLAUDE.md)

Reservadas para el sprint:

**§128. `LearningEnrollmentLog` append-only y inmutable.** Sin `@updatedAt`. Mismo patrón §14 PaymentLog. Razón: evidencia STPS = audit trail no manipulable.

**§129. Versionado de contenido obligatorio en enrollment.** `LearningEnrollment.contentVersionPin` snapshotea la versión del curso al momento del enroll. Si el curso se actualiza, el learner sigue viendo la versión que comenzó. Razón: LFT Art. 153-U exige certificación contra contenido específico, no "última versión".

**§130. DC-3 PDF se genera SOLO al completar (`COMPLETED`)**, nunca antes. Si el staff abandona el examen final → no hay PDF. Razón: STPS no acepta certificados de "intento" — solo conclusión exitosa.

**§131. `LearningCertificate.serialNumber` UNIQUE con prefix `ZNX-LRN-{yyyy}-{NNNNNN}`** (sequence por año). Verificación pública en `/v1/learning/certificates/:serialNumber` SIN auth. Razón: auditor STPS necesita validar sin credenciales.

**§132. Gamificación OFF por default en `LearningPreferences.gamificationOptIn`**. Opt-in explícito. Razón: doc 07 §6 Deci & Ryan crowding-out + §52 D9 staff preferences paridad.

**§133. `LearningAssignmentRule` propaga SÍNCRONO** al crear/editar la regla, NO espera scheduler. Dry-run obligatorio antes de apply. Razón: bug timing APAUTO de SuccessFactors documentado doc 03 §1.4.

**§134. `MxStpsAdapter` es BASE v1.0.0 Learning Core.** CO-SENA / CR-INA / PE-SUNAFIL son DLC tier "Learning Country Pack" activable via Zenix Activate. Patrón análogo §89 `IFiscalAdapter`. Razón: cada país tiene regulación distinta; modelo flat no escala.

**§135. Audio-first opcional en `LearningPreferences.audioFirst`** — UI cambia layout default. Hands-busy housekeepers tienen player tipo Spotify mini al pie del Hub. Razón: doc 07 §9 + 45% mobile usage.

**§136. Push notification de Learning máximo 2/día por staff** (incluyendo todos los tipos). Si excede, consolida en una sola "Tienes 3 pendientes hoy". Razón: alert fatigue doc 03 §6 + §58 D16 paridad.

**§137. Stripe billing per-active-staff (no per-seat).** Active = ≥1 login mobile/web en últimos 30 días. Cobro mensual basado en peak de los últimos 30 días (modelo iSpring Learn). Razón: justicia comercial en hoteles con rotación estacional.

---

## 6. Ramificación con CLAUDE.md Pending

Actualización al CLAUDE.md sección **Pending — Sprints inmediatos para v1.0.x Foundation**:

```markdown
| **LEARNING-CORE** | Zenix Learning LMS Fase 1: schema + módulo NestJS + web learner/manager + mobile + 3 cursos MVP (Distintivo H + NOM-035, Front Office AHLEI, Housekeeping) + DC-3 generator + gamificación ligera + Activate wizard integration. Rama `claude/zenix-learning-lms-v1-2qz8l`. Target v1.0.0 ideal, fallback v1.1.0. Plan completo en `docs/zenix-learning/10-implementation-plan.md`. Decisiones §128-§137 al cerrar sprint. | 42 días (~8.5 sem focused / ~6 sem con 2 devs) | Sí — hook comercial crítico |
```

---

## 7. Bitácora

- **2026-05-21** — Doc creado. Plan completo Fase 1 con 5 sub-fases + dependencias + DoD + riesgos + decisiones §128-§137 reservadas.
