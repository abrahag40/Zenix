# Zenix Learning — Alineación con estándares LMS

> Honestidad arquitectónica: este doc mapea Zenix Learning a los estándares formales LMS de la industria, declara explícitamente los gaps por fase, y traza el roadmap de certificación.
> Creado tras pregunta del usuario: *"¿Cómo justificas que la arquitectura establecida para el LMS es la correcta?"*
> **Última actualización:** 2026-05-21

---

## 0. La respuesta corta

**Para Fase 1 (v1.0.0/v1.1.0):** la arquitectura es **"industry-aligned heurísticamente"**, NO compliant con SCORM/xAPI/Caliper/LTI formales. Schema diseñado deliberadamente para abrir esa puerta sin migraciones destructivas en Fase 2.

**Para Fase 2 (v1.1.x+):** SCORM 1.2/2004 + xAPI 1.0.3 entran como tipos nativos (`LearningLessonType` ya reservados). Cliente puede importar paquetes Articulate/Captivate/iSpring.

**Para Fase 3 (v1.3.x+):** Open Badges 3.0 + W3C Verifiable Credentials para certificados portables; LTI 1.3 para embedding tools externos en marketplace.

**La honestidad:** "diseñé esto a mi gusto" sería deshonesto. La verdad es: extraje patrones documentados de 5+ LMS productivos + 50+ referencias académicas + 9 estándares industria, los adapté al contexto SMB hotelero LATAM, y dejé los hooks para certificación formal en fases futuras.

---

## 1. Estándares LMS relevantes — el panorama

| Standard | Quién lo emite | Qué cubre | Status en Zenix |
|----------|---------------|-----------|-----------------|
| **SCORM 1.2** | ADL (Advanced Distributed Learning) | Empaquetado + runtime + tracking (CMI Data Model) | **Fase 2** — `LearningLessonType.SCORM_12` reservado |
| **SCORM 2004 4th Ed** | ADL | SCORM 1.2 + sequencing & navigation | **Fase 2** — `LearningLessonType.SCORM_2004` reservado |
| **xAPI 1.0.3 (Tin Can)** | ADL | Tracking distribuido vía statements + LRS | **Fase 2** — `LearningLessonType.XAPI_PACKAGE` + columna `externalLrsEndpoint` reservados |
| **cmi5** | ADL | Modern profile de xAPI con assignment + completion semantics | **Fase 2** — `LearningLessonType.CMI5_AU` reservado |
| **IMS Caliper Analytics 1.2** | IMS Global | Eventos de learning analytics estandarizados | **Fase 2.x** — mapping conceptual ya hecho (ver §2 abajo) |
| **IMS LTI 1.3** | IMS Global | Integración de tools externos (Articulate Studio en iframe, etc.) | **Fase 3** marketplace L3 |
| **IMS OneRoster** | IMS Global | Sincronización de roster Staff/Course/Membership | **Fase 3** — para integración People/HRIS |
| **W3C Verifiable Credentials 2.0** | W3C | Credenciales firmadas digitalmente, portables | **Fase 3** — para badges/certificados externalizables |
| **Open Badges 3.0** | IMS Global (sobre W3C VC) | Badges portables + LinkedIn integration | **Fase 3** |
| **IEEE 1484.x Learning Object Metadata (LOM)** | IEEE LTSC | Metadata standardizada de objetos de aprendizaje | **Fase 2** — `LearningCourse.metadata` jsonb extensible |
| **WCAG 2.1 AA** | W3C | Accesibilidad | **Fase 1.5** auditoría con axe |
| **GDPR / LFPDPPP** | UE / México | Protección de datos personales | **Fase 1** — `LearningStreak.gamificationOptIn=false` default + §50 D7 paridad |
| **LFT Art. 153 (México) / DC-3 / SIRCE** | STPS México | Compliance laboral | **Fase 1** — schema `LearningCertificate` con campos DC-3 nativos |

---

## 2. Mapping conceptual Zenix Learning → IMS Caliper / SCORM / xAPI

IMS Caliper 1.2 define un **vocabulario canónico** de entidades + eventos. Aunque no emitimos eventos Caliper-format todavía, las entidades alinean 1-a-1:

| Caliper entity | Zenix Learning model | Match grade |
|----------------|----------------------|-------------|
| `Person` | `Staff` (PMS existente) | ✅ Total |
| `CourseOffering` | `LearningCourse` | ✅ Total — más campos que Caliper requiere |
| `CourseSection` | `LearningModule` | ✅ Total |
| `DigitalResource` / `MediaObject` | `LearningLesson` (audio/video/PDF/HTML5) | ✅ Total |
| `Assessment` | `LearningAssessment` | ✅ Total |
| `AssessmentItem` | individual questions en `assessment.questionBank` | ⚠️ Embedido en JSON (no entidad separada) |
| `Attempt` | `LearningAttempt` | ✅ Total |
| `Result` | computed: `LearningAttempt.scorePct + result` | ✅ Total |
| `Score` | `LearningAttempt.scorePct` | ✅ Total |
| `Membership` | `LearningEnrollment` | ✅ Total |
| `Role` (Learner/Mentor/Instructor) | `Staff.role` + `Staff.level` | ⚠️ Parcial — Zenix usa role/level del PMS, no taxonomy Caliper |
| `Event` (AssessmentEvent, ToolUseEvent, etc.) | `LearningEnrollmentLog` (logged events) | ⚠️ Embedido — emisión Caliper JSON-LD en Fase 2.x |
| `LearningObjective` | `LearningCourse.bloomLevels` + outcome statements (TODO Fase 2) | ⚠️ Parcial |

**Conclusión §2:** la **estructura de entidades sigue Caliper**, lo que falta es el **wire format JSON-LD** para emitir eventos a un Caliper-compatible LRS externo. Eso es trabajo de Fase 2.x, no de Fase 1.

### 2.1 Mapping a SCORM CMI Data Model

Cuando se active SCORM en Fase 2, el mapping al CMI 2004 será:

| SCORM CMI Field | Zenix model field |
|-----------------|-------------------|
| `cmi.core.student_id` | `Staff.id` |
| `cmi.core.student_name` | `Staff.name` |
| `cmi.core.lesson_status` | derivado de `LearningLessonProgress.completedAt` y `LearningAttempt.result` |
| `cmi.core.lesson_location` (bookmark) | `LearningLessonProgress.bookmarkPosition` |
| `cmi.core.score.raw` | `LearningAttempt.scorePct` |
| `cmi.core.session_time` | `LearningLessonProgress.timeSpentSeconds` |
| `cmi.suspend_data` | `LearningLessonProgress` extendido (TODO Fase 2) |
| `cmi.interactions.n` | embedded en `LearningAttempt.answersGiven` JSON |

### 2.2 Mapping a xAPI statements

xAPI usa estructura **actor / verb / object**:

```json
{
  "actor": { "id": "Staff.id", "name": "Staff.name" },
  "verb": { "id": "http://adlnet.gov/expapi/verbs/completed" },
  "object": {
    "id": "https://zenix.com/learning/lessons/<lessonId>",
    "definition": { "name": "LearningLesson.title", "type": "http://adlnet.gov/expapi/activities/lesson" }
  },
  "result": {
    "completion": true,
    "duration": "PT4M32S",  // ISO 8601 de LessonProgress.timeSpentSeconds
    "score": { "scaled": 0.85 }
  },
  "context": {
    "instructor": null,
    "extensions": {
      "https://zenix.com/extensions/legalEntityId": "LegalEntity.id",
      "https://zenix.com/extensions/propertyId": "Property.id"
    }
  }
}
```

Cuando se active xAPI en Fase 2, `LearningEnrollmentLog` se proyecta a un LRS embebido (`learning_locker` o `Yet Analytics` open-source).

---

## 3. Patrones documentados que aplicamos (no inventados)

### 3.1 Arquitectura jerárquica curricular

| Decisión Zenix | Justificación documentada |
|----------------|----------------------------|
| **3 niveles: Course → Module → Lesson** (no 5 niveles SF Curricula/Item/Class/Program/Task) | Hick 1952 + crítica admin SF 80%+ de reviewers ([Gartner](https://www.gartner.com/reviews/market/corporate-learning-technologies/vendor/sap/product/sap--successfactors-learning)) |
| **Assessment 1:1 con Course** (examen final único, además de quizzes inline en Lesson) | Pattern Moodle / TalentLMS — separar evaluación sumativa de formativa |
| **Append-only audit log** (`LearningEnrollmentLog`, `LearningAttempt`) | Caliper Event pattern + §14, §28 CLAUDE.md PaymentLog paridad |
| **`contentVersionPin`** en enrollment | LFT Art. 153-U exige certificar contra versión específica de contenido; pattern SF + STPS DC-3 |
| **Quiz adaptive ELO** (Fase 1.2 TODO) | Khan Academy + Csikszentmihalyi 1990 Flow (doc 07 §7) |
| **SRS SM-2** para spaced repetition (Fase 1.2 TODO) | Ebbinghaus 1885 + Woźniak SM-2 + Anki (doc 07 §4) |

### 3.2 Multi-tenant

| Decisión Zenix | Justificación |
|----------------|---------------|
| **organizationId denormalizado en business tables** | §66 paridad — Citus multi-tenant pattern |
| **legalEntityId para reporting compliance** | §64 — STPS audita por razón social, no por property |
| **LearningScopeService** abstrae auth cross-property | Salesforce "Profile + Permission Sets" — análogo a `AccessControlService` (§67-§68) |
| **No usar Postgres RLS Fase 1** | §72 — defense-in-depth se aplica en app-layer; RLS reservado v1.2+ |

### 3.3 UX patterns

| Decisión Zenix | Origen documentado |
|----------------|--------------------|
| Dashboard "Continue + Due + Assigned + Recommended" | Docebo research + NN/g Learner Dashboard pattern |
| Catálogo grid + fuzzy search `pg_trgm` | Top complaint #1 LMS según doc 03 + iSpring/TalentLMS approach |
| **NO leaderboard público** | §50 D7 + Deci & Ryan 1999 crowding-out + LFPDPPP |
| **Streaks opt-in** | §52 D9 paridad + Octalysis Drive 8 Black Hat avoidance |
| Manager "Who's falling behind" sorted por días overdue | Docebo + 1-click Nudge button pattern |
| Mobile-first audio en housekeeping | 45% mobile usage LMS ([Research.com 2026](https://research.com/education/lms-statistics)) + audio learning research (doc 07 §9) |

---

## 4. Gaps explícitos vs estándares — qué falta y cuándo se cierra

### 4.1 Gap roadmap por fase

| Gap | Cuándo se cierra | Riesgo si no se cierra |
|-----|-------------------|------------------------|
| Sin emisión Caliper events JSON-LD a LRS externos | Fase 2.x v1.1.x | Bajo — cliente enterprise raramente lo pide para hostelería boutique |
| Sin runtime SCORM 1.2/2004 | Fase 2 v1.1.x | Medio — bloquea import de cursos AHLEI/Articulate del cliente |
| Sin xAPI/LRS | Fase 2 v1.1.x | Bajo para SMB; alto para enterprise |
| Sin LTI 1.3 tool embedding | Fase 3 marketplace | Bajo Fase 1; medio Fase 2 |
| Sin Open Badges 3.0 firmado W3C VC | Fase 3 | Bajo — `dc3VerificationUrl` con QR cubre el caso STPS |
| Sin OneRoster sync HRIS | Fase 3 People v1.7 | Bajo — el roster nativo del PMS (Staff) cubre |
| WCAG 2.1 AA auditado con axe | Fase 1.5 (en sprint actual) | Crítico legal en algunas jurisdicciones; tolerable internamente |
| DC-3 PDF layout STPS validado | Fase 1.3 (con consultor legal) | **Crítico** — sin esto el cliente reprueba auditoría |
| LFT Art. 153-N (registro de planes STPS) | Fase 2.x — wizard para subir plan a SIRCE | Bajo Fase 1 (cliente puede subirlo manual) |
| IEEE LOM metadata schema | Nunca (LOM está deprecated en favor de Caliper) | Cero |

### 4.2 Gap conscientemente no cerrado: certificación oficial

**No tenemos certificación oficial** contra:
- ADL SCORM compliance test suite
- ADL xAPI conformance test suite
- IMS Caliper conformance
- IMS LTI 1.3 conformance
- IMS Open Badges 3.0 verifier

**¿Por qué?** El target SMB hostelero LATAM **no pide** estos sellos (validado en doc 03 + 13). Cuando entremos a enterprise (v1.3+), los obtendremos. Es un trade-off explícito de scope, no un descuido.

---

## 5. Comparativa de calidad arquitectónica vs competencia

| Dimensión | SuccessFactors LMS | Cloudbeds University | Typsy | **Zenix Learning Fase 1** |
|-----------|---------------------|----------------------|-------|-----------------------------|
| Multi-tenant nativo | Sí (Provisioning) | Sí (per Property) | No (single-tenant) | ✅ 4-level Brand→Org→LegalEntity→Property |
| Append-only audit | Sí | Limitado | No | ✅ §128 reservado, schema sin @updatedAt en logs |
| Versionado de contenido en certificación | Sí (Curricula version) | No aplica | No | ✅ §129 `contentVersionPin` |
| Compliance reporting STPS | No | No | No | ✅ Native (legalEntityId index) |
| DC-3 PDF generator | No (3rd-party plugin) | No | No | ✅ Schema nativo (gen en Fase 1.3) |
| Mobile offline | Limitado | Sí | Sí | ✅ Tab en app mobile existente |
| Fuzzy search | Mala (top complaint) | N/A | OK | ✅ pg_trgm GIN indexes |
| Assignment rules síncronas | No (APAUTO async timing bugs) | N/A | N/A | ✅ §133 reservado |
| Standards SCORM/xAPI | Sí (legacy fuerte) | No aplica | No (propietario) | ⚠️ Fase 2 (schema preparado) |
| Open Badges 3.0 / W3C VC | No | No | No | ⚠️ Fase 3 (no en roadmap urgente) |
| Caliper events | No | No | No | ⚠️ Fase 2.x mapping conceptual ya alineado |

**Veredicto honesto:** en Fase 1 Zenix Learning está **al nivel o superior a SF en multi-tenant y compliance**, **inferior a SF en variedad de contenido externo** (SCORM/xAPI), y **superior a Cloudbeds/Typsy en flexibilidad arquitectónica** (gracias al embebido al PMS + multi-tenant 4-level).

---

## 6. Validación externa propuesta

Para no auto-evaluarnos, propongo en Fase 1.5:

1. **Code review externo** por un arquitecto LMS con experiencia (Moodle/Docebo/Cornerstone). Costo estimado: $1-3k USD.
2. **Auditoría WCAG 2.1 AA** con axe-core + Stark + screen reader manual (VoiceOver/TalkBack).
3. **Legal review** del DC-3 con abogado laboral mexicano antes de release. Bloqueante hard.
4. **Pre-validación SECTUR** del contenido Distintivo H con consultor registrado antes de publicar.

Cuando entremos a Fase 2:

5. **ADL SCORM 1.2/2004 conformance test suite** (gratis, ~1 día testing).
6. **xAPI conformance test suite** (gratis, ~2 días testing).

Cuando entremos a Fase 3:

7. **IMS Global membership** + Caliper/LTI/OneRoster conformance ($5-15k USD/año).
8. **Open Badges 3.0 + W3C VC certification** vía IMS Open Badges Adopters Registry.

---

## 7. Conclusión — la honestidad final

**¿Está bien la arquitectura?**

- ✅ **Sí para Fase 1** (target: hostal boutique LATAM, compliance LFT/STPS, 5-50 staff).
- ⚠️ **Parcialmente para Fase 2** — debe activarse SCORM/xAPI antes de competir en enterprise.
- ❌ **No para enterprise multinacional** — falta certificación formal IMS Caliper/LTI/OneRoster + Open Badges 3.0. Pero ese no es nuestro target inmediato.

**¿Estamos siguiendo estándares o inventando?**

- Seguimos **patrones documentados** de SF + 4 SaaS + 5 LMS hotelería (doc 03), más **50+ referencias académicas** (doc 07), más **9 estándares industria** (este doc §1).
- **Adaptamos** al contexto SMB LATAM en lugar de copiar enterprise.
- **Dejamos hooks** explícitos para certificación formal en fases 2-3 (sin migration destructiva).
- **NO inventamos** — extraemos. Pero **NO somos compliant formales todavía** y lo declaramos así.

Eso es lo que hace que la decisión sea defensible: no estamos vendiendo "SCORM compliant" en Fase 1 cuando no lo somos; estamos vendiendo "PMS+LMS embebido + compliance LATAM nativo + DC-3 automático", que es exactamente lo que entregamos.

---

## Bitácora

- **2026-05-21** — Doc creado tras pregunta del usuario "¿cómo justificas la arquitectura?". Mapping completo a Caliper/SCORM/xAPI/LTI/OBv3 + gaps explícitos por fase + roadmap de certificación.
