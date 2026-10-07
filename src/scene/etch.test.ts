import { describe, expect, it } from 'vitest';
import { EtchSchedule, JUMP, TRAVEL, type Ink } from './etch';

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
    let max = 0;
    for (const v of r.data) max = Math.max(max, v);
    expect(max).toBeLessThanOrEqual(make().total);
  });

  it('rests at the start of the route before it begins (the start delay feeds negative times)', () => {
    const s = make();
    const first = s.rows[0];
    for (const t of [-0.5, -1e-6]) {
      const p = s.spotAt(t);
      expect(p.x).toBe(first.x0);
      expect(p.y).toBe(first.y);
      expect(p.firing).toBe(false);
    }
  });

  it('holds the final position, not firing, from the end on', () => {
    const s = make();
    const last = s.rows[s.rows.length - 1];
    const p = s.spotAt(s.total + 5);
    expect(p).toEqual({ x: last.dir > 0 ? last.x1 : last.x0, y: last.y, firing: false });
    expect(s.spotAt(s.total).firing).toBe(false);
  });

  it('travels between lines instead of jumping, dark all the way', () => {
    const s = make();
    const i = s.rows.findIndex((r, k) => k + 1 < s.rows.length && s.rows[k + 1].t0 - r.t1 > 1e-9);
    const a = s.rows[i];
    const b = s.rows[i + 1];
    const from = { x: a.dir > 0 ? a.x1 : a.x0, y: a.y };
    const to = { x: b.dir > 0 ? b.x0 : b.x1, y: b.y };
    for (const f of [0.25, 0.5, 0.75]) {
      const p = s.spotAt(a.t1 + f * (b.t0 - a.t1));
      expect(p.firing).toBe(false);
      expect(p.x).toBeCloseTo(from.x + f * (to.x - from.x), 6);
      expect(p.y).toBeCloseTo(from.y + f * (to.y - from.y), 6);
    }
  });

  it('refuses a pitch that is not a positive number', () => {
    for (const pitch of [0, -2, NaN]) expect(() => new EtchSchedule(ink(), lines, pitch)).toThrow();
  });

  it('gives a line with no ink only its jumps, and never a zero-length ink row', () => {
    const blank = new EtchSchedule(ink(), [{ x0: 0, y0: 0, x1: 100, y1: 8, duration: 1 }], 2);
    expect(blank.rows.every((r) => !r.ink)).toBe(true);
    expect(blank.total).toBeCloseTo(blank.rows.length * JUMP, 9);
    // A budget smaller than the empty rows' jumps must not squeeze the ink rows to nothing.
    const tight = new EtchSchedule(ink(), [{ x0: 15, y0: 8, x1: 85, y1: 22, duration: 0.01 }], 2);
    const inked = tight.rows.filter((r) => r.ink);
    expect(inked.length).toBeGreaterThan(0);
    for (const r of inked) expect(r.t1).toBeGreaterThan(r.t0);
  });

  it('puts every reveal texel outside the lines at 0', () => {
    const scale = 4;
    const r = make().revealTimes(scale);
    const inside = (x: number, y: number) => lines.some((l) => x >= l.x0 && x <= l.x1 && y >= l.y0 && y <= l.y1);
    let outside = 0;
    for (let j = 0; j < r.height; j++)
      for (let i = 0; i < r.width; i++) {
        if (inside((i + 0.5) * scale, (j + 0.5) * scale)) continue;
        outside++;
        expect(r.data[j * r.width + i]).toBe(0);
      }
    expect(outside).toBeGreaterThan(0);
  });

  it('puts the spot over a pixel at the moment that pixel is timed', () => {
    const s = make();
    for (const [x, y] of [[50, 15], [25, 12], [75, 18], [40, 30]]) {
      const p = s.spotAt(s.timeAt(x, y));
      expect(Math.abs(p.x - x)).toBeLessThan(1);
      expect(Math.abs(p.y - y)).toBeLessThanOrEqual(2);
    }
  });
});
