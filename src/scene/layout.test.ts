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

describe('section sizes from the dashboard', () => {
  const W = 6;
  const D = 3.9;
  const gap = 0.14;
  it('gives the lead column the share asked for', () => {
    const s = restSizes(4, W, D, gap, 0.6);
    expect(s.cols[0] / (W - gap)).toBeCloseTo(0.6);
  });
  it('gives an open section the share of width and depth asked for', () => {
    const s = focusSizes(4, 2, W, D, gap, undefined, undefined, undefined, { w: 0.7, d: 0.6 });
    expect(s.cols[1] / (W - gap)).toBeCloseTo(0.7);
    expect(s.rows[1][1] / (D - 2 * gap)).toBeCloseTo(0.6);
    const r = rectsFrom(4, s, W, D, gap);
    expect(r[2].w).toBeCloseTo(s.cols[1]);
  });
  it('sizes the featured section on its own, centred front to back', () => {
    const share = { w: 0.7, d: 0.6, featured: { w: 0.8, d: 0.5 } };
    const r = rectsFrom(4, focusSizes(4, 0, W, D, gap, undefined, undefined, undefined, share), W, D, gap);
    expect(r[0].w / (W - gap)).toBeCloseTo(0.8);
    expect(r[0].d / D).toBeCloseTo(0.5);
    expect(r[0].z).toBeCloseTo(0);
    // Another section still opens by the general shares.
    const o = rectsFrom(4, focusSizes(4, 2, W, D, gap, undefined, undefined, undefined, share), W, D, gap);
    expect(o[2].w / (W - gap)).toBeCloseTo(0.7);
    expect(o[0].d).toBeCloseTo(D);
  });

  it('has no featured section in a tall box', () => {
    const share = { w: 0.7, d: 0.6, featured: { w: 0.8, d: 0.5 } };
    const s = focusSizes(4, 0, 3.9, 7, gap, undefined, undefined, undefined, share);
    expect(s.rows[0][0] / (7 - 3 * gap)).toBeCloseTo(0.6);
  });
});

