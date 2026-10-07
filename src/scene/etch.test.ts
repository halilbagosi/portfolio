import { describe, expect, it } from 'vitest';
import { EtchSchedule, TRAVEL, type Ink } from './etch';

/** 100×40 grey map (1 value per pixel): ink in two rectangles, like two engraved lines. */
function ink(): Ink {
  const width = 100;
  const height = 40;
  const data = new Uint8Array(width * height);
  const fill = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) data[y * width + x] = 200;
  };
  fill(20, 10, 80, 20); // "name"
  fill(30, 28, 60, 32); // "role"
  return { data, width, height, stride: 1 };
}
const lines = [
  { x0: 15, y0: 8, x1: 85, y1: 22, duration: 1 },
  { x0: 25, y0: 26, x1: 65, y1: 34, duration: 0.5 },
];
const make = () => new EtchSchedule(ink(), lines, 2);

describe('EtchSchedule', () => {
  it('spends each line’s budget, plus the travel between lines', () => {
    expect(make().total).toBeCloseTo(1 + TRAVEL + 0.5, 9);
  });

  it('hatches back and forth, row after row, in time order', () => {
    const { rows } = make();
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].t0).toBeGreaterThanOrEqual(rows[i - 1].t1 - 1e-12);
      if (rows[i].y > rows[i - 1].y && rows[i].x0 === rows[i - 1].x0) expect(rows[i].dir).toBe(-rows[i - 1].dir as 1 | -1);
    }
  });

  it('visits every row that has ink', () => {
    const s = make();
    for (let y = 10; y < 20; y++) expect(s.rows.some((r) => r.ink && Math.abs(r.y - y) <= 1)).toBe(true);
  });

  it('times along each row run in the direction of travel', () => {
    const s = make();
    for (const r of s.rows) {
      const a = s.timeAt(r.dir > 0 ? r.x0 + 1 : r.x1 - 1, r.y);
      const b = s.timeAt(r.dir > 0 ? r.x1 - 1 : r.x0 + 1, r.y);
      expect(b).toBeGreaterThanOrEqual(a);
      expect(a).toBeGreaterThanOrEqual(r.t0 - 1e-9);
      expect(b).toBeLessThanOrEqual(r.t1 + 1e-9);
    }
  });

  it('is zero outside every line (nothing to cut there)', () => {
    expect(make().timeAt(5, 2)).toBe(0);
  });

  it('fires over ink only, and stops at the end', () => {
    const s = make();
    const row = s.rows.find((r) => r.ink && r.y > 10 && r.y < 20)!;
    const mid = (row.t0 + row.t1) / 2; // halfway along: x = 50, inside the ink
    expect(s.spotAt(mid).firing).toBe(true);
    const early = row.t0 + (row.t1 - row.t0) * 0.02; // x ≈ 16 or 84: outside the ink
    expect(s.spotAt(early).firing).toBe(false);
    expect(s.spotAt(s.total + 1).firing).toBe(false);
  });

  it('samples reveal times on a coarser grid', () => {
    const r = make().revealTimes(4);
    expect(r.width).toBe(25);
    expect(r.height).toBe(10);
    expect(Math.max(...r.data)).toBeLessThanOrEqual(make().total);
  });
});
