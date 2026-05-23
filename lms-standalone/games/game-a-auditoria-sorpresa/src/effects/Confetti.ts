import Phaser from 'phaser';

// Microinteracción de acierto. Respeta prefers-reduced-motion (WCAG): si el
// usuario pidió menos movimiento, no se emite partícula alguna (el feedback
// visual del modal — checkmark estático — basta).

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const COLORS = [0x10b981, 0xfacc15, 0x60a5fa, 0xf472b6, 0xffffff];

export function burst(scene: Phaser.Scene, x: number, y: number): void {
  if (prefersReducedMotion()) return;
  if (!scene.textures.exists('spark')) return;

  const emitter = scene.add.particles(x, y, 'spark', {
    speed: { min: 120, max: 320 },
    angle: { min: 200, max: 340 },
    gravityY: 420,
    lifespan: 900,
    scale: { start: 1, end: 0 },
    rotate: { min: 0, max: 360 },
    tint: COLORS,
    emitting: false,
  });
  emitter.setDepth(2000);
  emitter.explode(32, x, y);
  scene.time.delayedCall(1100, () => emitter.destroy());
}
