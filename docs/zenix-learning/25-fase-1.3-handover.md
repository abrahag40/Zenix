# Zenix Learning — Handover Fase 1.3 (Producción de contenido del catálogo MVP)

> Documento de cierre del sprint Fase 1.3: contenido de los 3 cursos del catálogo MVP producido, listo para ingesta por el equipo de ingeniería + revisión del reviewer experto. Define qué se entregó, qué falta, y los siguientes pasos.
> **Última actualización:** 2026-05-22 (Día 13 — cierre de sprint)

---

## 0. Resumen ejecutivo

El sprint Fase 1.3 (producción de contenido) entregó el **catálogo MVP completo de los 3 cursos hospitality** de Zenix Learning, en formato Markdown estructurado listo para ingesta al engine LMS (engine/content separation, doc 21).

| Curso | Módulos | Lessons | Question bank | Examen final |
|-------|---------|---------|---------------|--------------|
| **C1 Distintivo H + NOM-035** | 8 | 28 | 300 preguntas (5×) | 60 + caso práctico ✅ |
| **C2 Front Office Excellence** | 9 | 27 | 200 preguntas (5×) | 40 + simulación ✅ |
| **C3 Housekeeping Standards** | 10 | 28 | 250 preguntas (5×) | 50 + práctica ✅ |
| **TOTAL** | **27** | **83** | **750 preguntas** | 3 exámenes ✅ |

**Adicionalmente producido:**
- Sistema de certificación co-branded + endpoint `/verify` (spec, Curso 1)
- Quiz Randomization Standard universal del engine (doc 21 §1.1.bis)
- Mecánica de progreso modular + module-gating (doc 24)
- Estrategia de games HTML5 (doc 23) + modelo comercial Cialdini/SDT (doc 22) + arquitectura engine/content (doc 21)

---

## 1. Qué se entregó (estructura de archivos)

```
docs/zenix-learning/
├── 00-README.md (índice actualizado)
├── 20-content-production-plan.md (plan + bitácora completa Días 1-13)
├── 21-lms-architecture-content-separation.md (engine/content + Quiz Randomization Standard)
├── 22-sales-negotiation-model.md (Cialdini + SDT + Pool + Variante G)
├── 23-games-interactive-learning-strategy.md (7 conceptos game + Fase 1.4 roadmap)
├── 24-course-progress-module-gating.md (mecánica de progreso + module-gating)
├── 25-fase-1.3-handover.md (este documento)
└── courses/
    ├── 01-distintivo-h-nom-035/
    │   ├── 00-outline.md
    │   ├── question-bank.md (300 preguntas)
    │   ├── final-exam-spec.md
    │   ├── certificate-generation-spec.md
    │   └── modules/ (module-01 a module-08, 28 lessons)
    ├── 02-front-office-excellence/
    │   ├── 00-outline.md
    │   ├── question-bank.md (200 preguntas)
    │   └── modules/ (module-01 a module-09, 27 lessons)
    ├── 03-housekeeping-standards/
    │   ├── 00-outline.md
    │   ├── question-bank.md (250 preguntas)
    │   └── modules/ (module-01 a module-10, 28 lessons)
    └── exams-final-spec-cursos-2-3.md
```

---

## 2. Características del contenido producido

### 2.1 Plantilla canónica de lesson (las 83 lessons)

Cada lesson sigue la misma estructura (doc 20 §2):
1. **Hook — El error común** (JTBD del usuario: "operación desde la ignorancia")
2. **Evidencia — qué dice la norma/estándar** (cita verbatim con fuente)
3. **Aplicación práctica — Hoy mismo en tu turno** (accionable)
4. **Consecuencia verificable** (caso documentado con cifras)
5. **Knowledge check** (2-3 preguntas con explain citado)

Cada lesson tiene frontmatter YAML (`id`, `module`, `order`, `estimatedMinutes`, `bloomLevel`, `tags`, `sources`).

### 2.2 Principio editorial fundacional (Cursos 2 y 3)

**CERO terminología Zenix interna.** Los cursos hospitality son sobre estándares industriales portables (AHLEI, SECTUR, CDC, OSHA, EPA), NO sobre el sistema Zenix. Esto los hace certificables externamente + vendibles a hoteles que no usan Zenix PMS (Tier 5 marketplace futuro). El "Curso Zenix Sistema" (cómo operar el PMS) es producto separado.

### 2.3 Bibliografía verificable (~40 fuentes)

NMX-F-605 · Manual SECTUR · NOM-035-STPS · Guías I/II/III/IV/V · NOM-018-STPS · NOM-251 · LFT · ILO C190 · AHLEI CFDR · AHLEI CHHE · AHLEI START · O*NET · CDC (Foodborne, Environmental Services, Norovirus, Universal Precautions, Hand Hygiene) · FDA Food Code · USDA Pathogen Modeling · OSHA (Bloodborne Pathogens, Hazard Communication, Academy 610, General Duty Clause) · NIOSH · EPA (List N/K, Sanitizer, Antimicrobial) · Codex Alimentarius · ISO 22000 · NSF · UK FSA · PCI-DSS v4.0 · Visa Core Rules · CFDI 4.0 SAT · GDPR · LFPDPPP · Kotler · Cialdini · Deci&Ryan · Hofstede · Heskett · Hart/Heskett/Sasser · Karasek · Siegrist · Reason · Kahneman · Willis&Todorov · Carnegie · Sailer&Homner · Cornell School of Hotel Administration · ServSafe · ABMP · TARP · casos documentados COFEPRIS/SECTUR/STPS/OPS/SCJN/CDC NORS 2020-2024.

### 2.4 Cross-references entre cursos

- Seguridad química: Curso 1 M5 ↔ Curso 3 M3/M7 (cloramina, SDS, código colores)
- Carga laboral = factor NOM-035: Curso 1 M6 ↔ Curso 3 M2/M10
- Cornell ADR (1 punto = +11.2%): Curso 2 M1 ↔ Curso 3 M9
- Bioseguridad/Distintivo H en áreas F&B: Curso 1 ↔ Curso 3 M7

---

## 3. Qué falta antes de producción (pendientes)

### 3.1 Revisión del reviewer experto (BLOQUEANTE pre-publicación)

> El bloqueante crítico identificado desde el día 1 del sprint: **reviewer experto** (consultor SECTUR/Distintivo H + AHLEI partner) debe revisar el contenido antes de publicación. La búsqueda debe haber empezado el día 1.

| Curso | Reviewer requerido |
|-------|---------------------|
| C1 Distintivo H + NOM-035 | Consultor SECTUR/Distintivo H + abogado laboral (NOM-035) |
| C2 Front Office | AHLEI partner o experto en operación de recepción |
| C3 Housekeeping | AHLEI partner o experto CHHE + experto en seguridad química/OSHA |

El reviewer verifica: exactitud técnica, citas verificables, ausencia de errores sutiles, alineación con el estándar oficial.

### 3.2 Ingesta al engine (ingeniería)

El contenido Markdown debe convertirse a JSON normalizado + sembrarse al engine (doc 21):
- Pipeline de build Markdown → JSON (parseo de bloques hook/evidence/aplicación/consecuencia/knowledge-check)
- Seed de los 3 cursos como `LearningCourseVersion` + `LearningModule` + `LearningLesson`
- Seed de los 3 question banks (750 preguntas) como `LearningQuestionBank`
- Configuración de la distribución de cada examen final
- Componentes del engine: LessonPlayer, QuizEngine (con Quiz Randomization Standard), ProgressTracker, CertificateGenerator, ReportsEngine

### 3.3 Assets multimedia (Fase 1.4+)

El contenido actual es texto (HTML5_NATIVE). Pendiente:
- Stock photos con caption + alt (WCAG 2.1 AA) — donde las lessons lo indican
- Audio narrado (Fase 1.0.5+ cuando haya capital ElevenLabs)
- Games HTML5 (Fase 1.4-INTERLUDIO: Game A primero; doc 23)

### 3.4 Disclaimer + certificación oficial (roadmap)

- Disclaimer en cada lesson: "alineado a estándar, NO emite credential oficial" ✅ incluido
- Roadmap a certificación oficial: Zenix como ACE STPS (post primer cliente piloto, v1.0.5+) → DC-3 oficial (v1.1.x) → alianzas LATAM (doc 22 §5.2)

---

## 4. Métricas del sprint

| Métrica | Valor |
|---------|-------|
| Días de producción | 13 |
| Lessons redactadas | 83 |
| Módulos | 27 |
| Preguntas de banco | 750 (300+200+250) |
| Exámenes finales | 3 (con simulaciones) |
| Docs estratégicos/técnicos | 6 (docs 20-25) |
| Casos documentados con cifras | ~100+ |
| Fuentes verificables citadas | ~40 |
| Terminología Zenix en cursos hospitality | 0 (CERO, por diseño) |

---

## 5. Decisiones registradas durante el sprint (para CLAUDE.md §128+)

Numeración reservada para registrar al cerrar el sprint LEARNING-CORE completo (no solo Fase 1.3 contenido):

- **§ — Arquitectura engine/content separation** (doc 21): el LMS es motor estable; los cursos son contenido versionado.
- **§ — Quiz Randomization Standard universal** (doc 21 §1.1.bis): permutación de preguntas + opciones, Fisher-Yates server-side, sin excepción.
- **§ — Module-gating + progreso por módulo aprobado** (doc 24): el % avanza al aprobar Module Quiz, no al ver lessons.
- **§ — Cursos hospitality SIN terminología Zenix** (docs 06/22): portables, certificables externamente.
- **§ — Modelo comercial Cialdini + SDT** (doc 22): hook de curso regalo, prospecto elige, variantes A-G.
- **§ — Games HTML5 como diferenciador** (doc 23): Phaser 3 simulators, Fase 1.4-INTERLUDIO Game A pilot.
- **§ — Certificación co-branded + verify HMAC** (cert spec): Hotel emisor formal, Zenix plataforma, roadmap a DC-3 oficial.
- **§ — Ratio anti-cheat 5× en question banks** (banks): alineado a ServSafe Manager + ABMP.

---

## 6. Siguientes pasos recomendados (post Fase 1.3)

| Prioridad | Paso | Fase |
|-----------|------|------|
| 1 (BLOQUEANTE) | Contratar reviewer experto + revisar los 3 cursos | Inmediato |
| 2 | Ingesta del contenido al engine + seed | Fase 1.x ingeniería |
| 3 | Implementar engine components (LessonPlayer, QuizEngine, etc.) | Fase 1.x ingeniería |
| 4 | Game A "Auditoría Sorpresa" pilot | Fase 1.4-INTERLUDIO |
| 5 | Stock photos + audio narrado | Fase 1.0.5+ |
| 6 | ACE STPS registro (certificación oficial) | Post primer cliente piloto (v1.0.5+) |
| 7 | Curso Zenix Sistema (onboarding técnico) | Fase posterior |
| 8 | Tier 2 expansión (Inglés Hotelero segmentado, etc.) | v1.0.5 – v1.1.x |

---

## 7. Estado del sprint LEARNING-CORE

```
Fase 1.1 (backend/web/mobile foundation) ✅ (commits previos)
Fase 1.2 (mobile DLC-aware + lesson player + audio) ✅ (commits previos)
Fase 1.3 (producción de contenido — ESTE SPRINT) ✅ COMPLETO
  ├── 3 cursos (83 lessons, 27 módulos) ✅
  ├── 3 question banks (750 preguntas) ✅
  ├── 3 exámenes finales + simulaciones ✅
  ├── Sistema de certificación (spec) ✅
  ├── Quiz Randomization Standard ✅
  ├── Module-gating mechanics ✅
  └── Docs estratégicos (engine/content, comercial, games) ✅
Fase 1.4-INTERLUDIO (Game A pilot) ⏳ post Fase 1.3
Fase 1.5 (medición + expansión games) ⏳
```

---

## Bitácora

- **2026-05-22** (Día 13 — cierre de sprint Fase 1.3) — Handover redactado. Catálogo MVP de contenido COMPLETO: 3 cursos (83 lessons, 27 módulos), 3 question banks (750 preguntas ratio 5×), 3 exámenes finales con simulaciones, sistema de certificación, Quiz Randomization Standard, module-gating mechanics, 6 docs estratégicos/técnicos. Bloqueante crítico pre-publicación: reviewer experto. Siguientes pasos: revisión experta → ingesta al engine → Game A pilot (Fase 1.4). **🎉 SPRINT FASE 1.3 COMPLETO.**
