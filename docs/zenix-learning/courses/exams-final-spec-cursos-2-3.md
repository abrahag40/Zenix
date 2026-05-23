# Cursos 2 y 3 — Especificación de Examen Final + simulaciones

> Especificación de los exámenes finales de los Cursos 2 (Front Office) y 3 (Housekeeping), reusando el patrón canónico del Curso 1 ([final-exam-spec.md](01-distintivo-h-nom-035/final-exam-spec.md)). Define composición + simulaciones + reglas de aprobación.
> **Última actualización:** 2026-05-22 (Día 13 producción Fase 1.3)

---

## 0. Patrón compartido (heredado del Curso 1)

Ambos exámenes siguen el patrón canónico del Curso 1 (doc final-exam-spec.md del Curso 1):
- **Selección aleatoria** del banco con Quiz Randomization Standard (doc 21 §1.1.bis): permutación de preguntas + permutación de opciones a/b/c/d, Fisher-Yates server-side por attemptId.
- **Aprobación:** ≥75% global + 100% en ítems críticos.
- **Anti-cheating ligero:** foto al iniciar (eliminable GDPR) + permutación + detección focus-leave (señal, no penalización) + sin retroceder.
- **Re-takes:** 2 intentos (48h espera) → 3er intento requiere refresher de 4h.
- **Score combinado** cuando hay simulación/caso práctico: `(multiple choice × 0.7) + (simulación normalizada × 0.3)`.

---

## 1. Curso 2 — Front Office Excellence: Examen Final

### 1.1 Identidad

| Campo | Valor |
|-------|-------|
| Pre-requisito | Aprobar Module Quizzes 1-9 (100% módulos) |
| Composición | 40 preguntas multiple choice + 1 simulación de recepción |
| Tiempo límite | 70 minutos |
| Score mínimo | ≥75% global + 100% en ítems críticos |
| Banco origen | 200 preguntas (`02-front-office-excellence/question-bank.md`) — ratio 5× |

### 1.2 Distribución por módulo (40 preguntas)

| Módulo | Banco | Examen | Críticas mín |
|--------|-------|--------|--------------|
| M1 Industria + rol | 20 | 4 | 1 |
| M2 Tecnología | 22 | 5 | 1 |
| M3 Pre-arrival | 22 | 5 | 2 |
| M4 Check-in | 28 | 6 | 2 |
| M5 Folio + PCI | 24 | 5 | 2 |
| M6 Check-out + disputas | 22 | 5 | 2 |
| M7 Servicio + LEARN | 22 | 4 | 1 |
| M8 Seguridad + datos | 22 | 4 | 2 |
| M9 No-shows + fiscal | 18 | 2 | 1 |
| **TOTAL** | **200** | **40** | **14 críticos** |

### 1.3 Simulación de recepción

**Concepto:** el aprendiz procesa un check-in completo de un huésped ficticio en un **PMS genérico/conceptual** (NO Zenix) — o el Game D "Front Desk Rush" cuando esté disponible (Fase 1.5).

**Escenario:**
> "Un huésped llega con una reserva de Booking.com (modelo OTA_COLLECT). Procesa su check-in completo: saludo, verificación de identidad, verificación del modelo de cobro, asignación de habitación (verificando estado), información, y despedida. Maneja correctamente el cobro (¿cobras o no cobras?)."

**Lo que evalúa la simulación:**
- Conexión humana (saludo, contacto visual conceptual, uso del nombre)
- Verificación de identidad
- Identificación correcta del modelo de cobro OTA_COLLECT (NO doble cobro)
- Asignación verificando estado "vacante limpia"
- Información útil + despedida cálida

**Rúbrica:** 5 criterios × escala 1-4 = 20 puntos máx. Aprobación ≥15/20 (75%).

---

## 2. Curso 3 — Housekeeping Standards Premium: Examen Final

### 2.1 Identidad

| Campo | Valor |
|-------|-------|
| Pre-requisito | Aprobar Module Quizzes 1-10 (100% módulos) |
| Composición | 50 preguntas multiple choice + 1 práctica de inspección |
| Tiempo límite | 80 minutos |
| Score mínimo | ≥75% global + 100% en ítems críticos |
| Banco origen | 250 preguntas (`03-housekeeping-standards/question-bank.md`) — ratio 5× |

### 2.2 Distribución por módulo (50 preguntas)

| Módulo | Banco | Examen | Críticas mín |
|--------|-------|--------|--------------|
| M1 Introducción | 22 | 4 | 1 |
| M2 Planning | 24 | 5 | 2 |
| M3 Químicos + SDS | 26 | 6 | 2 |
| M4 SOPs limpieza | 30 | 6 | 2 |
| M5 Lencería | 26 | 5 | 2 |
| M6 Sustainability | 18 | 3 | 1 |
| M7 Bioseguridad | 28 | 6 | 3 |
| M8 Maintenance + L&F | 22 | 4 | 2 |
| M9 QA + inspections | 28 | 6 | 2 |
| M10 Seguridad + ergonomía | 26 | 5 | 2 |
| **TOTAL** | **250** | **50** | **19 críticos** |

### 2.3 Práctica de inspección

**Concepto:** el aprendiz inspecciona una habitación simulada (con foto-evidencia) identificando errores ocultos — o el Game F "Room Inspector" cuando esté disponible (Fase 1.5).

**Escenario:**
> "Inspecciona esta habitación 'terminada'. Identifica los errores: superficies de alto contacto sin desinfectar, caja fuerte sin revisar (con objeto del huésped anterior), mancha que no salió, amenity faltante, foco fundido no reportado, lencería con cabello, etc. Para cada error, indica qué falló y la acción correctiva."

**Lo que evalúa:**
- Verificación de la caja fuerte (objetos del huésped anterior)
- Detección de superficies de alto contacto sin desinfectar
- Detección de defectos de limpieza (manchas, cabellos)
- Detección de daños no reportados (foco fundido → mantenimiento)
- Acción correctiva apropiada por error

**Rúbrica:** identificación de errores + acción correctiva × cantidad de elementos = score. Aprobación ≥75%.

---

## 3. Implementación técnica (compartida con Curso 1)

Ambos exámenes usan los mismos componentes del engine que el Curso 1:
- `QuizBuilderService.buildFinalExam` (selección aleatoria con distribución + mínimo de críticas por módulo)
- `LearningQuizAttempt` con `kind=FINAL` + `gameSessionData`/`caseStudyAnswers`
- Quiz Randomization Standard (doc 21 §1.1.bis)
- `CertificateGenerator` (doc certificate-generation-spec.md del Curso 1) — co-branded, HMAC, verify endpoint

No requiere componentes nuevos del engine — solo seed del banco + configuración de la distribución del examen por curso.

---

## 4. Resumen de los 3 exámenes finales del catálogo MVP

| Curso | Preguntas examen | Simulación | Banco | Ratio | Vigencia cert |
|-------|------------------|------------|-------|-------|----------------|
| **C1 Distintivo H + NOM-035** | 60 + caso práctico | Auditoría cocina (Game A) | 300 | 5× | 12 meses |
| **C2 Front Office** | 40 + simulación | Check-in (Game D) | 200 | 5× | 24 meses |
| **C3 Housekeeping** | 50 + práctica | Inspección (Game F) | 250 | 5× | 24 meses |

---

## Bitácora

- **2026-05-22** (Día 13 producción) — Spec de exámenes finales Cursos 2 y 3 redactado, reusando el patrón canónico del Curso 1. Distribución por módulo + simulaciones (recepción / inspección) + rúbricas + reglas de aprobación (≥75% + 100% críticos). No requiere componentes nuevos del engine. Los 3 exámenes finales del catálogo MVP especificados.
