# Zenix Learning — Plan de arquitectura técnica

> Schema Prisma + endpoints REST + módulos NestJS + multi-tenant + integración con módulos existentes. Fase 1 (nativo HTML5) → Fase 2 (SCORM/xAPI).
> **Última actualización:** 2026-05-21

---

## 0. Principios arquitectónicos

1. **Bounded context (Evans 2003)** — `apps/api/src/learning/` es módulo NestJS independiente. Comunicación con Staff/PMS via SSE/EventEmitter, NO via service imports cruzados.
2. **Multi-tenant 4-level (§63-§72)** — toda entidad Learning lleva `organizationId` denormalizado + `legalEntityId` cuando aplica (para DC-3) + `propertyId` opcional (cursos per-property).
3. **Append-only audit (§14, §28)** — `LearningEnrollmentLog` y `LearningAttemptLog` son inmutables. Sin `@updatedAt`.
4. **Service-layer authorization (§35 paridad)** — `LearningService.enroll/start/complete` validan permisos vía `TenantContextService` antes de cualquier mutation.
5. **3 niveles jerárquicos máximo** — `Course` > `Module` > `Lesson`. NO replicar Curricula/Item/Class/Program de SF (doc 03 §1.3).
6. **Strategy pattern para fiscal/compliance** — `ILearningComplianceAdapter` por país (MX = `MxStpsAdapter` para DC-3), análogo a §89.
7. **Mobile-first (45% usage)** — toda funcionalidad debe funcionar offline + sync queue. Web es complemento, no canónico.
8. **HTML5+JSON nativo Fase 1, SCORM/xAPI Fase 2** — el `Lesson.contentType` enum se diseña extensible desde día 1.

---

## 1. Schema Prisma — entidades Fase 1

### 1.1 Enums

```prisma
enum LearningCourseStatus {
  DRAFT         // editable por curators, invisible para learners
  PUBLISHED     // publicado, visible en catálogo
  RETIRED       // ya no enrollable; los que ya están enrolled lo completan
}

enum LearningCourseTier {
  CORE          // incluido en DLC L1 (3 cursos MVP)
  PRO           // requiere DLC L2 (SCORM/xAPI)
  MARKETPLACE   // L3 — cursos pagados per-unit
  CUSTOM        // L4 — producido custom por ZaharDev consulting
  GIFT          // hook comercial — bundle con PMS sin DLC activo
}

enum LearningLessonType {
  HTML5_NATIVE      // Fase 1 — JSON con bloques contenido + quiz
  VIDEO_MP4         // Fase 1 — video alojado en R2/S3 con HLS
  AUDIO_MP3         // Fase 1 — audio para hands-busy learners (§9 doc 07)
  PDF_DOCUMENT      // Fase 1 — visualizador PDF readonly
  SCORM_12          // Fase 2
  SCORM_2004        // Fase 2
  XAPI_PACKAGE      // Fase 2
  CMI5_AU           // Fase 2
}

enum LearningEnrollmentStatus {
  NOT_STARTED       // staff fue enrollado, aún no abre el curso
  IN_PROGRESS       // abrió al menos 1 lección
  COMPLETED         // aprobó el examen final
  FAILED            // agotó re-takes sin aprobar
  EXPIRED           // recertificación vencida — requiere re-enroll
  CANCELLED         // unenrolled (raro, requiere supervisor)
}

enum LearningAssessmentResult {
  PASSED
  FAILED
  IN_PROGRESS       // examen abierto, no submitted
  ABANDONED         // dejó el examen sin submit
}

enum LearningCertificateType {
  ZENIX_INTERNAL    // certificado emitido por Zenix Learning
  STPS_DC3          // formato DC-3 STPS México (LFT Art. 153-U)
  AHLEI_ALIGNED     // alineado al estándar AHLEI pero no oficial
  EXTERNAL_PARTNER  // cuando emite un partner externo (v1.2 marketplace)
}

enum LearningContentLanguage {
  ES_MX             // español neutro LATAM-MX
  ES_419            // español neutro LATAM
  EN_US
  PT_BR             // futuro
}

enum LearningCourseCategory {
  COMPLIANCE_LEGAL          // LFT, STPS, NOM
  COMPLIANCE_SANITATION     // Distintivo H, ISO 22000, HACCP
  FRONT_OFFICE              // recepción
  HOUSEKEEPING              // limpieza
  FOOD_BEVERAGE             // A&B (futuro)
  REVENUE_MANAGEMENT        // RM
  LEADERSHIP                // supervisores
  SAFETY_SECURITY           // emergencias
  GUEST_SERVICE             // servicio al huésped
  TECHNOLOGY                // PMS, OTAs, channel managers
}
```

### 1.2 Catálogo + estructura curricular

```prisma
model LearningCourse {
  id                    String   @id @default(cuid())
  organizationId        String?  // null = catálogo Zenix global; populated = curso custom org
  brandId               String?  // si es curso brand-level
  legalEntityId         String?  // si es curso propio de una razón social
  propertyId            String?  // si es curso property-specific

  slug                  String   @unique
  title                 String
  shortDescription      String   @db.VarChar(280)
  longDescription       String?  @db.Text
  category              LearningCourseCategory
  tier                  LearningCourseTier   @default(CORE)
  language              LearningContentLanguage @default(ES_MX)
  status                LearningCourseStatus @default(DRAFT)

  // Versionado audit-grade (LFT 153-U exige versión de contenido al certificar)
  contentVersion        String   @default("1.0.0")
  publishedAt           DateTime?
  retiredAt             DateTime?

  // Compliance
  certificateType       LearningCertificateType @default(ZENIX_INTERNAL)
  stpsRegisteredAt      DateTime?  // si está registrado ante STPS como ACE
  stpsAgentCode         String?    // código del agente capacitador
  recertificationMonths Int?       // null = no expira; 12 = Distintivo H; 24 = NOM-035

  // Pedagogía (doc 07)
  estimatedHours        Decimal  @db.Decimal(5, 2)
  bloomLevels           String[] // ["APPLY", "ANALYZE"] — para SRS de targeting
  prerequisites         String[] // courseIds que deben estar COMPLETED antes
  passingScore          Decimal  @db.Decimal(5, 2) @default(75.00)
  maxAttempts           Int      @default(3)
  retakeWaitHours       Int      @default(48)

  // Diferenciador comercial
  isGiftEligible        Boolean  @default(false)  // puede regalarse al cerrar PMS

  thumbnailUrl          String?
  metadata              Json?    // tags, palabras clave para fuzzy search

  modules               LearningModule[]
  enrollments           LearningEnrollment[]
  assignmentRules       LearningAssignmentRule[]

  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt
  createdById           String?

  @@index([organizationId, status])
  @@index([category, tier, status])
  @@index([legalEntityId])
  @@index([slug])
}

model LearningModule {
  id              String   @id @default(cuid())
  courseId        String
  course          LearningCourse @relation(fields: [courseId], references: [id], onDelete: Cascade)

  order           Int
  title           String
  description     String?
  estimatedMinutes Int

  lessons         LearningLesson[]

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@unique([courseId, order])
  @@index([courseId])
}

model LearningLesson {
  id              String   @id @default(cuid())
  moduleId        String
  module          LearningModule @relation(fields: [moduleId], references: [id], onDelete: Cascade)

  order           Int
  title           String
  type            LearningLessonType
  durationMinutes Int      // para target microlearning 3-7 min (doc 07 §3)

  // Contenido nativo Fase 1
  contentJson     Json?    // bloques: [{ kind: 'text', body: '...' }, { kind: 'image', url: '...' }, { kind: 'quiz', q: [...] }]
  audioUrl        String?  // microlearning audio-first hands-busy
  videoUrl        String?
  pdfUrl          String?
  transcriptText  String?  @db.Text  // accesibilidad WCAG 2.1 AA

  // Fase 2 — SCORM/xAPI package metadata
  externalPackageUrl  String?
  externalPackageManifest Json?
  externalLrsEndpoint String?

  // Quiz adaptativo (doc 07 §7 Flow)
  quizPoolSize        Int?   // cuántas preguntas tomar del pool
  quizPoolJson        Json?  // banco de preguntas con dificultad ELO

  isOptional      Boolean  @default(false)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  attempts        LearningAttempt[]

  @@unique([moduleId, order])
  @@index([moduleId])
}

// Examen final por curso (separado del quiz de lección)
model LearningAssessment {
  id              String   @id @default(cuid())
  courseId        String   @unique  // 1:1 — el examen es del curso
  questionBank    Json     // pool de preguntas
  questionsPerAttempt Int  @default(40)
  durationMinutes Int      @default(60)
  shuffleQuestions Boolean @default(true)
  shuffleOptions  Boolean  @default(true)
  showResultDetail Boolean @default(true) // mostrar al learner qué falló

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}
```

### 1.3 Enrollment + progreso

```prisma
model LearningEnrollment {
  id                String   @id @default(cuid())
  staffId           String
  courseId          String
  course            LearningCourse @relation(fields: [courseId], references: [id])

  organizationId    String   // denormalizado §66
  legalEntityId     String?  // para emisión DC-3 (§64)
  propertyId        String?  // contexto property si aplica

  status            LearningEnrollmentStatus @default(NOT_STARTED)
  enrolledAt        DateTime @default(now())
  enrolledById      String?  // null = self-enroll; populated = manager assign / auto-rule
  enrollmentReason  String?  // "ASSIGNED_BY_MANAGER" | "ASSIGNMENT_RULE" | "SELF_ENROLL" | "GIFT_AT_ACTIVATION" | "RECERTIFICATION"

  startedAt         DateTime?
  completedAt       DateTime?
  expiresAt         DateTime?  // calculado de `course.recertificationMonths`
  totalTimeSpentMinutes Int   @default(0)

  // Score final
  finalScore        Decimal?  @db.Decimal(5, 2)
  attemptsUsed      Int       @default(0)

  // Certificado emitido
  certificateId     String?
  certificate       LearningCertificate? @relation(fields: [certificateId], references: [id])

  attempts          LearningAttempt[]
  logs              LearningEnrollmentLog[]

  @@unique([staffId, courseId, contentVersionPin])  // permite re-enroll a nueva versión
  @@index([staffId, status])
  @@index([legalEntityId, status])  // reporting STPS por LegalEntity
  @@index([propertyId, status])
  @@index([expiresAt])  // scheduler de re-certificación
  @@index([completedAt])

  contentVersionPin String  @default("1.0.0")  // versión del curso al enrollment (audit)
}

// Progreso per-lesson — append-only audit
model LearningLessonProgress {
  id              String   @id @default(cuid())
  enrollmentId    String
  lessonId        String

  startedAt       DateTime?
  completedAt     DateTime?
  timeSpentSeconds Int     @default(0)
  bookmarkPosition Int?    // segundo del video, párrafo del HTML5

  @@unique([enrollmentId, lessonId])
  @@index([enrollmentId])
}

// Intentos de quiz / examen — append-only
model LearningAttempt {
  id              String   @id @default(cuid())
  enrollmentId    String
  enrollment      LearningEnrollment @relation(fields: [enrollmentId], references: [id])

  lessonId        String?  // null = examen final del curso
  lesson          LearningLesson? @relation(fields: [lessonId], references: [id])

  attemptNumber   Int      // 1, 2, 3...
  startedAt       DateTime @default(now())
  submittedAt     DateTime?
  durationSeconds Int?

  questionsAsked  Json     // snapshot de preguntas + opciones (audit)
  answersGiven    Json     // respuestas del learner (audit)
  questionsCorrect Int     @default(0)
  questionsTotal  Int      @default(0)
  scorePct        Decimal  @db.Decimal(5, 2) @default(0)
  result          LearningAssessmentResult @default(IN_PROGRESS)

  @@index([enrollmentId, attemptNumber])
  @@index([lessonId])
}

// Log inmutable — análogo a §14 PaymentLog
model LearningEnrollmentLog {
  id              String   @id @default(cuid())
  enrollmentId    String
  enrollment      LearningEnrollment @relation(fields: [enrollmentId], references: [id])

  event           String   // "ENROLLED" | "STARTED" | "LESSON_COMPLETED" | "ATTEMPT_SUBMITTED" | "PASSED" | "FAILED" | "CERTIFICATE_ISSUED" | "EXPIRED" | "RECERTIFIED" | "MANAGER_REMINDED"
  metadata        Json?
  actorId         String?  // staffId que disparó (null = system/scheduler)
  occurredAt      DateTime @default(now())

  @@index([enrollmentId, occurredAt])
}
```

### 1.4 Certificados (DC-3 + Zenix + AHLEI-aligned)

```prisma
model LearningCertificate {
  id              String   @id @default(cuid())
  enrollmentId    String   @unique
  staffId         String
  courseId        String
  legalEntityId   String?

  type            LearningCertificateType
  serialNumber    String   @unique  // formato: ZNX-LRN-{yyyy}-{NNNNNN}
  issuedAt        DateTime @default(now())
  expiresAt       DateTime?

  // DC-3 STPS specific (LFT Art. 153-U)
  dc3RegistroSTPS String?  // folio del registro del plan ante STPS
  dc3InstructorNombre String?
  dc3InstructorCURP String?
  dc3HorasTotales Decimal? @db.Decimal(5, 2)
  dc3LugarFecha   Json?    // { ciudad, estado, fecha }
  dc3CertificadoPdfUrl String?  // PDF generado, audit-grade
  dc3VerificationUrl   String  // URL pública con QR para verificación

  enrollments     LearningEnrollment[]

  @@index([staffId, type])
  @@index([legalEntityId, issuedAt])  // bulk export para SIRCE
  @@index([serialNumber])
}
```

### 1.5 Asignación automática (Assignment Rules estilo SF mejorado)

```prisma
// Inspirado en SF Assignment Profiles pero con propagación síncrona (doc 03 §1.4)
model LearningAssignmentRule {
  id              String   @id @default(cuid())
  organizationId  String
  legalEntityId   String?
  propertyId      String?

  name            String
  description     String?
  isActive        Boolean  @default(true)

  // Reglas: si Staff cumple TODAS estas condiciones → enroll automático
  matchRole       String[] // ["RECEPTIONIST", "SUPERVISOR"]
  matchDepartment String[] // ["FRONT_OFFICE", "HOUSEKEEPING"]
  matchPropertyType String[] // ["HOSTAL", "HOTEL"]
  matchHireDateAfter DateTime?
  matchHireDateBefore DateTime?

  // Qué se asigna
  courseId        String
  course          LearningCourse @relation(fields: [courseId], references: [id])
  enrollWithinDays Int     @default(0)  // 0 = inmediato; 30 = a los 30 días de contratación
  deadlineDays    Int?     // null = sin fecha; N = N días desde enroll para completar

  // Auditoría
  lastRunAt       DateTime?
  totalEnrolledByThisRule Int @default(0)

  createdAt       DateTime @default(now())
  createdById     String?

  @@index([organizationId, isActive])
}
```

### 1.6 Gamificación (Fase 1 ligera — doc 08)

```prisma
model LearningBadge {
  id              String   @id @default(cuid())
  code            String   @unique  // "FIRST_LESSON" | "COURSE_COMPLETE" | "10_LESSONS" | "DISTINTIVO_H_CERT"
  name            String
  description     String
  iconUrl         String?
  category        String   // "MILESTONE" | "CERTIFICATION" | "DEDICATION"

  // Condition expresada declarativa: {"type": "courses_completed", "count": 3}
  conditionJson   Json
  awards          LearningBadgeAward[]
}

model LearningBadgeAward {
  id              String   @id @default(cuid())
  staffId         String
  badgeId         String
  badge           LearningBadge @relation(fields: [badgeId], references: [id])

  awardedAt       DateTime @default(now())
  context         Json?    // { courseId, enrollmentId }

  @@unique([staffId, badgeId])  // 1 sola vez por badge
  @@index([staffId])
}

// Streaks opt-in (§52 D9 paridad — gamificación opcional)
model LearningStreak {
  staffId         String   @id
  currentStreak   Int      @default(0)
  longestStreak   Int      @default(0)
  lastActiveDate  DateTime?
  gamificationOptIn Boolean @default(false)  // OFF by default — doc 07 §6 SDT
}

// Preferencias per-staff (extiende StaffPreferences existente)
model LearningPreferences {
  staffId         String   @id
  preferredLanguage LearningContentLanguage @default(ES_MX)
  audioFirst      Boolean  @default(false)  // hands-busy users
  emailReminders  Boolean  @default(true)
  pushReminders   Boolean  @default(true)
  weeklyDigestDay String   @default("MONDAY")  // doc 03 §6 — weekly > daily
  reminderHourLocal Int    @default(9)  // 9 AM local time
  receivePeerNudges Boolean @default(false)
}
```

---

## 2. Endpoints REST (NestJS module structure)

### `apps/api/src/learning/`

```
learning/
├── learning.module.ts
├── catalog/              # consulta catálogo + búsqueda fuzzy
│   ├── catalog.controller.ts        GET /v1/learning/courses, GET /v1/learning/courses/:slug
│   └── catalog.service.ts           PostgreSQL trigram fuzzy search
├── enrollments/          # enrollment lifecycle
│   ├── enrollments.controller.ts    POST /v1/learning/enrollments, PATCH /:id/start
│   └── enrollments.service.ts
├── lessons/              # render lesson + track progress
│   ├── lessons.controller.ts        GET /v1/learning/lessons/:id, POST /:id/progress
│   └── lessons.service.ts
├── attempts/             # quiz + examen
│   ├── attempts.controller.ts       POST /v1/learning/attempts, POST /:id/submit
│   └── attempts.service.ts          # SM-2 SRS algorithm + ELO adaptive
├── certificates/         # certificate generation + verification
│   ├── certificates.controller.ts   GET /v1/learning/certificates/:serialNumber
│   ├── certificates.service.ts
│   └── dc3-generator.service.ts     # PDF DC-3 con layout STPS
├── assignment-rules/     # auto-enroll engine
│   ├── assignment-rules.controller.ts
│   ├── assignment-rules.service.ts
│   └── assignment-rules.scheduler.ts # cron: re-evalúa al cambiar staff role
├── gamification/         # badges + streaks (opt-in)
│   ├── badges.service.ts            # evalúa conditions tras cada completion
│   └── streaks.service.ts
├── reporting/            # compliance + manager dashboard
│   ├── reporting.controller.ts      GET /v1/learning/reports/compliance, /manager-dashboard
│   ├── compliance-report.service.ts # STPS-style: per-LegalEntity completion rates
│   └── manager-dashboard.service.ts
├── adapters/             # Strategy pattern fiscal/compliance
│   ├── learning-compliance.adapter.ts (interface)
│   ├── mx-stps.adapter.ts            (Fase 1)
│   ├── co-sena.adapter.ts            (Fase 1.x)
│   └── cr-ina.adapter.ts             (Fase 1.x)
├── schedulers/
│   ├── recertification.scheduler.ts  # @Cron diario: mark EXPIRED + re-enroll auto
│   ├── reminder.scheduler.ts          # @Cron 9am local per-property: weekly digest
│   └── assignment-rules.scheduler.ts  # @Cron hourly: re-evalúa rules
└── dto/
    ├── enroll.dto.ts
    ├── submit-attempt.dto.ts
    └── ...
```

### Endpoints clave (resumen)

| Método | Path | Auth | Acción |
|--------|------|------|--------|
| `GET` | `/v1/learning/courses` | LEARNER+ | Lista catálogo (filtros: category, tier, language, due-soon) |
| `GET` | `/v1/learning/courses/:slug` | LEARNER+ | Detalle de curso + módulos + lecciones |
| `GET` | `/v1/learning/me/dashboard` | LEARNER | Dashboard learner: Continue + Due + Assigned + Recommended |
| `POST` | `/v1/learning/enrollments` | LEARNER+ | Self-enroll (si tier=CORE accesible) o manager assign |
| `PATCH` | `/v1/learning/enrollments/:id/start` | LEARNER | Marcar IN_PROGRESS al abrir 1ª lección |
| `POST` | `/v1/learning/lessons/:id/progress` | LEARNER | Track bookmark, time spent, completion |
| `POST` | `/v1/learning/attempts` | LEARNER | Iniciar intento (quiz lección o examen final) |
| `POST` | `/v1/learning/attempts/:id/submit` | LEARNER | Submit respuestas → calcula score, marca PASSED/FAILED |
| `GET` | `/v1/learning/certificates/:serialNumber` | PUBLIC | Verificación pública (NO requiere auth — para auditor STPS) |
| `GET` | `/v1/learning/certificates/:serialNumber/pdf` | PUBLIC | Descarga PDF DC-3 |
| `POST` | `/v1/learning/assignment-rules` | SUPERVISOR+ | Crea regla auto-asignación (con dry-run preview) |
| `POST` | `/v1/learning/assignment-rules/:id/dry-run` | SUPERVISOR+ | Previsualiza qué staff se afectaría (doc 03 §1.4) |
| `GET` | `/v1/learning/reports/compliance` | SUPERVISOR+ | Reporte STPS-grade: % completion per-LegalEntity per-curso |
| `GET` | `/v1/learning/reports/manager-dashboard` | SUPERVISOR+ | "Who's falling behind" list (no leaderboard público) |
| `POST` | `/v1/learning/reports/staff/:id/nudge` | SUPERVISOR+ | 1-click recordatorio individual |

### SSE events (extender `ALL_SSE_TYPES`)

```typescript
'learning:enrollment:created'
'learning:enrollment:completed'
'learning:certificate:issued'
'learning:badge:awarded'
'learning:reminder'
```

---

## 3. Integración con módulos existentes Zenix

### 3.1 Staff (apps/api/src/staff)
- `Staff.id` → `LearningEnrollment.staffId`. Sin nueva tabla User-Learner.
- Hook en `staff.service.ts` post `create/update`: dispara re-evaluación de `LearningAssignmentRule` (cron de respaldo cada hora si falla).

### 3.2 Multi-tenant (§63-§72)
- Toda query Learning pasa por `TenantContextService` — verifica scope `organizationId` + `legalEntityId` + `propertyId`.
- Reporting STPS extrae por `legalEntityId` (la razón social es la que se audita).

### 3.3 Scheduling (Sprint 8H)
- `LearningPreferences.reminderHourLocal` se sincroniza con `Shift.startTime` del staff para que el reminder llegue 10 min antes de su turno (doc 07 §9 — timing inteligente).

### 3.4 NotificationCenter (§99-§101)
- `learning:reminder` se entrega via `NotificationCenterService` con `category=LEARNING_REMINDER` (nuevo enum), nivel **2 (Notification)**, NUNCA nivel 3 (Alarm — doc 03 §6 alert fatigue).
- Auto-cleanup a 7d post-`expiresAt` (mismo patrón §101).
- Self-suppress §99 aplica (manager que envía reminder a otro staff NO se notifica a sí mismo).

### 3.5 Mobile (apps/mobile)
- Hub Recamarista (§60 D18) recibe tab nuevo "Aprendizaje" con: Continue Learning + Due Soon.
- Offline-first: lecciones HTML5+audio descargadas al abrir app con wifi → quiz attempts queued para sync.
- Push notifications con `Expo Push` (ya existente) — `category=LEARNING_REMINDER`.

### 3.6 Settings / Activate wizard (§77-§80)
- Etapa 6 "Staff" del wizard agrega toggle "Activar Zenix Learning (DLC) — curso regalo Distintivo H".
- Al marcar: aprovisiona cursos CORE, crea `LearningAssignmentRule` por defecto (all staff → curso gift), envía 1 push de bienvenida.

### 3.7 Zenix Activate health checks (§79)
- Pre-activación Learning: test que `dc3VerificationUrl` pública responde + test que `LearningCertificate.serialNumber` se genera con prefix correcto + test que push notification llega al device de staff seed.

---

## 4. Fuzzy search del catálogo (top complaint #1 doc 03 §5)

Usar PostgreSQL `pg_trgm` extension. Migration:

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX learning_course_title_trgm_idx ON "LearningCourse" USING gin (title gin_trgm_ops);
CREATE INDEX learning_course_short_description_trgm_idx ON "LearningCourse" USING gin ("shortDescription" gin_trgm_ops);
```

Query:
```typescript
const courses = await prisma.$queryRaw`
  SELECT *, similarity(title, ${q}) AS rank
  FROM "LearningCourse"
  WHERE status = 'PUBLISHED'
    AND (title % ${q} OR "shortDescription" % ${q})
  ORDER BY rank DESC
  LIMIT 20
`;
```

No usar Elasticsearch — overkill para SMB target.

---

## 4.5. Multi-tenant scope service (audit 2026-05-21)

Tras auditoría detectada en sesión 2026-05-21 contra el modelo 4-level (§63-§72) + `JwtPayload.scope` ('BRAND' | 'LEGAL_ENTITY' | 'PROPERTY'):

**Gaps cerrados con `LearningScopeService` (`apps/api/src/learning/scope/`):**

1. `enrollments.create()` ahora valida `actor.scope` cubre el `propertyId` del target staff. Antes: solo cross-org. Bug: SUPERVISOR scope=PROPERTY podía enrollar staff de OTRA property de la misma org.
2. `catalog.list()` ahora filtra por accessible properties + legal entities, no solo organizationId. Antes: cursos scoped a una property leakeaban al catálogo de otras.
3. Nuevo endpoint `GET /v1/learning/manager/enrollments` respeta scope completo para el "Manager Dashboard" del Fase 1.1 frontend. PROPERTY scope ve sólo su property; LEGAL_ENTITY ve todas las properties bajo su LegalEntity; BRAND ve todas las orgs bajo su Brand.
4. `enrollments` ahora poblan `legalEntityId` al crearse — clave para reporting compliance STPS per razón social (§64).

**Patrón de uso (todos los servicios que toquen datos cross-staff):**

```typescript
constructor(private readonly scope: LearningScopeService) {}

async someAction(actor: JwtPayload, targetStaffId: string) {
  await this.scope.assertActorCanEnrollStaff(actor, targetStaffId) // throw 403 si no
  // ... resto de la lógica
}
```

`LearningScopeService` delega a `AccessControlService` (@Global) para las queries cross-property (UNION ALL de los 3 niveles). No duplica lógica — solo aplica la decisión Learning-específica encima.

Ver doc 12 §3.2 para justificación arquitectónica completa.

---

## 5. Authorization matrix

| Acción | RECEPTIONIST | HOUSEKEEPER | SUPERVISOR | ZENIX_ADMIN |
|--------|--------------|-------------|------------|-------------|
| Browse catalog (PUBLISHED, propios) | ✅ | ✅ | ✅ | ✅ |
| Self-enroll a CORE | ✅ | ✅ | ✅ | ✅ |
| Self-enroll a PRO/MARKETPLACE | ❌ | ❌ | ✅ (approval) | ✅ |
| Take lesson + quiz | ✅ propio | ✅ propio | ✅ propio | ✅ cualquier |
| Submit assessment | ✅ propio | ✅ propio | ✅ propio | ✅ cualquier |
| View own certificate | ✅ | ✅ | ✅ | ✅ |
| Verify public certificate | ✅ public | ✅ public | ✅ public | ✅ public |
| Create assignment rule | ❌ | ❌ | ✅ (own property) | ✅ |
| Manager dashboard (lo de mi equipo) | ❌ | ❌ | ✅ | ✅ |
| Nudge a otro staff | ❌ | ❌ | ✅ | ✅ |
| Compliance report STPS | ❌ | ❌ | ✅ (own LegalEntity) | ✅ |
| Create course (CORE/PRO) | ❌ | ❌ | ❌ | ✅ (TAX_CURATOR-style role) |

---

## 6. Plan migration Fase 1 → Fase 2 (SCORM/xAPI)

`LearningLesson.type` ya tiene los enum values reservados. Para Fase 2 solo se añaden:

1. Nuevos models: `LearningScormPackage`, `LearningXapiStatement`, `LearningLrs` (Learning Record Store interno o externo)
2. Nuevo módulo `apps/api/src/learning/scorm/` con runtime SCORM 1.2/2004 (libraries open-source: `simple-scorm-player`, `pipwerks/scorm-api-wrapper`)
3. xAPI endpoint público `/v1/learning/xapi/statements` (compliant con xAPI spec 1.0.3)
4. Player Fase 2 en `apps/web/src/modules/learning/PlayerScorm.tsx` que envuelve el package en iframe + intercepta API calls

NO se migra el modelo existente — los lessons HTML5_NATIVE conviven con SCORM/xAPI en la misma tabla.

---

## 7. Riesgos arquitectónicos identificados

| Riesgo | Mitigación |
|--------|-----------|
| Tabla `LearningAttempt` crece sin bound (quiz × staff × intento) | Partitioning Postgres por mes a partir de 1M rows. Schema ya soporta. |
| Audio/video alojados en R2/S3 → costo + latencia LATAM | CDN edge (Cloudflare R2 + Vercel Image Optimization) — ya disponible. |
| PDF DC-3 generation bottleneck | Generation async via BullMQ queue (Redis ya disponible). Webhook a frontend cuando ready. |
| Conflicto multi-tenant cross-org (org A enrolla staff de org B) | Service-layer validation §35 + tests unit per acción. |
| Re-cert scheduler corre 2 veces al mismo enrollment | Lock optimista en `LearningEnrollment.expiresAt` + idempotency check. |
| Quiz cheat con dev-tools (inspeccionar respuestas en JSON) | Server-side scoring (frontend nunca recibe respuestas correctas hasta submit). |

---

## 8. Bitácora

- **2026-05-21** — Doc creado. Schema Prisma con 14 modelos + 6 enums. Endpoints REST con 14+ routes. SSE + integración con 7 módulos existentes. Fuzzy search con pg_trgm. Migration path a Fase 2 SCORM/xAPI.
