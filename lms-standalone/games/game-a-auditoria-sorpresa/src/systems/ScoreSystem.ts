// Scoring del escenario. Correcto +10 / falso positivo o falso negativo -5.
// Falso negativo (no detectar incumplimiento crítico) además registra multa
// simulada en MXN — hace visceral la consecuencia real (STPS/COFEPRIS).

export class ScoreSystem {
  total = 0;
  finesIncurred = 0;
  finesAvoided = 0;
  correctCount = 0;
  hintCost = 0;

  add(points: number): void {
    this.total += points;
    this.correctCount++;
  }

  subtract(points: number): void {
    this.total = Math.max(0, this.total - points);
  }

  registerFine(amount: number): void {
    this.finesIncurred += amount;
  }

  registerAvoided(amount: number): void {
    this.finesAvoided += amount;
  }

  payHint(cost: number): void {
    this.total = Math.max(0, this.total - cost);
    this.hintCost += cost;
  }
}
