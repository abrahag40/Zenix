import Phaser from 'phaser';
import { SCENARIOS, type ScenarioData } from '../types';
import { t } from '../i18n/es-MX';

// Selección de escenario. El escenario 3 (resort, 28 críticos) queda bloqueado
// hasta aprobar el escenario 2 — progresión de dificultad (scaffolding).

const STARS = ['★', '★★', '★★★'];

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('MenuScene');
  }

  create(): void {
    const { width } = this.scale;

    this.add.text(width / 2, 56, t.title, { fontSize: '40px', color: '#facc15', fontStyle: 'bold' }).setOrigin(0.5);
    this.add.text(width / 2, 96, t.subtitle, { fontSize: '20px', color: '#e2e8f0' }).setOrigin(0.5);
    this.add
      .text(width / 2, 134, t.menuLead, { fontSize: '14px', color: '#94a3b8' })
      .setOrigin(0.5);

    const cardW = 250;
    const gap = 30;
    const totalW = cardW * 3 + gap * 2;
    const startX = (width - totalW) / 2 + cardW / 2;

    SCENARIOS.forEach((s, i) => {
      const data = this.cache.json.get(s.key) as ScenarioData;
      const locked = i === 2 && !this.registry.get('passed:scenario-02-hotel');
      this.buildCard(startX + i * (cardW + gap), 330, cardW, data, STARS[i], locked, s.key);
    });

    this.add
      .text(width / 2, 560, t.guidedHint, { fontSize: '13px', color: '#64748b', fontStyle: 'italic' })
      .setOrigin(0.5);
  }

  private buildCard(
    x: number,
    y: number,
    w: number,
    data: ScenarioData,
    stars: string,
    locked: boolean,
    key: string
  ): void {
    const h = 250;
    const card = this.add.container(x, y);
    const bg = this.add
      .rectangle(0, 0, w, h, locked ? 0x262220 : 0x2d2a26)
      .setStrokeStyle(2, locked ? 0x4b5563 : 0x10b981);
    const title = this.add
      .text(0, -88, data.title, { fontSize: '18px', color: '#f1f5f9', fontStyle: 'bold', align: 'center', wordWrap: { width: w - 30 } })
      .setOrigin(0.5);
    const count = this.add
      .text(0, -34, `${data.items.length} puntos evaluables`, { fontSize: '14px', color: '#cbd5e1' })
      .setOrigin(0.5);
    const star = this.add.text(0, 2, stars, { fontSize: '20px', color: '#facc15' }).setOrigin(0.5);
    const diff = this.add
      .text(0, 34, data.difficulty, { fontSize: '13px', color: '#94a3b8' })
      .setOrigin(0.5);

    card.add([bg, title, count, star, diff]);

    if (locked) {
      const lock = this.add.text(0, 92, `🔒 ${t.locked}`, { fontSize: '12px', color: '#64748b' }).setOrigin(0.5);
      card.add(lock);
      return;
    }

    const btn = this.add.container(0, 92);
    const brect = this.add.rectangle(0, 0, 150, 40, 0x047857).setStrokeStyle(2, 0xffffff, 0.25);
    const btxt = this.add.text(0, 0, t.play, { fontSize: '16px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5);
    btn.add([brect, btxt]);
    brect.setInteractive({ useHandCursor: true });
    brect.on('pointerover', () => brect.setFillStyle(0x059669));
    brect.on('pointerout', () => brect.setFillStyle(0x047857));
    brect.on('pointerdown', () => this.scene.start('KitchenScene', { scenarioId: key }));
    card.add(btn);
  }
}
