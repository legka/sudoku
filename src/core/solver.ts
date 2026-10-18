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

/**
 * Precomputed valid digit-set bitmasks (bits 1..9) indexed by [count][sum].
 * Across all (count, sum) pairs there are only 511 non-empty subsets of {1..9}.
 */
const CAGE_COMBOS: Uint16Array[][] = Array.from({ length: SIZE + 1 }, () =>
  Array.from({ length: 46 }, () => new Uint16Array(0)),
);

{
  const buckets: number[][][] = Array.from({ length: SIZE + 1 }, () =>
    Array.from({ length: 46 }, () => []),
  );
  for (let mask = 2; mask <= ALL_DIGITS; mask += 2) {
    let count = 0;
    let sum = 0;
    for (let d = 1; d <= SIZE; d++) {
      if (mask & bit(d)) {
        count++;
        sum += d;
      }
    }
    buckets[count][sum].push(mask);
  }
  for (let k = 1; k <= SIZE; k++) {
    for (let s = 1; s <= 45; s++) {
      if (buckets[k][s].length > 0) {
        CAGE_COMBOS[k][s] = new Uint16Array(buckets[k][s]);
      }
    }
  }
}

function rawAvail(ctx: Context, i: number): number {
  return ALL_DIGITS & ~(ctx.rows[rowOf(i)] | ctx.cols[colOf(i)] | ctx.boxes[boxOf(i)]);
}

function candidates(ctx: Context, i: number): number {
  const avail = rawAvail(ctx, i);
  const c = ctx.cageOf[i];
  if (c < 0 || avail === 0) return avail;

  const cage = ctx.cages[c];
  const rem = cage.cells.length - ctx.cageFilled[c];
  const need = cage.sum - ctx.cageSum[c];
  if (rem <= 0 || need <= 0 || need > 45) return 0;

  const combos = CAGE_COMBOS[rem][need];
  if (combos.length === 0) return 0;

  const used = ctx.cageMask[c];
  if (rem === 1) {
    return need <= SIZE && !(used & bit(need)) ? avail & bit(need) : 0;
  }

  let unionAvail = avail;
  for (let k = 0; k < cage.cells.length; k++) {
    const cell = cage.cells[k];
    if (cell !== i && ctx.v[cell] === 0) {
      unionAvail |= rawAvail(ctx, cell);
    }
  }
  const allowed = unionAvail & ~used;

  let validDigits = 0;
  for (let idx = 0; idx < combos.length; idx++) {
    const m = combos[idx];
    if ((m & allowed) === m) {
      validDigits |= m;
    }
  }
  return avail & validDigits;
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
