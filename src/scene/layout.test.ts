import { describe, expect, it } from 'vitest';
import { expandedLayout, focusSizes, lerpSizes, packLayout, rectsFrom, restSizes, type Rect } from './layout';

const GAP = 0.14;
const EPS = 1e-6;

function overlaps(a: Rect, b: Rect) {
  return Math.abs(a.x - b.x) < (a.w + b.w) / 2 - EPS && Math.abs(a.z - b.z) < (a.d + b.d) / 2 - EPS;
}

/**
 * Every way `rects` breaks the box: a non-positive size, an edge outside it, or two overlapping
 * cells. Plain comparisons (negated, so NaN counts as a violation) and one `expect` per call:
 * the mid-transition test runs this on hundreds of layouts, and an `expect` per bound and per
 * pair made it slow enough to hit the test timeout on a busy machine.
 */
function violations(rects: Rect[], W: number, D: number, label = ''): string[] {
  const out: string[] = [];
  rects.forEach((r, i) => {
    if (!(r.w > 0 && r.d > 0)) out.push(`${label}cell ${i} has size ${r.w}x${r.d}`);
    if (
      !(r.x - r.w / 2 >= -W / 2 - EPS && r.x + r.w / 2 <= W / 2 + EPS) ||
      !(r.z - r.d / 2 >= -D / 2 - EPS && r.z + r.d / 2 <= D / 2 + EPS)
    )
      out.push(`${label}cell ${i} leaves the box: ${JSON.stringify(r)}`);
  });
  for (let i = 0; i < rects.length; i++)
    for (let j = i + 1; j < rects.length; j++)
      if (overlaps(rects[i], rects[j])) out.push(`${label}cells ${i} and ${j} overlap`);
  return out;
}

function check(rects: Rect[], W: number, D: number) {
  expect(violations(rects, W, D)).toEqual([]);
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
      const bad: string[] = [];
      states.forEach((a, ai) =>
        states.forEach((b, bi) => {
          for (const t of [0.25, 0.5, 0.75, overshoot])
            bad.push(...violations(rectsFrom(n, lerpSizes(a, b, t), W, D, GAP), W, D, `state ${ai}->${bi} t=${t}: `));
        }),
      );
      // States: 0 is rest, i + 1 is project i focused. Show the first few, not thousands.
      expect(bad.slice(0, 10), `${bad.length} violations`).toEqual([]);
    });
  }
});
}
