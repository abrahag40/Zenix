# Zenix Learning — Compromisos de utilización de estándares LMS

> Respuesta concreta al input del usuario: *"podemos tomar los alineamientos y documentación para asegurar que estamos alineados a ese tipo de temario/recomendaciones/documentación"*.
> Este doc lista las acciones EJECUTABLES (no solo intencionales) que tomamos para aprovechar los estándares LMS aunque NO estemos formalmente certificados.
> **Última actualización:** 2026-05-21

---

## 0. La premisa

Doc 12 estableció que en Fase 1 NO somos compliant formales con SCORM/xAPI/Caliper/LTI. El usuario respondió: *"podemos tomar los alineamientos y documentación para asegurar que estamos alineados a ese tipo de temario/recomendaciones/documentación"*.

Este doc transforma esa intención en **compromisos verificables**: para cada estándar relevante, qué tomamos AHORA (Fase 1) sin pagar certificación, qué dejamos preparado para Fase 2-3, y qué métrica usamos para confirmar adherencia.

---

## 1. Catálogo de compromisos

### 1.1 IMS Caliper Analytics 1.2 — vocabulario canónico

**Decisión:** adoptamos el **vocabulario de Caliper** para nombrar nuestros eventos internos aunque NO emitamos JSON-LD a un Caliper-compatible LRS externo todavía.

**Acción Fase 1:**
- Renombrar internamente los events de `LearningEnrollmentLog` para alinearse con Caliper Event vocabulary:
  - `ENROLLED` → equivale a Caliper `Member` `AddedEvent`
  - `STARTED` → Caliper `Session` `StartedEvent`
  - `LESSON_COMPLETED` → Caliper `Activity` `CompletedEvent`
  - `ATTEMPT_SUBMITTED` → Caliper `Assessment` `Submitted` (action) + `AssessmentItem` `Completed`
  - `PASSED` / `FAILED` → Caliper `Outcome` `GradedEvent`
  - `CERTIFICATE_ISSUED` → Caliper `Annotation` `BookmarkedEvent` + custom extension
- Documentar el mapping en cada `event` constant del código

**Acción Fase 2:**
- Implementar `CaliperEmitter` service que proyecta `LearningEnrollmentLog` a JSON-LD compliant
- Endpoint configurable per-tenant: `caliperLrsEndpoint` en `OrgConfig` (futuro)
- Pass IMS Global Caliper conformance suite

**Cómo verifico que cumplimos:**
- ✅ Code review checklist Fase 1.5: cada event en `LearningEnrollmentLog` tiene comentario con su Caliper equivalent
- ⏳ Fase 2: pasar 100% del Caliper Conformance Test Suite (gratis, ~2 días)

**Fuente:** [IMS Caliper Analytics Specification](https://www.imsglobal.org/spec/caliper/v1p2)

---

### 1.2 ADL SCORM 1.2 / 2004 — runtime + content packaging

**Decisión Fase 1:** schema preparado, NO ejecutamos runtime. Cliente NO puede importar SCORM packages todavía.

**Acción Fase 1:** ya cumplida con `LearningLessonType.SCORM_12 / SCORM_2004` + columnas `externalPackageUrl/Manifest/LrsEndpoint`. Documentado en doc 12 §2.1.

**Acción Fase 2 v1.1.x:**
- Implementar runtime SCORM 1.2 (libraries open-source: `simple-scorm-player`, `pipwerks/scorm-api-wrapper`)
- Implementar runtime SCORM 2004 con sequencing & navigation
- Pre-validar con **ADL SCORM Test Suite** ([download oficial](https://adlnet.gov/projects/scorm-test-suite/))

**Cómo verifico que cumplimos:**
- ⏳ Fase 2: pasar 100% ADL SCORM 1.2 Test Suite (gratis, 1-2 días testing)
- ⏳ Fase 2: pasar 100% ADL SCORM 2004 4th Ed Test Suite

**Compromiso temprano (Fase 1):** mantener `cmi.core.*` field names en cualquier lógica interna que se asemeje a tracking SCORM-like, para minimizar refactor Fase 2.

**Fuente:** [ADL SCORM 2004 4th Edition](https://adlnet.gov/projects/scorm-2004-4th-edition/)

---

### 1.3 xAPI 1.0.3 — distributed learning tracking

**Decisión Fase 1:** los `LearningEnrollmentLog.metadata` ya capturan suficiente para proyectar a xAPI statement format Fase 2. NO emitimos statements a LRS externo.

**Acción Fase 1 (compromiso nuevo este sprint):**
- Cuando logueamos events en `LearningEnrollmentLog`, incluir `metadata.xapiVerb` con el URI canónico ADL:
  - `STARTED` → `metadata.xapiVerb = "http://adlnet.gov/expapi/verbs/initialized"`
  - `LESSON_COMPLETED` → `"http://adlnet.gov/expapi/verbs/completed"`
  - `PASSED` → `"http://adlnet.gov/expapi/verbs/passed"`
  - `FAILED` → `"http://adlnet.gov/expapi/verbs/failed"`
- Esto permite que Fase 2 simplemente lea de `metadata.xapiVerb` y emita statement sin refactor

**Acción Fase 2 v1.1.x:**
- Endpoint público `/v1/learning/xapi/statements` compliant con xAPI 1.0.3
- LRS interno (Learning Locker embedded) o externo opcional configurable
- Pasar **xAPI Conformance Test Suite** ([conformance.adlnet.gov](https://conformance.adlnet.gov/))

**Cómo verifico que cumplimos:**
- ✅ Code review Fase 1.5: `xapiVerb` URI poblado en cada event de `LearningEnrollmentLog`
- ⏳ Fase 2: pasar xAPI conformance suite

**Fuente:** [xAPI Specification 1.0.3](https://github.com/adlnet/xAPI-Spec)

---

### 1.4 IMS Open Badges 3.0 + W3C Verifiable Credentials 2.0 — credenciales portables

**Decisión:** Fase 1 emitimos PDF DC-3 con QR + URL verificación pública. NO emitimos badge OBv3 firmado todavía.

**Acción Fase 1 (compromiso nuevo este sprint):**
- `LearningCertificate.dc3VerificationUrl` debe contener un endpoint público idempotente
- Response shape debe incluir los campos REQUIRED por OBv3 spec (aunque no firmemos):
  - `id` (verification URL), `type: 'OpenBadgeCredential'`, `name`, `description`
  - `issuer: { id, name, type: 'Profile' }`
  - `awardedDate` (= `issuedAt`), `expirationDate` (= `expiresAt`)
  - `credentialSubject: { id: staffId, achievement: { ... } }`
- Implementar este shape en `certificates.service.verifyBySerial()` (extensión menor)

**Acción Fase 3:**
- Firmar credentials con clave privada Zenix (W3C VC `proof` con `Ed25519Signature2020`)
- Endpoint `/v1/learning/certificates/:serial/badge.json` returns OBv3 JSON-LD compliant
- Registrar Zenix en **IMS Open Badges Adopters Registry**
- Habilitar import a LinkedIn (LinkedIn parsea OBv3 firmado)

**Cómo verifico que cumplimos:**
- ⏳ Fase 1.5: response shape de verify endpoint incluye los REQUIRED fields OBv3
- ⏳ Fase 3: pasar IMS Open Badges Adopters Registry validation

**Fuente:** [IMS Open Badges 3.0 Specification](https://www.imsglobal.org/spec/ob/v3p0/), [W3C VC 2.0](https://www.w3.org/TR/vc-data-model-2.0/)

---

### 1.5 Bloom Taxonomy (Anderson & Krathwohl 2001) — objetivos de aprendizaje

**Decisión:** schema `LearningCourse.bloomLevels: String[]` ya enforce-able a Bloom 6 levels. Cada objetivo de aprendizaje en redacción de contenido empieza con verbo Bloom.

**Acción Fase 1 (compromiso ejecutable):**
- Content review checklist pre-publicación (`status: DRAFT → PUBLISHED`):
  - [ ] Cada `LearningLesson.contentJson` declara `learningObjective` field con verbo Bloom
  - [ ] Cada question en `quizPoolJson` declara `bloomLevel` field
  - [ ] `LearningCourse.bloomLevels` array refleja la suma de niveles cubiertos por las lessons
- Validador automático en pipeline de seed: rechaza publish si bloomLevels vacío

**Acción Fase 2:**
- Reporting de "distribución Bloom" en course completion analytics — útil para evidencia pedagógica

**Cómo verifico que cumplimos:**
- ✅ Fase 1.3 (contenido cursos MVP): los 3 cursos pasan content review checklist
- ✅ Fase 1.5: validador automático activo

**Fuente:** doc 07 §2 + [Anderson & Krathwohl 2001 PDF](https://quincycollege.edu/wp-content/uploads/Anderson-and-Krathwohl_Revised-Blooms-Taxonomy.pdf)

---

### 1.6 SuperMemo SM-2 — spaced repetition algorithm

**Decisión:** Fase 1.2 implementa SM-2 para SRS cards generadas de conceptos críticos del curso.

**Acción Fase 1.2:**
- `LearningSRSCard` model nuevo (no en Fase 1.0 — schema preparado deja `quizPoolJson` extensible)
- Algoritmo SM-2 con Easiness Factor (EF=2.5 inicial, mín 1.3), intervalos 1/6/EF×prev
- Testing contra valores conocidos de SuperMemo papers

**Cómo verifico que cumplimos:**
- ⏳ Fase 1.2: tests unit `srs-algorithm.test.ts` matching SM-2 reference values (Woźniak 1990 paper)

**Fuente:** doc 07 §4 + [SuperMemo SM-2](https://www.supermemo.com/en/blog/history-of-spaced-repetition)

---

### 1.7 Kirkpatrick 1959 — 4 levels of evaluation

**Decisión:** medimos L1 + L2 desde día 1. L3 + L4 con tooling Fase 2+.

**Acción Fase 1 (compromiso nuevo):**
- L1 (Reaction): survey 1-pregunta NPS post-curso. Schema ya soporta via `LearningEnrollment.metadata.reactionNPS`
- L2 (Learning): quiz pre-test + post-test 30/60/90d auto-disparado por scheduler
  - **Decisión §146 reservada:** scheduler `RetentionQuizScheduler` cron diario crea attempts con `metadata.retentionCheckpoint: 30 | 60 | 90`. El staff los recibe como push notification "Refresher rápido 3 preguntas (1 min)".

**Acción Fase 2:**
- L3 (Behavior): integration con supervisor checklist + mystery shopper feed (out of scope hoy)
- L4 (Results): cruzar `LearningEnrollment.completedAt` con `Property.dailyMetrics` para correlation. Requiere DashboardReports module (existe — extensión menor)

**Cómo verifico que cumplimos:**
- ✅ Fase 1.5: dashboard manager muestra completion rate **separado de** engagement rate (no inflado por compliance forzado)
- ⏳ Fase 2: knowledge retention 30/60/90d métricas visibles

**Fuente:** doc 07 §10 + [Kirkpatrick Partners](https://www.kirkpatrickpartners.com/the-kirkpatrick-model/)

---

### 1.8 WCAG 2.1 AA — accesibilidad

**Decisión:** auditoría obligatoria Fase 1.5 con axe-core + screen reader manual.

**Acción Fase 1.5 (DoD del sprint):**
- Toda página Learning pasa axe-core con 0 violations
- Test manual screen reader: VoiceOver (iOS/macOS) + TalkBack (Android) navegan completion de lección sin fricción
- Lighthouse score Accessibility ≥95 en todas las páginas Learning

**Cómo verifico:**
- ✅ Fase 1.5 DoD: reportes axe attachados al PR

**Fuente:** doc 05 §6 + [WCAG 2.1 AA quick reference](https://www.w3.org/WAI/WCAG21/quickref/)

---

### 1.9 GDPR / LFPDPPP — protección de datos personales

**Decisión:** schema ya alineado con privacy-by-design (gamification opt-in default false §132, no leaderboards públicos §50, append-only audit §128).

**Acción Fase 1 (compromiso adicional):**
- `LearningEnrollment.staffId` y certificates referenced via FK — **al anonimizar staff** (caso baja + retención fiscal), el `Staff.name` se reemplaza por `Staff-XXX` y `Staff.email` por hash, pero `LearningEnrollment` + `LearningCertificate` permanecen para evidencia STPS (LFT 153-U)
- Documentar este comportamiento en privacy policy del producto

**Cómo verifico:**
- ⏳ Fase 1.5: legal review confirma compatibilidad LFPDPPP Art. 17 derecho ARCO + LFT 153-U retención

**Fuente:** [LFPDPPP DOF 2010](https://www.dof.gob.mx/nota_detalle.php?codigo=5150631&fecha=05/07/2010), [GDPR Art. 17](https://gdpr-info.eu/art-17-gdpr/)

---

### 1.10 LFT México Art. 153-A a 153-X + DC-3 — compliance legal

**Decisión:** ya implementado en schema. Validación legal con abogado laboral bloqueante para release.

**Acción Fase 1.3 (DoD del sprint, bloqueante hard):**
- DC-3 PDF generado pasa review de abogado laboral mexicano
- Layout valida contra formato STPS oficial 2026 (doc 02 §3)
- QR + URL verificación pública responde 200 sin auth (§131)

**Cómo verifico:**
- 🔴 Fase 1.3 bloqueante: legal review firmado antes de release

**Fuente:** doc 02 (research completo)

---

## 2. Checklist de "alineamiento sin certificación formal" para revisión externa

Para que un consultor externo verifique nuestro compromiso, puede ejecutar este checklist:

### Compromisos Fase 1 (cierre del sprint LEARNING-CORE)

- [ ] `LearningEnrollmentLog.event` constants tienen comentario con Caliper equivalent
- [ ] `LearningEnrollmentLog.metadata.xapiVerb` poblado con URI canónico ADL en cada event
- [ ] Schema `LearningLessonType` reserva SCORM_12/2004/XAPI_PACKAGE/CMI5_AU sin uso (Fase 2)
- [ ] `LearningCertificate` response de `verifyBySerial()` incluye OBv3 required fields (id, type, issuer, awardedDate, credentialSubject)
- [ ] `LearningCourse.bloomLevels` array poblado en los 3 cursos MVP
- [ ] Content review checklist pre-publish enforces verbos Bloom en learningObjectives
- [ ] axe-core scan = 0 violations en todas las páginas Learning
- [ ] Lighthouse Accessibility ≥95 en todas las páginas
- [ ] Screen reader test pass (VoiceOver + TalkBack)
- [ ] DC-3 PDF pasa legal review

### Compromisos Fase 2 (v1.1.x)

- [ ] ADL SCORM 1.2 Test Suite 100% pass
- [ ] ADL SCORM 2004 4th Ed Test Suite 100% pass
- [ ] ADL xAPI Conformance Suite 100% pass
- [ ] IMS Caliper Conformance Suite 100% pass
- [ ] CaliperEmitter service activo con endpoint configurable per-tenant
- [ ] RetentionQuizScheduler ejecutando L2 Kirkpatrick checkpoints 30/60/90d

### Compromisos Fase 3 (v1.3.x)

- [ ] IMS Open Badges 3.0 Adopters Registry validation pass
- [ ] OBv3 badges firmados con Ed25519Signature2020
- [ ] LinkedIn integration: badges parseables vía OBv3 import
- [ ] IMS Global membership + LTI 1.3 conformance pass

---

## 3. Decisión §146 (reservada) — Standards Utilization

**Texto para CLAUDE.md al cerrar sprint:**

> **§146** Zenix Learning adopta el VOCABULARIO + RESPONSE SHAPES de los estándares LMS relevantes (IMS Caliper, ADL xAPI, IMS Open Badges 3.0, Bloom revisada, SuperMemo SM-2, Kirkpatrick) en Fase 1 SIN buscar certificación formal. Cada `LearningEnrollmentLog.event` incluye `metadata.xapiVerb` con URI canónico ADL. Cada certificate response incluye OBv3 required fields. Cada `LearningCourse.bloomLevels` valida verbos Bloom en learningObjectives. Esto reduce el costo de migración a Fase 2 (SCORM/xAPI runtime + Caliper emitter) y Fase 3 (OBv3 firmado + LTI) — el schema y los logs ya hablan el lenguaje correcto. La certificación formal contra ADL/IMS test suites llega en Fase 2-3 con presupuesto dedicado.

---

## 4. Bitácora

- **2026-05-21** — Doc creado tras input del usuario "podemos tomar los alineamientos y documentación". Convierte intención en compromisos verificables con checklist + métricas + decisión §146 reservada.
