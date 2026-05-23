import Phaser from 'phaser';
import type { ItemResult, ScenarioData } from '../types';
import { TimerSystem } from '../systems/TimerSystem';
import { LmsBridge } from '../bridge/LmsBridge';
import { t } from '../i18n/es-MX';

interface ResultsData {
  scenario: ScenarioData;
  total: number;
  maxScore: number;
  results: ItemResult[];
  elapsedMs: number;
  finesAvoided: number;
  hintsUsed: number;
  passed: boolean;
}

// Promedio de aprendices (placeholder; en producción viene del engine vía
// telemetría PostHog). Benchmark anónimo — NUNCA leaderboard público (SDT
// Deci & Ryan, evita crowding-out del aprendizaje intrínseco).
const PEER_AVG = 0.72;

export class ResultsScene extends Phaser.Scene {
  constructor() {
    super('ResultsScene');
  }

  create(data: ResultsData): void {
    const { width } = this.scale;
    const pct = data.maxScore > 0 ? data.total / data.maxScore : 0;
    const isResort = data.scenario.id === 'scenario-03-resort';

    this.cameras.main.setBackgroundColor('#1e1b18');

    this.add.text(width / 2, 40, 'RESULTADO', { fontSize: '24px', color: '#facc15', fontStyle: 'bold' }).setOrigin(0.5);
    this.add.text(width / 2, 72, data.scenario.title, { fontSize: '16px', color: '#cbd5e1' }).setOrigin(0.5);

    const scoreColor = data.passed ? '#10b981' : '#ef4444';
    this.add
      .text(width / 2, 120, `${data.total} / ${data.maxScore}   (${Math.round(pct * 100)}%)`, {
        fontSize: '30px',
        color: scoreColor,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    this.add
      .text(width / 2, 156, data.passed ? `✓ ${t.approved}` : `✗ ${t.failed}`, {
        fontSize: '18px',
        color: scoreColor,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    const correct = data.results.filter((r) => r.correct).length;
    this.add
      .text(
        width / 2,
        190,
        `${correct}/${data.results.length} aciertos · ${t.finesAvoided}: $${data.finesAvoided.toLocaleString('es-MX')} · ${t.time}: ${TimerSystem.formatMs(data.elapsedMs)} · ${t.hintsUsed}: ${data.hintsUsed}`,
        { fontSize: '13px', color: '#94a3b8', align: 'center' }
      )
      .setOrigin(0.5);

    // benchmark anónimo
    this.add.text(width / 2, 224, `${t.benchmark}`, { fontSize: '13px', color: '#cbd5e1' }).setOrigin(0.5);
    this.drawBenchmark(width / 2, 248, pct);

    // correcciones
    const wrong = data.results.filter((r) => !r.correct);
    let y = 290;
    this.add.text(width / 2, y, `── ${t.corrections} ──`, { fontSize: '14px', color: '#f1f5f9', fontStyle: 'bold' }).setOrigin(0.5);
    y += 26;
    if (wrong.length === 0) {
      this.add.text(width / 2, y, '¡Sin errores! Auditoría impecable.', { fontSize: '14px', color: '#10b981' }).setOrigin(0.5);
      y += 24;
    } else {
      wrong.slice(0, 8).forEach((r) => {
        this.add
          .text(width / 2, y, `✗ ${r.item.area} (${r.item.criticalPoint})`, { fontSize: '13px', color: '#fca5a5' })
          .setOrigin(0.5);
        y += 20;
      });
      if (wrong.length > 8) {
        this.add.text(width / 2, y, `…y ${wrong.length - 8} más`, { fontSize: '12px', color: '#94a3b8' }).setOrigin(0.5);
        y += 20;
      }
    }

    if (isResort) {
      const criticalWrong = wrong.filter((r) => r.item.critical).length;
      if (criticalWrong > 0) {
        this.add
          .text(width / 2, y + 6, t.criticalRule, {
            fontSize: '12px',
            color: '#fbbf24',
            align: 'center',
            fontStyle: 'italic',
            wordWrap: { width: 560 },
          })
          .setOrigin(0.5);
        y += 44;
      }
    }

    this.buildButtons(data, Math.max(y + 30, 560));
  }

  private drawBenchmark(cx: number, y: number, pct: number): void {
    const w = 300;
    const x0 = cx - w / 2;
    this.add.rectangle(x0, y, w, 14, 0x334155).setOrigin(0, 0.5);
    this.add.rectangle(x0, y, w * Math.min(1, pct), 14, 0x10b981).setOrigin(0, 0.5);
    // marca del promedio de aprendices
    const mx = x0 + w * PEER_AVG;
    this.add.rectangle(mx, y, 2, 22, 0xfacc15).setOrigin(0.5);
    this.add.text(mx, y - 18, `prom. ${Math.round(PEER_AVG * 100)}%`, { fontSize: '10px', color: '#facc15' }).setOrigin(0.5);
  }

  private buildButtons(data: ResultsData, y: number): void {
    const { width } = this.scale;
    this.button(width / 2 - 200, y, 180, t.retry, 0x334155, () =>
      this.scene.start('KitchenScene', { scenarioId: data.scenario.id })
    );
    this.button(width / 2, y, 180, t.otherScenario, 0x334155, () => this.scene.start('MenuScene'));
    this.button(width / 2 + 200, y, 180, t.backToCourse, 0x047857, () => {
      const replays = (this.registry.get('replays') ?? 0) as number;
      LmsBridge.emit({
        type: 'game:completed',
        payload: {
          totalScore: data.total,
          maxScore: data.maxScore,
          scenariosCompleted: 1,
          replayCount: replays,
        },
      });
      LmsBridge.announce('Progreso enviado al curso.');
    });
  }

  private button(x: number, y: number, w: number, label: string, color: number, onClick: () => void): void {
    const c = this.add.container(x, y);
    const r = this.add.rectangle(0, 0, w, 42, color).setStrokeStyle(2, 0xffffff, 0.2);
    const txt = this.add.text(0, 0, label, { fontSize: '15px', color: '#fff', fontStyle: 'bold' }).setOrigin(0.5);
    c.add([r, txt]);
    r.setInteractive({ useHandCursor: true });
    r.on('pointerover', () => r.setFillStyle(color, 0.82));
    r.on('pointerout', () => r.setFillStyle(color, 1));
    r.on('pointerdown', onClick);
  }
}
