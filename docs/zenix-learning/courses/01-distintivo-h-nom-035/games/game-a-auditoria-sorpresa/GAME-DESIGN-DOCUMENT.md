# Game A — "Auditoría Sorpresa: Distintivo H Simulator" — Game Design Document

> DDD detallado + scaffold de código Phaser 3 del game-pilot de Fase 1.4-INTERLUDIO. Capstone del Módulo 3 del Curso 1 (las 11 áreas + 28 puntos críticos). Complementa [doc 23 §6](../../../23-games-interactive-learning-strategy.md) (estrategia) con el detalle de implementación.
> **Última actualización:** 2026-05-22 (Fase 1.4-INTERLUDIO Día 1)

---

## 0. Resumen

| Campo | Valor |
|-------|-------|
| **Nombre** | Auditoría Sorpresa: Distintivo H Simulator |
| **Tipo** | Serious game simulation-based, 2D top-down pixel-art |
| **Motor** | Phaser 3.80+ (TypeScript) + Vite |
| **Curso parent** | Curso 1 Distintivo H + NOM-035, capstone Módulo 3 |
| **Tipo de lesson en el engine** | `GAME_PHASER` (doc 21 enum) |
| **Duración** | ~24 min (3 escenarios × 8 min) |
| **Pedagogía** | Sweller (load) + Bandura (self-efficacy) + Csikszentmihalyi (flow) + Vygotsky (scaffolding) + Kirkpatrick L3 (transfer) |

---

## 1. Inspiración + pilares de diseño

### 1.1 Referencias

| Referencia | Qué tomamos |
|------------|-------------|
| **Papers, Please** (Lucas Pope 2013) | El loop del inspector: examinar → decidir → consecuencia. Stakes reales sin trivializar |
| **Overcooked / Cooking Mama** | Estética top-down de cocina + ambiente cálido + legibilidad |
| **Hidden-object games** | Encontrar los puntos críticos "escondidos" en la escena |
| **Pixel-art 16-bit (SNES-era)** | Cálido, accesible, NO intimidante (staff de cualquier edad) |

### 1.2 Pilares de diseño (no negociables)

1. **Simulation-based, NO trivia gamificada** (doc 23 §1.2 Hamari 2014) — el aprendiz INSPECCIONA una cocina real, no responde trivia coloreada.
2. **Consecuencias significativas** — cada error simula una multa STPS en pesos (UMA 2026) o un brote. El aprendizaje es visceral.
3. **Accesible a todo el staff** — pixel-art amigable, controles simples, modo guiado opcional para staff senior.
4. **Pedagógicamente fundamentado** — load cognitivo controlado (1 área a la vez), flow zone (8 min), scaffolding (pistas).
5. **El engine NO conoce el contenido** (doc 21) — el game es content versionado; reporta al engine vía postMessage.

---

## 2. Mecánicas core

### 2.1 Loop principal

```
1. El inspector (avatar del aprendiz) entra a la cocina top-down
2. Se mueve por las 11 áreas (WASD/flechas/swipe mobile)
3. Detecta ítems evaluables (resaltado sutil al acercarse)
4. Click/tap en un ítem → modal de evaluación
5. Modal: foto/sprite zoom + pregunta "¿CUMPLE NMX-F-605?" → CUMPLE / NO CUMPLE
6. Decisión correcta → +puntos + confetti (PixiJS) + sonido positivo
   Decisión incorrecta → −puntos + explicación citada + multa simulada
7. Repetir hasta cubrir el área / acabar el tiempo (8 min)
8. Fin del escenario → score + comparativa benchmark + correcciones pedagógicas
```

### 2.2 Sistemas

| Sistema | Detalle |
|---------|---------|
| **Movimiento** | Top-down, velocidad balanceada (ni lento=aburre, ni rápido=errores por accidente) |
| **Detección de ítems** | Resaltado sutil (outline/glow) al estar en rango — signifier perceptible sin spoilear |
| **Evaluación** | Modal con sprite zoom + 2 opciones (CUMPLE/NO CUMPLE) — enfoca 1 ítem (Sweller) |
| **Scoring** | Correcto +10 / falso negativo (incumplimiento no detectado) = multa $MXN / falso positivo −5 |
| **Pistas** | 3 por escenario, cuestan 5 pts cada una pero NO reducen aprendizaje (scaffolding Vygotsky) |
| **Timer** | 8 min visible como cronómetro (NO countdown amenazante); al expirar → "Continuar sin presión" para aprendizaje completo |
| **Feedback** | Inmediato (<100ms), confetti PixiJS en aciertos, explicación citada en errores |

### 2.3 Los 3 escenarios

| Escenario | Ítems | Dificultad | Bloom |
|-----------|-------|------------|-------|
| **1. Cocina hostal pequeño** | 10 puntos críticos | Introductoria | RECORDAR + COMPRENDER |
| **2. Restaurant hotel medio** | 18 puntos críticos | Intermedia | APLICAR |
| **3. Kitchen central resort** | 28 puntos críticos completos | Alta | ANALIZAR + EVALUAR |

Los 28 puntos críticos sembrados provienen exactamente de la Lesson 3.5 del Módulo 3 (las 11 áreas evaluadas).

---

## 3. Estructura del proyecto Phaser

```
game-auditoria-sorpresa/
├── package.json                 (Phaser 3 + Vite + TypeScript)
├── vite.config.ts
├── index.html                   (canvas + bridge postMessage)
├── tsconfig.json
├── src/
│   ├── main.ts                  (Phaser.Game config + escenas)
│   ├── bridge/
│   │   └── LmsBridge.ts         (postMessage al engine LMS)
│   ├── scenes/
│   │   ├── BootScene.ts         (carga assets)
│   │   ├── MenuScene.ts         (selección de escenario)
│   │   ├── KitchenScene.ts      (la escena de inspección — core)
│   │   └── ResultsScene.ts      (score + correcciones)
│   ├── objects/
│   │   ├── Inspector.ts         (avatar del aprendiz)
│   │   ├── EvaluableItem.ts     (ítem evaluable)
│   │   └── EvaluationModal.ts   (modal CUMPLE/NO CUMPLE)
│   ├── systems/
│   │   ├── ScoreSystem.ts
│   │   ├── HintSystem.ts
│   │   └── TimerSystem.ts
│   ├── effects/
│   │   └── ConfettiPixi.ts      (microinteracción)
│   └── i18n/
│       └── es-MX.json           (strings externalizados para futuro multi-idioma)
├── content/                     (CONTENT — versionado, separado del código)
│   ├── scenario-01-hostal.json  (tilemap + ítems sembrados + respuestas)
│   ├── scenario-02-hotel.json
│   └── scenario-03-resort.json
└── assets/
    ├── tilemaps/                (Tiled JSON)
    ├── sprites/                 (Aseprite exports)
    └── audio/                   (sfx)
```

**Separación content/engine dentro del game:** los `content/scenario-*.json` contienen los ítems sembrados + sus respuestas correctas + explicaciones citadas. El código del game (engine del game) NO conoce las respuestas — las lee del JSON. Esto refleja el principio engine/content (doc 21) a nivel del game mismo, y permite agregar escenarios nuevos sin tocar el código.

---

## 4. Scaffold de código (arranque real)

### 4.1 `src/main.ts`

```typescript
import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { KitchenScene } from './scenes/KitchenScene';
import { ResultsScene } from './scenes/ResultsScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 960,
  height: 640,
  parent: 'game-root',
  backgroundColor: '#1e1b18',
  pixelArt: true,                       // estética pixel-art crisp
  scale: {
    mode: Phaser.Scale.FIT,             // responsive (desktop + tablet + mobile)
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: { gravity: { x: 0, y: 0 }, debug: false },  // top-down: sin gravedad
  },
  scene: [BootScene, MenuScene, KitchenScene, ResultsScene],
};

new Phaser.Game(config);
```

### 4.2 `src/bridge/LmsBridge.ts` (integración con el engine LMS)

```typescript
// El game NUNCA accede a la API Zenix directamente.
// Solo postMessage al parent frame (iframe sandboxed). Doc 21 §integración.

type LmsEvent =
  | { type: 'game:ready' }
  | { type: 'game:progress'; payload: { scenarioId: string; percent: number } }
  | { type: 'game:decision'; payload: { itemId: string; answer: 'CUMPLE' | 'NO_CUMPLE'; correct: boolean } }
  | { type: 'game:scenario-complete'; payload: { scenarioId: string; score: number; maxScore: number; timeMs: number } }
  | { type: 'game:completed'; payload: { totalScore: number; maxScore: number; scenariosCompleted: number; replayCount: number } }
  | { type: 'game:error'; payload: { code: string; message: string } };

export class LmsBridge {
  private static origin = '*'; // en producción: el origin del engine LMS

  static emit(event: LmsEvent): void {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ source: 'zenix-game-a', ...event }, this.origin);
    }
    // dev fallback
    console.debug('[LmsBridge]', event);
  }

  static ready() {
    this.emit({ type: 'game:ready' });
  }
}
```

### 4.3 `content/scenario-01-hostal.json` (CONTENT versionado — ejemplo)

```json
{
  "id": "scenario-01-hostal",
  "version": "2026.05.1",
  "title": "Cocina de hostal pequeño",
  "difficulty": "introductoria",
  "bloomLevel": "COMPRENDER",
  "tilemap": "assets/tilemaps/cocina-hostal.json",
  "timeLimitSeconds": 480,
  "hintsAvailable": 3,
  "items": [
    {
      "id": "item-pescado-piso",
      "x": 320, "y": 200,
      "sprite": "caja-pescado",
      "area": "Recepción/Almacenamiento",
      "compliant": false,
      "question": "¿Esta caja de pescado cumple con la NMX-F-605?",
      "correctAnswer": "NO_CUMPLE",
      "explanation": "Los alimentos NUNCA se almacenan en el piso (mínimo 15 cm de elevación). Riesgo de humedad + plagas + cross-contamination.",
      "source": "NMX-F-605 punto 2.3 (Almacenamiento) + Manual SECTUR 2020",
      "fineIfMissed": 8000,
      "critical": true
    },
    {
      "id": "item-tabla-sin-color",
      "x": 540, "y": 280,
      "sprite": "tabla-blanca",
      "area": "Cocina",
      "compliant": false,
      "question": "¿Esta tabla de cortar genérica (sin código de colores) cumple?",
      "correctAnswer": "NO_CUMPLE",
      "explanation": "Sin código de colores hay riesgo de cross-contamination (misma tabla para crudo y cocido). Estándar: rojo carne, azul pescado, verde vegetales, amarillo aves.",
      "source": "NMX-F-605 punto 5.2 + NSF/UK FSA color coding",
      "fineIfMissed": 12000,
      "critical": true
    },
    {
      "id": "item-termometro-calibrado",
      "x": 200, "y": 420,
      "sprite": "termometro-ok",
      "area": "Recepción",
      "compliant": true,
      "question": "¿Este termómetro calibrado (marca 0°C en agua con hielo) cumple?",
      "correctAnswer": "CUMPLE",
      "explanation": "Correcto. El termómetro calibrado (tolerancia -0.5 a +0.5°C en agua con hielo) es requisito. Verificación al inicio de turno.",
      "source": "NMX-F-605 punto 1.1 + NIST Calibration",
      "fineIfMissed": 0,
      "critical": false
    }
  ]
}
```

> Nota: el JSON real del escenario 1 tendría los 10 ítems; el escenario 3, los 28 puntos críticos completos. Aquí se muestran 3 como ejemplo de estructura.

### 4.4 `src/scenes/KitchenScene.ts` (núcleo — esqueleto)

```typescript
import Phaser from 'phaser';
import { LmsBridge } from '../bridge/LmsBridge';
import { ScoreSystem } from '../systems/ScoreSystem';
import { TimerSystem } from '../systems/TimerSystem';
import { HintSystem } from '../systems/HintSystem';
import { EvaluableItem } from '../objects/EvaluableItem';
import { Inspector } from '../objects/Inspector';

export class KitchenScene extends Phaser.Scene {
  private scenario!: any;            // cargado del content JSON
  private inspector!: Inspector;
  private items: EvaluableItem[] = [];
  private score!: ScoreSystem;
  private timer!: TimerSystem;
  private hints!: HintSystem;
  private evaluatedIds = new Set<string>();

  constructor() { super('KitchenScene'); }

  init(data: { scenarioId: string }) {
    this.scenario = this.cache.json.get(data.scenarioId);
  }

  create() {
    // 1. Tilemap de la cocina (Tiled)
    const map = this.make.tilemap({ key: this.scenario.tilemap });
    // ... cargar tilesets + capas (piso, paredes, mobiliario)

    // 2. Inspector (avatar)
    this.inspector = new Inspector(this, 480, 320);

    // 3. Sistemas
    this.score = new ScoreSystem();
    this.timer = new TimerSystem(this, this.scenario.timeLimitSeconds, () => this.onTimeUp());
    this.hints = new HintSystem(this, this.scenario.hintsAvailable);

    // 4. Ítems evaluables (del content JSON)
    this.scenario.items.forEach((itemData: any) => {
      const item = new EvaluableItem(this, itemData, (answer) => this.onEvaluate(itemData, answer));
      this.items.push(item);
    });

    LmsBridge.ready();
  }

  private onEvaluate(itemData: any, answer: 'CUMPLE' | 'NO_CUMPLE') {
    if (this.evaluatedIds.has(itemData.id)) return;
    this.evaluatedIds.add(itemData.id);

    const correct = answer === itemData.correctAnswer;
    if (correct) {
      this.score.add(10);
      this.showConfetti(); // PixiJS
    } else {
      // falso negativo (no detectó incumplimiento) o falso positivo
      this.score.subtract(5);
      if (itemData.correctAnswer === 'NO_CUMPLE') {
        this.score.registerFine(itemData.fineIfMissed); // multa simulada
      }
      this.showExplanation(itemData); // explicación citada
    }

    // El engine NO conoce la respuesta — el game la evaluó internamente (del JSON)
    LmsBridge.emit({
      type: 'game:decision',
      payload: { itemId: itemData.id, answer, correct },
    });

    this.updateProgress();
  }

  private updateProgress() {
    const percent = Math.round((this.evaluatedIds.size / this.scenario.items.length) * 100);
    LmsBridge.emit({ type: 'game:progress', payload: { scenarioId: this.scenario.id, percent } });
    if (this.evaluatedIds.size === this.scenario.items.length) this.onScenarioComplete();
  }

  private onScenarioComplete() {
    LmsBridge.emit({
      type: 'game:scenario-complete',
      payload: {
        scenarioId: this.scenario.id,
        score: this.score.total,
        maxScore: this.scenario.items.length * 10,
        timeMs: this.timer.elapsedMs,
      },
    });
    this.scene.start('ResultsScene', { scenario: this.scenario, score: this.score });
  }

  private onTimeUp() { /* ofrecer "continuar sin presión" para aprendizaje completo */ }
  private showConfetti() { /* ConfettiPixi.burst(this) */ }
  private showExplanation(itemData: any) { /* modal con explanation + source */ }
}
```

---

## 5. Accesibilidad (WCAG 2.1 A → AA)

| Requisito | Implementación |
|-----------|----------------|
| Keyboard nav | WASD/flechas + Enter (interactuar) + Esc (pausa) |
| Screen reader | aria-live announcements en cada modal de evaluación |
| Color independence | Ítems se distinguen por forma + icono, no solo color |
| `prefers-reduced-motion` | Confetti → checkmark estático |
| Contraste 4.5:1 | UI overlay |
| Pausa anytime | Botón pausa visible (no penaliza score) |
| Modo "Inspección Guiada" | Tutorial paso a paso opt-in para staff senior |

---

## 6. Cronograma de implementación (21 días — doc 23 §5)

| Fase | Días | Entregable |
|------|------|------------|
| Game design + wireframes + sign-off reviewer SECTUR | 1-2 | DDD aprobado (este doc) |
| Assets escenario 1 (Aseprite) + Phaser jugable | 3-7 | Build cocina hostal |
| Bridge postMessage + integración engine + PostHog | 8-9 | Conectado a runtime data |
| Escenarios 2 y 3 + balance + flow tuning | 10-17 | Game completo 3 escenarios |
| QA + accessibility WCAG 2.1 A | 18 | Bug + a11y list |
| Bug fixes + a11y fixes | 19-20 | Production-ready |
| Sign-off reviewer SECTUR final | 21 | Publicado en CourseVersion 2026.07.1 |

**Cost estimate:** $8-12k USD (game designer + Phaser dev + pixel artist + reviewer SECTUR + QA).

---

## 7. Métricas (Fase 1.5 — doc 23 §5)

| Métrica | Target |
|---------|--------|
| Completion rate vs lessons-only | ≥75% |
| Conversion lift comercial (demo Game A vs sin) | ≥20% |
| NPS post-game | ≥50 |
| Knowledge retention (SRS post-game) | +20% |

Si conversion lift > 20% Y completion > 75% → desarrollar Games D (Front Desk Rush) + F (Room Inspector).

---

## Bitácora

- **2026-05-22** (Fase 1.4-INTERLUDIO Día 1) — DDD del Game A redactado con scaffold de código Phaser 3 (estructura de proyecto + main.ts + LmsBridge + scenario JSON ejemplo + KitchenScene esqueleto) + accesibilidad WCAG + cronograma 21 días + métricas. Separación content/engine aplicada a nivel del game (los escenarios son JSON versionado, el código no conoce las respuestas). Pendiente: materializar el proyecto Phaser ejecutable (depende de la decisión de repo) + assets Aseprite + tilemaps Tiled + reviewer SECTUR sign-off.
- **2026-05-23** (Fase 1.4 Día 1-2) — **CONTENT versionado completo de los 3 escenarios + wireframes**. `content/scenario-01-hostal.json` (10 ítems, 7 NO_CUMPLE / 3 CUMPLE, 6 áreas), `content/scenario-02-hotel.json` (18 ítems, 13/5, 9 áreas), `content/scenario-03-resort.json` (28 ítems = los 28 puntos críticos 1:1, 18/10, 11 áreas completas). Cada ítem con pregunta, respuesta correcta, explicación citada, fuente NMX-F-605/SECTUR/CDC/FDA/EPA, multa simulada (MXN) y flag crítico — fiel a la Lesson 3.5 del Módulo 3. Distribución cumple/no-cumple balanceada para penalizar falsos positivos (auditar bien = también reconocer lo que cumple). `WIREFRAMES.md` con las 4 pantallas core (Menu/Kitchen/EvaluationModal/Results) + layout físico de los 3 escenarios + overlay accesibilidad. Pendiente: sign-off reviewer SECTUR + assets Aseprite/Tiled + materialización Phaser ejecutable (depende de la decisión de repo).
