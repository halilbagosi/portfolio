import { describe, expect, it } from 'vitest';
import { cubicBezier, homography, lerpQuad, rectQuad, type Quad } from './quad';

const apply = (h: number[], x: number, y: number) => {
  const w = h[6] * x + h[7] * y + h[8];
  return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w];
};

describe('homography', () => {
  it('maps each source corner onto its destination, perspective included', () => {
    const src = rectQuad(-50, -80, 100, 160);
    const dst: Quad = [[10, 20], [210, 35], [190, 300], [30, 280]];
    const h = homography(src, dst);
    src.forEach((p, i) => {
      const [u, v] = apply(h, p[0], p[1]);
      expect(u).toBeCloseTo(dst[i][0], 5);
      expect(v).toBeCloseTo(dst[i][1], 5);
    });
  });

  it('is a plain scale and move between rects', () => {
    const h = homography(rectQuad(0, 0, 10, 10), rectQuad(5, 5, 20, 40));
    expect(apply(h, 5, 5)).toEqual([15, 25].map((v) => expect.closeTo(v, 5)));
  });
});

describe('lerpQuad / cubicBezier', () => {
  it('blends corner by corner', () => {
    expect(lerpQuad(rectQuad(0, 0, 10, 10), rectQuad(10, 10, 10, 10), 0.5)[0]).toEqual([5, 5]);
  });
  it('runs 0 to 1 and eases out', () => {
    const e = cubicBezier(0.32, 0.72, 0, 1);
    expect(e(0)).toBe(0);
    expect(e(1)).toBe(1);
    expect(e(0.5)).toBeGreaterThan(0.8);
  });
});
