# Auditoría Sorpresa — Distintivo H Simulator (Game A)

Serious game **Phaser 3 + TypeScript + Vite**. El aprendiz es la Unidad de Verificación: recorre una cocina top-down, detecta los puntos evaluables y decide si **CUMPLEN** o **NO** la NMX-F-605. Capstone del Módulo 3 del curso *Distintivo H + NOM-035*.

> Diseño completo: [GAME-DESIGN-DOCUMENT](../../../docs/zenix-learning/courses/01-distintivo-h-nom-035/games/game-a-auditoria-sorpresa/GAME-DESIGN-DOCUMENT.md) · Wireframes: [WIREFRAMES](../../../docs/zenix-learning/courses/01-distintivo-h-nom-035/games/game-a-auditoria-sorpresa/WIREFRAMES.md)

---

## Correr el proyecto

```bash
npm install
npm run dev       # http://localhost:5180
npm run build     # tsc --noEmit + vite build → dist/
npm run preview   # sirve dist/
```

Requiere Node ≥20.

> **Assets placeholder:** hoy el render usa primitivas de Phaser (círculos/rectángulos/emoji) para que el juego corra sin dependencias de arte. En producción se reemplazan por sprites **Aseprite** + tilemaps **Tiled** sin tocar la lógica — solo la capa de render de `Inspector` / `EvaluableItem` y la carga del tilemap en `KitchenScene`.

---

## Separación engine / content (no negociable)

El código del game **no conoce las respuestas**. Los 3 escenarios viven como JSON versionado en [`public/content/`](public/content/):

| Escenario | Ítems | Dificultad |
|-----------|-------|------------|
| `scenario-01-hostal.json` | 10 | introductoria |
| `scenario-02-hotel.json` | 18 | intermedia |
| `scenario-03-resort.json` | 28 (los 28 puntos críticos 1:1) | alta |

Cada ítem trae pregunta, respuesta correcta, explicación citada, fuente (NMX-F-605/SECTUR/CDC/FDA/EPA), multa simulada en MXN y flag crítico. Agregar un escenario nuevo = 1 JSON nuevo, sin tocar código. Los JSON son la **fuente de verdad**; la copia canónica vive junto al curso en `docs/zenix-learning/.../content/`.

---

## Estructura

```
src/
├── main.ts                  Phaser.Game config + registro de escenas
├── types.ts                 tipos del content + catálogo de escenarios
├── vite-env.d.ts
├── bridge/LmsBridge.ts      postMessage al engine LMS (iframe)
├── i18n/es-MX.ts            strings externalizados
├── scenes/
│   ├── BootScene.ts         carga content JSON + textura confetti
│   ├── MenuScene.ts         selección de escenario (3 bloqueado hasta pasar 2)
│   ├── KitchenScene.ts      núcleo: movimiento + proximidad + evaluación + HUD
│   └── ResultsScene.ts      score + benchmark anónimo + correcciones
├── objects/
│   ├── Inspector.ts         avatar del aprendiz (WASD/flechas)
│   ├── EvaluableItem.ts     punto evaluable con glow de proximidad
│   └── EvaluationModal.ts   modal CUMPLE/NO CUMPLE + feedback citado
├── systems/
│   ├── ScoreSystem.ts       +10 correcto / −5 error / multa simulada
│   ├── TimerSystem.ts       cronómetro count-up (no amenazante)
│   └── HintSystem.ts        3 pistas, −5 pts, no revelan respuesta
└── effects/Confetti.ts      partículas (respeta prefers-reduced-motion)
public/content/              CONTENT versionado (los 3 escenarios)
```

---

## Integración con el engine LMS (postMessage)

El game emite eventos al parent frame vía `LmsBridge`:

| Evento | Cuándo |
|--------|--------|
| `game:ready` | escena de cocina lista |
| `game:progress` | tras cada evaluación (`percent`) |
| `game:decision` | cada decisión (`itemId`, `criticalPoint`, `answer`, `correct`) |
| `game:scenario-complete` | fin de escenario (`score`, `maxScore`, `passed`) |
| `game:completed` | "Volver al curso" → recalcula % del módulo |

El game **nunca** llama una API directamente; el engine traduce estos eventos a progreso/certificación.

---

## Pedagogía aplicada

- **Sweller** — un ítem a la vez en el modal (carga cognitiva controlada).
- **Bandura / Csikszentmihalyi** — cronómetro count-up no amenazante, dificultad escalonada (flow).
- **Vygotsky** — pistas como scaffolding que no revelan la respuesta.
- **Kirkpatrick L3** — feedback con cita verbatim de la fuente en cada error (transfer).
- **Deci & Ryan (SDT)** — benchmark anónimo, **nunca leaderboard público** (evita crowding-out).

---

## Accesibilidad (WCAG 2.1 A → AA, en progreso)

Hecho: navegación teclado (WASD/flechas + SPACE/ENTER + ESC), `prefers-reduced-motion` (confetti se desactiva), región `aria-live` para anuncios, color + icono + etiqueta (no solo color). Pendiente: contraste AA final + modo "Inspección Guiada" (tutorial) + audit a11y formal (cronograma GDD §6 día 18).

---

## Estado

Build + typecheck verdes; dev/preview server sirve HTML y content. **No verificado el gameplay en navegador** (este entorno es headless, sin WebGL). Pendiente: assets Aseprite/Tiled, audio, sign-off reviewer SECTUR, y la migración a su repo independiente cuando exista.
