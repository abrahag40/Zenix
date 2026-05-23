// Tipos del CONTENT (escenarios JSON). El engine del game NO conoce las
// respuestas en código — las lee de estos datos versionados. Principio
// engine/content del genesis prompt del LMS.

export type Answer = 'CUMPLE' | 'NO_CUMPLE';

export interface EvaluableItemData {
  id: string;
  x: number;
  y: number;
  sprite: string;
  area: string;
  criticalPoint: string;
  compliant: boolean;
  question: string;
  correctAnswer: Answer;
  explanation: string;
  source: string;
  fineIfMissed: number;
  critical: boolean;
}

export interface ScenarioData {
  id: string;
  version: string;
  title: string;
  difficulty: string;
  bloomLevel: string;
  tilemap: string;
  timeLimitSeconds: number;
  hintsAvailable: number;
  passThreshold: number;
  narrativeIntro: string;
  items: EvaluableItemData[];
}

export interface ItemResult {
  item: EvaluableItemData;
  answer: Answer;
  correct: boolean;
}

// Catálogo de escenarios disponibles (orden = progresión de dificultad).
export const SCENARIOS = [
  { key: 'scenario-01-hostal', file: 'content/scenario-01-hostal.json' },
  { key: 'scenario-02-hotel', file: 'content/scenario-02-hotel.json' },
  { key: 'scenario-03-resort', file: 'content/scenario-03-resort.json' },
] as const;
