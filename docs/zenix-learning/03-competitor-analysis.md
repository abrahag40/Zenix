# Zenix Learning — Análisis de competencia y UX patterns

> Análisis profundo de SuccessFactors LMS + 4 competidores SaaS + LMS hotelería + patrones UX validados.
> Insumo para diseñar el módulo Learning evitando los errores documentados de SF y tomando lo mejor del mercado.
> **Última actualización:** 2026-05-21 (research por agente, +40 fuentes verificables)

---

## 1. SAP SuccessFactors LMS — análisis profundo

### 1.1 Arquitectura general

SuccessFactors LMS organiza el contenido en una jerarquía estricta de **entidades**: Items (la unidad mínima — un curso, video, SCORM package), Classes (instancias programadas de un Item, normalmente para ILT/VILT), Programs (secuencia o agrupación temática), Curricula (colecciones de Items con reglas de re-certificación y períodos de validez) y Tasks (job aids o checklists in-situ) ([SAP Help — Assignment Profiles](https://help.sap.com/docs/SAP_SUCCESSFACTORS_LEARNING/5fae31b1299d4033b665edabea7b9087/7a3303fd092f4c9b99c66912aee8c559.html); [SAP Spot — Power in Assignment Profiles](http://www.sapspot.com/successfactors-lms-power-in-assignment-profiles/)).

El motor de automatización son los **Assignment Profiles**: reglas declarativas sobre atributos del User (job code, location, department, custom fields) que asignan automáticamente Items, Curricula, Catalogs, User Roles, Recommended Items y Coupons. Pueden propagarse manualmente o vía proceso periódico ("APAUTO") — esta dualidad es fuente común de bugs de timing en producción ([SAP Community — Power in Assignment Profiles](https://blogs.sap.com/2013/12/05/successfactors-lms-power-in-assignment-profiles/)).

El **catálogo** se organiza por carpetas y subcarpetas con permisos jerárquicos. El **reporting** usa Plateau Report Designer (PRD) — herramienta legacy basada en BIRT, separada del nuevo "People Analytics" de SF. La **app móvil** (SuccessFactors Mobile) soporta enrollment, completion de Items SCORM cacheados y QR check-in para ILT.

### 1.2 Lo que los usuarios AMAN

- "El learner-facing UI tras el redesign de la 'New Learning Experience' es state of art, intuitivo y customizable" ([G2 — SuccessFactors Learning Reviews](https://www.g2.com/products/sap-successfactors-learning/reviews)).
- Integración nativa con Employee Central (HRIS): un cambio de puesto dispara re-asignación automática vía Assignment Profile sin intervención manual.
- Compliance audit-grade — todo completion queda time-stamped con versión del Item, ideal para OSHA/STPS/HIPAA ([SCORM.com — SCORM Explained](https://scorm.com/scorm-explained/)).
- Curricula con re-certificación: el sistema vuelve a marcar al user como "out of compliance" automáticamente al expirar el período (típico 12 meses para HACCP, 24 para fire safety).

### 1.3 Lo que los usuarios ODIAN (citas verbatim)

- **"La administración parece diseñada en los 2000s, es engorrosa y poco intuitiva. Más del 80% de reviewers que mencionan administración la consideran difícil"** ([Gartner Peer Insights](https://www.gartner.com/reviews/market/corporate-learning-technologies/vendor/sap/product/sap--successfactors-learning); [elearningindustry.com](https://elearningindustry.com/directory/elearning-software/sap-successfactors/reviews)).
- **"Back-end es un Frankenstein con elementos legacy todavía presentes; varios módulos fueron 'bolted on' a lo largo de los años y nunca se integraron del todo. La experiencia es inconsistente al moverte entre Learning, Performance y Compensation"** ([Capterra](https://www.capterra.com/p/144575/SuccessFactors-Perform-and-Reward/reviews/)).
- **"Look and feel de los 90s, performance lenta, navegación profunda"** ([elearningindustry.com](https://elearningindustry.com/directory/elearning-software/sap-successfactors/reviews)).
- **Búsqueda mala** — el find-a-course retorna resultados poco relevantes, sin fuzzy matching, sin tags ponderados. Los users terminan dependiendo de Assignment Profiles "push" en vez de auto-descubrimiento.
- **Authoring externo obligatorio** — SF no incluye un authoring tool; el contenido se crea en Articulate Storyline / Adobe Captivate / iSpring Suite y se importa como SCORM 1.2 / 2004. Esto suma $1,500-3,000/licencia/año al stack.

### 1.4 Lo que los administradores específicamente reclaman

- **Sin ad-hoc reporting accesible al admin** — todo report custom requiere PRD developer o un consulting partner ([Gartner](https://www.gartner.com/reviews/market/corporate-learning-technologies/vendor/sap/product/sap--successfactors-learning)).
- **Configuración profunda solo en "Provisioning"** (back-end SAP), no accesible al cliente; obliga a contratar partner para cambios estructurales.
- **Assignment Profiles con propagación asíncrona** — un cambio puede tardar hasta el siguiente run del job APAUTO en aparecer; debugging costoso.
- **Taxonomías rígidas** — añadir un campo custom al User requiere change en Employee Central + remapping en LMS, no es self-service.

### 1.5 Cómo funcionan los flujos clave

- **Enrollment**: vía Assignment Profile (automático) o catalog browse (auto-enroll) o admin assignment (push). Pre-requisites enforced en cascade.
- **Progress tracking**: SCORM API (`cmi.core.lesson_status`, `cmi.core.score`) o xAPI statements. Bookmarks soportados pero dependen del SCORM publisher.
- **Calificación**: cuestionarios SCORM/exam objects con pass/fail score configurable. Re-attempts limitados por policy.
- **Certificación**: Curricula define expiración (months/years from completion). Al expirar, status passa a "out-of-compliance" y dispara notification cascade.

---

## 2. Comparativa de 4 competidores

### 2.1 TalentLMS (Epignosis)

**Pricing:** desde $69/mes para SMB hasta planes Enterprise con seat unlimited. **UI/UX:** highest usability ratings — la mayoría de admins tienen su primer curso live en menos de una hora ([iSpring — TalentLMS Alternatives](https://www.ispringsolutions.com/blog/alternative-talentlms); [Coggno](https://coggno.com/blog/lms/best-lms-for-small-business-2026/)). **Mobile:** apps iOS/Android nativas con offline. **Formatos:** SCORM 1.2/2004, xAPI, cmi5 ([TalentLMS — SCORM Compliant features](https://www.talentlms.com/features/scorm-lms)). **Destaque:** TalentLibrary — 700+ cursos ready-made incluidos (workplace safety, DEI, customer service) — ideal para hospitality que necesita compliance covered fast. **Crítica:** branding limitado en tier bajo; reportes avanzados solo en plan Premium+; búsqueda fuzzy mediocre.

### 2.2 iSpring Learn

**Pricing:** $200-500/mes para SMB (cobra por active users, no por seats). **UI/UX:** clean, "Apple-style" minimalista. **Mobile:** apps con offline + auto-sync. **Formatos:** SCORM 1.2/2004, xAPI, AICC. **Destaque:** integración nativa con iSpring Suite (authoring en PowerPoint) — convierte slides en SCORM con quizzes y dialogue simulations sin código. Ideal para hoteles boutique donde el supervisor crea contenido propio. iSpring Academy library para onboarding rápido y seasonal training ([TalentLMS Blog — 12 Best SaaS LMS 2026](https://www.talentlms.com/blog/best-saas-lms/)). **Crítica:** menos depth en learning paths complejos que Docebo; reportes son report-driven, no dashboard-driven.

### 2.3 Docebo

**Pricing:** $15,000-25,000/año desde el primer contrato — annual, no monthly ([Docebo vs TalentLMS — Software Advice](https://www.softwareadvice.com/lms/docebo-lms-profile/vs/talentlms/)). **UI/UX:** modular, dashboard-heavy, AI-powered course recommendations. **Mobile:** Docebo Go.Learn app + Embed (LMS-in-iframe para portales custom). **Formatos:** SCORM, xAPI, cmi5, AICC, LTI 1.3. **Destaque:** AI Virtual Coach + Content Marketplace + 200+ integrations (Salesforce, MS Teams, Zoom). Diseñado para enterprise con headcount growth significativo. **Crítica:** "no es adecuado para small/medium business ni instituciones académicas" ([Docebo — Absorb Alternatives](https://www.docebo.com/learning-network/blog/absorb-lms-alternatives/)) — el ticket de entrada lo descarta para boutique hotels.

### 2.4 Moodle Workplace

**Pricing:** licensing vía Certified Moodle Partners; el self-hosted core LMS es gratis, pero implementación $2,000-25,000+ ([Accipio — Moodle LMS Guide 2026](https://www.accipio.com/blog/moodle-lms-guide-2026/)). **UI/UX:** "dated, cluttered, visually unappealing — steep learning curve" ([Capterra — Moodle reviews](https://www.capterra.com/p/80691/Moodle/reviews/); [research.com — Moodle Review 2026](https://research.com/software/reviews/moodle-review)). **Mobile:** Moodle Mobile app + Workplace App. **Formatos:** SCORM 1.2/2004, xAPI, LTI 1.3, H5P nativo. **Destaque:** multi-tenancy real, 2,000+ plugins, código abierto, scored 96 en integraciones y 93 en assessments (tied con Brightspace). **Crítica:** UX dated igual o peor que SF; cualquier customization significativa requiere developer Moodle-certified. Ironía: **EHL Graduate School corre su academia internamente sobre Moodle customizado** ([EHL Online Courses](https://gs.ehl.edu/online-courses)) — sí escala, pero no out-of-the-box.

---

## 3. LMS específicos hotelería

- **AHLEI** (American Hotel & Lodging Educational Institute) — research/policy body de AHLA. Casi 30 certification designations trademarked (CHA, CHS, CHE, CHDT, CHRM). Catálogo amplio entre safety, cleanliness, leadership y financial management. Material respetado por la industria; UX legacy ([AHLEI Hotel Industry Training](https://ahlei.servsafebrands.com/); [AHLEI Training & Certification](https://ahlei.servsafebrands.com/training-and-certification-overview)).
- **eHotelier Academy** — 250+ cursos endorsados por The Institute of Hospitality, con tracks desde front-line hasta GM. Incluye demonstrations, simulations, testing. Modelo subscription per-user con descuentos por volumen ([eHotelier Institute of Hospitality](https://academy.ehotelier.com/institute-of-hospitality/)).
- **EHL Edge** (École Hôtelière Lausanne) — el más premium, plataforma propietaria sobre Moodle. Certificados con unique ID, faculty world-class, alumni discount 10%. Pricing por curso (no flat sub) ([EHL Graduate School](https://gs.ehl.edu/online-courses)).
- **Typsy** — Netflix-style on-demand video, hundreds of expert-led courses, nuevos cursos cada mes. **Free plan 30 cursos / $99.99 USD plan 70+ ad-free** — el más asequible y popular para boutiques ([Typsy](https://www.typsy.com/)).
- **Tovuti LMS Hospitality** — LMS general con vertical hospitality; soporta SCORM 1.2/2004, AICC, xAPI; compliance CCPA/GDPR/HIPAA built-in ([Tovuti Hospitality LMS](https://www.tovutilms.com/hospitality-lms)).

**Insight clave:** ningún PMS LATAM (Cloudbeds, Mews, Opera) incluye LMS embebido. Los hoteles boutique compran Typsy o eHotelier por fuera y luego viven sin trazabilidad cross-system entre quién hizo qué training y quién operó qué turno. **Zenix Learning embebido es diferenciador comercial real** — cierra el loop entre training, schedule (§Sprint 8H) y performance.

---

## 4. Patrones UI/UX consolidados (lo mejor del mercado)

### 4.1 Catálogo
**Pattern ganador**: grid de tarjetas + filtros laterales (categoría, duración, formato, idioma) + sticky search bar. Cloudbeds, Typsy, Docebo usan este patrón. Paths/Curricula como tarjetas más grandes con visual progress bar agregado. Evitar tree-view profundo (problema SF).

### 4.2 Learner dashboard
Orden óptimo (NN/g + Docebo research):
1. **Hero strip** — "Continue learning" (último curso en progreso, 1 botón gigante)
2. **Due soon** — compliance deadlines con badge rojo/ámbar
3. **Assigned by manager** — required courses, sin opción de dismiss
4. **Recommended for you** — basado en role + history
5. **Catalog browse** — opcional, oculto hasta hover/scroll

"Progress bars do more for motivation than any pep talk" ([iSpring — LMS Dashboard](https://www.ispringsolutions.com/blog/lms-dashboard)).

### 4.3 Course player
- **Sidebar colapsable** con lección actual highlighted
- **Progress bar global + per-section**
- **Auto-bookmarking** (reanudar exacto al volver) — falta crítica en SF nativo
- **Next/Previous** sticky bottom (Fitts 1954 — targets siempre a un click)
- **Distraction-free mode**: secondary menus hidden until hover ([NeuronUX](https://www.neuronux.com/post/top-7-ux-design-strategies-to-enhance-your-lms))

### 4.4 Manager dashboard
- "Who's falling behind" — lista priorizada por días de retraso (no leaderboard público — §50/§52)
- 1-click "Nudge" — envía recordatorio individual (no broadcast)
- Heatmap calendar de completions por team
- Drill-down per-staff sin abandonar contexto

### 4.5 Mobile-first
- Tap targets ≥44pt (WCAG/Apple HIG)
- Offline-first con queue sync (patrón Zenix mobile existente)
- Push reminders contextuales (max 1/día, no broadcast)
- Vertical video preferido para microlearning ([Typsy](https://www.typsy.com/) lo usa)

### 4.6 Reporting STPS-compliance
- **DC-3 auto-generado** al completar curso registrado ante STPS, con folio + nombre del agente capacitador + firma electrónica ([Cursalab — DC-3 formato](https://cursalab.io/blog/como-usar-el-formato-dc-3-para-documentar-correctamente-la-capacitacion-en-mexico/); [CENCADE — Cumplimiento STPS DC3 DC4](https://cencade.com.mx/cumplimiento-stps-dc3-dc4/))
- DC-4 (plan y programa) generado en bulk al activar property
- Export Excel + PDF audit-grade
- **Art. 153-A Ley Federal del Trabajo** obliga a TODO empleador mexicano (ver doc 02)

### 4.7 SCORM/xAPI handling
- Aceptar SCORM 1.2 + 2004 + xAPI + cmi5 (mismo set que Tovuti/TalentLMS — table stakes) — **Fase 2 Zenix**, no Fase 1
- LRS interno o externo (Learning Locker, Yet Analytics)
- **xAPI permite tracking offline + mobile + actividades fuera del LMS** — clave para tareas de housekeeping ("staff cleaned room 304 following SOP v3" como statement xAPI desde la mobile app Zenix)

---

## 5. Lo que los usuarios PIDEN y no encuentran

Top complaints documentados en G2/Capterra/Quora/elearningindustry:

1. **Búsqueda fuzzy decente** — "users can't seamlessly jump between searching for courses, taking assessments, and tracking their progress" ([Capterra — Common UX Problems LMS](https://www.capterra.com/resources/problems-with-learning-management-systems/); [elearningindustry — Top 5 Things People Hate](https://elearningindustry.com/top-things-people-hate-learning-management-systems)).
2. **Bookmarking visual de progreso** — saber exacto dónde quedé sin reabrir cada sección.
3. **Reminders contextuales sin saturar** — "students ignore up to 40% of faculty emails due to notification fatigue" ([tryhavana.com — Combat Email Fatigue](https://www.tryhavana.com/blog/combat-student-email-fatigue)).
4. **Certificados descargables PDF** con QR de verificación pública.
5. **Integración con HR/payroll** — auto-disparar bono al completar curriculum, auto-bloquear shift assignment si compliance vencido.
6. **"Lost in navigation"** — friction = #1 killer de engagement; drop-off en primeros 10 min ([LMS Portals — Course Navigation](https://www.lmsportals.com/post/confusing-course-navigation-is-undermining-your-content)).

---

## 6. Patrones psicológicos validados en LMS

### Microlearning (Kapp + cognitive load theory)
Lecciones de 3-7 min, single learning objective, alta retención. Duolingo es el caso de estudio canónico — "breaks down language concepts into short digestible lessons, following cognitive load theory" ([Scrimmage — Psychology Behind Duolingo](https://scrimmage.co/the-psychology-behind-duolingos-success/); [ATD — 1000 Days of Duolingo](https://www.td.org/content/atd-blog/what-1-000-days-of-duolingo-taught-me-about-microlearning-and-gamification)).

### Streaks (Duolingo style) — riesgo crowding-out (Deci & Ryan 1985)
**Funcionan**: "fear of breaking a streak is a powerful motivator" ([StriveCloud — Duolingo Gamification](https://www.strivecloud.io/blog/gamification-examples-boost-user-retention-duolingo)).
**Pero**: Self-Determination Theory predice que XP/badges/streaks pueden crowd out la motivación intrínseca. "Learners who depend primarily on gamification show higher abandonment rates than learners motivated by genuine interest" ([dev.to — Why Duolingo's Gamification Works (And When It Doesn't)](https://dev.to/pocket_linguist/why-duolingos-gamification-works-and-when-it-doesnt-1d4)).
**Contrapunto de Kapp**: research indica que extrinsic rewards CAN foster intrinsic motivation cuando son performance-contingent (no participation-contingent) ([Karl Kapp — In Defense of Gamification](https://karlkapp.com/in-defense-of-the-term-gamification-as-used-by-learning-professionals/)).

**Recomendación para Zenix**: streak opt-in por staff (igual que §52 D9 gamification level), no default ON. Métricas individuales privadas (igual que §50 D7). Badges performance-contingent, no "logged-in 7 days".

### Notification fatigue
"Average employee navigates 120 emails daily" ([Tutor LMS — Mastering Communication](https://tutorlms.com/blog/mastering-communication-in-tutor-lms/)). Best practice: **weekly digest consolidado** > daily nudges. Aplica §58 D16 disciplina de niveles de notificación de Zenix (Ambient / Notification / Elevated). Learning **nunca** debe ser nivel 3 alarm.

### Mobile vs desktop split
- **78% de online learners accede LMS desde laptop, 45% desde smartphone** (overlap = usuarios usan ambos) ([Research.com — 51 LMS Statistics 2026](https://research.com/education/lms-statistics)).
- Mobile LMS growth en corporate: **+45% en 2024 solo**; CAGR mobile learning 36.45% 2020-2027 ([Research.com — Mobile vs Desktop Usage](https://research.com/software/guides/mobile-vs-desktop-usage)).
- Mobile-first LMS share projected to double by 2028, **overtaking desktop-first**.
- Corporate LMS market: $50.1B para 2030, CAGR 23.8%.

**Implicación para Zenix:** housekeepers ya usan mobile (apps/mobile existente) — el LMS debe entregarse en la misma app, no en navegador separado. Recepcionistas pueden usar desktop (calendar contextual). Supervisor consume reports en desktop.

---

## 7. Recomendaciones específicas para Zenix Learning (síntesis ejecutiva)

| Decisión | Justificación citada |
|---|---|
| **No replicar Curricula/Items/Programs/Classes/Tasks de SF** — colapsar a **Course / Path / Module** (3 niveles, no 5) | Hick 1952 + 80% admins SF quejan de complejidad ([Gartner](https://www.gartner.com/reviews/market/corporate-learning-technologies/vendor/sap/product/sap--successfactors-learning)) |
| **Assignment rules estilo SF Assignment Profiles, pero con propagación síncrona** y dry-run preview | Bug de timing APAUTO documentado ([SAP Spot](http://www.sapspot.com/successfactors-lms-power-in-assignment-profiles/)) |
| **Aceptar SCORM 1.2/2004 + xAPI + cmi5** en Fase 2 (no Fase 1) | Table stakes (TalentLMS, Tovuti, Docebo); STPS DC-3 audit grade |
| **Authoring NO en v1** — soportar import desde iSpring Suite / Articulate / Captivate + video MP4 nativo en Fase 2 | $0 invest, mismo modelo SF; authoring es 6-12 meses solo |
| **Catálogo grid + filtros laterales + fuzzy search PostgreSQL trigram** | Top complaint #1 LMS ([elearningindustry](https://elearningindustry.com/top-things-people-hate-learning-management-systems)) |
| **Dashboard learner Apple Calendar style** — Continue Learning hero + Due Soon + Assigned + Recommended | Docebo research + NN/g |
| **DC-3 auto-generado al completar** curso registrado ante STPS | Art. 153-A LFT mandatorio MX (doc 02) |
| **Mobile en la app Zenix existente** (no nueva app), offline queue ya existe | 45% adoption smartphone + mobile growth 45%/año ([Research.com](https://research.com/education/lms-statistics)) |
| **Streaks/badges OPT-IN por staff** (§52 D9 paridad) | Deci & Ryan crowding-out risk |
| **Weekly digest > daily nudges** | "Students ignore 40% of emails by fatigue" ([tryhavana.com](https://www.tryhavana.com/blog/combat-student-email-fatigue)) |
| **No leaderboard público** (§50 D7 paridad) | LFPDPPP + crowding-out |
| **Integraciones día 1**: Typsy + AHLEI + eHotelier content libraries vía SCORM import en Fase 2 | Hoteles ya compran ese contenido — Zenix lo amplifica, no compite |
| **Bundle con Zenix Activate (§77-§80)** — wizard pre-cargado con cursos compliance MX (Distintivo H, NOM-035) | Diferenciador vs Mews/Cloudbeds que no tienen LMS |

---

## Bibliografía

- [SAP SuccessFactors Learning Reviews — G2](https://www.g2.com/products/sap-successfactors-learning/reviews)
- [SAP SuccessFactors Learning — Gartner Peer Insights](https://www.gartner.com/reviews/market/corporate-learning-technologies/vendor/sap/product/sap--successfactors-learning)
- [SAP SuccessFactors Pros and Cons — G2](https://www.g2.com/products/sap-successfactors/reviews?qs=pros-and-cons)
- [SAP SuccessFactors HCM Reviews — Capterra](https://www.capterra.com/p/144575/SuccessFactors-Perform-and-Reward/reviews/)
- [SAP SuccessFactors Reviews — eLearning Industry](https://elearningindustry.com/directory/elearning-software/sap-successfactors/reviews)
- [SuccessFactors LMS — SelectHub](https://www.selecthub.com/p/lms-software/successfactors-lms/)
- [SuccessFactors LMS Assignment Profiles — SAPSPOT](http://www.sapspot.com/successfactors-lms-power-in-assignment-profiles/)
- [SuccessFactors LMS Assignment Profiles — SAP Community](https://blogs.sap.com/2013/12/05/successfactors-lms-power-in-assignment-profiles/)
- [SAP Help — SuccessFactors Learning Assignment Profiles](https://help.sap.com/docs/SAP_SUCCESSFACTORS_LEARNING/5fae31b1299d4033b665edabea7b9087/7a3303fd092f4c9b99c66912aee8c559.html)
- [Top 3 TalentLMS Alternatives — iSpring](https://www.ispringsolutions.com/blog/alternative-talentlms)
- [Best SaaS LMS 2026 — TalentLMS Blog](https://www.talentlms.com/blog/best-saas-lms/)
- [Docebo vs TalentLMS — Software Advice](https://www.softwareadvice.com/lms/docebo-lms-profile/vs/talentlms/)
- [TalentLMS SCORM Compliant LMS Features](https://www.talentlms.com/features/scorm-lms)
- [Best LMS for Small Business 2026 — Coggno](https://coggno.com/blog/lms/best-lms-for-small-business-2026/)
- [Absorb LMS Alternatives — Docebo](https://www.docebo.com/learning-network/blog/absorb-lms-alternatives/)
- [Moodle Reviews — Capterra](https://www.capterra.com/p/80691/Moodle/reviews/)
- [Moodle LMS Guide 2026 — Accipio](https://www.accipio.com/blog/moodle-lms-guide-2026/)
- [Moodle Review 2026 — research.com](https://research.com/software/reviews/moodle-review)
- [Moodle LMS vs Moodle Workplace — Raccoon Gang](https://raccoongang.com/blog/moodle-vs-moodle-workplace/)
- [AHLEI Hotel Industry Training](https://ahlei.servsafebrands.com/)
- [AHLEI Training & Certification Overview](https://ahlei.servsafebrands.com/training-and-certification-overview)
- [eHotelier Institute of Hospitality Academy](https://academy.ehotelier.com/institute-of-hospitality/)
- [Typsy — Hospitality Online Courses](https://www.typsy.com/)
- [EHL Graduate School Online Courses](https://gs.ehl.edu/online-courses)
- [Tovuti Hospitality LMS](https://www.tovutilms.com/hospitality-lms)
- [SCORM Explained — SCORM.com](https://scorm.com/scorm-explained/)
- [xAPI vs SCORM Comparison — iSpring](https://www.ispringsolutions.com/blog/xapi-vs-scorm)
- [What Is SCORM 2026 — Coggno](https://coggno.com/blog/what-is-scorm-and-why-is-it-important-for-lms-platforms-in-2026/)
- [51 LMS Statistics 2026 — Research.com](https://research.com/education/lms-statistics)
- [Mobile vs Desktop Usage Statistics 2026 — Research.com](https://research.com/software/guides/mobile-vs-desktop-usage)
- [eLearning Statistics 2026 — iSpring](https://www.ispringsolutions.com/blog/elearning-statistics)
- [Why Duolingo's Gamification Works (And When It Doesn't) — dev.to](https://dev.to/pocket_linguist/why-duolingos-gamification-works-and-when-it-doesnt-1d4)
- [Psychology Behind Duolingo — Scrimmage](https://scrimmage.co/the-psychology-behind-duolingos-success/)
- [1000 Days of Duolingo — ATD](https://www.td.org/content/atd-blog/what-1-000-days-of-duolingo-taught-me-about-microlearning-and-gamification)
- [Karl Kapp — In Defense of Gamification](https://karlkapp.com/in-defense-of-the-term-gamification-as-used-by-learning-professionals/)
- [Duolingo Gamification — StriveCloud](https://www.strivecloud.io/blog/gamification-examples-boost-user-retention-duolingo)
- [Common UX Problems with LMS — Capterra](https://www.capterra.com/resources/problems-with-learning-management-systems/)
- [Top 5 Things People Hate About LMS — eLearning Industry](https://elearningindustry.com/top-things-people-hate-learning-management-systems)
- [Confusing Course Navigation — LMS Portals](https://www.lmsportals.com/post/confusing-course-navigation-is-undermining-your-content)
- [Combat Student Email Fatigue — Havana](https://www.tryhavana.com/blog/combat-student-email-fatigue)
- [Mastering Communication in Tutor LMS](https://tutorlms.com/blog/mastering-communication-in-tutor-lms/)
- [LMS Dashboard — iSpring](https://www.ispringsolutions.com/blog/lms-dashboard)
- [LMS UX Best Practices — Learning Pulse Medium](https://learning-pulse.medium.com/lms-ux-best-practices-designing-a-frictionless-learning-experience-83884fafb3ce)
- [Top 7 UX Design Strategies for LMS — NeuronUX](https://www.neuronux.com/post/top-7-ux-design-strategies-to-enhance-your-lms)

---

## Bitácora

- **2026-05-21** — Doc creado a partir de research del agente competitivo. 7 secciones + 40+ fuentes citadas.
