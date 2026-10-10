import { CELLS, Cage, Grid, SIZE } from './types';

export const rowOf = (i: number): number => Math.floor(i / SIZE);
export const colOf = (i: number): number => i % SIZE;
export const boxOf = (i: number): number =>
  Math.floor(rowOf(i) / 3) * 3 + Math.floor(colOf(i) / 3);

/** The 27 classic units: 9 rows, 9 columns, 9 boxes. */
export const UNITS: readonly number[][] = (() => {
  const units: number[][] = [];
  for (let k = 0; k < SIZE; k++) {
    units.push([], [], []);
  }
  for (let i = 0; i < CELLS; i++) {
    units[rowOf(i)].push(i);
    units[SIZE + colOf(i)].push(i);
    units[2 * SIZE + boxOf(i)].push(i);
  }
  return units;
})();

/** For each cell, the 20 distinct cells sharing a row, column or box with it. */
export const PEERS: readonly number[][] = (() => {
  const peers: number[][] = [];
  for (let i = 0; i < CELLS; i++) {
    const set = new Set<number>();
    for (const unit of UNITS) {
      if (unit.includes(i)) {
        for (const j of unit) if (j !== i) set.add(j);
      }
    }
    peers.push([...set]);
  }
  return peers;
})();

/** Maps each cell to the index of the cage containing it (-1 if none). */
export function cageIndexOf(cages: Cage[]): number[] {
  const index = new Array<number>(CELLS).fill(-1);
  cages.forEach((cage, c) => {
    for (const i of cage.cells) index[i] = c;
  });
  return index;
}

/**
 * Returns the cells that break a rule: a repeated digit in a row, column,
 * box or cage, or a cage whose digits overshoot or (when full) miss its sum.
 * Empty cells are never reported.
 */
export function findConflicts(values: Grid, cages: Cage[] = []): Set<number> {
  const bad = new Set<number>();

  const checkUnit = (cells: readonly number[]): void => {
    const seen = new Map<number, number>();
    for (const i of cells) {
      const v = values[i];
      if (v === 0) continue;
      const other = seen.get(v);
      if (other === undefined) seen.set(v, i);
      else {
        bad.add(i);
        bad.add(other);
      }
    }
  };

  for (const unit of UNITS) checkUnit(unit);

  for (const cage of cages) {
    checkUnit(cage.cells);
    let total = 0;
    let filled = 0;
    for (const i of cage.cells) {
      if (values[i] !== 0) {
        total += values[i];
        filled++;
      }
    }
    const overshoot = total > cage.sum;
    const wrongTotal = filled === cage.cells.length && total !== cage.sum;
    if (overshoot || wrongTotal) {
      for (const i of cage.cells) if (values[i] !== 0) bad.add(i);
    }
  }

  return bad;
}

/** Bit mask helpers: bit d (1..9) represents digit d. */
export const bit = (d: number): number => 1 << d;
export const popcount = (mask: number): number => {
  let m = mask;
  let n = 0;
  while (m) {
    m &= m - 1;
    n++;
  }
  return n;
};
