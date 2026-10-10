import { generatePuzzle } from '../core/generate';
import type { Difficulty, Mode, Puzzle } from '../core/types';
import type { GenerateRequest } from './generator.worker';

interface Reply {
  id: number;
  puzzle?: Puzzle;
  error?: string;
}

const pending = new Map<number, { resolve: (p: Puzzle) => void; reject: (e: Error) => void }>();
let worker: Worker | null = null;
let nextId = 0;

function getWorker(): Worker | null {
  if (worker) return worker;
  if (typeof Worker === 'undefined') return null;
  try {
    worker = new Worker(new URL('./generator.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    return null;
  }
  worker.onmessage = (event: MessageEvent<Reply>) => {
    const { id, puzzle, error } = event.data;
    const job = pending.get(id);
    if (!job) return;
    pending.delete(id);
    if (puzzle) job.resolve(puzzle);
    else job.reject(new Error(error ?? 'Puzzle generation failed'));
  };
  worker.onerror = (event) => {
    for (const job of pending.values()) job.reject(new Error(event.message));
    pending.clear();
    worker?.terminate();
    worker = null;
  };
  return worker;
}

/** Generates a puzzle in a worker when possible, otherwise on the main thread. */
export function requestPuzzle(mode: Mode, difficulty: Difficulty): Promise<Puzzle> {
  const w = getWorker();
  if (!w) return Promise.resolve(generatePuzzle(mode, difficulty));

  return new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    const request: GenerateRequest = { id, mode, difficulty };
    w.postMessage(request);
  });
}
