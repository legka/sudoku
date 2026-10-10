/** 81 cell values in row-major order. 0 means empty. */
export type Grid = number[];

export interface Cage {
  /** Cell indices belonging to the cage. */
  cells: number[];
  /** Required sum of the digits in the cage. */
  sum: number;
}

export type Mode = 'classic' | 'killer';
export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert';

export interface Puzzle {
  mode: Mode;
  difficulty: Difficulty;
  /** Clues shown at the start. All zeros for killer puzzles. */
  givens: Grid;
  solution: Grid;
  /** Empty for classic puzzles. */
  cages: Cage[];
}

export const SIZE = 9;
export const CELLS = 81;
