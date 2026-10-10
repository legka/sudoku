import { colOf, rowOf } from '../core/rules';
import { SIZE } from '../core/types';

/**
 * Geometry for drawing killer cages in SVG. Units are cells: cell (r, c)
 * occupies the square [c, c+1] x [r, r+1], and the board is 9 x 9.
 */

type Point = [number, number];

const keyOf = (p: Point): string => `${p[0]},${p[1]}`;
const parseKey = (key: string): Point => key.split(',').map(Number) as Point;
const sign = (n: number): number => Math.sign(n) || 0;

/**
 * Closed outline of a cage, inset toward the cage's interior by `inset` cells,
 * as an SVG path. A cage has no holes (at most 5 cells), so the outline is one loop.
 */
export function cageOutlinePath(cells: readonly number[], inset = 0.08): string {
  const inCage = new Set(cells);
  // Boundary edges, directed so the cage lies on the right (clockwise on screen).
  const next = new Map<string, Point>();
  const edge = (from: Point, to: Point): void => {
    next.set(keyOf(from), to);
  };

  for (const i of cells) {
    const r = rowOf(i);
    const c = colOf(i);
    if (r === 0 || !inCage.has(i - SIZE)) edge([c, r], [c + 1, r]);
    if (c === SIZE - 1 || !inCage.has(i + 1)) edge([c + 1, r], [c + 1, r + 1]);
    if (r === SIZE - 1 || !inCage.has(i + SIZE)) edge([c + 1, r + 1], [c, r + 1]);
    if (c === 0 || !inCage.has(i - 1)) edge([c, r + 1], [c, r]);
  }

  const parts: string[] = [];
  const visited = new Set<string>();
  for (const start of next.keys()) {
    if (visited.has(start)) continue;

    const loop: Point[] = [];
    let key = start;
    do {
      visited.add(key);
      const p = parseKey(key);
      loop.push(p);
      key = keyOf(next.get(key)!);
    } while (key !== start);

    const n = loop.length;
    const points = loop.map((p, k) => {
      const prev = loop[(k - 1 + n) % n];
      const after = loop[(k + 1) % n];
      // Inward normal of an edge (cage on the right) is its direction rotated
      // a quarter turn: (dx, dy) -> (-dy, dx). The inset corner is the point
      // where the two offset edges meet: (n1 + n2) / (1 + n1·n2). That is the
      // plain normal on a straight run and the diagonal at a 90° corner.
      const d1 = [sign(p[0] - prev[0]), sign(p[1] - prev[1])];
      const d2 = [sign(after[0] - p[0]), sign(after[1] - p[1])];
      const n1 = [-d1[1], d1[0]];
      const n2 = [-d2[1], d2[0]];
      const scale = inset / (1 + n1[0] * n2[0] + n1[1] * n2[1]);
      const x = p[0] + scale * (n1[0] + n2[0]);
      const y = p[1] + scale * (n1[1] + n2[1]);
      return `${round(x)} ${round(y)}`;
    });
    parts.push(`M${points.join('L')}Z`);
  }
  return parts.join(' ');
}

/** Position for a cage's sum label: just inside the top-left cell of the cage. */
export function cageLabelPosition(cells: readonly number[]): Point {
  const first = Math.min(...cells);
  // Clear of the outline, which sits 0.08 cells in from the cell edge.
  return [colOf(first) + 0.14, rowOf(first) + 0.12];
}

const round = (n: number): number => Math.round(n * 1000) / 1000;
