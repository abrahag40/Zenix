# GÉNESIS PROMPT — Plataforma LMS independiente + Cursos portables

> **Este es el PRIMER PROMPT del repositorio.** Cópialo como `GENESIS.md` (o pégalo como mensaje inicial) en una nueva sesión de Claude Code sobre un repo vacío. Contiene la especificación completa, misión, arquitectura, fundamentos científicos, análisis de competencia, modelo comercial y referencias del proyecto. Es autocontenido: un agente que NUNCA vio el proyecto puede arrancarlo solo con este documento.
>
> **Nombre del proyecto:** `<PROYECTO>` (placeholder — reemplazar por el nombre definitivo; sugerencias al final §18). El proyecto es **vendor-neutral**: nació de la experiencia construyendo un LMS hotelero, pero es un producto INDEPENDIENTE que se vende solo.
>
> **Origen:** destilado de 13 días de research + producción (3 cursos completos · 83 lessons · 750 preguntas) + 8 documentos estratégicos. Toda decisión aquí está justificada con estudios verificables citados.

---

## 0. Cómo usar este documento (instrucciones para el agente)

Eres el agente que va a construir este proyecto desde cero. Este documento es tu brief fundacional. Antes de escribir código:

1. **Lee el documento completo.** Entiende la misión, la arquitectura y las decisiones no-negociables.
2. **NO reinventes las decisiones ya tomadas** (§10) — están justificadas con estudios. Puedes debatirlas con evidencia, pero el default es respetarlas.
3. **Propón un plan de sprint** (§16) antes de codear. Confirma con el humano.
4. **Aplica el principio de debate epistémico:** toda recomendación tuya debe citar fuente verificable (estudio académico, estándar oficial, benchmark de competidor). Nunca "porque sí".
5. **Mantén la separación engine/content (§4) como regla sagrada** — es el corazón de la arquitectura.

---

## 1. Misión, visión, objetivo

### Misión

Construir un **sistema de capacitación (LMS) profesional** que corrija la **ignorancia operativa** en industrias de servicio, empezando por hotelería, mediante cursos pedagógicamente fundamentados + tecnología interactiva (desde HTML hasta motores de videojuego), vendible en dos formas: como **plataforma completa** y como **cursos portables** que se montan en plataformas de terceros.

### Insight fundacional (verbatim del founder)

> *"Hay empresas que trabajan su operación desde la ignorancia. Para eso son los cursos."*

Esto refina el **Jobs To Be Done** (Christensen 2003): el producto NO es "training corporativo abstracto" — es **corrección sistemática de prácticas incorrectas heredadas**, con evidencia oficial citada y consecuencias verificables (multas, brotes, lesiones, pérdidas).

### Visión

Convertirse en el referente LATAM de capacitación operativa para industrias de servicio: un catálogo de cursos certificables alineados a estándares oficiales + una plataforma de entrega multi-stack + un marketplace de cursos de terceros.

---

## 2. El DOBLE PRODUCTO (modelo de negocio central)

El proyecto se divide en **dos productos vendibles por separado**:

### Producto 1 — La PLATAFORMA (LMS-as-a-Platform)

El motor de entrega: reproduce cursos, rastrea progreso, emite certificados, da reportes a managers. Se vende como **solución de capacitación completa** a empresas que NO tienen LMS. Usa **stacks tecnológicos variables según el objetivo del curso**:

| Stack | Cuándo usarlo |
|-------|---------------|
| **HTML5 nativo** | Lessons de texto/imagen/audio/video (la mayoría) |
| **Phaser 3** | Simuladores 2D (auditoría de cocina, recepción, inspección) |
| **Babylon.js / Three.js** | Simulación 3D del entorno de trabajo (EPP, equipo, evacuación) |
| **Unity / Unreal Engine** | Simulación inmersiva de alta fidelidad / VR (entrenamiento crítico: emergencias, maquinaria peligrosa) — fase avanzada |

### Producto 2 — Los CURSOS PORTABLES (Courses-as-Product)

Los cursos como **archivos montables** vendibles para plataformas que el cliente YA usa (SAP SuccessFactors, Cornerstone OnDemand, Docebo, Moodle Workplace, TalentLMS, etc.). Se entregan en **estándares de empaquetado portables**:

| Estándar | Uso |
|----------|-----|
| **SCORM 1.2 / 2004** | El más soportado por LMS corporativos legacy |
| **xAPI (Tin Can)** | Tracking moderno, granular, offline-capable |
| **cmi5** | xAPI sobre LMS (lo mejor de ambos) |

**Implicación arquitectónica crítica:** los cursos NUNCA contienen terminología propietaria de la plataforma. Son **vendor-neutral** — basados en estándares industriales (AHLEI, SECTUR, CDC, OSHA, etc.). Esto es lo que los hace portables a CUALQUIER plataforma. (Ver §4 separación engine/content y §10 decisión no-negociable).

### Por qué este doble modelo es sólido

- **Mews/Cloudbeds/Opera NO tienen LMS** → oportunidad en hotelería
- **TalentLMS/iSpring/Docebo venden plataforma pero NO contenido hotelero específico** → oportunidad en cursos
- **SuccessFactors es "back-end Frankenstein"** (80%+ de reviews negativos de admins) + authoring externo (Articulate $1.5-3k/año aparte) → oportunidad de cursos llave-en-mano
- Vender cursos portables NO requiere que el cliente abandone su LMS → menor fricción de venta

---

## 3. Alcance

### Fase 1 (MVP) — qué SÍ

- Engine LMS web + mobile (entrega de cursos HTML5 + audio + video + PDF)
- Quiz engine con randomización universal (§10)
- Progreso modular + module-gating (§10)
- Sistema de certificación co-branded + verificación pública
- 3 cursos hospitality completos (ya producidos — ver §7)
- 1 game-pilot Phaser (simulador de auditoría)
- Exportador a SCORM/xAPI (Producto 2)

### Fase 1 — qué NO (diferido)

- Unity/Unreal (fase avanzada, solo cuando haya demanda enterprise verificada)
- Marketplace de terceros (fase 2)
- IA tutora conversacional (fase 3)
- Multi-idioma automático (los cursos nacen en ES-MX; EN/PT-BR en fase 2)

---

## 4. Arquitectura técnica (DECISIÓN FUNDACIONAL)

### 4.1 Engine / Content / Runtime — las 3 capas (NO NEGOCIABLE)

| Capa | Qué es | Cadencia de cambio |
|------|--------|---------------------|
| **Engine (motor)** | Código: lesson player, quiz engine, cert generator, dashboard, sync offline, push | Releases v1.x.y (1-2 meses) |
| **Content (cursos)** | JSON de lessons + assets (audio/video/PDF/img) + bancos de preguntas + metadata | Versionado independiente (semanal/mensual SIN tocar engine) |
| **Runtime Data** | Enrollments, attempts, progress, certificados, audit logs | Por cada interacción (eventos en vivo) |

**Insight central:** un curso nuevo NO requiere deploy del motor. Un fix del motor NO requiere re-publicar cursos. Patrón canónico de TODO LMS profesional (Moodle, Canvas, Articulate, TalentLMS, iSpring, Docebo). **Sin esta separación, el LMS deja de ser un LMS y se vuelve una colección de cursos hard-coded — el error que mata a los e-learnings "boutique".**

**Reglas no-negociables del engine:**
- **CERO hard-coded course content.** El engine NUNCA contiene strings de lessons, preguntas ni respuestas. Si el engine sabe la respuesta correcta de una pregunta → anti-patrón.
- **Versionado independiente.** Engine `v1.0.0`, cursos `MX-DH-2026.05.1`. Un typo en el curso = bump del CONTENT, sin tocar el engine.
- **Backwards-compatible.** Un curso `2026.05.1` enrollado por un staff que no completó debe seguir reproduciéndose en el engine `v1.5.0` un año después. Pattern Netflix.

### 4.2 Stack tecnológico base sugerido

| App | Framework sugerido |
|-----|---------------------|
| API | NestJS + Prisma + PostgreSQL (o el stack que el agente justifique) |
| Web | React + Vite + Tailwind |
| Mobile | Expo (React Native) — offline-first con cola de sync |
| Games | Phaser 3 + Vite (2D); Babylon.js (3D); Unity/Unreal (avanzado) |
| Content packaging | Exportador SCORM 1.2/2004 + xAPI/cmi5 |

### 4.3 Schema de datos (modelos núcleo)

```
Course → CourseVersion → Module → Lesson → (KnowledgeCheck)
Course → CourseVersion → FinalExam
QuestionBank (≥5× preguntas del examen — ratio anti-cheat)
Enrollment (staff × courseVersion) → LessonAttempt (append-only) + QuizAttempt (append-only)
Certificate (append-only, HMAC firmado, co-branded)
GameBundle + GameAssetPack (para lessons tipo GAME_*)
```

Tipos de lesson (enum extensible): `HTML5_NATIVE | VIDEO_MP4 | AUDIO_MP3 | PDF_DOCUMENT | GAME_PHASER | GAME_BABYLON_3D | GAME_UNITY | SCORM_12 | SCORM_2004 | XAPI_PACKAGE | CMI5_AU`.

---

## 5. Fundamentos psicopedagógicos (con citas verificables)

Toda decisión de diseño pedagógico se ancla en estos fundamentos oficialmente reconocidos:

| Fundamento | Autor/Año | Aplicación |
|------------|-----------|------------|
| **Andragogía** (adulto trabajador) | Knowles 1973 | Tono "evidencia + respeto", no profesoral. El aprendiz YA tiene un patrón mental (probablemente erróneo); el curso lo desafía con evidencia |
| **JTBD** | Christensen 2003 | El curso corrige ignorancia operativa, no es training abstracto |
| **Taxonomía de Bloom revisada** | Anderson & Krathwohl 2001 | Cada lesson/módulo declara su nivel Bloom; los escenarios escalan RECORDAR→CREAR |
| **Carga cognitiva** | Sweller 1988 | Máx ~5-7 elementos simultáneos; 1 concepto a la vez |
| **Microlearning** | Kapp 2012 | Lessons de 3-7 min; sesiones de 15-45 min, no maratones |
| **Spaced repetition (SRS)** | Woźniak SM-2 1995 | Preguntas reaparecen en intervalos crecientes (200-300% mejor retención) |
| **Práctica de recuperación** | Cepeda et al. 2006 | Quiz inline con feedback inmediato |
| **Self-efficacy** | Bandura 1977 | Mastery experience: escenarios fáciles → confianza para difíciles |
| **Flow** | Csikszentmihalyi 1990 | Challenge ≈ skill; timers calibrados (ni aburre ni angustia) |
| **Zona de desarrollo próximo** | Vygotsky 1978 | Sistema de pistas/scaffolding opcional |
| **Self-Determination Theory** | Deci & Ryan 1985/2000 | Autonomía (el aprendiz elige) + Competencia (mastery) + Relacionalidad. Base del modelo comercial |
| **Crowding-out effect** | Deci, Koestner & Ryan 1999 | PROHIBIDO: leaderboards públicos, rewards que reemplazan motivación intrínseca |
| **Gamificación (meta-análisis)** | Sailer & Homner 2020 (Educ. Psych. Review) | Cognitivo d=0.49, motivacional d=0.36, conductual d=0.25. Solo simulation-based, NO trivia |
| **Gamificación contextual** | Hamari et al. 2014 | Funciona cuando simula el contexto operativo real; NO universalmente |
| **Game-based transfer** | Connor et al. 2003 | Simulación mejora Kirkpatrick L3 (transfer al trabajo) |
| **Kirkpatrick L1-L4 + Phillips L5** | Kirkpatrick 2006 / Phillips 2003 | Medir Reaction/Learning/Behavior/Results/ROI |
| **Modelo del Queso Suizo** | Reason 1990 | Los incidentes son cadenas de fallas; una capa intacta los previene |
| **Service Recovery Paradox** | Hart/Heskett/Sasser 1990 (HBR) | Un problema bien resuelto genera más lealtad (aplicado a cursos de servicio) |
| **Primera impresión** | Willis & Todorov 2006 (Princeton) | Juicios de confianza en 100ms (cursos de recepción) |
| **Dimensiones culturales** | Hofstede 1980 | Adaptación cultural del servicio sin estereotipar |
| **Recency effect / Sistema 1-2** | Kahneman 2011 | Última impresión + decisiones bajo presión |

**Anti-patrones pedagógicos PROHIBIDOS:** trivia gamificada disfrazada de simulador, leaderboards públicos (crowding-out), games obligatorios para aprobar, microtransactions, dark patterns (loss aversion forzada, streaks que angustian), feedback punitivo ("perdiste"/"fail" — usar "repasa"/"sigamos").

---

## 6. Modelo comercial (Cialdini + SDT)

### 6.1 Mecánica de cierre con hook de curso regalo

```
1. Vendedor ofrece la plataforma/cursos al prospecto
2. Prospecto duda
3. Vendedor: "Te regalo UN curso de mi catálogo — tú eliges cuál — gratis
   para tu personal. Al final reciben comprobante certificado."
4. Prospecto elige → Cialdini Reciprocidad + SDT Autonomía + Compromiso público
5. Staff completa → comprobante co-branded
6. Cliente ve resultados → compra los otros cursos / renueva plataforma
```

### 6.2 Principios (Cialdini 1984 + Deci & Ryan)

| Principio | Cita | Aplicación |
|-----------|------|------------|
| Reciprocidad | Cialdini cap. 2 | Curso regalado (valor percibido $150-300) crea obligación implícita |
| Autonomía | Deci & Ryan 2000 | El prospecto ELIGE → motivación intrínseca (completion 75-85% vs 40% impuesto) |
| Compromiso público | Cialdini cap. 3 + Festinger 1957 | Al elegir, declara su Job To Be Done |
| Loss aversion | Kahneman 2011 | "Te REGALO" > "te incluyo"/"te descuento" (2-2.5× más motivador) |
| Autoridad | Cialdini cap. 6 | Estándares oficiales (NMX/NOM/AHLEI) son fuente de autoridad |

### 6.3 Variantes del hook (vendedor adapta al perfil)

A (hook simple) · B (doble hook compliance) · C (doble hook reputación) · D (doble hook revenue) · E (triple hook enterprise) · F (hook educativo reverse-psychology) · G (Hook Killer Demo Game — mostrar un simulador en vivo 3 min antes del cierre).

**Anti-variantes PROHIBIDAS:** escasez forzada ("solo hoy"), fear-mongering, disonancia ("sin esto tu negocio está en riesgo").

### 6.4 Pricing (referencia)

- Curso individual one-time: $99-149 USD/staff certificado (compliance estática)
- DLC mensual: $7-9 USD/staff/mes (cursos recurrentes)
- Curso regalo (hook): $0 (1 curso a elección)
- Cursos portables (SCORM/xAPI) para plataforma de tercero: licencia por volumen
- Custom course con game específico (enterprise): $5-20k USD desarrollo + license recurrente

---

## 7. Catálogo de cursos (Pool Tier 1-5)

### Tier 1 — MVP (YA PRODUCIDOS — migrar del material existente)

| Curso | Módulos/Lessons | Estándar alineado | Banco |
|-------|------------------|---------------------|-------|
| **Distintivo H + NOM-035** (compliance MX) | 8 / 28 | NMX-F-605 + NOM-035-STPS | 300 preguntas |
| **Front Office Excellence** | 9 / 27 | AHLEI CFDR + CONOCER EC0124 | 200 preguntas |
| **Housekeeping Standards Premium** | 10 / 28 | AHLEI CHHE + CDC + OSHA + EPA | 250 preguntas |

Cada lesson sigue la **plantilla canónica**: Hook (el error común) → Evidencia (cita verbatim) → Aplicación práctica (hoy mismo en tu turno) → Consecuencia verificable (caso documentado con cifras) → Knowledge check (preguntas con explicación citada).

### Tier 2 — Expansión cercana

Inglés Hotelero segmentado (A1-A2 / B1 / B2-C1 CEFR) · Servicio al Huésped Premium (CGSP) · Bartending.

### Tier 3 — Expansión media

F&B Service (ServSafe) · Wine 101 LATAM (WSET) · Revenue Management (HSMAI) · Channel Management · Liderazgo Supervisor (CHS) · Seguridad y Emergencias.

### Tier 4 — Compliance LATAM por país

NOM-251/NOM-247 (MX) · NTSH (CO) · ICT (CR) · Mincetur (PE) · AHT (AR) · GDPR/LFPDPPP/Habeas Data.

### Tier 5 — Marketplace + custom

Cursos de terceros (revenue share 70/30) · idiomas adicionales · especialidades F&B · sustainability · wellness · aventura · marketing hotelero.

### Curso de sistema (separado)

"Cómo operar [la plataforma]" — onboarding técnico por rol, gratis, producto aparte del catálogo de habilidades.

---

## 8. Análisis de competencia

| Competidor | Fortaleza | Debilidad explotable |
|------------|-----------|----------------------|
| **SAP SuccessFactors** | Enterprise, integrado a HCM | "Back-end Frankenstein" (80%+ reviews admins negativos); authoring externo aparte ($1.5-3k/año Articulate); sin contenido hotelero |
| **TalentLMS** | Fácil, económico | Sin contenido hotelero específico; plataforma genérica |
| **iSpring Learn** | Authoring + LMS | Genérico; sin cursos LATAM hotelería |
| **Docebo** | IA + social | Caro; enterprise; sin contenido vertical hotelero |
| **Moodle Workplace** | Open-source, flexible | Requiere implementación técnica; sin contenido |
| **AHLEI Academy / eHotelier / Typsy** | Contenido hotelero | En inglés; caro; no LATAM-compliance (Distintivo H, NOM-035); no gamificado simulation-based |
| **Cornerstone OnDemand** | Enterprise robusto | Caro; sin contenido hotelero LATAM |

**Posicionamiento ganador:** contenido hotelero LATAM-specific (compliance MX/LATAM real) + gamificación simulation-based + portabilidad (vendible como cursos a quien ya tiene LMS) + pricing accesible para hostales/boutique. **Categoría nueva: "Operational Learning para hospitalidad LATAM".**

---

## 9. Industrias donde aplica

**Inicio:** hotelería (hoteles boutique, hostales, resorts, cadenas pequeñas LATAM).

**Extensible (mismo motor + cursos nuevos):**
- Restaurantes / F&B independientes
- Retail (servicio al cliente, manejo de efectivo, seguridad)
- Salud (clínicas, control de infecciones, NOM-035)
- Manufactura ligera (seguridad OSHA, NOM-017/029, ergonomía)
- Logística / almacenes (seguridad, manejo de cargas NIOSH)
- Cualquier industria con: compliance obligatorio + personal operativo + alta rotación + "ignorancia operativa heredada"

El motor es agnóstico de industria; los cursos definen el vertical.

---

## 10. Decisiones NO-NEGOCIABLES (justificadas)

1. **Engine/content separation** (§4) — sagrada. El motor evoluciona en su cadencia, los cursos en la suya.
2. **CERO terminología vendor en los cursos** — los cursos son sobre estándares industriales portables (AHLEI/SECTUR/CDC/OSHA), NUNCA sobre la plataforma. Esto los hace certificables externamente + vendibles a plataformas de terceros (Producto 2). El curso "cómo usar la plataforma" es producto separado.
3. **Quiz Randomization Standard universal** — TODOS los quizzes aplican permutación de preguntas + permutación de opciones (Fisher-Yates server-side determinístico por attemptId). Sin excepción, sin opt-out per-curso. Es regla del ENGINE (el contenido no decide). Previene "trampa interna del creador" (respuesta siempre en C) + asegura anti-cheating uniforme.
4. **Module-gating + progreso por módulo aprobado** — el % del curso avanza al APROBAR el Module Quiz (≥75%), no al ver las lessons. Protege contra skip-and-skim. Examen final separado emite el certificado.
5. **Política de re-takes anti-frustración** — 3 intentos (espera escalonada 24h/48h/coaching). El 3er fallo NO bloquea la carrera; activa coaching humano. Feedback SIEMPRE educativo, nunca punitivo (Knowles + Bandura + Csikszentmihalyi).
6. **Ratio anti-cheat 5× en bancos** — el banco tiene ≥5× las preguntas del examen (alineado a ServSafe Manager + ABMP). 1.7% probabilidad de repetición entre intentos.
7. **Certificación co-branded + verificación pública HMAC** — el emisor formal es el CLIENTE (hotel), la plataforma es el medio (pattern Coursera). HMAC-SHA256 self-contained (verificable sin DB query). Roadmap a certificación oficial (ej: ACE STPS para DC-3 en MX).
8. **Games solo simulation-based** — Phaser/Unity/Unreal para SIMULAR el contexto operativo, NUNCA trivia gamificada. 10 anti-patrones prohibidos (leaderboards públicos, microtransactions, dark patterns, etc.).
9. **Privacidad peer-to-peer** — NO leaderboards públicos entre staff (crowding-out Deci&Ryan). Manager ve "quién va atrasado", no ranking público.
10. **Accesibilidad WCAG 2.1 AA** — keyboard nav, screen readers, prefers-reduced-motion, contraste 4.5:1, en lessons Y games.
11. **Trazabilidad cita-por-cita** — cada concepto en cada lesson cita fuente verificable pública. Sin esto, no se publica. Disclaimer honesto: "alineado a estándar, NO emite credential oficial" (hasta lograr acreditación formal).
12. **Reviewer experto pre-publicación** — todo curso pasa por experto del dominio (consultor del estándar) antes de publicar. Bloqueante de calidad.

---

## 11. Estándares de portabilidad (Producto 2 — clave del negocio)

Para vender cursos a plataformas de terceros (SuccessFactors, Cornerstone, Docebo, Moodle), el sistema exporta a:

| Estándar | Detalle | Soporte |
|----------|---------|---------|
| **SCORM 1.2** | El más universal (LMS legacy) | Casi todos los LMS corporativos |
| **SCORM 2004** | Secuenciación avanzada | Mayoría de LMS modernos |
| **xAPI (Tin Can)** | Tracking granular, offline, fuera del LMS (LRS) | LMS modernos + LRS |
| **cmi5** | xAPI estructurado sobre LMS | Lo más nuevo |

**Diseño para portabilidad desde el día 1:** el contenido (lessons JSON + assets + banco) se diseña de forma que el packaging a SCORM/xAPI sea una transformación, no una reescritura. El game (Phaser) se empaqueta como SCORM con wrapper. Esto es lo que permite el Producto 2.

---

## 12. Estrategia de games (multi-stack según objetivo)

| Stack | Objetivo | Cuándo |
|-------|----------|--------|
| **HTML5/CSS interactivo** | Microinteracciones, drag-drop, branching simple | Cualquier curso |
| **Phaser 3** (2D) | Simuladores 2D top-down (auditoría cocina, recepción Diner-Dash, inspección hidden-object) | MVP — game-pilot ya diseñado (ver material existente: "Auditoría Sorpresa Distintivo H Simulator") |
| **Babylon.js / Three.js** (3D web) | Simulación 3D del entorno (EPP, equipo, recorrido) | Cuando 2D no basta + sin necesidad de instalar |
| **Unity / Unreal Engine** | Simulación inmersiva alta fidelidad / VR (emergencias, maquinaria peligrosa, evacuación) | Enterprise / entrenamiento crítico — fase avanzada, demanda verificada |

**Game-pilot ya diseñado (migrar el DDD):** "Auditoría Sorpresa: Distintivo H Simulator" — Phaser 3, 2D top-down pixel-art, inspirado en Papers Please + Overcooked. 3 escenarios (cocina hostal/restaurant hotel/kitchen resort), 28 puntos críticos. Loop: examinar ítem → ¿cumple/no cumple? → consecuencia (multa simulada/confetti). DDD completo + scaffold de código disponible en el material de origen.

**Integración game↔engine:** iframe sandboxed + bridge `postMessage` (el game reporta progress/score/completed; el engine NO conoce las respuestas — el game las lee de su content JSON, reflejando engine/content separation a nivel del game).

**Pipeline de assets:** Tiled (tilemaps) + Aseprite (pixel art) para 2D. PostHog para telemetría.

---

## 13. Sistema de certificación

- **PDF co-branded:** logo del cliente + logo de la plataforma (cliente = emisor formal, plataforma = medio). Sin slogans de marketing.
- **HMAC-SHA256** con key per-cliente, verificable públicamente en `/verify/cert/:id` SIN consultar DB (self-contained). QR escaneable.
- **Generación on-demand** (no pre-generar — 80% de certs nunca se descargan).
- **Tipos:** interno alineado → oficial (cuando se logre acreditación, ej: ACE STPS para DC-3 en MX) → partner (marketplace).
- **NO incluir datos sensibles** en el PDF/QR público (email, RFC, CURP) — GDPR/LFPDPPP.
- **Anti-patrones prohibidos:** pre-generar todos, MD5/SHA-1, verify con login, datos sensibles públicos, logo plataforma dominante sobre cliente.

---

## 14. Roadmap de fases

| Fase | Contenido |
|------|-----------|
| **1.0** | Engine MVP (web+mobile) + 3 cursos + quiz randomization + module-gating + certificación + exportador SCORM/xAPI |
| **1.1** | Game-pilot Phaser (Auditoría Sorpresa) + medición conversion lift |
| **1.2** | Expansión games (si conversion >20%) + Tier 2 cursos (Inglés segmentado) |
| **1.3** | Marketplace de terceros (revenue share) + multi-idioma (EN/PT-BR) |
| **2.0** | Babylon 3D + Unity (entrenamiento crítico) + IA tutora + acreditaciones oficiales |

---

## 15. Referencias verificables (bibliografía completa)

### Pedagogía / aprendizaje
Knowles 1973 *The Adult Learner* · Anderson & Krathwohl 2001 *Taxonomy for Learning* · Sweller 1988 *Cognitive Load* · Kapp 2012 *Gamification of Learning* · Woźniak 1995 SuperMemo SM-2 · Cepeda et al. 2006 (Psychological Bulletin) · Bandura 1977 *Social Learning Theory* · Csikszentmihalyi 1990 *Flow* · Vygotsky 1978 *Mind in Society* · Deci & Ryan 1985/2000 SDT · Deci/Koestner/Ryan 1999 (Psychological Bulletin) · Sailer & Homner 2020 (Educational Psychology Review) · Hamari et al. 2014 (HICSS) · Connor et al. 2003 (Int. J. Training & Development) · Kirkpatrick 2006 · Phillips 2003 · Chi 2009 (ICAP) · Kolb 1984 · Christensen 2003 (JTBD) · Reason 1990 *Human Error* · Festinger 1957.

### Negocio / servicio / psicología del consumidor
Cialdini 1984 *Influence* · Kahneman 2011 *Thinking Fast and Slow* · Tversky & Kahneman 1981 (framing) · Kotler *Marketing for Hospitality and Tourism* · Heskett et al. 1994 *Service Profit Chain* (HBR) · Hart/Heskett/Sasser 1990 *Service Recovery Paradox* (HBR) · Hofstede 1980 *Cultural Dimensions* · Willis & Todorov 2006 (Princeton) · Carnegie · Cornell School of Hotel Administration 2014 (rating→ADR) · TARP service studies · Vallerand 1997.

### Estándares hotelería + compliance
NMX-F-605-NORMEX-2018 (DOF 2019) · Manual Distintivo H SECTUR 2020 · NOM-035-STPS-2018 + Guías I/II/III/IV/V · NOM-018-STPS-2015 (GHS) · NOM-251-SSA1 · LFT (México) · ILO C190 · AHLEI CFDR/CHHE/CGSP/CHS · AHLEI START · O*NET · CONOCER EC0124.

### Salud / seguridad / técnico
CDC (Foodborne, Environmental Services, Norovirus, Universal Precautions, Hand Hygiene) · FDA Food Code · USDA Pathogen Modeling · OSHA (Bloodborne Pathogens, Hazard Communication, Academy 610, General Duty Clause) · NIOSH lifting guidelines · EPA (List N/K, Sanitizer, Antimicrobial) · Codex Alimentarius CAC/RCP 1-1969 · ISO 22000 · NSF International · UK FSA · WHO.

### Pagos / fiscal / datos
PCI-DSS v4.0 · Visa Core Rules (Dispute Management, Reason Codes) · CFDI 4.0 SAT · GDPR · LFPDPPP (derechos ARCO).

### Benchmarks LMS / certificación
ServSafe Manager (ratio bancos) · ABMP CMTBC · SuccessFactors/TalentLMS/iSpring/Docebo/Moodle/Cornerstone reviews (G2/Capterra) · AHLEI Academy/eHotelier/Typsy/EHL Edge/Tovuti.

> Cada lesson de los cursos producidos cita la fuente específica por concepto. El agente debe preservar esta trazabilidad al migrar.

---

## 16. Primer sprint sugerido (propón y confirma con el humano)

1. **Scaffold del monorepo** (API + web + mobile + content + games + packaging) con engine/content separation desde el día 1.
2. **Schema de datos** (Prisma o equivalente) con los modelos núcleo (§4.3) + Quiz Randomization en el engine.
3. **Pipeline de ingesta de contenido** (Markdown estructurado → JSON normalizado) — el contenido de los 3 cursos ya existe en este formato.
4. **Lesson player + Quiz engine** (con randomización universal) + Module-gating.
5. **Migrar los 3 cursos** (83 lessons + 750 preguntas) al formato del engine.
6. **Certificate generator** + endpoint verify.
7. **Exportador SCORM/xAPI** (Producto 2) — MVP.
8. **Game-pilot Phaser** (migrar el DDD existente).

**Antes de codear:** confirma el nombre del proyecto (§18), el stack exacto, y el orden del sprint con el humano.

---

## 17. Anti-patrones prohibidos (resumen)

- Course content hard-coded en el engine
- Terminología vendor en los cursos (rompe portabilidad)
- Quiz sin randomización (trampa interna del creador)
- Trivia gamificada disfrazada de simulador
- Leaderboards públicos (crowding-out)
- Games obligatorios para aprobar
- Microtransactions / pay-to-win / dark patterns
- Feedback punitivo ("perdiste"/"fail")
- Certificados sin examen aprobado / con datos sensibles públicos / firma MD5-SHA1
- Pre-generar todos los PDFs
- Publicar contenido sin reviewer experto + sin citas verificables
- Comprometer accesibilidad WCAG por "velocidad"

---

## 18. Naming (decidir antes de empezar)

El nombre debe ser vendor-neutral (NO atado al proyecto hotelero de origen) porque se venderá solo + a clientes que usan otros LMS. Sugerencias de naming framework:
- Evocar "aprendizaje operativo" / "capacitación" / "forja de habilidades"
- Funcionar en español e inglés (mercado LATAM + posible expansión)
- Disponible como dominio + handle

El humano define el nombre definitivo. Reemplazar todos los `<PROYECTO>` de este documento.

---

## Cómo continuó este proyecto (contexto de origen)

Este génesis prompt destila 13 días de research + producción de un sprint LMS dentro de un PMS hotelero. Se produjeron 3 cursos completos (83 lessons, 27 módulos, 750 preguntas de banco, 3 exámenes finales, sistema de certificación) + 8 documentos estratégicos (arquitectura engine/content, modelo comercial Cialdini/SDT, estrategia de games, mecánica de progreso modular, fundamentos pedagógicos, análisis de competencia, pricing). Todo ese material es la base a migrar. La decisión de extraerlo a un proyecto independiente nació del insight de que (a) el LMS es vendible como producto standalone, y (b) los cursos — al ser vendor-neutral por diseño — son vendibles como archivos portables a plataformas de terceros. Este documento captura el QUÉ y el PORQUÉ; el material de origen captura el contenido detallado.
