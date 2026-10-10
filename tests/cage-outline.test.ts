import { describe, expect, it } from 'vitest';
import { cageLabelPosition, cageOutlinePath } from '../src/ui/cage-outline';

/** Parses the points of an outline path made of "M x y L x y ... Z" loops. */
function points(path: string): [number, number][] {
  return [...path.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
}

function bounds(pts: [number, number][]) {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

describe('cageOutlinePath', () => {
  it('insets a single cell outline toward its centre', () => {
    const path = cageOutlinePath([0]);
    expect(path.match(/M/g)).toHaveLength(1);
    expect(bounds(points(path))).toEqual({ minX: 0.08, maxX: 0.92, minY: 0.08, maxY: 0.92 });
    expect(points(path)).toHaveLength(4);
  });

  it('draws one outline around a two-cell cage, with no line on the shared edge', () => {
    // Cells 0 and 1 form a horizontal domino in the top row.
    const path = cageOutlinePath([0, 1]);
    expect(path.match(/M/g)).toHaveLength(1);
    expect(bounds(points(path))).toEqual({ minX: 0.08, maxX: 1.92, minY: 0.08, maxY: 0.92 });
    // The shared edge at x = 1 only appears on the top and bottom outline.
    const pts = points(path);
    expect(pts.filter((p) => p[0] === 1.08 || p[0] === 0.92).length).toBe(0);
  });

  it('outlines an L-shaped cage as one loop', () => {
    // Cells 0, 1 and 9 form an L in the top-left corner.
    const path = cageOutlinePath([0, 1, 9]);
    expect(path.match(/M/g)).toHaveLength(1);
    expect(bounds(points(path))).toEqual({ minX: 0.08, maxX: 1.92, minY: 0.08, maxY: 1.92 });
  });

  it('keeps every outline point a fixed distance inside the grid lines', () => {
    // Points sit 0.08 from a grid line: their fractional part is 0.08 or 0.92.
    const onInset = (v: number) => {
      const f = Math.round((v - Math.floor(v)) * 1000) / 1000;
      return f === 0.08 || f === 0.92;
    };
    for (const cells of [[0], [0, 1], [0, 1, 9], [0, 9, 18, 19, 20]]) {
      for (const [x, y] of points(cageOutlinePath(cells))) {
        expect(onInset(x) || onInset(y)).toBe(true);
      }
    }
  });

  it('places the sum label in the top-left cell of the cage', () => {
    expect(cageLabelPosition([9, 10, 18])).toEqual([0.05, 1.03]);
  });
});
