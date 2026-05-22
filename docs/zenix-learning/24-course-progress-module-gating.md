# Zenix Learning — Course Progress & Module-Gating Mechanics

> Mecánica formal de cómo el progreso del aprendiz se trackea, los módulos se desbloquean, los quizzes se aprueban y el porcentaje del curso se calcula. Documento de referencia para producto + ingeniería + reviewer experto.
> **Última actualización:** 2026-05-22 (Día 3)

---

## 0. Por qué este doc existe

Pregunta legítima del usuario 2026-05-22: *"Los cursos están segmentados por módulos, no creo que en un solo día — dependiendo del temario y complejidad — lo terminen todo en una sola sesión."*

**Confirmación:** sí, los cursos están segmentados por módulos. Esta doc formaliza la mecánica precisa para que ingeniería, contenido y producto trabajen sobre un contrato compartido — y para que el reviewer experto entienda cómo el progreso se mide y certifica.

**Principio fundacional:** un curso Zenix Learning está diseñado para sesiones de **15-45 minutos** distribuidas a lo largo de **2-6 semanas calendario**, NO para maratones de un día. Esto encaja con Knowles andragogía (adulto trabajador), Kapp microlearning 3-7 min, y Spaced Repetition Woźniak SM-2 (intervalos crecientes maximizan retención).

---

## 1. Anatomía de progreso de un curso

### 1.1 Jerarquía estructural

```
Course (24 h total · 8 módulos · ~28 lessons · 1 examen final)
  │
  └─ Module N (2-5 h · 3-5 lessons · 1 Module Quiz)
        │
        └─ Lesson M (15-90 min · contenido HTML5/audio/video/PDF · 2-3 knowledge checks)
              │
              └─ Knowledge Check (2-3 preguntas auto-evaluación, NO suman al score final)

Final Assessment (60 preguntas multiple choice + 1 caso práctico con foto-evidencia)
```

### 1.2 Las tres unidades de progreso

| Unidad | Persistencia | Score | Bloquea avance |
|--------|--------------|-------|------------------|
| **Lesson** | `LearningLessonAttempt` append-only (1 row por inicio) | Sin score formal (solo progress % de tiempo consumido + interaction events) | No bloquea; el aprendiz puede saltar lessons opcionalmente excepto si `Module.requiresAllLessons=true` |
| **Module Quiz** | `LearningQuizAttempt` append-only (1 row por intento) | Score 0-100 · aprobación ≥75% | **SÍ bloquea** acceso al siguiente módulo |
| **Final Assessment** | `LearningQuizAttempt` con `kind=FINAL` | Score 0-100 · aprobación ≥80% global + ≥100% en ítems críticos | Desbloquea **emisión de certificado** |

---

## 2. Cálculo del porcentaje de avance del curso

### 2.1 Fórmula canónica

```
Course.progressPercent = ROUND(
  ( SUM(weightOfCompletedModules) / SUM(weightOfAllModules) ) × 100
)
```

**Default weight por módulo:** `1.0` (todos pesan igual) → para curso de 8 módulos, cada uno aporta `12.5%`.

**Weight custom (override per módulo):** opcional, para casos donde un módulo es más extenso (ej: Módulo 3 con 5 lessons + Game A). Default sigue siendo 1.0 hasta que reviewer experto justifique override en `Module.weight`.

### 2.2 Ejemplo Curso 1 — Distintivo H + NOM-035

| Módulo | Lessons | Horas | Weight | % al aprobar Module Quiz |
|--------|---------|-------|--------|---------------------------|
| 1. Marco normativo | 3 | 2 | 1.0 | **12.5%** |
| 2. Zona de peligro + ETAs | 4 | 3 | 1.0 | **25.0%** (acumulado) |
| 3. 11 áreas + 28 puntos críticos (+ 🎮 Game A capstone) | 5 | 5 | 1.0 | **37.5%** |
| 4. Higiene del manipulador | 3 | 2 | 1.0 | **50.0%** |
| 5. Limpieza vs desinfección + códigos | 4 | 3 | 1.0 | **62.5%** |
| 6. Marco NOM-035 + 5 factores psicosociales | 3 | 3 | 1.0 | **75.0%** |
| 7. Guías Referencia I/II/III | 3 | 3 | 1.0 | **87.5%** |
| 8. Política + evidencia + plan de acción | 3 | 3 | 1.0 | **100%** + unlock examen final |
| **Examen Final + caso práctico** | — | 1 | — | Emisión de certificado |

**Nota:** el porcentaje SE COMPLETA al aprobar el **Module Quiz** del módulo, NO al ver la última lesson. Esta es decisión deliberada — protege contra "skip lessons + aprobar quiz por suerte" y garantiza retention measurable.

### 2.3 Progress per lesson dentro del módulo (sub-medida)

Mientras el aprendiz está dentro de un módulo, el sistema muestra **dos barras de progreso**:

```
Curso total: ████░░░░░░░░░░░░ 25%  (Módulo 3 de 8)
Módulo actual: ███████░░░ 70%  (lesson 4 de 5)
```

La barra del curso solo avanza al cerrar el módulo con quiz aprobado. La barra del módulo avanza por lesson completada.

---

## 3. Module Quiz — mecánica y reglas

### 3.1 Composición

- **Preguntas por quiz:** 8-12 preguntas multiple choice
- **Origen:** drawn aleatoriamente del `LearningQuestionBank` del módulo (ratio anti-cheat 3× — banco tiene ≥30 preguntas por módulo)
- **Tiempo límite:** opcional per módulo (default sin límite Fase 1.3; con límite en Fase 1.4 para games)
- **Score mínimo aprobación:** 75% (configurable per módulo en `Module.passingScore`)
- **Feedback:** al submit, muestra score + breakdown por pregunta + explicación citada con fuente oficial (incluso para respuestas correctas — refuerzo educativo)

### 3.2 Política de re-takes

| Intento | Espera previa | Condiciones | Acción si falla |
|---------|----------------|--------------|------------------|
| **1° intento** | Ninguna | Aprobó todas las lessons del módulo | Si falla → permite 2° intento tras 24h |
| **2° intento** | 24 horas | Posterior al fallo del 1° | Si falla → exige re-revisar lessons del módulo (LearningLessonAttempt nuevo) + esperar 48h |
| **3° intento** | 48 horas | Posterior a re-revisar lessons | Si falla → activa **flujo de soporte:** SSE alerta a Manager para coaching 1-on-1 antes de un 4° intento |

**Política anti-frustración:** si un aprendiz falla 3 veces el mismo Module Quiz, **NO bloquea su carrera laboral indefinidamente**. El Manager Dashboard activa un flag "necesita coaching" — el supervisor puede tener una sesión presencial con el aprendiz, revisar conceptos confusos, y el sistema permite continuar con apoyo humano. **Pattern Knowles andragogía — adulto + workplace = soporte, no castigo.**

### 3.3 Posibilidad de "salto sin quiz"

**Por default: NO.** Para avanzar al Módulo N+1, debes aprobar Module Quiz N.

**Excepción:** modo "Recertificación rápida" (Fase 2 v1.1+) — para aprendices que ya completaron el curso el año previo (vigencia Distintivo H = 1 año), pueden tomar directamente el Module Quiz sin re-ver lessons. Si lo aprueban: el módulo se marca completed. Si no: re-flow normal del módulo.

---

## 4. Examen Final — desbloqueo del certificado

### 4.1 Pre-requisito

Todos los Module Quizzes aprobados (porcentaje del curso = 100%).

### 4.2 Composición

- **60 preguntas multiple choice:** 40 Distintivo H + 20 NOM-035 (composición específica del Curso 1)
- **1 caso práctico:** auditoría simulada con foto-evidencia (sube foto del manipulador o del área a evaluar)
- **Tiempo:** 90 minutos sin pausa (anti-cheating ligero)
- **Score mínimo aprobación:** 80% global + **100% en los ítems críticos** del Distintivo H

### 4.3 Reglas anti-cheating ligeras (Fase 1.3)

- Foto del rostro al iniciar el examen (registro, eliminable per GDPR a solicitud)
- Detección de focus-leave del browser (registro, no penalización — solo señal forense)
- Preguntas aleatorias del banco (cada candidato recibe permutación distinta)

### 4.4 Re-takes del examen final

| Intento | Espera | Acción si falla |
|---------|--------|-------------------|
| **1° intento** | — | Si falla → 7 días espera para 2° |
| **2° intento** | 7 días | Si falla → 14 días + recomendación re-revisar 3 módulos peor calificados |
| **3° intento** | 14 días | Si falla → re-tomar el curso completo desde Módulo 1 (recursos Knowles + protección reputación del distintivo) |

### 4.5 Emisión del certificado

Al aprobar el examen final:
1. `LearningCertificate` row creada (append-only, §95 paridad)
2. PDF co-branded generado on-demand (Hotel logo + Zenix Learning logo)
3. QR público verificable en `/verify/cert/:id` con HMAC firmado
4. Notif push al aprendiz: "¡Felicidades, tu certificado está listo!"
5. Notif push al supervisor (sin métricas comparativas públicas)
6. Microinteracción PixiJS confetti al revelar el certificado (Atomic Habits "habit tracker satisfaction")

---

## 5. UX del learner — wireframes texto

### 5.1 Vista del curso (entry point)

```
┌─────────────────────────────────────────────────────────────┐
│  📚 Distintivo H + NOM-035-STPS                    ▣ Pausar│
│  ───────────────────────────────────────────────────────────│
│  Tu progreso: ████░░░░░░░░░░░░ 25%  (Módulo 2 de 8)        │
│  Tiempo estimado restante: 18h 30min                        │
│                                                             │
│  ▼ Continuar donde te quedaste:                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Módulo 3 · Lesson 3.2                               │    │
│  │ Áreas 1-3: Recepción / Almacenamiento / Químicos    │    │
│  │ Faltan ~45 min para terminar la lesson              │    │
│  │                              [ Continuar lección → ]│    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ▼ Todos los módulos:                                       │
│  ✅ Módulo 1 · Marco normativo Distintivo H          12.5%  │
│  ✅ Módulo 2 · Zona de peligro + ETAs                12.5%  │
│  ▶  Módulo 3 · 11 áreas + 28 puntos críticos         🎮     │
│  🔒 Módulo 4 · Higiene del manipulador                       │
│  🔒 Módulo 5 · Limpieza vs desinfección                      │
│  🔒 Módulo 6 · Marco NOM-035                                 │
│  🔒 Módulo 7 · Guías Referencia I/II/III                     │
│  🔒 Módulo 8 · Política + plan de acción                     │
│  🔒 Examen Final + caso práctico → Certificado              │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 Vista dentro de una lesson

```
┌─────────────────────────────────────────────────────────────┐
│  ← Volver al curso        Módulo 3 · Lesson 3.2     ▣ Pausar│
│  ───────────────────────────────────────────────────────────│
│  Curso total:   ████░░░░░░░░░░░░ 25%                       │
│  Módulo actual: ███████░░░ 70%  (lesson 4 de 5)            │
│                                                             │
│  [ Contenido de la lesson aquí — texto, audio, video ]      │
│                                                             │
│  ───────────────────────────────────────────────────────────│
│  [ ← Lesson anterior ]                  [ Siguiente → ]     │
└─────────────────────────────────────────────────────────────┘
```

### 5.3 Vista del Module Quiz

```
┌─────────────────────────────────────────────────────────────┐
│  🎯 Módulo 2 · Quiz Final          Intento 1 de 3 disponibles│
│  ───────────────────────────────────────────────────────────│
│  10 preguntas · sin tiempo límite · aprobación ≥75%         │
│                                                             │
│  Pregunta 3 de 10:                                          │
│  La regla 4-60°C de zona de peligro se basa en:             │
│                                                             │
│  ◯ Una recomendación arbitraria del Distintivo H            │
│  ◯ Datos epidemiológicos confirmados por HACCP, Codex...    │
│  ◯ Una tradición de la cocina francesa                      │
│  ◯ Solo aplica en climas tropicales como LATAM              │
│                                                             │
│                          [ Pregunta anterior ] [ Siguiente ]│
└─────────────────────────────────────────────────────────────┘
```

### 5.4 Resultado del Module Quiz aprobado

```
┌─────────────────────────────────────────────────────────────┐
│                       🎉                                     │
│             ¡Aprobaste el Módulo 2!                          │
│                                                             │
│  Score: 87 / 100 (mínimo 75)                                │
│  Tiempo: 14 min                                             │
│                                                             │
│  Tu progreso del curso: 12.5% → 25%  ▲                     │
│                                                             │
│         [ Repasar tus respuestas ]  [ Continuar al Módulo 3 → ]│
└─────────────────────────────────────────────────────────────┘
```

### 5.5 Resultado del Module Quiz fallado

```
┌─────────────────────────────────────────────────────────────┐
│                       📚                                     │
│             Casi lo logras — sigamos                         │
│                                                             │
│  Score: 65 / 100 (mínimo 75)                                │
│                                                             │
│  No es el final del camino. Repasa los conceptos que más    │
│  te dieron problema:                                        │
│  • Listeria y por qué se multiplica a 4°C                  │
│  • Toxinas termorresistentes de S. aureus                  │
│  • Periodo de incubación de Campylobacter                  │
│                                                             │
│  Puedes intentar de nuevo en 24 horas.                      │
│                                                             │
│         [ Repasar Módulo 2 ]   [ Recordarme en 24h ]        │
└─────────────────────────────────────────────────────────────┘
```

**Tono pedagógico no negociable:** el feedback de fallo NUNCA es punitivo ("perdiste", "incorrecto", "fail"). SIEMPRE es educativo ("repasa", "sigamos", "casi lo logras"). Pattern Knowles + Csikszentmihalyi flow recovery + Bandura self-efficacy preservation.

---

## 6. Mapping al schema Prisma existente (doc 04)

### 6.1 Modelos involucrados

```prisma
model LearningCourse {
  id                String   @id
  slug              String   @unique
  passingScore      Decimal  @default(0.80)  // % aprobación examen final
  // ... otros campos existentes
}

model LearningCourseVersion {
  id                String   @id
  courseId          String
  version           String   // "2026.05.1"
  modules           LearningModule[]
  finalExamId       String?  // FK al quiz del examen final
}

model LearningModule {
  id                String   @id
  courseVersionId   String
  orderIndex        Int
  title             String
  estimatedMinutes  Int
  weight            Decimal  @default(1.0)   // peso del módulo en cálculo de %
  passingScore      Decimal  @default(0.75)  // % aprobación module quiz
  requiresAllLessons Boolean @default(false) // si true, bloquea quiz hasta completar todas las lessons
  moduleQuizId      String?  // FK al quiz del módulo
  lessons           LearningLesson[]
}

model LearningQuiz {
  id                String   @id
  kind              QuizKind // MODULE | FINAL
  moduleId          String?  // si kind=MODULE
  courseVersionId   String?  // si kind=FINAL
  questionsPerAttempt Int    @default(10)
  timeLimit         Int?     // segundos, null = sin límite
}

model LearningQuizAttempt {  // append-only §95 paridad
  id                String   @id
  enrollmentId      String
  quizId            String
  startedAt         DateTime
  submittedAt       DateTime?
  score             Decimal?
  passed            Boolean?
  answersJson       Json
  attemptNumber     Int      // 1, 2, 3...
  // ... otros campos
}

model LearningEnrollment {
  id                String   @id
  staffId           String
  courseVersionId   String
  status            LearningEnrollmentStatus  // NOT_STARTED | IN_PROGRESS | COMPLETED | FAILED | EXPIRED
  startedAt         DateTime?
  completedAt       DateTime?
  progressPercent   Decimal  @default(0)  // recalculado tras cada module quiz aprobado
  currentModuleId   String?  // dónde está el aprendiz actualmente
  currentLessonId   String?  // resume-where-left-off
}
```

### 6.2 Servicio que recalcula progress

```typescript
// apps/api/src/learning/services/progress.service.ts

@Injectable()
export class LearningProgressService {
  async onModuleQuizPassed(attemptId: string): Promise<void> {
    const attempt = await this.prisma.learningQuizAttempt.findUnique({
      where: { id: attemptId },
      include: { quiz: { include: { module: true } }, enrollment: true }
    });
    
    if (!attempt.passed || attempt.quiz.kind !== 'MODULE') return;
    
    const enrollmentId = attempt.enrollmentId;
    const courseVersionId = attempt.enrollment.courseVersionId;
    
    // Recalcular progressPercent
    const allModules = await this.prisma.learningModule.findMany({
      where: { courseVersionId },
      orderBy: { orderIndex: 'asc' }
    });
    
    const passedQuizAttempts = await this.prisma.learningQuizAttempt.findMany({
      where: {
        enrollmentId,
        passed: true,
        quiz: { kind: 'MODULE' }
      },
      distinct: ['quizId']
    });
    
    const passedModuleIds = new Set(
      passedQuizAttempts.map(a => a.quiz.moduleId)
    );
    
    const totalWeight = allModules.reduce((sum, m) => sum + Number(m.weight), 0);
    const passedWeight = allModules
      .filter(m => passedModuleIds.has(m.id))
      .reduce((sum, m) => sum + Number(m.weight), 0);
    
    const progressPercent = (passedWeight / totalWeight) * 100;
    
    await this.prisma.learningEnrollment.update({
      where: { id: enrollmentId },
      data: { progressPercent }
    });
    
    // Si 100% y existe examen final → unlock
    if (progressPercent === 100) {
      await this.emitEvent('learning:final-exam-unlocked', { enrollmentId });
    }
  }
}
```

### 6.3 Endpoint para el frontend

```typescript
// GET /v1/learning/enrollments/:id/state

interface CourseStateResponse {
  enrollmentId: string;
  courseTitle: string;
  progressPercent: number;
  currentModule: {
    id: string;
    title: string;
    orderIndex: number;
    lessonsTotal: number;
    lessonsCompleted: number;
    quizStatus: 'NOT_TAKEN' | 'PASSED' | 'FAILED_AVAILABLE_RETRY' | 'LOCKED_AWAITING_COOLDOWN';
    nextRetryAvailableAt?: string;
  };
  modules: Array<{
    id: string;
    title: string;
    orderIndex: number;
    status: 'COMPLETED' | 'IN_PROGRESS' | 'LOCKED';
    weightPercent: number;
  }>;
  finalExamUnlocked: boolean;
  certificateIssued: boolean;
  certificateUrl?: string;
  resumeAt: { moduleId: string; lessonId: string };
}
```

---

## 7. Decisiones derivadas (numeración reservada para CLAUDE.md)

> Para registrar como §134-§137 al cerrar sprint LEARNING-CORE.

- **§ — Module-gating obligatorio.** Para avanzar al Módulo N+1, el aprendiz debe aprobar Module Quiz N. Sin excepción salvo modo "Recertificación rápida" (Fase 2).
- **§ — Progress = % de módulos aprobados, no de lessons vistas.** El porcentaje del curso refleja módulos APROBADOS via quiz, no lessons abiertas. Esto protege contra skip-and-skim.
- **§ — Política de re-takes de 3 intentos con espera escalonada (24h / 48h / coaching) — anti-frustración.** El aprendiz que falla 3 veces NO se bloquea — activa flujo de coaching humano del supervisor. Patrón Knowles + Bandura self-efficacy.
- **§ — Feedback de fallo SIEMPRE educativo, NUNCA punitivo.** Sin "perdiste", "incorrecto", "fail". Siempre "repasa", "sigamos", "casi lo logras". Patrón Csikszentmihalyi flow recovery.
- **§ — Examen final separado del último Module Quiz.** Al aprobar 100% de módulos, se desbloquea el examen final (60 preguntas + caso práctico). Solo el examen final emite certificado, NO el Module Quiz 8.

---

## 8. Bibliografía verificable

- **Knowles, M. (1973).** *The Adult Learner: A Neglected Species.* Gulf Publishing. (Adulto trabajador, autoconcepto, motivación intrínseca)
- **Kapp, K. M. (2012).** *The Gamification of Learning and Instruction.* Pfeiffer. (Microlearning 3-7 min)
- **Woźniak, P. A. (1995).** "Optimization of repetition spacing in the course of learning." (SuperMemo SM-2)
- **Bandura, A. (1977).** *Social Learning Theory.* Prentice Hall. (Self-efficacy preservation tras fallo)
- **Csikszentmihalyi, M. (1990).** *Flow.* Harper & Row. (Flow recovery + challenge-skill balance)
- **Sweller, J. (1988).** "Cognitive load during problem solving." *Cognitive Science.* (Carga cognitiva por sesiones cortas)
- **Anderson, L. W., & Krathwohl, D. R. (2001).** *A Taxonomy for Learning.* (Bloom revisada — escalado por módulo)

---

## Bitácora

- **2026-05-22** (Día 3 PM) — Doc creado tras pregunta del usuario sobre segmentación de cursos por módulos. Formaliza mecánica de progreso modular + gating + re-takes + UX wireframes + mapping al schema Prisma existente + servicio recalcula progressPercent + endpoint state del frontend. Decisiones §134-§137 reservadas en CLAUDE.md.
