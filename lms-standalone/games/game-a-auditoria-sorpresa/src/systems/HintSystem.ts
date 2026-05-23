// Pistas: 3 por escenario, cuestan 5 pts cada una pero NO reducen aprendizaje
// (scaffolding Vygotsky). La pista NO revela la respuesta: solo dirige la
// atención hacia un punto aún sin evaluar (resalta su área).

export class HintSystem {
  remaining: number;
  readonly cost = 5;

  constructor(available: number) {
    this.remaining = available;
  }

  get canUse(): boolean {
    return this.remaining > 0;
  }

  use(): boolean {
    if (!this.canUse) return false;
    this.remaining--;
    return true;
  }
}
