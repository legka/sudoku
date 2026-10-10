import { Cage, CELLS, Grid, SIZE } from './types';
import { bit, boxOf, colOf, findConflicts, popcount, rowOf } from './rules';

const ALL_DIGITS = 0b11_1111_1110; // bits 1..9

interface Context {
  v: Grid;
  rows: number[];
  cols: number[];
  boxes: number[];
  /** Cage index per cell, or -1 when the cell is outside any cage. */
  cageOf: number[];
  cages: Cage[];
  cageSum: number[];
  cageFilled: number[];
  cageMask: number[];
  shuffle: boolean;
  limit: number;
  count: number;
  solution: Grid | null;
  nodes: number;
  nodeBudget: number;
  aborted: boolean;
}

export interface SolveOptions {
  /** Stop after this many solutions have been found (default 2). */
  limit?: number;
  /** Try digits in random order, so repeated calls yield different grids. */
  shuffle?: boolean;
  /** Give up after this many search nodes (default: no limit). */
  nodeBudget?: number;
}

function createContext(givens: Grid, cages: Cage[], opts: SolveOptions): Context {
  const cageOf = new Array<number>(CELLS).fill(-1);
  cages.forEach((cage, c) => {
    for (const i of cage.cells) cageOf[i] = c;
  });

  const ctx: Context = {
    v: givens.slice(),
    rows: new Array<number>(SIZE).fill(0),
    cols: new Array<number>(SIZE).fill(0),
    boxes: new Array<number>(SIZE).fill(0),
    cageOf,
    cages,
    cageSum: cages.map(() => 0),
    cageFilled: cages.map(() => 0),
    cageMask: cages.map(() => 0),
    shuffle: opts.shuffle ?? false,
    limit: opts.limit ?? 2,
    count: 0,
    solution: null,
    nodes: 0,
    nodeBudget: opts.nodeBudget ?? Infinity,
    aborted: false,
  };

  for (let i = 0; i < CELLS; i++) {
    const d = ctx.v[i];
    if (d !== 0) place(ctx, i, d);
  }
  return ctx;
}

function place(ctx: Context, i: number, d: number): void {
  const b = bit(d);
  ctx.v[i] = d;
  ctx.rows[rowOf(i)] |= b;
  ctx.cols[colOf(i)] |= b;
  ctx.boxes[boxOf(i)] |= b;
  const c = ctx.cageOf[i];
  if (c >= 0) {
    ctx.cageSum[c] += d;
    ctx.cageFilled[c] += 1;
    ctx.cageMask[c] |= b;
  }
}

function unplace(ctx: Context, i: number, d: number): void {
  const b = bit(d);
  ctx.v[i] = 0;
  ctx.rows[rowOf(i)] ^= b;
  ctx.cols[colOf(i)] ^= b;
  ctx.boxes[boxOf(i)] ^= b;
  const c = ctx.cageOf[i];
  if (c >= 0) {
    ctx.cageSum[c] -= d;
    ctx.cageFilled[c] -= 1;
    ctx.cageMask[c] ^= b;
  }
}

const MIN_SUM = [0, 1, 3, 6, 10, 15, 21, 28, 36, 45];
const MAX_SUM = [0, 9, 17, 24, 30, 35, 39, 42, 44, 45];

const MIN_BOUNDS = new Int16Array(10 * 1024);
const MAX_BOUNDS = new Int16Array(10 * 1024);

for (let k = 1; k <= SIZE; k++) {
  for (let mask = 0; mask < 1024; mask++) {
    const idx = (k << 10) | mask;
    let low = 0;
    let takenLow = 0;
    for (let x = 1; x <= SIZE && takenLow < k; x++) {
      if (!(mask & bit(x))) {
        low += x;
        takenLow++;
      }
    }
    MIN_BOUNDS[idx] = takenLow === k ? low : 999;

    let high = 0;
    let takenHigh = 0;
    for (let x = SIZE; x >= 1 && takenHigh < k; x--) {
      if (!(mask & bit(x))) {
        high += x;
        takenHigh++;
      }
    }
    MAX_BOUNDS[idx] = takenHigh === k ? high : -1;
  }
}

/**
 * Whether digit d can still go into the cage of cell i: it must be new to the
 * cage, and the cells still empty must be able to make up the remaining sum
 * with distinct digits (checked against the smallest and largest possible totals).
 */
function fitsCage(ctx: Context, c: number, d: number): boolean {
  if (ctx.cageMask[c] & bit(d)) return false;
  const cage = ctx.cages[c];
  const sum = ctx.cageSum[c] + d;
  if (sum > cage.sum) return false;
  const remaining = cage.cells.length - (ctx.cageFilled[c] + 1);
  if (remaining === 0) return sum === cage.sum;

  const need = cage.sum - sum;
  if (need < MIN_SUM[remaining] || need > MAX_SUM[remaining]) return false;

  const used = ctx.cageMask[c] | bit(d);
  const idx = (remaining << 10) | used;
  return need >= MIN_BOUNDS[idx] && need <= MAX_BOUNDS[idx];
}

function candidates(ctx: Context, i: number): number {
  let avail = ALL_DIGITS & ~(ctx.rows[rowOf(i)] | ctx.cols[colOf(i)] | ctx.boxes[boxOf(i)]);
  const c = ctx.cageOf[i];
  if (c < 0) return avail;
  let result = 0;
  for (let d = 1; d <= SIZE; d++) {
    if (avail & bit(d) && fitsCage(ctx, c, d)) result |= bit(d);
  }
  return result;
}

function shuffleInPlace<T>(items: T[]): void {
  for (let k = items.length - 1; k > 0; k--) {
    const j = Math.floor(Math.random() * (k + 1));
    [items[k], items[j]] = [items[j], items[k]];
  }
}

function search(ctx: Context): void {
  if (ctx.count >= ctx.limit || ctx.aborted) return;
  if (++ctx.nodes > ctx.nodeBudget) {
    ctx.aborted = true;
    return;
  }

  // Pick the empty cell with the fewest candidates (most constrained first).
  let best = -1;
  let bestMask = 0;
  let bestCount = 10;
  for (let i = 0; i < CELLS; i++) {
    if (ctx.v[i] !== 0) continue;
    const mask = candidates(ctx, i);
    const n = popcount(mask);
    if (n < bestCount) {
      best = i;
      bestMask = mask;
      bestCount = n;
      if (n <= 1) break;
    }
  }

  if (best === -1) {
    ctx.count++;
    if (!ctx.solution) ctx.solution = ctx.v.slice();
    return;
  }
  if (bestCount === 0) return;

  const digits: number[] = [];
  for (let d = 1; d <= SIZE; d++) if (bestMask & bit(d)) digits.push(d);
  if (ctx.shuffle) shuffleInPlace(digits);

  for (const d of digits) {
    place(ctx, best, d);
    search(ctx);
    unplace(ctx, best, d);
    if (ctx.count >= ctx.limit || ctx.aborted) return;
  }
}

/**
 * Counts solutions of a sudoku (classic when `cages` is empty, killer otherwise),
 * stopping once `limit` have been found. Returns null if `nodeBudget` ran out
 * before the count was settled.
 */
export function countSolutions(
  givens: Grid,
  cages: Cage[] = [],
  limit = 2,
  nodeBudget?: number,
): number | null {
  if (findConflicts(givens, cages).size > 0) return 0;
  const ctx = createContext(givens, cages, { limit, nodeBudget });
  search(ctx);
  if (ctx.count >= limit) return ctx.count;
  return ctx.aborted ? null : ctx.count;
}

/** Returns one solution, or null if the puzzle has none. */
export function solve(givens: Grid, cages: Cage[] = [], opts: SolveOptions = {}): Grid | null {
  if (findConflicts(givens, cages).size > 0) return null;
  const ctx = createContext(givens, cages, { ...opts, limit: 1 });
  search(ctx);
  return ctx.solution;
}
