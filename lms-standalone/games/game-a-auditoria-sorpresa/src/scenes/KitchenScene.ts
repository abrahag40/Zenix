import Phaser from 'phaser';
import type { Answer, ItemResult, ScenarioData } from '../types';
import { Inspector } from '../objects/Inspector';
import { EvaluableItem } from '../objects/EvaluableItem';
import { EvaluationModal } from '../objects/EvaluationModal';
import { ScoreSystem } from '../systems/ScoreSystem';
import { TimerSystem } from '../systems/TimerSystem';
import { HintSystem } from '../systems/HintSystem';
import { burst } from '../effects/Confetti';
import { LmsBridge } from '../bridge/LmsBridge';
import { t } from '../i18n/es-MX';

const RANGE = 84;

export class KitchenScene extends Phaser.Scene {
  private scenario!: ScenarioData;
  private inspector!: Inspector;
  private items: EvaluableItem[] = [];
  private score!: ScoreSystem;
  private timer!: TimerSystem;
  private hints!: HintSystem;
  private modal!: EvaluationModal;
  private results: ItemResult[] = [];
  private evaluatedCount = 0;
  private finished = false;

  private hud!: {
    timer: Phaser.GameObjects.Text;
    score: Phaser.GameObjects.Text;
    fines: Phaser.GameObjects.Text;
    hints: Phaser.GameObjects.Text;
    progress: Phaser.GameObjects.Text;
    bar: Phaser.GameObjects.Rectangle;
  };

  constructor() {
    super('KitchenScene');
  }

  init(data: { scenarioId: string }): void {
    this.scenario = this.cache.json.get(data.scenarioId) as ScenarioData;
    this.items = [];
    this.results = [];
    this.evaluatedCount = 0;
    this.finished = false;
  }

  create(): void {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor('#1e1b18');
    this.physics.world.setBounds(0, 44, width, height - 88);

    this.drawAreaBackdrop();

    this.score = new ScoreSystem();
    this.timer = new TimerSystem(this.scenario.timeLimitSeconds);
    this.hints = new HintSystem(this.scenario.hintsAvailable);

    this.scenario.items.forEach((d) => {
      const item = new EvaluableItem(this, d, (it) => this.onSelectItem(it));
      this.items.push(item);
    });

    this.inspector = new Inspector(this, width / 2, height / 2);

    this.modal = new EvaluationModal(this);

    this.buildHud();
    this.buildIntro();

    // teclas: SPACE/ENTER evalúa el ítem en rango; H pista; ESC menú
    const kb = this.input.keyboard!;
    kb.on('keydown-SPACE', () => this.interactNearest());
    kb.on('keydown-ENTER', () => this.interactNearest());
    kb.on('keydown-H', () => this.useHint());
    kb.on('keydown-ESC', () => {
      if (!this.modal.isOpen) this.scene.start('MenuScene');
    });

    LmsBridge.ready();
    LmsBridge.emit({ type: 'game:progress', payload: { scenarioId: this.scenario.id, percent: 0 } });
  }

  private drawAreaBackdrop(): void {
    // cuadrícula sutil de piso (placeholder del tilemap)
    const g = this.add.graphics();
    g.lineStyle(1, 0x2a2622, 1);
    for (let x = 0; x <= this.scale.width; x += 48) g.lineBetween(x, 44, x, this.scale.height - 44);
    for (let y = 44; y <= this.scale.height - 44; y += 48) g.lineBetween(0, y, this.scale.width, y);
    g.setDepth(-10);
  }

  private buildHud(): void {
    const { width, height } = this.scale;
    this.add.rectangle(0, 0, width, 44, 0x14110f).setOrigin(0, 0).setDepth(900);
    this.add.rectangle(0, height - 44, width, 44, 0x14110f).setOrigin(0, 0).setDepth(900);

    const style = { fontSize: '15px', color: '#e2e8f0', fontStyle: 'bold' };
    this.hud = {
      timer: this.add.text(16, 13, '', style).setDepth(901),
      score: this.add.text(150, 13, '', style).setDepth(901),
      fines: this.add.text(300, 13, '', { ...style, color: '#fbbf24' }).setDepth(901),
      hints: this.add.text(500, 13, '', style).setDepth(901),
      progress: this.add.text(16, height - 31, '', { fontSize: '13px', color: '#cbd5e1' }).setDepth(901),
      bar: this.add.rectangle(170, height - 25, 0, 10, 0x10b981).setOrigin(0, 0.5).setDepth(901),
    };
    this.add.rectangle(170, height - 25, 200, 10, 0x334155).setOrigin(0, 0.5).setDepth(900);

    // botón de pista (footer derecha)
    const { width: w } = this.scale;
    const hintBtn = this.add.container(w - 90, height - 22).setDepth(902);
    const r = this.add.rectangle(0, 0, 150, 28, 0x334155).setStrokeStyle(1, 0xfacc15, 0.5);
    const txt = this.add.text(0, 0, `💡 ${t.hint} (−5)`, { fontSize: '12px', color: '#facc15' }).setOrigin(0.5);
    hintBtn.add([r, txt]);
    r.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.useHint());

    this.refreshHud();
  }

  private buildIntro(): void {
    const { width, height } = this.scale;
    const overlay = this.add.container(width / 2, height / 2).setDepth(2500);
    const bg = this.add.rectangle(0, 0, width, height, 0x000000, 0.78);
    const title = this.add
      .text(0, -120, this.scenario.title, { fontSize: '26px', color: '#facc15', fontStyle: 'bold' })
      .setOrigin(0.5);
    const intro = this.add
      .text(0, -20, this.scenario.narrativeIntro, {
        fontSize: '16px',
        color: '#e2e8f0',
        align: 'center',
        wordWrap: { width: 560 },
        lineSpacing: 6,
      })
      .setOrigin(0.5);
    const start = this.add.container(0, 120);
    const r = this.add.rectangle(0, 0, 220, 48, 0x047857).setStrokeStyle(2, 0xffffff, 0.25);
    const txt = this.add.text(0, 0, 'Comenzar inspección', { fontSize: '17px', color: '#fff', fontStyle: 'bold' }).setOrigin(0.5);
    start.add([r, txt]);
    overlay.add([bg, title, intro, start]);
    this.timer.pause();
    r.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      overlay.destroy();
      this.timer.resume();
    });
  }

  private nearestInRange(): EvaluableItem | null {
    let best: EvaluableItem | null = null;
    let bestD = RANGE;
    for (const it of this.items) {
      if (it.evaluated) continue;
      const d = Phaser.Math.Distance.Between(this.inspector.x, this.inspector.y, it.x, it.y);
      if (d <= bestD) {
        bestD = d;
        best = it;
      }
    }
    return best;
  }

  private interactNearest(): void {
    if (this.modal.isOpen || this.finished) return;
    const it = this.nearestInRange();
    if (it) this.onSelectItem(it);
  }

  private onSelectItem(item: EvaluableItem): void {
    if (this.modal.isOpen || item.evaluated) return;
    this.timer.pause();
    this.modal.open(item.itemData, (answer) => this.handleAnswer(item, answer));
  }

  private handleAnswer(item: EvaluableItem, answer: Answer): void {
    const correct = answer === item.itemData.correctAnswer;
    if (correct) {
      this.score.add(10);
      if (item.itemData.correctAnswer === 'NO_CUMPLE') this.score.registerAvoided(item.itemData.fineIfMissed);
      burst(this, item.x, item.y);
    } else {
      this.score.subtract(5);
      if (item.itemData.correctAnswer === 'NO_CUMPLE') this.score.registerFine(item.itemData.fineIfMissed);
    }

    item.markResult(correct);
    this.evaluatedCount++;
    this.results.push({ item: item.itemData, answer, correct });

    LmsBridge.emit({
      type: 'game:decision',
      payload: { itemId: item.itemData.id, criticalPoint: item.itemData.criticalPoint, answer, correct },
    });

    this.modal.showFeedback(item.itemData, correct, () => this.afterEvaluate());
  }

  private afterEvaluate(): void {
    this.refreshHud();
    const percent = Math.round((this.evaluatedCount / this.items.length) * 100);
    LmsBridge.emit({ type: 'game:progress', payload: { scenarioId: this.scenario.id, percent } });

    if (this.evaluatedCount >= this.items.length) {
      this.completeScenario();
    } else {
      this.timer.resume();
    }
  }

  private useHint(): void {
    if (this.modal.isOpen || this.finished) return;
    if (!this.hints.use()) {
      LmsBridge.announce('No quedan pistas.');
      return;
    }
    this.score.payHint(this.hints.cost);
    // dirige la atención al ítem sin evaluar más cercano (no revela respuesta)
    let target: EvaluableItem | null = null;
    let bestD = Infinity;
    for (const it of this.items) {
      if (it.evaluated) continue;
      const d = Phaser.Math.Distance.Between(this.inspector.x, this.inspector.y, it.x, it.y);
      if (d < bestD) {
        bestD = d;
        target = it;
      }
    }
    if (target) {
      target.pulse(this);
      LmsBridge.announce(`Observa con atención el área de ${target.itemData.area}.`);
    }
    this.refreshHud();
  }

  private refreshHud(): void {
    this.hud.timer.setText(`⏱ ${this.timer.format()}`);
    this.hud.score.setText(`${t.score}: ${this.score.total}`);
    this.hud.fines.setText(`${t.fines}: $${this.score.finesIncurred.toLocaleString('es-MX')}`);
    this.hud.hints.setText(`${t.hintsLeft}: ${'●'.repeat(this.hints.remaining)}${'○'.repeat(Math.max(0, this.scenario.hintsAvailable - this.hints.remaining))}`);
    this.hud.progress.setText(`${t.evaluated}: ${this.evaluatedCount}/${this.items.length}`);
    this.hud.bar.width = 200 * (this.evaluatedCount / this.items.length);
  }

  private completeScenario(): void {
    this.finished = true;
    const maxScore = this.items.length * 10;
    const passed = this.score.total / maxScore >= this.scenario.passThreshold;
    if (passed) this.registry.set(`passed:${this.scenario.id}`, true);

    LmsBridge.emit({
      type: 'game:scenario-complete',
      payload: { scenarioId: this.scenario.id, score: this.score.total, maxScore, timeMs: this.timer.elapsedMs, passed },
    });

    this.scene.start('ResultsScene', {
      scenario: this.scenario,
      total: this.score.total,
      maxScore,
      results: this.results,
      elapsedMs: this.timer.elapsedMs,
      finesAvoided: this.score.finesAvoided,
      hintsUsed: this.scenario.hintsAvailable - this.hints.remaining,
      passed,
    });
  }

  update(_time: number, delta: number): void {
    if (this.finished) return;
    const active = !this.modal.isOpen;
    this.inspector.move(active);
    if (active) this.timer.update(delta);

    for (const it of this.items) {
      const d = Phaser.Math.Distance.Between(this.inspector.x, this.inspector.y, it.x, it.y);
      it.setInRange(active && d <= RANGE);
    }
    this.hud.timer.setText(`⏱ ${this.timer.format()}`);
  }
}
