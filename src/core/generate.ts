import { countSolutions, solve } from './solver';
import { Cage, CELLS, Difficulty, Grid, Puzzle, SIZE } from './types';
import { PEERS, bit } from './rules';

/** Classic: number of clues to leave on the board (unreachable targets stop early). */
const CLASSIC_CLUES: Record<Difficulty, number> = {
  easy: 38,
  medium: 32,
  hard: 27,
  expert: 23,
};

/** Killer: target number of cages, and the largest allowed cage. */
const KILLER_CAGES: Record<Difficulty, { cages: number; maxSize: number }> = {
  easy: { cages: 36, maxSize: 3 },
  medium: { cages: 29, maxSize: 4 },
  hard: { cages: 23, maxSize: 4 },
  expert: { cages: 22, maxSize: 5 },
};

const KILLER_MAX_ATTEMPTS = 2000;
/** Search budget for one uniqueness check; a merge that cannot be verified in time is skipped. */
const KILLER_NODE_BUDGET = 4_000;
/** Generation stops merging after this long, keeping the (always unique) puzzle so far. */
const KILLER_TIME_BUDGET_MS = 1_500;

function shuffle<T>(items: T[]): T[] {
  for (let k = items.length - 1; k > 0; k--) {
    const j = Math.floor(Math.random() * (k + 1));
    [items[k], items[j]] = [items[j], items[k]];
  }
  return items;
}

/** A random, fully solved classic grid. */
export function generateSolvedGrid(): Grid {
  const solved = solve(new Array<number>(CELLS).fill(0), [], { shuffle: true });
  if (!solved) throw new Error('Failed to generate a solved grid');
  return solved;
}

export function generateClassic(difficulty: Difficulty): Puzzle {
  const solution = generateSolvedGrid();
  const givens = solution.slice();
  const target = CLASSIC_CLUES[difficulty];
  let clues = CELLS;

  for (const i of shuffle([...Array(CELLS).keys()])) {
    if (clues <= target) break;
    const saved = givens[i];
    givens[i] = 0;
    if (countSolutions(givens, [], 2) === 1) {
      clues--;
    } else {
      givens[i] = saved;
    }
  }

  return { mode: 'classic', difficulty, givens, solution, cages: [] };
}

/**
 * Killer: begins with every cell in its own cage (which fixes the solution)
 * and merges neighbouring cages at random. A merge is kept only if the
 * puzzle still has exactly one solution.
 */
export function generateKiller(difficulty: Difficulty): Puzzle {
  const solution = generateSolvedGrid();
  const { cages: targetCages, maxSize } = KILLER_CAGES[difficulty];

  let cages: number[][] = [...Array(CELLS).keys()].map((i) => [i]);
  let cageOf = [...Array(CELLS).keys()];

  const toCageObjects = (groups: number[][]): Cage[] =>
    groups.map((cells) => ({
      cells,
      sum: cells.reduce((total, i) => total + solution[i], 0),
    }));

  const digitMask = (cells: number[]): number =>
    cells.reduce((mask, i) => mask | bit(solution[i]), 0);

  const deadline = performance.now() + KILLER_TIME_BUDGET_MS;
  for (
    let attempt = 0;
    attempt < KILLER_MAX_ATTEMPTS && cages.length > targetCages && performance.now() < deadline;
    attempt++
  ) {
    const i = Math.floor(Math.random() * CELLS);
    const neighbours = PEERS[i].filter((j) => isOrthogonal(i, j) && cageOf[j] !== cageOf[i]);
    if (neighbours.length === 0) continue;
    const j = neighbours[Math.floor(Math.random() * neighbours.length)];

    const a = cageOf[i];
    const b = cageOf[j];
    const merged = [...cages[a], ...cages[b]];
    if (merged.length > maxSize) continue;
    // Digits within one cage must be distinct.
    if (digitMask(cages[a]) & digitMask(cages[b])) continue;

    const next = cages.filter((_, k) => k !== a && k !== b);
    next.push(merged);
    const solutions = countSolutions(
      new Array<number>(CELLS).fill(0),
      toCageObjects(next),
      2,
      KILLER_NODE_BUDGET,
    );
    if (solutions !== 1) continue;

    cages = next;
    cageOf = new Array<number>(CELLS).fill(-1);
    cages.forEach((cells, c) => cells.forEach((k) => (cageOf[k] = c)));
  }

  return {
    mode: 'killer',
    difficulty,
    givens: new Array<number>(CELLS).fill(0),
    solution,
    cages: toCageObjects(cages).map((cage) => ({
      ...cage,
      cells: [...cage.cells].sort((x, y) => x - y),
    })),
  };
}

function isOrthogonal(i: number, j: number): boolean {
  const ri = Math.floor(i / SIZE);
  const rj = Math.floor(j / SIZE);
  const ci = i % SIZE;
  const cj = j % SIZE;
  return (ri === rj && Math.abs(ci - cj) === 1) || (ci === cj && Math.abs(ri - rj) === 1);
}

export function generatePuzzle(mode: 'classic' | 'killer', difficulty: Difficulty): Puzzle {
  return mode === 'classic' ? generateClassic(difficulty) : generateKiller(difficulty);
}
