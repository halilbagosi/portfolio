export type Pt = [number, number];
/** Four corners, clockwise from top-left. */
export type Quad = [Pt, Pt, Pt, Pt];

export const rectQuad = (x: number, y: number, w: number, h: number): Quad => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];

export function lerpQuad(a: Quad, b: Quad, t: number): Quad {
  return a.map((p, i) => [p[0] + (b[i][0] - p[0]) * t, p[1] + (b[i][1] - p[1]) * t]) as Quad;
}

/** Row-major 3x3 projective map taking the corners of `src` onto those of `dst`. */
export function homography(src: Quad, dst: Quad): number[] {
  // Eight unknowns (the ninth is 1): two equations per corner.
  const m: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i];
    const [u, v] = dst[i];
    m.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    m.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  for (let c = 0; c < 8; c++) {
    let p = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r;
    [m[c], m[p]] = [m[p], m[c]];
    const d = m[c][c] || 1e-12;
    for (let k = c; k < 9; k++) m[c][k] /= d;
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const f = m[r][c];
      if (f) for (let k = c; k < 9; k++) m[r][k] -= f * m[c][k];
    }
  }
  return [...m.map((r) => r[8]), 1];
}

/** The homography as a CSS transform (applied about the element's transform-origin). */
export function matrix3d(h: number[]): string {
  const [a, b, c, d, e, f, g, i] = h;
  return `matrix3d(${a},${d},0,${g},${b},${e},0,${i},0,0,1,0,${c},${f},0,1)`;
}

/** CSS cubic-bezier(x1, y1, x2, y2) as a function of progress, for driving a transition by hand. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
  const at = (t: number, a: number, b: number) => 3 * a * (1 - t) * (1 - t) * t + 3 * b * (1 - t) * t * t + t * t * t;
  const slope = (t: number, a: number, b: number) => 3 * a * (1 - t) * (1 - t) + 6 * (b - a) * (1 - t) * t + 3 * (1 - b) * t * t;
  return (x: number) => {
    if (x <= 0 || x >= 1) return Math.min(1, Math.max(0, x));
    let t = x;
    for (let k = 0; k < 8; k++) {
      const err = at(t, x1, x2) - x;
      const s = slope(t, x1, x2);
      if (Math.abs(err) < 1e-6 || Math.abs(s) < 1e-6) break;
      t -= err / s;
    }
    return at(Math.min(1, Math.max(0, t)), y1, y2);
  };
}
