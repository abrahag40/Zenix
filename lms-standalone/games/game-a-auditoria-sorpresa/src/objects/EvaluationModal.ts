import Phaser from 'phaser';
import type { Answer, EvaluableItemData } from '../types';
import { LmsBridge } from '../bridge/LmsBridge';
import { t } from '../i18n/es-MX';

// Modal CUMPLE / NO CUMPLE. Enfoca UN ítem a la vez (Sweller — carga cognitiva
// controlada). En errores muestra explicación + cita verbatim de la fuente
// (transfer Kirkpatrick L3). Bloquea input del mundo mientras está abierto.

const PANEL_W = 540;
const WRAP = PANEL_W - 80;

export class EvaluationModal extends Phaser.GameObjects.Container {
  private backdrop: Phaser.GameObjects.Rectangle;
  private panel: Phaser.GameObjects.Container;
  isOpen = false;

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0);
    const { width, height } = scene.scale;

    this.backdrop = scene.add
      .rectangle(0, 0, width, height, 0x000000, 0.62)
      .setOrigin(0, 0)
      .setInteractive(); // captura clicks → bloquea el mundo
    this.panel = scene.add.container(width / 2, height / 2);

    this.add([this.backdrop, this.panel]);
    this.setDepth(3000).setScrollFactor(0).setVisible(false);
    scene.add.existing(this);
  }

  private clearPanel(): void {
    this.panel.removeAll(true);
  }

  private makeButton(
    label: string,
    x: number,
    y: number,
    w: number,
    color: number,
    onClick: () => void
  ): Phaser.GameObjects.Container {
    const c = this.scene.add.container(x, y);
    const rect = this.scene.add.rectangle(0, 0, w, 44, color).setStrokeStyle(2, 0xffffff, 0.25);
    const txt = this.scene.add
      .text(0, 0, label, { fontSize: '16px', color: '#ffffff', fontStyle: 'bold' })
      .setOrigin(0.5);
    c.add([rect, txt]);
    rect.setInteractive({ useHandCursor: true });
    rect.on('pointerover', () => rect.setFillStyle(color, 0.82));
    rect.on('pointerout', () => rect.setFillStyle(color, 1));
    rect.on('pointerdown', onClick);
    return c;
  }

  private panelBg(h: number): Phaser.GameObjects.Rectangle {
    return this.scene.add.rectangle(0, 0, PANEL_W, h, 0x1f1b18).setStrokeStyle(2, 0x4b5563);
  }

  open(item: EvaluableItemData, onAnswer: (answer: Answer) => void): void {
    this.isOpen = true;
    this.setVisible(true);
    this.clearPanel();

    const bg = this.panelBg(340);
    const area = this.scene.add
      .text(0, -150, `${item.area} · Punto ${item.criticalPoint}`, { fontSize: '13px', color: '#facc15', fontStyle: 'bold' })
      .setOrigin(0.5);
    // zoom placeholder del ítem
    const zoom = this.scene.add.rectangle(0, -90, 90, 70, 0x3b3733).setStrokeStyle(2, 0x6b6b6b);
    const zoomIcon = this.scene.add.text(0, -90, '🔍', { fontSize: '30px' }).setOrigin(0.5);
    const question = this.scene.add
      .text(0, -10, item.question, {
        fontSize: '17px',
        color: '#f1f5f9',
        align: 'center',
        wordWrap: { width: WRAP },
        lineSpacing: 4,
      })
      .setOrigin(0.5);

    const btnCumple = this.makeButton(t.cumple, -120, 110, 200, 0x047857, () => onAnswer('CUMPLE'));
    const btnNo = this.makeButton(t.noCumple, 120, 110, 200, 0xb91c1c, () => onAnswer('NO_CUMPLE'));

    this.panel.add([bg, area, zoom, zoomIcon, question, btnCumple, btnNo]);
    LmsBridge.announce(`${item.area}. ${item.question}. Opciones: cumple o no cumple.`);
  }

  showFeedback(item: EvaluableItemData, correct: boolean, onClose: () => void): void {
    this.clearPanel();
    const tall = !correct;
    const h = tall ? 420 : 220;
    const bg = this.panelBg(h);

    const headColor = correct ? '#10b981' : '#ef4444';
    const head = this.scene.add
      .text(0, -h / 2 + 36, correct ? `✓ ${t.correct}  +10` : `✗ ${t.incorrect}  −5`, {
        fontSize: '22px',
        color: headColor,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    const children: Phaser.GameObjects.GameObject[] = [bg, head];

    if (!correct) {
      if (item.correctAnswer === 'NO_CUMPLE' && item.fineIfMissed > 0) {
        const fine = this.scene.add
          .text(0, -h / 2 + 70, `⚠ ${t.fineSimulated}: $${item.fineIfMissed.toLocaleString('es-MX')} MXN`, {
            fontSize: '14px',
            color: '#fbbf24',
            fontStyle: 'bold',
          })
          .setOrigin(0.5);
        children.push(fine);
      }
      const expl = this.scene.add
        .text(0, -30, item.explanation, {
          fontSize: '15px',
          color: '#e2e8f0',
          align: 'left',
          wordWrap: { width: WRAP },
          lineSpacing: 4,
        })
        .setOrigin(0.5);
      const src = this.scene.add
        .text(0, h / 2 - 90, `📖 ${t.source}: ${item.source}`, {
          fontSize: '12px',
          color: '#94a3b8',
          align: 'left',
          fontStyle: 'italic',
          wordWrap: { width: WRAP },
        })
        .setOrigin(0.5);
      children.push(expl, src);
    }

    const btn = this.makeButton(t.understood, 0, h / 2 - 36, 200, 0x334155, () => {
      this.close();
      onClose();
    });
    children.push(btn);

    this.panel.add(children);
    LmsBridge.announce(
      correct ? `Correcto, más diez puntos.` : `Incorrecto. ${item.explanation}. Fuente: ${item.source}.`
    );
  }

  close(): void {
    this.isOpen = false;
    this.setVisible(false);
    this.clearPanel();
  }
}
