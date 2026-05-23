// Cronómetro count-UP (NO countdown amenazante — GDD §2.2 / Csikszentmihalyi
// flow). El timeLimit solo marca el tiempo "recomendado"; al superarlo NO
// se penaliza: el aprendizaje completo prevalece sobre el reloj.

export class TimerSystem {
  elapsedMs = 0;
  private recommendedMs: number;
  private running = true;
  private overRecommended = false;

  constructor(recommendedSeconds: number) {
    this.recommendedMs = recommendedSeconds * 1000;
  }

  update(deltaMs: number): void {
    if (this.running) this.elapsedMs += deltaMs;
    if (!this.overRecommended && this.elapsedMs >= this.recommendedMs) {
      this.overRecommended = true;
    }
  }

  pause(): void {
    this.running = false;
  }

  resume(): void {
    this.running = true;
  }

  get isOverRecommended(): boolean {
    return this.overRecommended;
  }

  format(): string {
    const total = Math.floor(this.elapsedMs / 1000);
    const m = Math.floor(total / 60)
      .toString()
      .padStart(2, '0');
    const s = (total % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  static formatMs(ms: number): string {
    const total = Math.floor(ms / 1000);
    const m = Math.floor(total / 60)
      .toString()
      .padStart(2, '0');
    const s = (total % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }
}
