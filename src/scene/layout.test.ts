import { describe, expect, it } from 'vitest';
import { expandedLayout, focusSizes, lerpSizes, packLayout, rectsFrom, restSizes, type Rect } from './layout';

const GAP = 0.14;
const EPS = 1e-6;

function overlaps(a: Rect, b: Rect) {
  return Math.abs(a.x - b.x) < (a.w + b.w) / 2 - EPS && Math.abs(a.z - b.z) < (a.d + b.d) / 2 - EPS;
}

function check(rects: Rect[], W: number, D: number) {
  for (const r of rects) {
    expect(r.w).toBeGreaterThan(0);
    expect(r.d).toBeGreaterThan(0);
    expect(r.x - r.w / 2).toBeGreaterThanOrEqual(-W / 2 - EPS);
    expect(r.x + r.w / 2).toBeLessThanOrEqual(W / 2 + EPS);
    expect(r.z - r.d / 2).toBeGreaterThanOrEqual(-D / 2 - EPS);
    expect(r.z + r.d / 2).toBeLessThanOrEqual(D / 2 + EPS);
  }
  for (let i = 0; i < rects.length; i++)
    for (let j = i + 1; j < rects.length; j++) expect(overlaps(rects[i], rects[j])).toBe(false);
}

// Landscape (columns of rows) and portrait (one column of rows) boxes.
for (const [W, D] of [[6, 3.9], [3.9, 7]]) {
describe(`layout ${W}x${D}`, () => {
  for (let n = 1; n <= 12; n++) {
    it(`packs ${n} cells inside the box without overlap`, () => {
      const rects = packLayout(n, W, D, GAP);
      expect(rects).toHaveLength(n);
      check(rects, W, D);
    });

    it(`focuses each of ${n} cells; the focused one is the largest`, () => {
      for (let i = 0; i < n; i++) {
        const rects = expandedLayout(n, i, W, D, GAP);
        check(rects, W, D);
        const area = (r: Rect) => r.w * r.d;
        rects.forEach((r, j) => j !== i && expect(area(rects[i])).toBeGreaterThan(area(r)));
      }
    });

    it(`never overlaps mid-transition (${n} cells)`, () => {
      // Critically damped springs only overshoot a little (when retargeted mid-flight); the tall
      // box's row spans are long, so the same overshoot is a smaller fraction of them.
      const overshoot = D > W ? 1.02 : 1.1;
      const rest = restSizes(n, W, D, GAP);
      const states = [rest, ...Array.from({ length: n }, (_, i) => focusSizes(n, i, W, D, GAP))];
      for (const a of states)
        for (const b of states)
          for (const t of [0.25, 0.5, 0.75, overshoot]) check(rectsFrom(n, lerpSizes(a, b, t), W, D, GAP), W, D);
    });
  }
});
}
