# Curso 1 — Examen Final + Caso práctico (especificación)

> Especificación técnica del examen final del Curso 1 Distintivo H + NOM-035 + caso práctico de auditoría con foto-evidencia. Sirve como contrato entre contenido (question bank) + engine (QuizEngine + CaseStudyEngine) + UX (player).
> **Última actualización:** 2026-05-22 (Día 6 producción Fase 1.3)

---

## 0. Identidad del examen final

| Campo | Valor |
|-------|-------|
| **Curso parent** | Curso 1 — Distintivo H + NOM-035 |
| **Tipo** | `LearningQuiz.kind = FINAL` |
| **Pre-requisito** | Aprobar Module Quizzes 1-8 (100% módulos completados) |
| **Composición** | 60 preguntas multiple choice + 1 caso práctico con foto-evidencia |
| **Tiempo límite** | 90 minutos (1.5 minutos por pregunta promedio + 30 min para caso práctico) |
| **Score mínimo aprobación** | ≥80% global (48/60 preguntas correctas mínimo) **+ 100% en ítems críticos** |
| **Re-takes permitidos** | 3 intentos con espera 7d → 14d → re-tomar curso completo |
| **Banco origen** | **300 preguntas** (`question-bank.md`) — selección aleatoria 60 (ratio 5× alineado a ServSafe Manager) |

---

## 1. Composición del examen — distribución por módulo

| Módulo | Preguntas en banco | Preguntas en examen | % del examen | Críticas mínimas |
|--------|---------------------|---------------------|----------------|------------------|
| **M1** Marco normativo DH | 25 | 5 | 8.3% | 2 |
| **M2** Zona de peligro + 5 ETAs | 40 | 8 | 13.3% | 3 |
| **M3** 11 áreas + 28 puntos críticos | 50 | 12 | 20.0% | 5 |
| **M4** Higiene del manipulador | 35 | 7 | 11.7% | 3 |
| **M5** Limpieza/desinfección/códigos | 50 | 8 | 13.3% | 3 |
| **M6** NOM-035 marco + 5 factores | 40 | 8 | 13.3% | 3 |
| **M7** Guías Referencia I/II/III | 25 | 5 | 8.3% | 2 |
| **M8** Política + plan + protocolo | 35 | 7 | 11.7% | 3 |
| **TOTAL** | **300** | **60** | **100%** | **24 ítems críticos** |

**Ratio anti-cheat:** **5×** sobre las 60 preguntas del examen (alineado a ServSafe Manager + ABMP CMTBC standards). Cada candidato recibe permutación única + 1.7% probabilidad de repetición entre intentos consecutivos.

**Distribución 40 Distintivo H + 20 NOM-035:**
- Distintivo H (M1-M5): **40 preguntas** (66.7% del examen, refleja peso curricular)
- NOM-035 (M6-M8): **20 preguntas** (33.3% del examen)

### 1.1 Algoritmo de selección aleatoria

```typescript
// apps/api/src/learning/services/quiz-builder.service.ts

interface QuizSelectionConfig {
  totalQuestions: 60;
  minCriticalQuestions: 24;
  distribution: {
    moduleId: string;
    count: number;
    minCritical: number;
  }[];
}

async function buildFinalExam(courseVersionId: string): Promise<Question[]> {
  const config = await getQuizConfig(courseVersionId);
  const selectedQuestions: Question[] = [];
  
  for (const moduleConfig of config.distribution) {
    const moduleBank = await getQuestionsForModule(moduleConfig.moduleId);
    
    // Asegura mínimo de críticas por módulo
    const criticalsInModule = moduleBank.filter(q => q.isCritical);
    const minorsInModule = moduleBank.filter(q => !q.isCritical);
    
    const selectedCriticals = shuffleAndPick(criticalsInModule, moduleConfig.minCritical);
    const remainingNeeded = moduleConfig.count - moduleConfig.minCritical;
    const selectedMinors = shuffleAndPick(minorsInModule, remainingNeeded);
    
    selectedQuestions.push(...selectedCriticals, ...selectedMinors);
  }
  
  // Aleatoriza orden final + valida total = 60
  return shuffle(selectedQuestions);
}
```

---

## 2. Reglas de aprobación

### 2.1 Cálculo del score

```
Score global = (preguntas_correctas / 60) × 100
Score críticos = (críticos_correctos / 24) × 100

Aprobado si:
  Score global ≥ 80%
  Y
  Score críticos = 100% (los 24 críticos correctos sin excepción)
```

### 2.2 Casos de fallo

| Caso | Score global | Score críticos | Resultado |
|------|--------------|------------------|-----------|
| Excelente | ≥90% | 100% | **Aprobado con honores** (certificado con distinción) |
| Aprobado | 80-89% | 100% | **Aprobado** (certificado estándar) |
| Falló por críticos | ≥80% | <100% | **Falló** — explicación específica: "Tu score global es bueno, pero fallaste X ítems críticos. Los críticos no admiten error porque representan puntos eliminatorios del estándar Distintivo H." |
| Falló por score | <80% | cualquiera | **Falló** — explicación: "Tu score global está por debajo del mínimo (80%). Revisa los módulos donde tuviste mayor dificultad." |

### 2.3 Política de re-takes

| Intento | Espera previa | Acción si falla | Acción si aprueba |
|---------|----------------|------------------|-------------------|
| 1° | Ninguna | Espera 7 días + recomendación re-revisar 3 módulos peor calificados | Certificado emitido |
| 2° | 7 días | Espera 14 días + recomendación re-revisar módulos | Certificado emitido |
| 3° | 14 días | Re-tomar curso completo desde Módulo 1 | Certificado emitido |
| 4°+ | Solo después de re-tomar curso completo | — | — |

---

## 3. Anti-cheating ligero (Fase 1.3)

> **Nota arquitectónica:** la permutación aleatoria de preguntas + opciones es **estándar universal del engine LMS Zenix** (`QuizRandomizerService`), NO una feature específica de este examen final. Aplica a TODOS los quizzes del LMS: Module Quizzes, exámenes finales, knowledge checks, mini-quizzes dentro de games. Ver [doc 21 §1.1.bis Quiz Randomization Standard](../../21-lms-architecture-content-separation.md#11bis-quiz-randomization-standard).

### 3.1 Mecanismos implementados

| Mecanismo | Implementación | Justificación |
|-----------|----------------|----------------|
| **Foto del rostro al iniciar** | Webcam captura imagen al inicio del examen | Identificación del usuario. Eliminable per GDPR a solicitud. |
| **Permutación aleatoria de preguntas** (universal) | `QuizRandomizerService.randomize()` — Fisher-Yates con seed determinístico por `attemptId` | Estándar del engine, aplica a TODOS los quizzes del LMS. Sin excepción. |
| **Permutación aleatoria de opciones a/b/c/d** (universal) | Idem — barajea opciones por pregunta. Server valida por `option.id`, NO por letra mostrada | Previene memorización por letra ("la respuesta es siempre c"). Estándar engine. |
| **Selección aleatoria del banco** | 60 preguntas de banco 180, balanceando críticas/menores por módulo | Específico de exámenes que extraen de banco más grande |
| **Detección de focus-leave** | Si el browser pierde focus >5 seg, se registra en interactionLog | Señal forense, NO penalización automática |
| **Time tracking** | Tiempo por pregunta + tiempo total | Detección de respuestas demasiado rápidas (<2 seg sugiere conocimiento previo del banco) |
| **Sin retroceder** | Una vez respondida, NO se puede modificar respuesta | Previene búsqueda externa entre preguntas |
| **Sin notas/tabs abiertos** | Mensaje al inicio + verificación al envío | Disciplina del usuario, no enforcement técnico |

### 3.2 Mecanismos NO implementados Fase 1.3

- ❌ Proctoring profesional con cámara continua (intrusivo, Fase 2+ si requiere mercado)
- ❌ Bloqueo de pantalla completa forzado (mala UX, problemas accesibilidad)
- ❌ Detección de IA / ChatGPT en respuestas (irrelevante en multiple choice)
- ❌ Lock-down browser (over-engineering para Fase 1.3)

---

## 4. UX del examen final

### 4.1 Pantalla de inicio

```
┌─────────────────────────────────────────────────────────────┐
│  🏆 EXAMEN FINAL — Curso Distintivo H + NOM-035-STPS         │
│  ───────────────────────────────────────────────────────────│
│                                                             │
│  Antes de empezar:                                          │
│  ✓ 60 preguntas multiple choice (40 DH + 20 NOM-035)       │
│  ✓ 1 caso práctico con foto-evidencia                      │
│  ✓ Tiempo límite: 90 minutos                                │
│  ✓ Aprobación: ≥80% global + 100% en ítems críticos        │
│  ✓ Una vez respondida, NO podrás modificar la respuesta     │
│  ✓ Tu webcam capturará tu rostro al iniciar (privacidad     │
│     según GDPR/LFPDPPP, eliminable a solicitud)             │
│                                                             │
│  Tienes 3 intentos disponibles. Este es el intento 1.       │
│                                                             │
│  ¿Tu entorno está listo?                                    │
│  □ Estoy en lugar tranquilo sin interrupciones             │
│  □ Tengo 90 minutos disponibles sin compromisos             │
│  □ Mi webcam funciona correctamente                         │
│  □ Entiendo las reglas de aprobación                        │
│                                                             │
│  [ Cancelar y volver más tarde ]   [ Iniciar examen → ]    │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Pantalla de pregunta

```
┌─────────────────────────────────────────────────────────────┐
│  ⏱  87:23 restantes                       Pregunta 12 de 60 │
│  ───────────────────────────────────────────────────────────│
│                                                             │
│  Tu trabajo es en recepción. Recibes pescado a 12°C.       │
│  ¿Procedimiento correcto?                                   │
│                                                             │
│  ◯ a) Aceptarla y meterla rápido al refrigerador           │
│  ◯ b) Rechazarla, documentar el rechazo con foto,          │
│       notificar al proveedor y al chef ejecutivo            │
│  ◯ c) Aceptarla si el proveedor es confiable               │
│  ◯ d) Cocinarla inmediatamente para "destruir" bacterias   │
│                                                             │
│  ───────────────────────────────────────────────────────────│
│                                       [ Confirmar respuesta ]│
└─────────────────────────────────────────────────────────────┘
```

### 4.3 Pantalla de resultados aprobado

```
┌─────────────────────────────────────────────────────────────┐
│                       🎉                                     │
│         ¡APROBASTE el Curso Distintivo H + NOM-035!         │
│                                                             │
│  Score global:     54/60 (90%)                              │
│  Score críticos:   24/24 (100%) ✓                          │
│  Tiempo:           73 minutos                               │
│                                                             │
│  Tu certificado:                                            │
│  ID: ZL-DH-2026-A8F4-9D2E                                  │
│  Verificable en: zenix.com/verify/cert/ZL-DH-2026-A8F4-9D2E│
│                                                             │
│  [ Descargar PDF ]   [ Compartir en LinkedIn ]              │
│                                                             │
│  Próximo paso recomendado:                                  │
│  → Curso Front Office Excellence (AHLEI CFDR-aligned)       │
└─────────────────────────────────────────────────────────────┘
```

### 4.4 Pantalla de resultados fallado

```
┌─────────────────────────────────────────────────────────────┐
│                       📚                                     │
│       No aprobaste — pero sigamos. Puedes intentar          │
│                de nuevo en 7 días.                          │
│                                                             │
│  Score global:     42/60 (70%)  ← debajo de 80%             │
│  Score críticos:   22/24 (91.7%) ← debajo de 100%          │
│  Tiempo:           67 minutos                               │
│                                                             │
│  Lo que más te conviene repasar:                            │
│  → Módulo 5 (Limpieza/desinfección) — 3 errores            │
│  → Módulo 6 (NOM-035 marco) — 2 errores                    │
│  → Módulo 8 (Política + protocolo) — 2 errores             │
│                                                             │
│  Próximo intento disponible: 29 mayo 2026                   │
│                                                             │
│  [ Repasar módulos sugeridos ]   [ Recordarme en 7d ]      │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. Caso práctico — Auditoría simulada con foto-evidencia

### 5.1 Concepto

El caso práctico es el **complemento experiencial** del examen multiple choice. El aprendiz recibe un escenario simulado de auditoría sorpresa en un hotel ficticio + un set de **5 fotos** (alimentos, equipo, áreas, personal, documentos) que debe analizar y reportar.

**Por qué este formato:**
- Multiple choice mide **conocimiento** (Bloom: RECORDAR + COMPRENDER + APLICAR)
- Caso práctico mide **análisis + evaluación** (Bloom: ANALIZAR + EVALUAR + CREAR)
- La combinación cubre los 6 niveles de Bloom = aprendizaje completo

### 5.2 Estructura del caso práctico

```
ESCENARIO:
"Eres el Chef Ejecutivo del Hotel Sol y Mar, hostal boutique de 18 habitaciones
en Playa del Carmen. SECTUR realizará auditoría sorpresa MAÑANA para tu
solicitud de Distintivo H. Esta noche realizas una inspección preliminar y
documentas con fotos lo que encuentras. Necesitas determinar qué problemas hay
y proponer acción correctiva inmediata."

5 FOTOS A ANALIZAR:
1. Foto cocina: caja de pescado en el suelo + termómetro recepción en cajón
2. Foto refrigerador: pollo crudo sobre verduras, hielo acumulado puerta
3. Foto bar: cubeta de hielo sin pala, frutas cortadas en tabla genérica blanca
4. Foto MSDS de químicos: solo en inglés, sin sección 10
5. Foto bitácora de capacitación: tres firmas con misma caligrafía, fecha
   ayer (1 día antes de auditoría)
```

### 5.3 Preguntas del caso práctico

```
Para CADA foto:
1. ¿Qué punto crítico de la NMX-F-605 está incumplido? (cita específica)
2. ¿Qué consecuencia tendría si la UV lo detecta? (sanción + impacto)
3. ¿Cuál es tu acción correctiva inmediata? (qué + cómo + responsable + plazo)

Pregunta final integradora:
4. ¿Estás listo para la auditoría mañana o debes posponerla?
   Justifica tu decisión con criterios verificables.
```

### 5.4 Rúbrica de evaluación

| Criterio | Excelente (4) | Bueno (3) | Aceptable (2) | Insuficiente (1) |
|----------|----------------|------------|----------------|--------------------|
| **Identificación de incumplimientos** | Identifica los 5 con cita específica del estándar | Identifica 4-5 con cita | Identifica 3-4 sin cita específica | Identifica <3 |
| **Conocimiento de consecuencias** | Cita sanción específica + impacto + caso documentado | Sanción general + impacto | Mención de sanción sin especificar | No menciona consecuencias |
| **Acción correctiva** | Acción específica + responsable + plazo + criterio de éxito | Acción + responsable + plazo | Acción + responsable | Acción genérica |
| **Decisión integradora** | Decisión razonada con criterios verificables + justifica | Decisión razonada | Decisión sin justificación clara | Sin decisión clara |

**Score caso práctico:** suma de los 4 criterios × 5 fotos = 80 puntos máximo
**Aprobación caso práctico:** ≥60 puntos (75%)

### 5.5 Score combinado examen final + caso práctico

```
Score final = (Score multiple choice × 0.7) + (Score caso práctico normalizado × 0.3)

Donde:
  Score multiple choice = (correctas/60) × 100
  Score caso práctico normalizado = (puntos_obtenidos/80) × 100

Aprobación final:
  Score final ≥ 80
  Y
  Score críticos multiple choice = 100%
  Y
  Score caso práctico ≥ 60/80 (75%)
```

### 5.6 UX del caso práctico

```
┌─────────────────────────────────────────────────────────────┐
│  Caso práctico — Foto 1 de 5                  ⏱ 27:14 rest.│
│  ───────────────────────────────────────────────────────────│
│                                                             │
│  [ FOTO: cocina con caja de pescado en piso +              │
│    termómetro en cajón ]                                    │
│                                                             │
│  Analiza esta foto. Responde las 3 preguntas:               │
│                                                             │
│  1. ¿Qué punto crítico NMX-F-605 está incumplido?           │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ [textarea]                                          │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  2. ¿Qué consecuencia si la UV lo detecta?                  │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ [textarea]                                          │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  3. ¿Acción correctiva inmediata?                           │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ [textarea]                                          │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│              [ Foto anterior ]   [ Siguiente foto → ]       │
└─────────────────────────────────────────────────────────────┘
```

### 5.7 Evaluación del caso práctico

**Fase 1.3 (sprint actual):** evaluación **manual** por reviewer experto. El responsable de Tax Curator equivalente (consultor SECTUR contratado periódicamente) revisa las respuestas + asigna puntos por criterio.

**Fase 1.4-INTERLUDIO:** evaluación **asistida por IA** + revisor manual. GPT-4 / Claude Sonnet evalúa respuestas contra rúbrica + el reviewer confirma o ajusta.

**Fase 2+:** evaluación **fully automated** con IA fine-tuned en respuestas del banco. Reviewer interviene solo en casos límite (score 55-70).

---

## 6. Mapping al schema Prisma

### 6.1 Modelos involucrados

```prisma
model LearningQuiz {
  id                  String   @id @default(cuid())
  kind                QuizKind // MODULE | FINAL
  courseVersionId     String?  // populated si kind=FINAL
  moduleId            String?  // populated si kind=MODULE
  questionsPerAttempt Int      @default(60)
  timeLimit           Int?     // 5400 (90 min) para FINAL
  passingScore        Decimal  @default(0.80) // 80% para FINAL
  hasCaseStudy        Boolean  @default(false)
  caseStudyId         String?  // FK opcional a LearningCaseStudy
}

model LearningCaseStudy {
  id                  String   @id @default(cuid())
  courseVersionId     String
  scenario            String   @db.Text
  fotos               Json     // array de { url, descripcionAlt, criteriosEvaluacion }
  preguntas           Json     // array de { id, texto, criteriosEvaluacion }
  rubricaJson         Json     // rúbrica de evaluación
  scoreMaximo         Int      @default(80)
  scoreMinimoAprobar  Int      @default(60)
}

model LearningQuizAttempt {
  id                  String   @id @default(cuid())
  enrollmentId        String
  quizId              String
  attemptNumber       Int
  startedAt           DateTime
  submittedAt         DateTime?
  score               Decimal?
  scoreCriticos       Decimal? // % de críticos correctos
  scoreMultipleChoice Decimal? // si tiene caseStudy
  scoreCaseStudy      Decimal? // si tiene caseStudy
  passed              Boolean?
  answersJson         Json
  caseStudyAnswers    Json?    // respuestas al caso práctico
  interactionLog      Json     // focus-leave events, time per question
  webcamSnapshotUrl   String?  // foto inicio examen, eliminable GDPR
  // ... otros campos
}
```

---

## 7. Implementación técnica — Fase 1.3 vs Fase 1.4+

### 7.1 Fase 1.3 (sprint actual)

**Componentes a implementar (4 días estimados):**

| Componente | Esfuerzo | Owner |
|------------|----------|--------|
| Seed Prisma question bank (180 preguntas) | 0.5 día | Backend |
| QuizBuilderService.buildFinalExam | 0.5 día | Backend |
| CaseStudyEvaluatorService (manual hooks) | 0.5 día | Backend |
| FinalExamPlayer.tsx (UX completo) | 1.5 días | Frontend |
| CaseStudyPlayer.tsx + foto display | 1 día | Frontend |
| Telemetry PostHog del examen | 0.5 día | Frontend + Backend |
| Tests integración | 0.5 día | QA |

### 7.2 Fase 1.4-INTERLUDIO (post Fase 1.3)

- AI-assisted case study evaluation (GPT-4 / Claude Sonnet)
- Confetti PixiJS en pantalla aprobado
- Webcam snapshot integration con tracking GDPR

### 7.3 Fase 2+ (v1.1+)

- Proctoring profesional opcional para clientes enterprise
- Multi-language (EN/PT-BR) preserving banco español master
- Adaptive difficulty per IRT (Item Response Theory)

---

## 8. Métricas a observar post-launch

| Métrica | Target Year 1 |
|---------|----------------|
| Pass rate primer intento | 60-75% (industry benchmark serious exams) |
| Pass rate acumulado 3 intentos | ≥90% |
| Tiempo promedio examen | 60-80 min (de 90 disponibles) |
| Score promedio aprobados | ≥85% |
| Casos de cheating detectados (focus-leave + speed anomaly) | <2% |
| NPS post-examen | ≥50 |

---

## Bitácora

- **2026-05-22** (Día 6 producción mediodía) — Especificación examen final + caso práctico redactada completa. Distribución 60 preguntas por módulo + algoritmo de selección aleatoria + reglas de aprobación + anti-cheating ligero + UX wireframes + caso práctico 5 fotos + rúbrica evaluación + mapping schema Prisma + roadmap implementación Fase 1.3 / 1.4 / 2+.
