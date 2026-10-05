export interface Rect {
  /** Centre on the box floor plane (x right, z towards the viewer). */
  x: number;
  z: number;
  w: number;
  d: number;
}

/**
 * The bento is a grid of columns, each a stack of rows. Project 0 gets its own (lead)
 * column; the rest fill columns of up to three on the right. Animating column widths and
 * row heights (instead of each rect on its own) keeps every in-between frame a valid,
 * non-overlapping layout, and keeps each project in its place.
 */
export interface Sizes {
  cols: number[];
  rows: number[][];
}

/** Project indices per column. A tall box (portrait) is one column: every project gets a row. */
export function structure(n: number, tall = false): number[][] {
  if (n <= 0) return [];
  if (n === 1) return [[0]];
  if (tall) return [Array.from({ length: n }, (_, i) => i)];
  const rest = n - 1;
  const ncols = Math.ceil(rest / 3);
  const base = Math.floor(rest / ncols);
  const extra = rest % ncols;
  const cols: number[][] = [[0]];
  let next = 1;
  for (let c = 0; c < ncols; c++) {
    const k = base + (c < extra ? 1 : 0);
    cols.push(Array.from({ length: k }, () => next++));
  }
  return cols;
}

const split = (total: number, gap: number, k: number) => (total - gap * (k - 1)) / k;

/** Resting sizes: lead column ~46% wide, the others share the rest; rows split evenly (one column: just rows). */
export function restSizes(n: number, W: number, D: number, gap: number): Sizes {
  const s = structure(n, D > W);
  if (s.length === 1) return { cols: [W], rows: [s[0].map(() => split(D, gap, s[0].length))] };
  const usable = W - gap * (s.length - 1);
  const lead = usable * (n === 2 ? 0.5 : 0.46);
  const other = (usable - lead) / (s.length - 1);
  return {
    cols: s.map((_, c) => (c === 0 ? lead : other)),
    rows: s.map((col) => col.map(() => split(D, gap, col.length))),
  };
}

/** Focused sizes: the project's column and row take nearly everything; the rest become slim strips. */
export function focusSizes(n: number, index: number, W: number, D: number, gap: number, strip = 0.5): Sizes {
  const s = structure(n, D > W);
  if (n <= 1) return restSizes(n, W, D, gap);
  const fc = s.findIndex((col) => col.includes(index));
  const usable = W - gap * (s.length - 1);
  return {
    cols: s.map((_, c) => (c === fc ? usable - strip * (s.length - 1) : strip)),
    rows: s.map((col, c) => {
      if (c !== fc) return col.map(() => split(D, gap, col.length));
      const usableD = D - gap * (col.length - 1);
      // A long single column (portrait, many projects) shares at most 45% among its strips.
      const st = Math.min(strip, (usableD * 0.45) / Math.max(1, col.length - 1));
      return col.map((p) => (p === index ? usableD - st * (col.length - 1) : st));
    }),
  };
}

/** Lays out rects (indexed by project) from column widths and row heights. */
export function rectsFrom(n: number, sizes: Sizes, W: number, D: number, gap: number): Rect[] {
  const s = structure(n, D > W);
  const out: Rect[] = new Array(n);
  let x = -W / 2;
  s.forEach((col, c) => {
    const w = sizes.cols[c];
    let z = -D / 2;
    col.forEach((p, r) => {
      const d = sizes.rows[c][r];
      out[p] = { x: x + w / 2, z: z + d / 2, w, d };
      z += d + gap;
    });
    x += w + gap;
  });
  return out;
}

export const lerpSizes = (a: Sizes, b: Sizes, t: number): Sizes => ({
  cols: a.cols.map((v, i) => v + (b.cols[i] - v) * t),
  rows: a.rows.map((col, c) => col.map((v, r) => v + (b.rows[c][r] - v) * t)),
});

export const packLayout = (n: number, W: number, D: number, gap: number) => rectsFrom(n, restSizes(n, W, D, gap), W, D, gap);
export const expandedLayout = (n: number, i: number, W: number, D: number, gap: number) =>
  rectsFrom(n, focusSizes(n, i, W, D, gap), W, D, gap);
