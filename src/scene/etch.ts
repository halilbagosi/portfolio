/**
 * The laser's route over the lid's engraving map, like a galvo fiber laser filling text: line by
 * line (name, role, socials), a back-and-forth raster hatch over each line's ink. Rows without ink
 * are jumped quickly. Pure (pixels and seconds), so it is tested without a GPU.
 */

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface EtchLine extends Box {
  /** Seconds to spend on this line. */
  duration: number;
}

export interface Row {
  y: number;
  x0: number;
  x1: number;
  /** 1: left to right. */
  dir: 1 | -1;
  t0: number;
  t1: number;
  ink: boolean;
}

/** A grey map: `data[(y * width + x) * stride]` is how deep to cut there (0 = not at all). */
export interface Ink {
  data: ArrayLike<number>;
  width: number;
  height: number;
  stride: number;
}

/** Seconds for a row with nothing to cut. */
export const JUMP = 0.012;
/** Seconds to move on to the next line. */
export const TRAVEL = 0.15;
/** Shortest time an ink row may take, so a tight budget never squeezes it to nothing. */
const MIN_INK_ROW = 0.002;
const INK = 40;

/**
 * Contract: line boxes are assumed disjoint (`timeAt` takes the first line that contains a point).
 * A line with no ink takes `rows × JUMP` rather than its `duration`: there is nothing to spend it on.
 */
export class EtchSchedule {
  readonly rows: Row[] = [];
  readonly total: number;
  private spans: { box: Box; first: number; count: number }[] = [];

  constructor(
    private ink: Ink,
    lines: EtchLine[],
    private pitch: number,
  ) {
    if (!(pitch > 0)) throw new Error(`EtchSchedule: pitch must be a positive number, got ${pitch}`); // also catches NaN
    let t = 0;
    lines.forEach((line, li) => {
      if (li > 0) t += TRAVEL;
      const ys: number[] = [];
      for (let y = line.y0 + pitch / 2; y < line.y1; y += pitch) ys.push(y);
      const inked = ys.map((y) => this.rowHasInk(line, y));
      const n = inked.filter(Boolean).length;
      const rowT = n ? Math.max(MIN_INK_ROW, (line.duration - (ys.length - n) * JUMP) / n) : 0;
      this.spans.push({ box: line, first: this.rows.length, count: ys.length });
      ys.forEach((y, i) => {
        const dt = inked[i] ? rowT : JUMP;
        this.rows.push({ y, x0: line.x0, x1: line.x1, dir: i % 2 ? -1 : 1, t0: t, t1: t + dt, ink: inked[i] });
        t += dt;
      });
    });
    this.total = t;
  }

  /** Where the spot is at time t (map pixels), and whether it is cutting. */
  spotAt(t: number): { x: number; y: number; firing: boolean } {
    const last = this.rows[this.rows.length - 1];
    if (!last) return { x: 0, y: 0, firing: false };
    if (t >= this.total) return { ...this.end(last), firing: false };
    if (t < 0) return { ...this.start(this.rows[0]), firing: false }; // the start delay: rest where the route begins
    const i = this.rowAt(t);
    const r = this.rows[i];
    const next = this.rows[i + 1];
    if (t > r.t1 && next) {
      // Travelling to the next line: slide from this row's end to the next row's start, dark.
      const f = (t - r.t1) / (next.t0 - r.t1 || 1);
      const a = this.end(r);
      const b = this.start(next);
      return { x: a.x + f * (b.x - a.x), y: a.y + f * (b.y - a.y), firing: false };
    }
    const f = (t - r.t0) / (r.t1 - r.t0 || 1);
    const x = r.dir > 0 ? r.x0 + f * (r.x1 - r.x0) : r.x1 - f * (r.x1 - r.x0);
    return { x, y: r.y, firing: r.ink && this.near(x, r.y) };
  }

  /** The moment the spot passes over pixel (x, y); 0 outside every line (nothing is cut there). */
  timeAt(x: number, y: number): number {
    for (const s of this.spans) {
      const b = s.box;
      if (x < b.x0 || x > b.x1 || y < b.y0 || y > b.y1 || !s.count) continue;
      const i = Math.min(s.count - 1, Math.max(0, Math.floor((y - b.y0) / this.pitch)));
      const r = this.rows[s.first + i];
      const f = Math.min(1, Math.max(0, (x - r.x0) / (r.x1 - r.x0 || 1)));
      return r.t0 + (r.dir > 0 ? f : 1 - f) * (r.t1 - r.t0);
    }
    return 0;
  }

  /** Reveal times on a grid `scale` times coarser than the map, rows top-down like the canvas. */
  revealTimes(scale: number) {
    const width = Math.ceil(this.ink.width / scale);
    const height = Math.ceil(this.ink.height / scale);
    const data = new Float32Array(width * height);
    for (let j = 0; j < height; j++)
      for (let i = 0; i < width; i++) data[j * width + i] = this.timeAt((i + 0.5) * scale, (j + 0.5) * scale);
    return { data, width, height };
  }

  private start(r: Row) {
    return { x: r.dir > 0 ? r.x0 : r.x1, y: r.y };
  }

  private end(r: Row) {
    return { x: r.dir > 0 ? r.x1 : r.x0, y: r.y };
  }

  /** Index of the row being cut at t: the last one started by then. */
  private rowAt(t: number) {
    let lo = 0;
    let hi = this.rows.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.rows[mid].t0 <= t) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  private at(x: number, y: number) {
    const { data, width, height, stride } = this.ink;
    const xi = Math.min(width - 1, Math.max(0, Math.round(x)));
    const yi = Math.min(height - 1, Math.max(0, Math.round(y)));
    return data[(yi * width + xi) * stride];
  }

  private rowHasInk(b: Box, y: number) {
    for (let yy = Math.floor(y - this.pitch / 2); yy < y + this.pitch / 2; yy++)
      for (let x = Math.floor(b.x0); x <= b.x1; x++) if (this.at(x, yy) > INK) return true;
    return false;
  }

  /** Ink within 2px of a point (the spot is a little wider than one pixel). */
  private near(x: number, y: number) {
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (this.at(x + dx, y + dy) > INK) return true;
    return false;
  }
}
