import { describe, expect, it } from 'vitest';
import { countSolutions, solve } from '../src/core/solver';
import { generateClassic, generateKiller } from '../src/core/generate';
import { Game } from '../src/core/game';
import { findConflicts, PEERS } from '../src/core/rules';
import { CELLS, Grid, Puzzle } from '../src/core/types';

const empty = (): Grid => new Array<number>(CELLS).fill(0);

/** A well-known puzzle with a unique solution. */
const SAMPLE =
  '530070000600195000098000060800060003400803001700020006060000280000419005000080079';
const toGrid = (s: string): Grid => s.split('').map(Number);

function isValidFullGrid(g: Grid): boolean {
  return g.every((v, i) => v !== 0 && PEERS[i].every((j) => g[j] !== v));
}

describe('solver', () => {
  it('solves a classic puzzle', () => {
    const solution = solve(toGrid(SAMPLE));
    expect(solution).not.toBeNull();
    expect(isValidFullGrid(solution!)).toBe(true);
    // Givens are preserved.
    toGrid(SAMPLE).forEach((v, i) => v && expect(solution![i]).toBe(v));
  });

  it('counts solutions and stops at the limit', () => {
    expect(countSolutions(toGrid(SAMPLE))).toBe(1);
    expect(countSolutions(empty(), [], 2)).toBe(2);
  });

  it('reports zero solutions for contradictory givens', () => {
    const g = toGrid(SAMPLE);
    g[2] = 5; // duplicates 5 in row 0
    expect(countSolutions(g)).toBe(0);
    expect(solve(g)).toBeNull();
  });

  it('respects cage sums', () => {
    // Two cells in the first row, sum 3: only {1,2} works.
    const cages = [{ cells: [0, 1], sum: 3 }];
    expect(countSolutions(empty(), cages, 10)).toBeGreaterThan(1);
    const solution = solve(empty(), [{ cells: [0, 1], sum: 3 }]);
    expect(solution![0] + solution![1]).toBe(3);
  });
});

describe('findConflicts', () => {
  it('flags duplicate digits in a row', () => {
    const g = empty();
    g[0] = 4;
    g[8] = 4;
    expect([...findConflicts(g)].sort()).toEqual([0, 8]);
  });

  it('flags a complete cage with the wrong sum', () => {
    const g = empty();
    g[0] = 1;
    g[1] = 2;
    const conflicts = findConflicts(g, [{ cells: [0, 1], sum: 4 }]);
    expect([...conflicts].sort()).toEqual([0, 1]);
  });

  it('does not flag a partially filled cage that is still on track', () => {
    const g = empty();
    g[0] = 1;
    expect(findConflicts(g, [{ cells: [0, 1], sum: 4 }]).size).toBe(0);
  });
});

describe('classic generator', () => {
  it('produces a puzzle with a unique solution that matches its givens', () => {
    const p = generateClassic('hard');
    expect(isValidFullGrid(p.solution)).toBe(true);
    expect(countSolutions(p.givens, [], 2)).toBe(1);
    p.givens.forEach((v, i) => v && expect(v).toBe(p.solution[i]));
  });

  it('gives fewer clues on harder levels', () => {
    const clues = (p: Puzzle) => p.givens.filter((v) => v !== 0).length;
    expect(clues(generateClassic('easy'))).toBeGreaterThan(clues(generateClassic('expert')));
  });
});

describe('killer generator', () => {
  it.each(['easy', 'medium', 'hard', 'expert'] as const)(
    'builds a unique %s puzzle with consistent cages',
    (difficulty) => {
      const p = generateKiller(difficulty);

      // Cages partition the grid.
      const seen = new Array<number>(CELLS).fill(0);
      for (const cage of p.cages) {
        for (const i of cage.cells) seen[i]++;
        const digits = cage.cells.map((i) => p.solution[i]);
        expect(new Set(digits).size).toBe(digits.length);
        expect(digits.reduce((a, b) => a + b, 0)).toBe(cage.sum);
      }
      expect(seen.every((n) => n === 1)).toBe(true);

      expect(countSolutions(empty(), p.cages, 2)).toBe(1);
      expect(p.cages.length).toBeLessThan(CELLS);
    },
    20_000,
  );
});

describe('Game', () => {
  const puzzle = (): Puzzle => ({
    mode: 'classic',
    difficulty: 'easy',
    givens: toGrid(SAMPLE),
    solution: solve(toGrid(SAMPLE))!,
    cages: [],
  });

  it('does not let the player change givens', () => {
    const g = new Game(puzzle());
    g.select(0);
    expect(g.inputDigit(1, false)).toBe(false);
  });

  it('counts wrong entries as mistakes and supports undo', () => {
    const p = puzzle();
    const g = new Game(p);
    const empties = p.givens.flatMap((v, i) => (v === 0 ? [i] : []));
    const i = empties[0];
    const wrong = p.solution[i] === 1 ? 2 : 1;

    g.select(i);
    g.inputDigit(wrong, false);
    expect(g.values[i]).toBe(wrong);
    expect(g.isWrong(i)).toBe(true);
    expect(g.mistakes).toBe(1);

    g.undo();
    expect(g.values[i]).toBe(0);
  });

  it('toggles pencil marks in note mode', () => {
    const g = new Game(puzzle());
    g.select(2);
    g.inputDigit(4, true);
    expect(g.notes[2] & (1 << 4)).toBeTruthy();
    g.inputDigit(4, true);
    expect(g.notes[2]).toBe(0);
  });

  it('finishes when every cell matches the solution', () => {
    const p = puzzle();
    const g = new Game(p);
    for (let i = 0; i < CELLS; i++) {
      if (p.givens[i] === 0) {
        g.select(i);
        g.inputDigit(p.solution[i], false);
      }
    }
    expect(g.finished).toBe(true);
    expect(g.mistakes).toBe(0);
  });

  it('restores from a saved snapshot', () => {
    const g = new Game(puzzle());
    g.select(0);
    g.hint();
    const restored = new Game(puzzle(), JSON.parse(JSON.stringify(g.toJSON())));
    expect(restored.values).toEqual(g.values);
    expect(restored.hints).toBe(1);
  });
});
