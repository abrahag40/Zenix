import Phaser from 'phaser';
import { SCENARIOS } from '../types';

// Carga el CONTENT (escenarios JSON servidos desde /public/content) y genera
// la textura 'spark' usada por el confetti. Content fetched at runtime, NO
// compilado en el bundle — fiel al principio engine/content.

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload(): void {
    const { width, height } = this.scale;
    this.add
      .text(width / 2, height / 2 - 20, 'Cargando auditoría…', { fontSize: '20px', color: '#e2e8f0' })
      .setOrigin(0.5);
    const bar = this.add.rectangle(width / 2, height / 2 + 20, 0, 8, 0x10b981).setOrigin(0.5);
    this.load.on('progress', (p: number) => bar.setSize(240 * p, 8));

    SCENARIOS.forEach((s) => this.load.json(s.key, s.file));

    // textura placeholder para partículas de confetti
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1).fillRect(0, 0, 6, 6);
    g.generateTexture('spark', 6, 6);
    g.destroy();
  }

  create(): void {
    this.scene.start('MenuScene');
  }
}
