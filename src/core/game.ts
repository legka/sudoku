import { CELLS, Grid, Puzzle } from './types';
import { PEERS, bit } from './rules';

interface Snapshot {
  values: Grid;
  /** Pencil marks per cell: bit d set means digit d is noted. */
  notes: number[];
}

export interface GameSnapshot extends Snapshot {
  puzzle: Puzzle;
  selected: number | null;
  mistakes: number;
  hints: number;
  elapsedSeconds: number;
  finished: boolean;
}

const UNDO_LIMIT = 500;

/** Mutable state of one game in progress. */
export class Game {
  readonly puzzle: Puzzle;
  values: Grid;
  notes: number[];
  selected: number | null = null;
  mistakes = 0;
  hints = 0;
  elapsedSeconds = 0;
  finished = false;

  private undoStack: Snapshot[] = [];

  constructor(puzzle: Puzzle, state?: Partial<GameSnapshot>) {
    this.puzzle = puzzle;
    this.values = state?.values?.slice() ?? puzzle.givens.slice();
    this.notes = state?.notes?.slice() ?? new Array<number>(CELLS).fill(0);
    this.selected = state?.selected ?? null;
    this.mistakes = state?.mistakes ?? 0;
    this.hints = state?.hints ?? 0;
    this.elapsedSeconds = state?.elapsedSeconds ?? 0;
    this.finished = state?.finished ?? false;
  }

  isGiven(i: number): boolean {
    return this.puzzle.givens[i] !== 0;
  }

  /** A filled value that differs from the solution. */
  isWrong(i: number): boolean {
    return this.values[i] !== 0 && this.values[i] !== this.puzzle.solution[i];
  }

  get isSolved(): boolean {
    return this.values.every((v, i) => v === this.puzzle.solution[i]);
  }

  select(i: number | null): void {
    this.selected = i;
  }

  /**
   * Places digit d (1–9) in the selected cell, or toggles it as a pencil mark
   * when `noteMode` is set. Returns true if the state changed.
   */
  inputDigit(d: number, noteMode: boolean): boolean {
    const i = this.selected;
    if (this.finished || i === null || this.isGiven(i)) return false;

    if (noteMode) {
      if (this.values[i] !== 0) return false;
      this.commit(() => {
        this.notes[i] ^= bit(d);
      });
      return true;
    }

    if (this.values[i] === d) return false;
    this.commit(() => {
      this.values[i] = d;
      this.notes[i] = 0;
      // A placed digit no longer needs to be noted in the same row, column or box.
      for (const j of PEERS[i]) this.notes[j] &= ~bit(d);
    });
    if (d !== this.puzzle.solution[i]) this.mistakes++;
    this.checkFinished();
    return true;
  }

  erase(): boolean {
    const i = this.selected;
    if (this.finished || i === null || this.isGiven(i)) return false;
    if (this.values[i] === 0 && this.notes[i] === 0) return false;
    this.commit(() => {
      this.values[i] = 0;
      this.notes[i] = 0;
    });
    return true;
  }

  /** Fills the selected cell (or the first empty cell) with its correct value. */
  hint(): boolean {
    if (this.finished) return false;
    const candidates = [this.selected, ...this.values.map((_, i) => i)].filter(
      (i): i is number => i !== null && !this.isGiven(i) && this.values[i] !== this.puzzle.solution[i],
    );
    const i = candidates[0];
    if (i === undefined) return false;
    const d = this.puzzle.solution[i];
    this.commit(() => {
      this.values[i] = d;
      this.notes[i] = 0;
      for (const j of PEERS[i]) this.notes[j] &= ~bit(d);
    });
    this.hints++;
    this.checkFinished();
    return true;
  }

  undo(): boolean {
    const prev = this.undoStack.pop();
    if (!prev || this.finished) return false;
    this.values = prev.values;
    this.notes = prev.notes;
    return true;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0 && !this.finished;
  }

  private commit(change: () => void): void {
    this.undoStack.push({ values: this.values.slice(), notes: this.notes.slice() });
    if (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift();
    change();
  }

  private checkFinished(): void {
    if (this.isSolved) {
      this.finished = true;
      this.selected = null;
    }
  }

  toJSON(): GameSnapshot {
    return {
      puzzle: this.puzzle,
      values: this.values,
      notes: this.notes,
      selected: this.selected,
      mistakes: this.mistakes,
      hints: this.hints,
      elapsedSeconds: this.elapsedSeconds,
      finished: this.finished,
    };
  }
}
