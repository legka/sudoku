import type { GameSnapshot } from '../core/game';
import { CELLS } from '../core/types';

const KEY = 'sudoku.game.v1';

function isSnapshot(value: unknown): value is GameSnapshot {
  if (typeof value !== 'object' || value === null) return false;
  const s = value as Partial<GameSnapshot>;
  return (
    !!s.puzzle &&
    Array.isArray(s.puzzle.givens) &&
    s.puzzle.givens.length === CELLS &&
    Array.isArray(s.puzzle.solution) &&
    s.puzzle.solution.length === CELLS &&
    Array.isArray(s.values) &&
    s.values.length === CELLS &&
    Array.isArray(s.notes) &&
    s.notes.length === CELLS &&
    (s.undoStack === undefined || Array.isArray(s.undoStack))
  );
}

/** Storage can be unavailable (private mode, blocked site data); failures are ignored. */
export function loadSnapshot(): GameSnapshot | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isSnapshot(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveSnapshot(snapshot: GameSnapshot): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(snapshot));
  } catch {
    // Saving is a convenience; the game still works without it.
  }
}
