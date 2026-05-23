import Phaser from 'phaser';
import type { EvaluableItemData } from '../types';

// Punto evaluable de la cocina. Placeholder gráfico: caja etiquetada con un
// icono por área. Glow amarillo cuando el inspector está en rango (signifier
// perceptible sin spoilear si cumple o no). Tras evaluar, borde verde/rojo.

const ICONS: Record<string, string> = {
  Recepción: '📦',
  Almacenamiento: '🗄️',
  'Sustancias químicas': '🧪',
  Refrigeración: '❄️',
  Cocina: '🔪',
  'Agua y hielo': '🧊',
  Sanitarios: '🚰',
  'Manejo de basura': '🗑️',
  'Control de plagas': '🐜',
  Personal: '🧑‍🍳',
  Bar: '🍸',
};

const SIZE = 56;

export class EvaluableItem extends Phaser.GameObjects.Container {
  // NOTA: el campo se llama `itemData` (no `data`) porque Phaser.Container
  // ya define una propiedad `data: DataManager` que no debemos sobreescribir.
  readonly itemData: EvaluableItemData;
  evaluated = false;
  private bg: Phaser.GameObjects.Rectangle;
  private glow: Phaser.GameObjects.Rectangle;
  private mark: Phaser.GameObjects.Text;
  private inRange = false;
  private onSelect: (item: EvaluableItem) => void;

  constructor(scene: Phaser.Scene, data: EvaluableItemData, onSelect: (item: EvaluableItem) => void) {
    super(scene, data.x, data.y);
    this.itemData = data;
    this.onSelect = onSelect;

    this.glow = scene.add.rectangle(0, 0, SIZE + 16, SIZE + 16, 0xfacc15, 0).setStrokeStyle(3, 0xfacc15, 0);
    this.bg = scene.add.rectangle(0, 0, SIZE, SIZE, 0x3b3733).setStrokeStyle(2, 0x6b6b6b);
    const icon = scene.add.text(0, -2, ICONS[data.area] ?? '❓', { fontSize: '26px' }).setOrigin(0.5);
    const label = scene.add
      .text(0, SIZE / 2 + 4, data.criticalPoint, { fontSize: '11px', color: '#cbd5e1', fontStyle: 'bold' })
      .setOrigin(0.5, 0);
    this.mark = scene.add.text(0, -2, '', { fontSize: '34px', fontStyle: 'bold' }).setOrigin(0.5);

    this.add([this.glow, this.bg, icon, label, this.mark]);
    this.setSize(SIZE, SIZE);
    this.setInteractive(new Phaser.Geom.Rectangle(-SIZE / 2, -SIZE / 2, SIZE, SIZE), Phaser.Geom.Rectangle.Contains);
    this.on('pointerdown', () => {
      if (this.inRange && !this.evaluated) this.onSelect(this);
    });

    scene.add.existing(this);
  }

  setInRange(value: boolean): void {
    if (this.evaluated) return;
    this.inRange = value;
    this.glow.setStrokeStyle(3, 0xfacc15, value ? 0.95 : 0);
    this.bg.setStrokeStyle(2, value ? 0xfacc15 : 0x6b6b6b);
  }

  pulse(scene: Phaser.Scene): void {
    if (this.evaluated) return;
    scene.tweens.add({
      targets: this,
      scale: { from: 1, to: 1.25 },
      yoyo: true,
      repeat: 3,
      duration: 220,
      ease: 'Sine.easeInOut',
    });
  }

  markResult(correct: boolean): void {
    this.evaluated = true;
    this.inRange = false;
    this.glow.setStrokeStyle(3, 0xfacc15, 0);
    this.bg.setStrokeStyle(3, correct ? 0x10b981 : 0xef4444);
    this.mark.setText(correct ? '✓' : '✗').setColor(correct ? '#10b981' : '#ef4444');
    this.disableInteractive();
  }
}
