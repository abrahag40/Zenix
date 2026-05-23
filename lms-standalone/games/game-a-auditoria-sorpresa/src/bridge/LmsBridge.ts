// El game NUNCA accede a una API directamente. Solo postMessage al parent
// frame (iframe sandboxed del engine LMS). Cuando se ejecuta fuera de un
// iframe (dev standalone), cae a console.debug + el helper aria-live.

import type { Answer } from '../types';

export type LmsEvent =
  | { type: 'game:ready' }
  | { type: 'game:progress'; payload: { scenarioId: string; percent: number } }
  | { type: 'game:decision'; payload: { itemId: string; criticalPoint: string; answer: Answer; correct: boolean } }
  | {
      type: 'game:scenario-complete';
      payload: { scenarioId: string; score: number; maxScore: number; timeMs: number; passed: boolean };
    }
  | {
      type: 'game:completed';
      payload: { totalScore: number; maxScore: number; scenariosCompleted: number; replayCount: number };
    }
  | { type: 'game:error'; payload: { code: string; message: string } };

export class LmsBridge {
  // En producción: el origin exacto del engine LMS (no '*').
  private static origin = '*';

  static emit(event: LmsEvent): void {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ source: 'lms-game-a', ...event }, this.origin);
    }
    if (import.meta.env?.DEV) {
      console.debug('[LmsBridge]', event.type, 'payload' in event ? event.payload : '');
    }
  }

  static ready(): void {
    this.emit({ type: 'game:ready' });
  }

  // Anuncio accesible para lectores de pantalla (WCAG aria-live).
  static announce(message: string): void {
    const live = document.getElementById('a11y-live');
    if (live) live.textContent = message;
  }
}
