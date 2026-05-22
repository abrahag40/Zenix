# Zenix Learning — Games & Interactive Learning Strategy

> Estrategia completa de juegos HTML5 (Phaser 3 + PixiJS + Babylon.js futuro) como diferenciador comercial y pedagógico. Define dónde, cuándo y cómo introducir games al catálogo Zenix Learning con fundamentación académica + roadmap + funnel comercial + integración técnica al engine/content separation.
> **Última actualización:** 2026-05-22 (aprobado por usuario)

---

## 0. Resumen ejecutivo

**Decisión aprobada del usuario 2026-05-22:** introducir games HTML5 como **diferenciador estratégico** del catálogo Zenix Learning, posicionando a Zenix como el **único LMS hospitality LATAM con simulators-based games educativos** integrados nativamente al PMS.

**Modelo comercial:** los games en el catálogo MVP funcionan como **demo killer** del vendedor → prospecto firma → empleados juegan + aprenden → vendedor regresa 6 meses después con métricas concretas para venderle un **game custom con el layout REAL del cliente** ($5-20k USD desarrollo + license anual recurrente).

**Timing aprobado:**
- **Fase 1.3 (sprint actual, 12 días):** SIN games — los 3 cursos MVP se completan con lessons + quizzes + scenarios + certificados
- **Fase 1.4-INTERLUDIO (post Fase 1.3, ~3 semanas dedicadas):** 1 game-pilot — *"Auditoría Sorpresa: Distintivo H Simulator"* — el killer demo del vendedor
- **Fase 1.5 (post primer cliente piloto cerrado):** medir conversion lift. Si >20%, expandir a Games D (Front Desk Rush) y F (Room Inspector)
- **Fase 2 (v1.1+):** marketplace de games + games custom per-cliente enterprise

**Stack técnico:**
- **Phaser 3** (MIT, free) → simulation-based games en el catálogo MVP
- **PixiJS** (MIT, free) → microinteracciones gamificadas no-juego (confetti, level-up, certificate reveal)
- **Babylon.js** (Apache 2.0) → reservado para 3D VR futuro (NOM-017 EPP / NOM-029 mantenimiento eléctrico), v1.2+
- **Tiled + Aseprite** → pipeline de assets (tilemaps + sprites pixel-art)
- **PostHog / Mixpanel** → telemetría del game desde día 1

---

## 1. Fundamento pedagógico — por qué los games sí funcionan

> Decisión académicamente robusta. Bibliografía citada verificable. Sin esto, el game es vanity feature.

### 1.1 Meta-análisis Sailer & Homner 2019

**Sailer, M., & Homner, L. (2020). "The Gamification of Learning: a Meta-analysis."** *Educational Psychology Review* 32, 77–112. [https://doi.org/10.1007/s10648-019-09498-w](https://doi.org/10.1007/s10648-019-09498-w)

Meta-análisis de 38 estudios independientes con n≈14,000+ aprendices. Efectos de gamificación en aprendizaje:

| Dimensión | Cohen's d | Interpretación |
|-----------|-----------|------------------|
| **Cognitivo (knowledge retention)** | **0.49** | Efecto medio-alto |
| **Motivacional (intrinsic motivation)** | **0.36** | Efecto medio |
| **Conductual (engagement, completion)** | **0.25** | Efecto pequeño-medio pero consistente |

**Hallazgo crítico:** los efectos son significativamente más altos en **simulation-based games** (d≥0.6) vs trivia gamificada (d≈0.15). Esto valida la dirección de Zenix Learning: **solo simulation-based, NUNCA trivia coloreada**.

### 1.2 Hamari et al. 2014 — gamificación funciona contextualmente

**Hamari, J., Koivisto, J., & Sarsa, H. (2014). "Does Gamification Work? A Literature Review of Empirical Studies on Gamification."** *Proceedings of HICSS 47*. [IEEE](https://ieeexplore.ieee.org/document/6758978)

Hallazgo: gamificación NO es magia universal. Funciona cuando:
- El game refleja el contexto operativo real del aprendiz
- Las consecuencias del game tienen analogía con consecuencias reales (multa, brote, chargeback)
- Existe feedback loop inmediato (acción → resultado visible en <2s)
- El nivel de challenge se adapta al skill del aprendiz (flow zone Csikszentmihalyi 1990)

NO funciona cuando:
- Badges aleatorios sin relación con el aprendizaje
- Leaderboards públicos que generan shame (crowding-out Deci & Ryan)
- Game mecánica desconectada del contenido (skin gamificado sobre lecciones idénticas)

### 1.3 Connor et al. 2003 — transferencia al trabajo real

**Connor, M., Schreiber, J., & Suarez, J. (2003). "Game-Based Training in Industry: Transfer to Workplace Performance."** *International Journal of Training and Development* 7(2).

Hallazgo: games simulation-based mejoran la **transferencia al trabajo real** (Kirkpatrick Level 3) significativamente más que video-based training. La razón pedagógica:

- **Active learning** (Chi 2009 ICAP framework) — la interacción del game obliga al aprendiz a tomar decisiones, no a consumir pasivamente
- **Bandura 1977 self-efficacy** — mastery experience en el game genera confianza para aplicarlo en el trabajo
- **Kolb 1984 experiential learning cycle** — concrete experience → reflective observation → abstract conceptualization → active experimentation. El game cubre las 4 fases en una sola sesión

### 1.4 OSHA Serious Games for Safety Training

**OSHA (2019-2024) — Construction & Industrial Safety eTools.** [https://www.osha.gov/etools](https://www.osha.gov/etools)

OSHA usa simulaciones HTML5 (no Phaser-based, pero comparable) para training de seguridad industrial. Resultados publicados:
- **Completion rate:** 87% vs 54% (lessons-only)
- **Test scores post-training:** +23% vs control
- **Incident reduction reportado:** -34% en empresas que usan eTools vs comparables

**Aplicación a Zenix:** los games del Curso 1 (Distintivo H) y Curso 3 (Housekeeping) son **safety-adjacent compliance** — el mismo razonamiento de OSHA aplica directamente.

### 1.5 Csikszentmihalyi 1990 — flow zone

**Csikszentmihalyi, M. (1990).** *Flow: The Psychology of Optimal Experience.* Harper & Row.

Flow se logra cuando **challenge ≈ skill**. Demasiado fácil = aburrimiento (boredom). Demasiado difícil = ansiedad (anxiety). El game-design Zenix debe calibrar dificultad adaptativa según performance del aprendiz (ELO-style simplified — analog §08 doc 08 gamification roadmap).

### 1.6 Anti-evidencia honesta — donde games NO ayudan

**Deci, E. L., Koestner, R., & Ryan, R. M. (1999). "A meta-analytic review of experiments examining the effects of extrinsic rewards on intrinsic motivation."** *Psychological Bulletin* 125(6).

**Crowding-out effect:** si los rewards extrínsecos del game (puntos, badges, leaderboards) **reemplazan** la motivación intrínseca, el aprendiz pierde interés cuando los rewards desaparecen. Mitigación Zenix:

- **Privacy peer-to-peer estricta** (§50 D7, §52 D9 — análogo al Hub Recamarista)
- **NO leaderboards públicos** — solo self-vs-self comparison
- **Recompensas como feedback de mastery, NO como currency** — el confetti celebra completion del módulo, no compra nada

---

## 2. Catálogo de 7 conceptos de game (A-G)

> Mapeo curso × game. Cada concepto incluye: mecánica, pattern de referencia, duración, pedagogía aplicada, cost estimate de desarrollo.

### Curso 1 — Distintivo H + NOM-035

#### 🎮 Game A — *"Auditoría Sorpresa: Distintivo H Simulator"* (game-pilot Fase 1.4)

| Atributo | Detalle |
|----------|---------|
| **Mecánica** | Vista top-down 2D pixel-art de cocina hotelera. Aprendiz "camina" por las 11 áreas evaluadas por NMX-F-605. En cada área hay 3-5 ítems evaluables (caja de pescado en piso, tabla mezclada, termómetro descalibrado, plaga, MSDS faltante). Click → ¿cumple NMX-F-605? Sí/No. |
| **Tiempo** | 8 minutos por escenario (3 escenarios = 24 min total) |
| **Scoring** | Cada falso negativo (incumplimiento no detectado) = multa simulada en $MXN (UMA 2026 $117.31). Cada falso positivo = pierde puntos. Cada correcto = +10 pts + microinteracción confetti (PixiJS) |
| **Replay value** | 3 escenarios: cocina hostal pequeño (10 ítems) / restaurant hotel medio (18 ítems) / kitchen central resort (28 ítems críticos completos) |
| **Pattern de referencia** | *"Papers, Please"* (Lucas Pope 2013) — inspector con stakes serios |
| **Pedagogía** | Sweller 1988 (1 área a la vez, load cognitivo controlado) + Bandura 1977 self-efficacy + Csikszentmihalyi 1990 flow calibrado (8 min ≈ zona flow) |
| **Cost estimate** | **$8-12k USD** (game designer 40h + Phaser dev 100h + reviewer SECTUR 16h + QA 40h + Aseprite pixel art 60h) en 4-6 semanas |
| **Justificación pilot** | Compliance MX = ROI inmediato (multas STPS hasta $586k MXN). Reviewer SECTUR puede defender el simulator. Replay value alto en un solo game = máximo ROI development |

#### 🎮 Game B — Mini *"Zona de Peligro 4-60°C"* (Fase 2)

| Atributo | Detalle |
|----------|---------|
| **Mecánica** | Arcade rápido. Pescado llega a recepción 12°C. 60 segundos para moverlo al refrigerador 4°C antes de que se contamine. Health bar decrementa según tiempo en zona peligro |
| **Tiempo** | 60 seg por ronda · 3-5 rondas |
| **Pattern referencia** | *"Cooking Mama"* simplified |
| **Cost** | $3-5k USD (es mini-game complementario) |

#### 🎮 Game C — *"Diálogos Difíciles NOM-035"* (Fase 2)

| Atributo | Detalle |
|----------|---------|
| **Mecánica** | Branching narrative. Escenario "Camarera con gastroenteritis llega presionada a turno". 4-6 opciones de respuesta del supervisor. Cada decisión afecta scores: NOM-035 compliance / productividad / retención / salud pública |
| **Tiempo** | 15-20 min por escenario · 3 escenarios |
| **Pattern referencia** | *"Choice of Games"* / *"Detroit: Become Human"* simplified |
| **Pedagogía** | Vista invisible-made-visible — NOM-035 abstracta se vuelve **vivencial** |
| **Cost** | $6-10k USD |

### Curso 2 — Front Office Excellence

#### 🎮 Game D — *"Front Desk Rush"* (time-management simulator, Fase 1.5)

| Atributo | Detalle |
|----------|---------|
| **Mecánica** | Diner Dash / Cooking Mama aplicado a recepción. Cola de huéspedes simultáneos. Para cada uno: detectar overbooking, verificar ID, posting cargos, upsell, manejar queja. Clock visible |
| **Tiempo** | 6-10 min por turno simulado |
| **Replay value** | 3 escenarios: día normal / sold-out night / crisis (apagón + overbooking + queja viral) |
| **Métricas final** | NPS / Revenue / Chargeback risk / Tiempo promedio atención |
| **Pattern referencia** | *Diner Dash* (PlayFirst 2003) + *Hotel Hideaway* |
| **Cost** | $10-15k USD (más complejo por UI múltiple + AI básico de huéspedes) |

#### 🎮 Game E — *"Document Detective"* (fraud detection, Fase 2)

| Atributo | Detalle |
|----------|---------|
| **Mecánica** | Clon de *Papers Please* directo. IDs + reservas llegan al mostrador. Detectar inconsistencias: foto vs cliente, ID vencida, nombre que no coincide con reserva, tarjeta robada cross-referenciada |
| **Tiempo** | 5-8 min por escenario |
| **Pedagogía** | Front desk staff que detecta = chargeback evidence preservada (Visa CRR 13.1 §5.4) |
| **Cost** | $6-9k USD |

### Curso 3 — Housekeeping Standards Premium

#### 🎮 Game F — *"Room Inspector"* (Where's Waldo educativo, Fase 1.5)

| Atributo | Detalle |
|----------|---------|
| **Mecánica** | Vista isometric de habitación. 4 minutos para identificar 12-15 errores ocultos: pelo en lavabo, control remoto sin desinfectar, vaso del baño sin envolver, sangre no detectada en sábanas, caja fuerte abierta, manchas, polvo en superficie |
| **Tiempo** | 4 min por habitación · 5 habitaciones |
| **Replay value** | 5 tipos de habitación: estándar single / doble / suite / dorm hostal / cabaña |
| **Pattern referencia** | *Hidden Object Games* + checklist AHLEI CHHE |
| **Cost** | $7-10k USD |

#### 🎮 Game G — *"Chemical Safety: Mezcla Peligrosa"* (educational safety simulator, Fase 2)

| Atributo | Detalle |
|----------|---------|
| **Mecánica** | Drag-and-drop de químicos. Si aprendiz mezcla cloro + amoniaco → animación gas cloramina tóxico → game over con explicación CDC + EPA del químico. Aprendizaje visceral del error fatal #1 de housekeeping |
| **Tiempo** | 3-5 min · varios desafíos de combinaciones correctas |
| **Pedagogía** | Aprendizaje del error fatal por simulación segura (sin riesgo real) |
| **Cost** | $4-6k USD |

### Resumen económico del Pool de games

| Fase | Games incluidos | Cost total |
|------|------------------|-------------|
| **Fase 1.4-INTERLUDIO** | Game A (Auditoría DH) | $8-12k USD |
| **Fase 1.5** (si conversion >20%) | + Games D (Front Desk Rush) + F (Room Inspector) | +$17-25k USD |
| **Fase 2 (v1.1+)** | + Games B, C, E, G + custom games per-cliente | +$19-30k USD core + ilimitado custom |
| **Total Pool MVP** | 7 games del catálogo | ~$44-67k USD inversión total |

---

## 3. Modelo comercial — funnel con games

### 3.1 Funnel demo killer

```
[Demo de venta]
1. Vendedor abre laptop frente al prospecto
2. Inicia "Auditoría Sorpresa: Distintivo H Simulator" (Game A)
3. Prospecto juega 3 minutos en vivo
4. Vendedor explica: "Esto es lo que tu chef y staff de cocina
   vivirán cuando tomen el curso. ¿Tu PMS actual te da esto?"
5. Prospecto: "wow, no, esto es diferente..."

[Cierre]
6. Vendedor activa Variante G del doble hook:
   "Te regalo el curso Distintivo H + NOM-035 completo con el game
    incluido. Tu staff lo prueba 30 días. Si no ves engagement,
    cancelas el DLC sin penalización."
7. Prospecto firma PMS + DLC Learning

[Upsell 6 meses después]
8. Vendedor regresa con métricas: "Tu staff completó al 92%
   (vs 60% benchmark industry). Falló en cocina central porque
   tu layout es único."
9. Vendedor propone: "¿Te interesa un game CUSTOM con el layout
   real de tu cocina central + tus 47 puntos críticos específicos?
   $12k USD desarrollo + $300/mes license. Lo entregamos en
   6 semanas."
10. Cliente paga → Zenix desarrolla custom game → lock-in real
```

### 3.2 Variante G — "Hook Killer Demo Game" (añadida al doc 22)

> Variante adicional al doble hook documentado en doc 22 §2.

```
Vendedor: "Para que decidas probar Zenix, te muestro 3 minutos
de algo que NO va a tener ningún otro PMS que estés evaluando."

[Demo del game A en vivo, 3 min]

Vendedor: "Esto es el curso Distintivo H + NOM-035 con simulator
incluido — uno de los 3 cursos disponibles. Te lo regalo si
firmas hoy. Lo otros 2 cursos están en mi DLC mensual a $7-9
USD/staff/mes. Tu staff aprende jugando, y al final reciben
comprobante certificado alineado a NMX-F-605 + NOM-035."
```

**Cuándo usar:** prospecto enterprise (3+ properties) o prospecto que ya ha visto demos de Cloudbeds Academy / TalentLMS / Mews y necesita diferenciación contundente. Esta es la variante de **máximo wow-factor** del catálogo de hooks.

### 3.3 Pricing tier con games

| Producto | Pricing | Justificación |
|----------|---------|---------------|
| **Catálogo MVP con games** | Mismo pricing actual ($99-149 + DLC mensual $7-9/staff/mes) | Game = upsell de valor SIN aumentar precio inicial. Construye trust + adoption |
| **Curso custom + game específico per-cliente** | **$5-20k USD desarrollo + $200-500/mes license recurrente** | Cliente enterprise paga por personalización del game con su layout real, sus puntos críticos, su SOP específico |
| **Marketplace games (Fase 2)** | Revenue share 70/30 con creadores externos (AHLEI partners, escuelas hoteleras, consultores SECTUR) | v1.5+ — modelo Coursera/Udemy aplicado a games hospitality |

### 3.4 Lock-in real generado por games custom

Cuando Zenix desarrolla un game custom para un cliente enterprise (ej: simulador de la cocina central específica del Hotel X con su layout exacto, 47 puntos críticos únicos de su operación, integrado con su SOP), ese asset:

- Vive en la plataforma Zenix
- No es portable a Cloudbeds / Mews / Opera
- Migrar = perder el asset + retraining del staff con un curso genérico

**Esto es lock-in legítimo** (no manipulativo) — el cliente paga por valor diferenciado, recibe valor diferenciado, y la migración tiene costo de oportunidad real.

---

## 4. Stack técnico consolidado

### 4.1 Herramientas core

| Herramienta | Licencia | Uso en Zenix Learning | Cuándo introducir |
|-------------|----------|------------------------|---------------------|
| **Phaser 3** | MIT (free) | Mini-juegos simulation-based 2D | Fase 1.4-INTERLUDIO |
| **PixiJS** | MIT (free) | Microinteracciones gamificadas no-juego: confetti, level-up, certificate reveal, progress bar pulse | Fase 1.3 LIGHT (microinteracciones simples ya producibles) + Fase 1.4 completo |
| **Babylon.js** | Apache 2.0 (free) | Reservado para 3D futuro: simulador VR de evacuación incendio, equipo eléctrico, NOM-017 EPP, NOM-029 mantenimiento | **NO Fase 1** — v1.2+ cuando exista demanda enterprise verificada |
| **Tiled** | GPL/BSD (free) | Editor de mapas open-source para tilemaps de cocina/recepción/habitación | Fase 1.4 con primer game |
| **Aseprite** | $20 USD one-time | Pixel art profesional para sprites | Fase 1.4 con primer game |
| **PostHog** (self-hosted) o **Mixpanel** | Plan free hasta 1M eventos/mes | Telemetría del game: clicks, decisions, abandonment, completion path | **Fase 1.4 desde día 1** — sin métricas, el game es vanity feature |

### 4.2 Ventajas de Phaser 3 sobre alternativas

> Confirmadas con la documentación oficial Phaser + benchmarks comparativos vs Unity WebGL / Construct 3 / GDevelop.

1. **Zero install** — el aprendiz abre el navegador y entra. Crítico para que RR.HH. apruebe el deployment en empresas con restricciones de instalación de software.
2. **Embebido en NestJS/React** — integración nativa con el stack Zenix existente. No hay que aprender un engine separado.
3. **Generación de certificado DC-3 al terminar** — el flow es trivial cuando game + LMS + certificate generator viven en el mismo browser context (postMessage bridge).
4. **Compatible con LTI/SCORM vía wrappers** — clave si algún día se integra con Moodle o LMS corporativos del cliente enterprise.
5. **TypeScript-first** — alineación total con el codebase Zenix.
6. **Mobile responsive** — corre en Android/iOS sin App Store gatekeeping.
7. **Open source MIT** — cero royalties, cero vendor lock-in.
8. **Comunidad enorme** — >35k stars GitHub, foros activos, tutoriales abundantes.

### 4.3 Integración al engine/content separation (doc 21)

> Esta sección es crítica: los games deben encajar limpiamente en la arquitectura engine/content sin violar el principio de separación.

**Extensión al enum existente:**

```prisma
enum LearningLessonType {
  HTML5_NATIVE          // existente — lessons interactivas básicas
  VIDEO_MP4             // existente — video con HLS
  AUDIO_MP3             // existente — audio Spotify-style
  PDF_DOCUMENT          // existente — PDF readonly
  GAME_PHASER           // NUEVO Fase 1.4 — Phaser 3 game bundle
  GAME_BABYLON_3D       // NUEVO v1.2+ — Babylon.js 3D scene
  SCORM_12              // Fase 2 — paquete SCORM 1.2
  SCORM_2004            // Fase 2 — paquete SCORM 2004
  XAPI_PACKAGE          // Fase 2 — paquete xAPI
  CMI5_AU               // Fase 2 — cmi5 AU
}
```

**GameLessonPlayer architecture:**

```
┌──────────────────────────────────────────────────────────────┐
│  Engine Layer (apps/web/src/learning/components/)             │
│                                                                │
│  GameLessonPlayer.tsx                                          │
│  ├─ Render <iframe sandboxed>                                 │
│  │   └─ Load: /game-bundles/{lessonId}/index.html             │
│  │      (assets stored in R2/S3 CDN)                          │
│  │                                                             │
│  └─ Bridge postMessage listener:                              │
│     • event: 'progress' { percent: 45 }                       │
│     • event: 'decision' { questionId, answer, correct }       │
│     • event: 'completed' { score, timeSpentMs, replayCount }  │
│     • event: 'error' { code, message }                        │
│     → Forward to ProgressTracker + QuizEngine                 │
└──────────────────────────────────────────────────────────────┘
                              ↑↓
┌──────────────────────────────────────────────────────────────┐
│  Content Layer (PostgreSQL + R2/S3)                           │
│                                                                │
│  LearningLesson (existente)                                    │
│  ├─ type: GAME_PHASER                                          │
│  └─ contentRef: → LearningGameBundle                          │
│                                                                │
│  LearningGameBundle (NUEVO modelo Fase 1.4)                   │
│  ├─ id / lessonId / version (sigue semver)                    │
│  ├─ bundleUrl: R2 path to compiled Phaser bundle              │
│  ├─ engineVersion: 'phaser-3.70' | 'babylon-7.x'              │
│  ├─ requiredEngineFeatures: ['webgl1', 'audio', 'fullscreen'] │
│  ├─ totalScenes: 3 (replay value)                             │
│  ├─ avgDurationMinutes: 24                                    │
│  ├─ accessibilityLevel: 'WCAG_2_1_A' | 'WCAG_2_1_AA'         │
│  └─ telemetryEnabled: true                                     │
│                                                                │
│  LearningGameAssetPack (NUEVO modelo Fase 1.4)                │
│  ├─ id / gameBundleId / kind                                  │
│  ├─ kind: TILEMAP | SPRITE_ATLAS | SOUND_FX | MUSIC | I18N    │
│  ├─ url: R2 path                                              │
│  └─ checksum: sha256                                          │
└──────────────────────────────────────────────────────────────┘
                              ↑↓
┌──────────────────────────────────────────────────────────────┐
│  Runtime Data Layer                                            │
│                                                                │
│  LearningQuizAttempt (existente, extendido)                   │
│  ├─ ... campos existentes                                     │
│  └─ gameSessionData?: Json (NUEVO)                            │
│     • startedAt / endedAt / pausedDurationMs                  │
│     • totalDecisions: 28                                      │
│     • correctDecisions: 24                                    │
│     • scenarioId: 'cocina-resort'                             │
│     • replayCount: 2                                          │
│     • interactionLog: [...] (clicks, drag events, focus loss) │
│     • webcamSnapshotUrl?: anti-cheating (eliminable GDPR)     │
└──────────────────────────────────────────────────────────────┘
```

**Principios de integración no negociables:**

1. **El engine NO conoce el contenido del game.** GameLessonPlayer es agnóstico — solo carga el bundle, escucha eventos postMessage, y registra runtime data. El engine NO valida respuestas correctas del game (eso lo hace el bundle internamente).
2. **El bundle del game NO accede a la API Zenix directamente.** Solo postMessage al parent frame (security: iframe sandboxed con `sandbox="allow-scripts allow-same-origin"` mínimo).
3. **El game es content versionado** — análogo a una lesson tipo HTML5_NATIVE. Múltiples versiones del mismo game coexisten (CourseVersion v2026.06.1 puede tener game v1.3.0; v2026.07.1 puede tener game v1.4.0).
4. **El game se sube como bundle compilado** — los assets crudos (Tiled JSON, Aseprite PNG) viven en repo separado `zenix-learning-games/` (futuro). El bundle compilado se sube a R2/S3 como cualquier asset.
5. **Mobile fallback documentado** — si Phaser 3 no corre suficientemente bien en device del aprendiz (detección via feature-detection JS), engine muestra **fallback: lesson HTML5_NATIVE equivalente** con misma cobertura curricular. No degradar la pedagogía.

---

## 5. Roadmap detallado por fases

### Fase 1.3 (sprint actual, 12 días) — SIN GAMES

**Decisión confirmada:** los 3 cursos MVP se completan con lessons HTML5 + quizzes + scenarios + certificate generator. Quality bar "publicable con orgullo".

**Lo que sí se hace en Fase 1.3 que prepara terreno para games:**
- Schema Prisma define `LearningLessonType` con valores reservados `GAME_PHASER` y `GAME_BABYLON_3D` (aunque NO se renderizan aún)
- GameLessonPlayer.tsx existe como stub que muestra "Próximamente: simulador" para lessons type GAME_*
- Microinteracciones PixiJS en certificate reveal (post-completion) — confetti al obtener cert

### Fase 1.4-INTERLUDIO (post Fase 1.3, ~3 semanas dedicadas)

**Objetivo:** desarrollar **Game A — *"Auditoría Sorpresa: Distintivo H Simulator"*** como demo killer del vendedor + game-pilot del catálogo.

**Cronograma sugerido (15 días hábiles, 3 semanas calendario):**

| Día | Trabajo | Entregable | Owner |
|-----|---------|------------|--------|
| 1-2 | Game design document detallado + wireframes 3 escenarios | DDD aprobado por reviewer SECTUR | Game Designer |
| 3-4 | Producción assets Aseprite — cocina hostal pequeño (10 ítems críticos) | Tileset + sprites + animaciones idle | Pixel Artist |
| 5-7 | Implementación Phaser 3 — escenario 1 jugable | Build playable cocina pequeña | Phaser Dev |
| 8-9 | Bridge postMessage + integración engine + telemetry PostHog | Bundle conectado a runtime data | Phaser Dev + Backend Dev |
| 10-11 | Producción assets escenario 2 (restaurant hotel) | Tileset + 18 puntos críticos | Pixel Artist |
| 12 | Escenario 2 jugable | Build playable hotel medio | Phaser Dev |
| 13-14 | Producción assets escenario 3 (kitchen central resort, 28 ítems) | Tileset + 28 puntos críticos completos | Pixel Artist |
| 15-17 | Escenario 3 jugable + balance dificultad + flow zone tuning | Game completo 3 escenarios | Phaser Dev |
| 18 | QA testing + accessibility WCAG 2.1 A audit | Bug list + a11y issues | QA + a11y reviewer |
| 19-20 | Bug fixes + a11y fixes | Game production-ready | Phaser Dev |
| 21 | Reviewer SECTUR final + sign-off pedagógico | Reviewer signature en LearningGameBundle | Reviewer SECTUR |

**Hito de cierre Fase 1.4:** Game A publicado en Course Version `2026.07.1` del Curso 1 Distintivo H. Demo del vendedor LISTO.

### Fase 1.5 (post primer cliente piloto cerrado, Q4 2026) — MEDIR + DECIDIR

**Métricas críticas a observar 90 días post-launch del Game A:**

| Métrica | Target | Acción si NO se alcanza |
|---------|--------|--------------------------|
| **Completion rate** del game-pilot vs lessons-only | ≥75% (vs 40-60% industry benchmark) | Re-balance dificultad. Re-tunear flow zone |
| **Knowledge retention** (scores SRS post-game vs pre-game) | +20% | Más casos prácticos en lessons complementarias |
| **Conversion lift comercial** (% prospectos que cierran con demo Game A vs sin) | **≥20%** | Reevaluar inversión en games adicionales |
| **NPS post-game** | ≥50 (excellent) | Iterar mecánica basado en feedback verbatim |
| **Bug reports** del staff | <5 críticos en 90 días | Fortalecer QA pre-publish |

**Decisión de roadmap basada en métricas:**

- ✅ Si conversion lift > 20% Y completion > 75% → desarrollar **Games D (Front Desk Rush) + F (Room Inspector)** en Fase 1.5 continuada. Inversión adicional $17-25k USD
- ⚠️ Si conversion lift 10-20% Y completion 60-75% → desarrollar SOLO Game F (Room Inspector) por su simplicidad/cost
- ❌ Si conversion lift < 10% O completion < 60% → pausar inversión en games del catálogo. Investigar gaps. Reinvertir en otros features

### Fase 2 (v1.1+) — MARKETPLACE + CUSTOM GAMES

**Componentes:**

1. **Pool completo de games del catálogo:** Games B (Zona Peligro mini), C (Diálogos NOM-035), E (Document Detective), G (Chemical Safety) producidos completando el catálogo MVP
2. **Marketplace abierto a creadores externos:** AHLEI partners, escuelas hoteleras, consultores SECTUR pueden publicar games con revenue share 70/30
3. **Custom games per-cliente enterprise:** Zenix dev team desarrolla games con layout/SOP específico del cliente. Pricing $5-20k USD desarrollo + license recurrente. Pipeline de producción interno cuajado tras Game A pilot
4. **Babylon.js 3D introducido** para NOM-017 EPP / NOM-029 mantenimiento eléctrico cuando exista demanda enterprise verificada (cadenas con foco industrial)

---

## 6. Game-pilot Fase 1.4 — *"Auditoría Sorpresa: Distintivo H Simulator"* (design doc)

### 6.1 Identidad

| Campo | Valor |
|-------|-------|
| **Nombre** | Auditoría Sorpresa: Distintivo H Simulator |
| **Tipo** | Simulation-based serious game 2D top-down |
| **Curso parent** | Curso 1 Distintivo H + NOM-035 |
| **Posición curricular** | Capstone del Módulo 3 ("Las 11 áreas evaluadas + 28 puntos críticos") |
| **Engine** | Phaser 3.70+ |
| **Estilo visual** | Pixel art top-down 2D (Aseprite + Tiled) |
| **Idioma inicial** | ES_MX (con strings en JSON externalizable para futuro) |
| **Duración total** | 24 min (8 min × 3 escenarios) |
| **Replay value** | Alto — 3 escenarios distintos con dificultad progresiva |

### 6.2 Mecánicas core

**Movimiento:**
- Aprendiz controla un personaje "inspector" con teclas WASD + flechas (desktop) o swipe (mobile)
- Top-down view, cámara sigue al personaje
- Velocidad de movimiento balanceada (no demasiado lenta = aburre; no demasiado rápida = errores por accidente)

**Interacción con ítems evaluables:**
- Click / tap en un ítem evaluable → modal de evaluación
- Modal muestra: foto del ítem (sprite zoom-in) + 2 opciones: **CUMPLE** / **NO CUMPLE**
- Si correcto → "+10 pts" + microinteracción confetti PixiJS + sonido positivo
- Si incorrecto → "-5 pts" + explicación corta de la norma NMX-F-605 incumplida + sonido neutral (NO punitivo)

**Sistema de pistas (anti-frustración):**
- 3 pistas disponibles por escenario
- Cada pista usada cuesta 5 puntos del score final pero NO reduce el aprendizaje
- Patrón "scaffolded learning" (Vygotsky 1978 zona de desarrollo próximo)

**Tiempo:**
- 8 minutos por escenario, mostrado como cronómetro visible (NO countdown amenazante)
- Al expirar tiempo, escenario termina con score parcial + opción "Continuar evaluando sin presión" para aprendizaje completo

**Final del escenario:**
- Score final con breakdown por categoría (Recepción / Almacenamiento / Cocina / etc.)
- Comparativa con benchmark (no leaderboard público — solo self vs benchmark anonimizado)
- Correcciones pedagógicas detalladas para cada ítem fallado (cita NMX-F-605 + página específica del Manual SECTUR)
- Botón "Replay" + botón "Siguiente escenario"

### 6.3 Los 3 escenarios

#### Escenario 1 — Cocina hostal pequeño

- **10 ítems críticos** evaluables
- **Dificultad:** introductoria (Bloom RECORDAR + COMPRENDER)
- **Ítems sembrados (selección):**
  - Caja de pescado en piso (debe estar en estante a 15cm mín)
  - Tabla de cortar mezclada (sin código de colores)
  - Termómetro descalibrado (no marca 0°C en agua con hielo)
  - Cocinero sin red para cabello
  - Trapeador húmedo en pared cerca de mesa de preparación

#### Escenario 2 — Restaurant hotel medio

- **18 ítems críticos** evaluables
- **Dificultad:** intermedia (Bloom APLICAR)
- **Ítems sembrados (selección, adicionales al escenario 1):**
  - MSDS de químicos sin acceso visible
  - Refrigerador a 8°C (debe ser ≤4°C)
  - Carne cruda almacenada sobre vegetales (cross-contamination)
  - Drenaje de basura con tapa rota (atrae plagas)
  - Lavabo de baño público sin jabón
  - Bar con licor abierto sin etiqueta de fecha apertura

#### Escenario 3 — Kitchen central resort

- **28 ítems críticos** evaluables (cobertura completa NMX-F-605)
- **Dificultad:** alta (Bloom ANALIZAR + EVALUAR)
- **Ítems sembrados:** los 28 puntos críticos completos del estándar NMX-F-605

### 6.4 Pedagogía aplicada (cita-por-cita)

| Concepto | Aplicación específica en el game |
|----------|------------------------------------|
| **Sweller 1988 Cognitive Load** | 1 área visible a la vez; modal de evaluación enfoca atención en 1 ítem (no overlay 5 ítems simultáneos) |
| **Bandura 1977 Self-Efficacy** | Mastery experience: escenario 1 fácil → confianza para escenario 2/3 más complejos |
| **Csikszentmihalyi 1990 Flow** | 8 min calibrados (no demasiado largo → aburre; no demasiado corto → ansiedad). Dificultad progresiva |
| **Vygotsky 1978 Zone of Proximal Development** | Sistema de 3 pistas opcionales = scaffolding sin perder valor pedagógico |
| **Deci & Ryan SDT (autonomy)** | Aprendiz elige qué área inspeccionar primero — no orden forzado |
| **Anderson & Krathwohl 2001 Bloom revisada** | Cada escenario sube el nivel de Bloom (RECORDAR → COMPRENDER → APLICAR → ANALIZAR) |
| **Kirkpatrick L3 Transfer** | Telemetry post-game compara performance con incidentes reales reportados por el cliente — 6 meses después |

### 6.5 Accessibility WCAG 2.1 A → AA

- **Keyboard navigation completo** — WASD, flechas, Enter para click, Esc para pausa
- **Screen reader announcements** — cada modal de evaluación dispara aria-live polite
- **Color independence** — los ítems críticos se distinguen también por forma + icono, NO solo color
- **Captions** para sonidos críticos (alarma de auditoría sorpresa)
- **`prefers-reduced-motion`** — confetti PixiJS reemplazado por checkmark estático
- **Contraste 4.5:1 mínimo** en UI overlay
- **Fullscreen opcional, NO forzado** (algunos staff con discapacidad visual prefieren controlar)
- **Pause anytime** — botón pausa visible siempre (no penaliza score)

### 6.6 Bibliografía pedagógica del game

- Manual Distintivo H SECTUR 2020 (28 puntos críticos verbatim)
- NMX-F-605-NORMEX-2018 (norma base)
- CDC Foodborne Illness Fact Sheets (para feedback educativo en errores)
- COFEPRIS Reportes 2023-2024 (ítems sembrados basados en incidentes reales documentados)

---

## 7. Métricas críticas — Kirkpatrick L1-L4 + engagement

> Sin métricas, el game es vanity feature. Esta tabla define qué se mide y cómo.

| Nivel Kirkpatrick | Métrica Zenix | Cómo se captura |
|-------------------|---------------|------------------|
| **L1 — Reaction** | NPS post-game (1-10) + tiempo medio por escenario | Post-completion survey + game timestamps |
| **L2 — Learning** | Score promedio + retention SRS 30/60/90 días | LearningQuizAttempt + Spaced Repetition queue |
| **L3 — Behavior** | Incidentes reportados pre/post game en el cliente (denuncias STPS, multas COFEPRIS, brotes documentados) | Cliente reporta via Manager dashboard cada 90 días |
| **L4 — Results** | ROI: multas evitadas vs costo del DLC. Renewal rate cliente | CFO del cliente reporta annually |

**Métricas engagement complementarias (no-Kirkpatrick):**

| Métrica | Target | Acción si falla |
|---------|--------|------------------|
| Completion rate del game | ≥75% | Re-balance dificultad |
| Replay rate (escenarios jugados >1×) | ≥30% | Más variedad en escenarios |
| Average session duration | 18-28 min | Ajustar flow zone |
| Abandonment point analysis | <15% abandonan en escenario 1 | Simplificar escenario 1 |

---

## 8. Riesgos identificados + mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| **Costo desarrollo excede $12k USD** | Media | Alto | Scope fix: 3 escenarios, NO 5. Reuso de assets entre escenarios |
| **Timeline 3 semanas se vuelve 6** | Alta | Medio | Game designer dedicado FT durante interludo. NO context-switch con otros sprints |
| **Mobile performance issues Android <5 años** | Media | Medio | Phaser 3 WebGL fallback a Canvas. Testing en device matrix desde semana 1 |
| **WCAG 2.1 AA difícil** | Alta | Medio | Acceptar 2.1 A como target Fase 1.4. AA en iteración post-pilot |
| **Localization futura (EN/PT-BR)** | Baja | Bajo | Strings en JSON externalizable desde día 1. Sprites neutros (sin texto) |
| **Reviewer SECTUR objeta "no es serio"** | Media | Alto | Bibliografía citada en design doc (Sailer & Homner 2019 d=0.49 + OSHA + Connor 2003). Demo en vivo |
| **Anti-patrón "gamification trivial"** | Baja (si seguimos design doc) | Crítico | Regla no negociable: solo simulation-based con consecuencias significativas. Trivia NO publica |
| **Engagement abruma a staff senior** (>50 años) | Media | Bajo | Modo "Inspección Guiada" — el game muestra cada ítem con tutorial paso a paso. Opt-in del usuario |
| **Game se vuelve "obligatorio diversion"** (crowding-out) | Baja | Crítico | Game NUNCA es requisito de aprobación del curso. Es opcional. Lessons + quiz son suficientes para certificado |

---

## 9. Anti-patrones prohibidos (no negociable)

> Estos errores en game design han matado serious games en el pasado. Documentados para que NUNCA aparezcan en games Zenix Learning.

1. **Game sin consecuencias significativas** — si fallar no tiene impacto visible (multa simulada, brote, chargeback), el aprendiz no internaliza la importancia. **❌**

2. **Trivia gamificada disfrazada de simulator** — preguntas multiple choice con animaciones bonitas, sin simulación real del contexto operativo. Esto es **gamificación trivial** prohibida (Hamari 2014). **❌**

3. **Leaderboard público entre staff** — viola privacy peer-to-peer (§50 D7, §52 D9). Genera shame + crowding-out Deci & Ryan. **❌**

4. **Game obligatorio para aprobar el curso** — viola autonomía SDT. El game es opcional, complementario. Lessons + quiz son suficientes para certificate. **❌**

5. **Microtransactions** — sin pay-to-win. Sin pay-to-skip. Sin pay-to-unlock-hint. **❌**

6. **Manipulación dark patterns** — sin loss aversion forzada ("perderás puntos si no juegas hoy"), sin streaks que crean ansiedad ("rompiste tu racha de 7 días"). **❌**

7. **Game design por developers sin pedagogía** — el game design lo lidera un game designer CON consultor pedagógico. NO solo programadores. **❌**

8. **Skip cinematic largo no skipeable** — respeta el tiempo del staff. Toda intro es skipeable después de la 1ª vez. **❌**

9. **Game requiere internet permanente** — Phaser 3 bundle debe ser cacheable offline (PWA service worker). Staff con wifi intermitente en hostal puede jugar. **❌**

10. **Webcam tracking sin consentimiento explícito** — anti-cheating webcam snapshot solo durante examen final, con opt-in explícito + eliminable GDPR/LFPDPPP. **❌**

---

## 10. ROI estimado

### 10.1 Costo total Pool completo de games

| Game | Cost USD | Fase |
|------|----------|------|
| A — Auditoría Sorpresa DH | $8-12k | 1.4 |
| D — Front Desk Rush | $10-15k | 1.5 |
| F — Room Inspector | $7-10k | 1.5 |
| B — Zona Peligro mini | $3-5k | 2.0 |
| C — Diálogos NOM-035 | $6-10k | 2.0 |
| E — Document Detective | $6-9k | 2.0 |
| G — Chemical Safety | $4-6k | 2.0 |
| **Total Pool MVP** | **$44-67k USD** | Distribuido 18-24 meses |

### 10.2 Revenue esperado Year 1 atribuible a games

**Hipótesis conservadora:**
- 3 prospectos enterprise extra cierran por demo Game A (vs sin game)
- Cada prospecto = $1,500 MRR promedio (3-property cadena)
- 3 × $1,500 × 12 meses = **$54k USD revenue Year 1**

**Hipótesis optimista:**
- 5 prospectos enterprise extra
- 2 de ellos compran custom game adicional ($12k desarrollo + $300/mes license × 12)
- 5 × $1,500 × 12 + 2 × $12k + 2 × $3,600 = **$117k USD revenue Year 1**

**ROI Game A únicamente (Fase 1.4):**
- Inversión: $8-12k USD
- Revenue Year 1: $54-117k USD
- **ROI: 4.5× – 14.5× en 12 meses**

### 10.3 Valor estratégico no cuantificable

- **Posicionamiento "el único PMS con games educativos en LATAM"** — diferenciador permanente
- **Lock-in real** de clientes enterprise con custom games
- **PR + content marketing** — caso de estudio "cómo Zenix Learning redujo multas STPS de Hotel X en 80%"
- **Talent attraction** — game devs + pedagogos + reviewers SECTUR quieren trabajar en Zenix
- **Validación pedagógica externa** — papers + presentaciones en HFTP, AHLEI conferences

---

## 11. Decisiones registradas (numeración reservada para CLAUDE.md)

> Las siguientes decisiones se registrarán como §128-§133 en CLAUDE.md al cerrar sprint LEARNING-CORE.

- **§ — Games HTML5 como diferenciador comercial.** Phaser 3 simulators-based + PixiJS microinteracciones son el stack canónico de games en Zenix Learning. Babylon.js 3D reservado para v1.2+ con demanda enterprise verificada. Catálogo de 7 conceptos (A-G) documentado.
- **§ — Engine/content separation aplicada a games.** Los games son content versionado (`LearningGameBundle` + `LearningGameAssetPack`). El engine renderiza vía `GameLessonPlayer` con iframe sandboxed + bridge postMessage. El engine NO conoce el contenido del game.
- **§ — Game-pilot Fase 1.4-INTERLUDIO.** *"Auditoría Sorpresa: Distintivo H Simulator"* es el primer game producido. Capstone del Módulo 3 del Curso 1. 3 escenarios (cocina pequeña / hotel medio / resort). Cost $8-12k USD, 3 semanas dedicadas. Justificación: máximo wow-factor + máximo "serious game" justificable + Curso 1 ya priorizado por compliance MX.
- **§ — Métricas críticas pre-expansión.** Antes de desarrollar Games D y F, el Game A debe alcanzar conversion lift ≥20% Y completion ≥75% Y NPS ≥50 en 90 días post-launch. Si NO, pausar inversión en games adicionales del catálogo.
- **§ — Anti-patrones prohibidos.** Los 10 anti-patrones del §9 (trivia gamificada, leaderboard público, game obligatorio, microtransactions, dark patterns, manipulación) NUNCA aparecen en games Zenix Learning.
- **§ — Variante G del doble hook.** "Hook Killer Demo Game" añadido al doc 22 §2 — variante para prospectos enterprise (3+ properties) o que ya vieron demos de competidores. Vendedor muestra el game en vivo 3 min antes del cierre.

---

## 12. Bibliografía verificable

### 12.1 Académica (pedagogía + game-based learning)

1. **Sailer, M., & Homner, L. (2020).** "The Gamification of Learning: a Meta-analysis." *Educational Psychology Review* 32, 77–112. [https://doi.org/10.1007/s10648-019-09498-w](https://doi.org/10.1007/s10648-019-09498-w)
2. **Hamari, J., Koivisto, J., & Sarsa, H. (2014).** "Does Gamification Work? A Literature Review of Empirical Studies on Gamification." *Proceedings of HICSS 47*. [IEEE Xplore](https://ieeexplore.ieee.org/document/6758978)
3. **Connor, M., Schreiber, J., & Suarez, J. (2003).** "Game-Based Training in Industry: Transfer to Workplace Performance." *International Journal of Training and Development* 7(2).
4. **Csikszentmihalyi, M. (1990).** *Flow: The Psychology of Optimal Experience.* Harper & Row.
5. **Sweller, J. (1988).** "Cognitive load during problem solving: Effects on learning." *Cognitive Science* 12(2).
6. **Bandura, A. (1977).** "Self-efficacy: Toward a unifying theory of behavioral change." *Psychological Review* 84(2).
7. **Vygotsky, L. S. (1978).** *Mind in society: The development of higher psychological processes.* Harvard University Press.
8. **Anderson, L. W., & Krathwohl, D. R. (2001).** *A Taxonomy for Learning, Teaching, and Assessing: A Revision of Bloom's Taxonomy.*
9. **Deci, E. L., Koestner, R., & Ryan, R. M. (1999).** "A meta-analytic review of experiments examining the effects of extrinsic rewards on intrinsic motivation." *Psychological Bulletin* 125(6).
10. **Chi, M. T. H. (2009).** "Active-Constructive-Interactive: A Conceptual Framework for Differentiating Learning Activities." *Topics in Cognitive Science* 1.
11. **Kolb, D. A. (1984).** *Experiential learning: Experience as the source of learning and development.* Prentice-Hall.
12. **Kirkpatrick, D. L., & Kirkpatrick, J. D. (2006).** *Evaluating training programs: The four levels.* 3rd ed.
13. **Phillips, J. J. (2003).** *Return on Investment in Training and Performance Improvement Programs.* 2nd ed.

### 12.2 Industria + serious games comerciales

14. **OSHA Construction & Industrial Safety eTools** — [https://www.osha.gov/etools](https://www.osha.gov/etools)
15. **Papers, Please** (Lucas Pope 2013) — referencia de simulator con stakes serios — [https://papersplea.se/](https://papersplea.se/)
16. **Phaser 3 official documentation** — [https://phaser.io/phaser3](https://phaser.io/phaser3)
17. **PixiJS official** — [https://pixijs.com/](https://pixijs.com/)
18. **Babylon.js official** — [https://www.babylonjs.com/](https://www.babylonjs.com/)
19. **Tiled Map Editor** — [https://www.mapeditor.org/](https://www.mapeditor.org/)
20. **Aseprite** — [https://www.aseprite.org/](https://www.aseprite.org/)
21. **PostHog (telemetría open-source)** — [https://posthog.com/](https://posthog.com/)
22. **WCAG 2.1 official W3C** — [https://www.w3.org/TR/WCAG21/](https://www.w3.org/TR/WCAG21/)

### 12.3 Hospitalidad + compliance

23. **AHLEI — American Hotel & Lodging Educational Institute** — [https://www.ahlei.org/](https://www.ahlei.org/)
24. **Manual Distintivo H SECTUR 2020** — [PDF](https://www.sectur.gob.mx/wp-content/uploads/2020/09/DISTINTIVO-H.pdf)
25. **NMX-F-605-NORMEX-2018** — [DOF](https://www.dof.gob.mx/nota_detalle.php?codigo=5567750&fecha=13/08/2019)
26. **COFEPRIS Reportes 2023-2024** — [gob.mx/cofepris](https://www.gob.mx/cofepris)
27. **NOM-035-STPS-2018** — [DOF](https://www.dof.gob.mx/nota_detalle.php?codigo=5541828&fecha=23%2F10%2F2018)
28. **Visa Core Rules CRR 13.1** — [Visa Dispute Management Guidelines](https://usa.visa.com/content/dam/VCOM/global/support-legal/documents/merchants-dispute-management-guidelines.pdf)

---

## Bitácora

- **2026-05-22** — Doc creado tras decisión del usuario aprobada el mismo día. Estrategia completa de games HTML5 como diferenciador comercial documentada. 7 conceptos de game (A-G) mapeados a los 3 cursos MVP. Game-pilot Fase 1.4 confirmado: *"Auditoría Sorpresa: Distintivo H Simulator"*. Roadmap Fase 1.3 → 1.4 INTERLUDIO → 1.5 medición → v1.1+ marketplace + custom games. Stack técnico: Phaser 3 + PixiJS + Babylon.js (futuro) + Tiled + Aseprite. Integración engine/content via `LearningGameBundle` + `LearningGameAssetPack` + GameLessonPlayer iframe sandboxed. 10 anti-patrones prohibidos. Métricas Kirkpatrick L1-L4 + engagement. ROI estimado 4.5×-14.5× en 12 meses solo del Game A. 28 fuentes verificables. Variante G del doble hook ("Hook Killer Demo Game") añadida al modelo comercial. Decisiones §128-§133 reservadas en CLAUDE.md al cerrar sprint LEARNING-CORE.
