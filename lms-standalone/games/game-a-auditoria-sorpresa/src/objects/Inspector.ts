import Phaser from 'phaser';

// Avatar del aprendiz (la Unidad de Verificación). Placeholder gráfico: un
// cuerpo circular + visor. Se reemplaza por sprite Aseprite en producción
// sin tocar la lógica (solo el render).

const SPEED = 220;

export class Inspector extends Phaser.GameObjects.Container {
  declare body: Phaser.Physics.Arcade.Body;
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);

    const body = scene.add.circle(0, 0, 16, 0x60a5fa).setStrokeStyle(3, 0xffffff);
    const visor = scene.add.rectangle(0, -2, 18, 7, 0x1e293b).setOrigin(0.5);
    const badge = scene.add.text(0, 20, 'UV', { fontSize: '11px', color: '#e2e8f0', fontStyle: 'bold' }).setOrigin(0.5);
    this.add([body, visor, badge]);

    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.body.setCircle(16, -16, -16);
    this.body.setCollideWorldBounds(true);

    const kb = scene.input.keyboard!;
    this.cursors = kb.createCursorKeys();
    this.wasd = {
      W: kb.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      A: kb.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      S: kb.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      D: kb.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };
  }

  move(enabled: boolean): void {
    const body = this.body;
    body.setVelocity(0);
    if (!enabled) return;

    const left = this.cursors.left.isDown || this.wasd.A.isDown;
    const right = this.cursors.right.isDown || this.wasd.D.isDown;
    const up = this.cursors.up.isDown || this.wasd.W.isDown;
    const down = this.cursors.down.isDown || this.wasd.S.isDown;

    let vx = 0;
    let vy = 0;
    if (left) vx = -1;
    else if (right) vx = 1;
    if (up) vy = -1;
    else if (down) vy = 1;

    if (vx !== 0 || vy !== 0) {
      const v = new Phaser.Math.Vector2(vx, vy).normalize().scale(SPEED);
      body.setVelocity(v.x, v.y);
    }
  }
}
