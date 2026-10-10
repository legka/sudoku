import { generatePuzzle } from '../core/generate';
import type { Difficulty, Mode } from '../core/types';

export interface GenerateRequest {
  id: number;
  mode: Mode;
  difficulty: Difficulty;
}

// Puzzle generation (especially killer) can take a second or more,
// so it runs off the main thread to keep the UI responsive.
self.onmessage = (event: MessageEvent<GenerateRequest>) => {
  const { id, mode, difficulty } = event.data;
  try {
    postMessage({ id, puzzle: generatePuzzle(mode, difficulty) });
  } catch (error) {
    postMessage({ id, error: String(error) });
  }
};
