# Zenix Learning — Arquitectura Engine vs Content (separación canónica)

> Documento técnico que explica por qué el LMS Zenix y los cursos son entidades independientes, cómo se montan los cursos sobre el motor, y qué implicaciones tiene esta separación para producción, distribución, mantenimiento y escalabilidad.
> **Última actualización:** 2026-05-22

---

## 0. Resumen ejecutivo

| Capa | Qué es | Quién lo mantiene | Cadencia de cambio |
|------|--------|-------------------|---------------------|
| **Engine (motor LMS)** | Código del lector de lecciones, motor de quizzes, generador de certificados, dashboard manager, sync offline, push notifications | Equipo de ingeniería Zenix | Releases v1.x.y (1-2 meses entre versiones) |
| **Content (cursos)** | JSON de lessons + assets multimedia (audio/video/PDF/imágenes) + bancos de preguntas + metadata curricular | Reviewer experto + redactor + Tax Curator equivalente | Versionado independiente (semanal/mensual sin tocar engine) |
| **Runtime Data** | Enrollments, attempts, progress, certificates emitidos, audit logs | Sistema (escritura runtime), supervisor (lectura) | Por cada interacción del staff (eventos en vivo) |

**Insight central:** un curso nuevo NO requiere deploy del LMS. Un fix del LMS NO requiere re-publicar cursos. Es el mismo principio que separa el motor de tu PMS (`apps/api`) de los datos de cada propiedad (PostgreSQL rows): **el motor evoluciona en su cadencia, los datos en la suya**.

Esto es el patrón canónico de **TODO LMS profesional** — Moodle (Engine vs Course Packages), Canvas (Engine vs LTI tools), Articulate Storyline (Authoring tool vs Storyline Player), Adobe Captivate (Captivate vs Captivate Prime), TalentLMS (Platform vs Courses), iSpring Learn (Authoring + Learning), Docebo (Platform vs Course Library). **Sin esta separación, el LMS deja de ser un LMS y se convierte en una colección de cursos hard-coded** — exactamente el problema que tienen los e-learnings "boutique" que mueren con su primer cliente.

---

## 1. Las 3 capas en detalle

### 1.1 Engine Layer — el motor inmutable por curso

Ubicación: `apps/api/src/learning/` + `apps/web/src/learning/` + `apps/mobile/src/features/learning/`.

**Componentes del motor:**

```
┌──────────────────────────────────────────────────────────────┐
│  LessonPlayer                                                 │
│  ├─ HTML5 renderer (lessons type=HTML5_NATIVE)               │
│  ├─ Video player con HLS (lessons type=VIDEO_MP4)            │
│  ├─ Audio player Spotify-style (lessons type=AUDIO_MP3)      │
│  ├─ PDF viewer readonly (lessons type=PDF_DOCUMENT)          │
│  └─ [Fase 2] SCORM 2004 player + xAPI LRS bridge             │
├──────────────────────────────────────────────────────────────┤
│  QuizEngine                                                   │
│  ├─ Multiple choice scorer                                    │
│  ├─ Drag-drop scorer                                          │
│  ├─ Scenario branching (decision tree)                        │
│  ├─ SRS (Spaced Repetition SM-2 Woźniak 1995)                │
│  ├─ ELO adaptive difficulty (Csikszentmihalyi flow zone)     │
│  └─ Anti-cheating: webcam snapshot, focus-leave detection    │
├──────────────────────────────────────────────────────────────┤
│  ProgressTracker                                              │
│  ├─ LessonAttempt write (start/pause/resume/complete)        │
│  ├─ ModuleCompletion derivation                               │
│  ├─ CourseCompletion + certificate trigger                    │
│  └─ Offline queue (mobile §9 doc 09) + sync on reconnect     │
├──────────────────────────────────────────────────────────────┤
│  CertificateGenerator                                         │
│  ├─ PDF render co-branded (Hotel logo + Zenix logo)          │
│  ├─ Pre-firmado HMAC-SHA256 (key per LegalEntity)            │
│  ├─ QR verificable público (no DB query needed)              │
│  └─ Strategy adapter por tipo (ZENIX_INTERNAL/STPS_DC3/...)  │
├──────────────────────────────────────────────────────────────┤
│  ReportsEngine (Manager Dashboard)                            │
│  ├─ Who's falling behind (no leaderboard público §07)        │
│  ├─ Compliance rate por LegalEntity (auditoría STPS-ready)   │
│  ├─ Time-to-completion histogram                              │
│  └─ Curso-regalo conversion rate (PMS hook tracking)         │
├──────────────────────────────────────────────────────────────┤
│  NotificationDispatcher                                       │
│  ├─ Push assignment ("Te asignaron un curso")                │
│  ├─ Push due-soon ("Vence en 3 días")                        │
│  ├─ SSE in-app ("Tu certificado está listo")                 │
│  └─ Anti-fatigue rate limiting (§16 D-16 nivel 2 max)        │
└──────────────────────────────────────────────────────────────┘
```

**Características no negociables del engine:**

- **Cero hard-coded course content.** El engine NUNCA contiene strings de lessons, ni preguntas, ni respuestas. Si el engine sabe la respuesta correcta de una pregunta, el engine necesita actualizarse cada vez que cambia una pregunta → anti-patrón.
- **Versionado independiente del contenido.** El engine es `v1.0.0`. Los cursos son `MX-DH-2026.05.1`, `MX-DH-2026.06.1`. Una corrección de typo en el syllabus de DH → bump versión del CONTENT, sin tocar el engine.
- **Backwards-compatible con versiones de content antiguas.** Un curso `2026.05.1` enrollado por un staff que no completó debe seguir reproduciéndose en el engine `v1.5.0` lanzado un año después. Pattern Netflix: si grabaron Stranger Things S1 con códecs 2016, el player 2026 sigue reproduciéndolo.

### 1.2 Content Layer — los cursos como datos versionados

Ubicación física: PostgreSQL (metadata + structure) + R2/S3 (assets multimedia + PDFs).

**Estructura del Course Package canónico:**

```
LearningCourse (root)
├── id: cuid                            ← inmutable
├── slug: "mx-distintivo-h-nom-035"     ← inmutable (URL stable)
├── category: COMPLIANCE_LEGAL          ← LearningCourseCategory enum
├── tier: CORE | PRO | MARKETPLACE | CUSTOM | GIFT
├── language: ES_MX
├── status: DRAFT | PUBLISHED | RETIRED
├── activeVersionId: → LearningCourseVersion
│
└─ LearningCourseVersion[]              ← múltiples versiones coexisten
   ├── id: cuid
   ├── version: "2026.05.1"             ← semver-like (year.month.patch)
   ├── publishedAt: 2026-05-22
   ├── retiredAt: null | date           ← versiones viejas archivadas, no borradas
   ├── changelog: "Actualización tasa UMA 2026 + 3 escenarios nuevos"
   ├── reviewerSignedById: → User       ← reviewer experto firmó
   ├── reviewerSignedAt: timestamp
   │
   └─ LearningModule[]
      ├── id: cuid
      ├── orderIndex: 1
      ├── title: "Marco normativo Distintivo H"
      ├── estimatedMinutes: 120
      │
      └─ LearningLesson[]
         ├── id: cuid
         ├── orderIndex: 1
         ├── type: HTML5_NATIVE
         ├── title: "El error común: aceptar pescado a 12°C"
         ├── content: {
         │   blocks: [
         │     { type: "hook", body: "..." },
         │     { type: "evidence", body: "...", citation: "..." },
         │     { type: "audio", assetId: "..." },
         │     { type: "knowledge_check", questions: [...] }
         │   ]
         │ }
         └─ LearningAsset[] (FK)
            ├── id: cuid
            ├── kind: AUDIO_MP3 | VIDEO_MP4 | PDF | IMAGE
            ├── url: "https://r2.zenix.com/learning/...mp3"
            ├── checksum: sha256
            └── transcript: "..." (a11y WCAG 2.1 AA)
```

**Por qué versiones inmutables:**

1. **Auditoría retroactiva.** Si STPS audita en 2027 al staff certificado en mayo 2026, debe poder ver EXACTAMENTE el contenido que ese staff aprobó — no la versión editada después. Pattern CFDI 4.0 §11: una vez timbrado, inmutable.
2. **Reproducibilidad del certificado.** El QR del certificado linkea a `version: "2026.05.1"` específica. El verificador público puede ver "lo aprobó cuando el curso decía X, no Y".
3. **Roll-forward sin breaking progress.** Si staff Z está al 60% del curso versión `2026.05.1` cuando publicamos `2026.06.1` (correción menor), el sistema le ofrece continuar con su versión O migrar a la nueva. NUNCA pierde progreso.

### 1.3 Runtime Data Layer — el histórico inmutable

Ubicación: PostgreSQL exclusivamente (no R2, son datos relacionales puros).

```
LearningEnrollment
├── staffId / courseVersionId / propertyId / legalEntityId
├── status: NOT_STARTED → IN_PROGRESS → COMPLETED | FAILED | EXPIRED
├── enrolledAt / startedAt / completedAt / expiresAt
├── assignedById (supervisor que enrolló)
└── source: GIFT | DLC_INCLUDED | INDIVIDUAL_PURCHASE | MANDATORY_COMPLIANCE

LearningLessonAttempt (append-only, una row por intento)
├── enrollmentId / lessonId / startedAt / endedAt
├── progressPercent / completed
└── interactionLog: Json (clicks, pause, resume, focus-leave)

LearningQuizAttempt (append-only)
├── enrollmentId / quizId / score / passed / answersJson
├── timeSpentSeconds / startedAt / submittedAt
└── webcamSnapshotUrl?: String (anti-cheating, eliminable per GDPR)

LearningCertificate (append-only)
├── enrollmentId / courseVersionId / staffId / legalEntityId
├── issuedAt / pdfUrl / verificationHash
├── type: ZENIX_INTERNAL | STPS_DC3 | AHLEI_ALIGNED | EXTERNAL_PARTNER
└── revokedAt?: timestamp (extraordinario; legal hold)
```

**Reglas de inmutabilidad (paralelo §14 + §28 + §95):**

- Ninguna row de `LearningQuizAttempt` se edita. Re-intento = row nueva.
- Ninguna row de `LearningCertificate` se elimina hard. Revocación = `revokedAt` con razón documentada.
- Audit STPS-ready: dado un `staffId + courseVersionId + completedAt`, el sistema puede reproducir EXACTAMENTE qué preguntas vio el staff y qué contestó.

---

## 2. Cómo "se monta" un curso al LMS — el flujo end-to-end

### 2.1 Producción (autoría)

```
1. Reviewer experto (consultor SECTUR/AHLEI) + redactor Zenix
   producen Markdown con frontmatter YAML por lesson:
   
   ---
   id: lesson-marco-normativo-distintivo-h
   module: module-1-marco-normativo
   order: 1
   estimatedMinutes: 15
   bloomLevel: COMPREHEND
   tags: [distintivo-h, sectur, nmx-f-605]
   ---
   
   # El error común
   En muchos hoteles...
   
   # El deber ser
   La NMX-F-605-NORMEX-2018 establece...
   
2. Pipeline de build convierte Markdown → JSON normalizado
   (parseo de bloques: hook | evidence | audio | knowledge_check)
   
3. Build genera LearningCourseVersion con changelog auto + reviewer signature
   
4. Tax Curator equivalente revisa preview en staging
   
5. Promote a producción: status DRAFT → PUBLISHED
   activeVersionId del Course apunta a la nueva version
   versión anterior queda como retiredAt = now
```

### 2.2 Distribución (deployment al cliente)

```
1. Cliente tiene Zenix PMS activo + LegalEntity creada
2. Activate wizard ofrece "tu curso de regalo del catálogo de 3":
   prospecto elige UNO → enrollment automático del staff inicial
3. DLC mensual añade los otros 2 al catálogo accesible
4. El engine ya está deployed (no se redeploya por curso nuevo)
5. El nuevo curso aparece en la UI del learner en su próximo refresh
```

### 2.3 Consumo (learner)

```
1. Staff abre Zenix mobile → Tab Hub Aprendizaje
2. Engine query: GET /v1/learning/my-courses
3. Engine devuelve lista de LearningEnrollment activos
4. Staff toca curso → engine query GET /v1/learning/courses/:id/version/active
5. Engine recibe estructura completa del curso + assets URLs
6. LessonPlayer renderiza según type (HTML5/Video/Audio/PDF)
7. Cada interacción → POST /v1/learning/lessons/:id/attempt (append-only)
8. Examen → POST /v1/learning/quizzes/:id/submit
9. Si passed → CertificateGenerator dispara, PDF firmado en S3
10. Notif push "Felicidades, tu certificado está listo"
```

**Nota crítica:** ningún paso del 1 al 10 requirió cambio de código. Todo es data-driven sobre un engine estable.

---

## 3. Beneficios concretos de la separación

| Beneficio | Implementación | Industria que lo prueba |
|-----------|----------------|--------------------------|
| **Cursos nuevos sin deploy** | Reviewer publica curso desde Studio interno → CourseVersion DRAFT → PUBLISHED → visible | Articulate Rise, Adobe Captivate Prime, Moodle Workplace |
| **Multi-tenant content diferenciado** | `LearningCourse.organizationId = null` (catálogo Zenix) vs `= "org-acme"` (cursos custom del cliente Acme) | Docebo, TalentLMS, iSpring Learn |
| **Hot-fix de typos sin lock** | Nueva CourseVersion (`2026.05.2`); staff actual continúa en su versión hasta completar; nuevos enrollment toman la nueva | Khan Academy, Coursera |
| **A/B testing pedagógico** | Dos `LearningCourseVersion` activas con `splitPercent` para comparar conversion rate | Duolingo (Skill Tree experiments) |
| **Reviewer experto edita sin developer** | Studio web mínimo (Markdown-driven) → no requiere ingeniero | Notion Academy, Maven |
| **Cursos comprados a terceros (Fase 2 marketplace)** | Importar SCORM 2004 package → engine reproduce sin modificar | Coursera for Business, LinkedIn Learning |
| **Certificados retroactivos auditables** | Cada cert linkea a `courseVersionId` exacto | CFDI 4.0 (paralelo) |
| **Engine bug → fix one place** | Patch de seguridad en QuizEngine se aplica a TODOS los cursos sin re-publicar | Cualquier LMS profesional |

---

## 4. Anti-patrones explícitamente prohibidos

> Estos errores arquitectónicos han matado LMS boutique en el pasado. Documentados para que NUNCA aparezcan en Zenix Learning.

1. **Hard-coded course in repo** — preguntas/respuestas de Distintivo H en TypeScript files dentro de `apps/api`. Bloquea reviewer (no code-write access). Bloquea hot-fix (requiere deploy). Bloquea multi-cliente. **❌**

2. **Engine que sabe el contenido del curso** — switch case por `course.id` dentro de QuizEngine ("if Distintivo H, then weight pregunta 5 doble"). Cada curso nuevo requiere modificar engine. **❌**

3. **Course = código** — el curso es un `.tsx` con JSX hard-coded. No versionable como data. Cada propuesta de cambio = git diff de código. Reviewer no técnico ⟹ bottleneck permanente. **❌**

4. **Storage de assets en repo git** — videos en `apps/web/public/learning/distintivo-h/`. Repo gigante. CDN ausente. Bandwidth caro. R2/S3 es el lugar para multimedia. **❌**

5. **Progress en localStorage sin sync** — staff cambia de dispositivo y pierde 60% del curso. Mobile + Web deben compartir RuntimeData via PostgreSQL central. **❌**

6. **Certificate como PDF estático en repo** — pre-generar 1000 PDFs es absurdo. Generación on-demand con HMAC firmado. **❌**

7. **Quiz answers en frontend** — staff abre DevTools y ve respuestas correctas. Scoring SIEMPRE server-side. Frontend solo muestra opciones. **❌**

---

## 5. Mapping al schema Prisma existente

> Doc 04 `04-architecture-plan.md` ya define las 14 entidades. Este doc 21 explica el **por qué** arquitectónico de esa separación. Ambos docs son consistentes.

| Capa | Modelos Prisma (de doc 04) |
|------|----------------------------|
| **Engine** | (código, no modelos) — `apps/api/src/learning/services/*` |
| **Content** | `LearningCourse`, `LearningCourseVersion`, `LearningModule`, `LearningLesson`, `LearningAsset`, `LearningQuestion`, `LearningQuestionBank` |
| **Runtime Data** | `LearningEnrollment`, `LearningLessonAttempt`, `LearningQuizAttempt`, `LearningCertificate`, `LearningEnrollmentLog` (append-only) |

---

## 6. Roadmap evolutivo de la arquitectura

| Fase | Engine evoluciona en... | Content layer recibe... |
|------|--------------------------|--------------------------|
| **Fase 1 (v1.0.0)** | HTML5/audio/video/PDF nativo + Quiz multiple choice + SRS + Cert co-branded | 3 cursos MVP (DH + FO + HK) |
| **Fase 2 (v1.1)** | SCORM 2004 / xAPI LRS import + marketplace cursos terceros | + Pool de candidatos (Inglés, Bartending, A&B, Wine 101, etc.) |
| **Fase 3 (v1.2)** | AR/VR lessons (Quest 3 + WebXR) + IA tutora conversacional + ELO adaptive difficulty completo | Cursos generados parcialmente por IA con human-in-the-loop reviewer |
| **Fase 4 (v2.0)** | Multi-language auto-translation engine + Federated learning analytics + Blockchain credential portability | Cursos en EN/PT-BR/FR auto-generados desde ES_MX master |

**Insight:** el engine puede crecer en sofisticación SIN romper los cursos existentes. Pattern Netflix: el player de 2010 reproducía MP4; el player de 2024 reproduce HEVC/AV1 + Dolby Atmos; los catálogos crecieron en paralelo sin requerir re-deploy del player por cada show nuevo.

---

## 7. Cita central — por qué este patrón es no negociable

> *"The hardest part of building an LMS is not building the player. It's keeping the player and the content evolving at different speeds without either dragging the other down."*  
> — Articulate Storyline post-mortem, e-Learning Heroes Community, 2017

Zenix Learning adopta esa lección desde el día 1.

---

## Bitácora

- **2026-05-22** — Doc creado tras pregunta arquitectónica explícita del usuario sobre engine/content separation. Confirma que doc 04 schema Prisma + módulo NestJS independiente + content versionado son correctos. Sirve como referencia técnica para reviewers y futuros desarrolladores que se sumen al equipo Zenix Learning.
