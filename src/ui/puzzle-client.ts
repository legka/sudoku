import { generatePuzzle } from '../core/generate';
import type { Difficulty, Mode, Puzzle } from '../core/types';
import type { GenerateRequest } from './generator.worker';
import GeneratorWorker from './generator.worker?worker&inline';

interface Reply {
  id: number;
  puzzle?: Puzzle;
  error?: string;
}

interface PendingJob {
  mode: Mode;
  difficulty: Difficulty;
  resolve: (p: Puzzle) => void;
  reject: (e: Error) => void;
}

const pending = new Map<number, PendingJob>();
let worker: Worker | null = null;
let nextId = 0;

function getWorker(): Worker | null {
  if (worker) return worker;
  if (typeof Worker === 'undefined') return null;
  try {
    worker = new GeneratorWorker();
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
  worker.onerror = () => {
    const jobs = [...pending.values()];
    pending.clear();
    worker?.terminate();
    worker = null;
    for (const job of jobs) {
      try {
        job.resolve(generatePuzzle(job.mode, job.difficulty));
      } catch (err) {
        job.reject(err instanceof Error ? err : new Error(String(err)));
      }
    }
  };
  return worker;
}

export function cancelPending(): void {
  if (pending.size === 0) return;
  for (const job of pending.values()) {
    job.reject(new Error('Superseded by a newer request'));
  }
  pending.clear();
  if (worker) {
    worker.terminate();
    worker = null;
  }
}

/** Generates a puzzle in a worker when possible, otherwise on the main thread. */
export function requestPuzzle(mode: Mode, difficulty: Difficulty): Promise<Puzzle> {
  cancelPending();

  const w = getWorker();
  if (!w) return Promise.resolve(generatePuzzle(mode, difficulty));

  return new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { mode, difficulty, resolve, reject });
    const request: GenerateRequest = { id, mode, difficulty };
    w.postMessage(request);
  });
}
