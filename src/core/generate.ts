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

/** Killer: target number of cages, largest allowed cage, and max single-cell cages. */
const KILLER_CAGES: Record<Difficulty, { cages: number; maxSize: number; maxSingles: number }> = {
  easy: { cages: 38, maxSize: 3, maxSingles: 6 },
  medium: { cages: 31, maxSize: 4, maxSingles: 2 },
  hard: { cages: 26, maxSize: 5, maxSingles: 0 },
  expert: { cages: 22, maxSize: 6, maxSingles: 0 },
};

const KILLER_MAX_ATTEMPTS = 2000;
/** Search budget for one uniqueness check; a merge that cannot be verified in time is skipped. */
const KILLER_NODE_BUDGET = 6_000;
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
 * and merges neighbouring cages at random. Single-cell cages are prioritized
 * first down to `maxSingles`, then general merges proceed toward `targetCages`.
 * A merge is kept only if the puzzle still has exactly one solution.
 */
export function generateKiller(difficulty: Difficulty): Puzzle {
  const solution = generateSolvedGrid();
  const { cages: targetCages, maxSize, maxSingles } = KILLER_CAGES[difficulty];

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
  const blockedPairs = new Set<string>();

  for (
    let attempt = 0;
    attempt < KILLER_MAX_ATTEMPTS && performance.now() < deadline;
    attempt++
  ) {
    const singleCageIndices: number[] = [];
    for (let c = 0; c < cages.length; c++) {
      if (cages[c].length === 1) singleCageIndices.push(c);
    }

    const needSingleMerge = singleCageIndices.length > maxSingles;
    if (!needSingleMerge && cages.length <= targetCages) break;

    let a: number;
    if (needSingleMerge) {
      a = singleCageIndices[Math.floor(Math.random() * singleCageIndices.length)];
    } else {
      const i = Math.floor(Math.random() * CELLS);
      a = cageOf[i];
    }

    const maskA = digitMask(cages[a]);
    const neighborCages = new Set<number>();
    for (const cell of cages[a]) {
      for (const peer of PEERS[cell]) {
        if (isOrthogonal(cell, peer) && cageOf[peer] !== a) {
          neighborCages.add(cageOf[peer]);
        }
      }
    }

    const allowedMax = needSingleMerge && maxSingles === 0 ? maxSize + 1 : maxSize;
    const candidates = [...neighborCages].filter((b) => {
      const mergedLen = cages[a].length + cages[b].length;
      if (mergedLen > (cages[a].length === 1 && cages[b].length === maxSize ? allowedMax : maxSize)) {
        return false;
      }
      if (maskA & digitMask(cages[b])) return false;
      const key =
        cages[a][0] < cages[b][0]
          ? `${cages[a].join(',')}|${cages[b].join(',')}`
          : `${cages[b].join(',')}|${cages[a].join(',')}`;
      return !blockedPairs.has(key);
    });

    if (candidates.length === 0) {
      if (needSingleMerge && singleCageIndices.every((s) => s === a)) break;
      continue;
    }

    // Prefer merging with smaller neighbour cages so singletons pair up first.
    shuffle(candidates).sort((x, y) => cages[x].length - cages[y].length);
    const b = candidates[0];
    const pairKey =
      cages[a][0] < cages[b][0]
        ? `${cages[a].join(',')}|${cages[b].join(',')}`
        : `${cages[b].join(',')}|${cages[a].join(',')}`;

    const merged = [...cages[a], ...cages[b]];
    const next = cages.filter((_, k) => k !== a && k !== b);
    next.push(merged);
    const solutions = countSolutions(
      new Array<number>(CELLS).fill(0),
      toCageObjects(next),
      2,
      KILLER_NODE_BUDGET,
    );
    if (solutions !== 1) {
      blockedPairs.add(pairKey);
      continue;
    }

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
