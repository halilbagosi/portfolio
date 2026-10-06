import { describe, expect, it } from 'vitest';
import { sizeWarning, targetSize } from './photos';

describe('targetSize', () => {
  it('fits desktop shots within 2400px', () => {
    expect(targetSize(3000, 2000)).toEqual({ w: 2400, h: 1600, phone: false });
  });

  it('never upscales', () => {
    expect(targetSize(1000, 600)).toEqual({ w: 1000, h: 600, phone: false });
    expect(targetSize(1179, 2556)).toEqual({ w: 1179, h: 2556, phone: true });
  });

  it('fits phone shots to 1290px wide', () => {
    expect(targetSize(1500, 3000)).toEqual({ w: 1290, h: 2580, phone: true });
  });
});

describe('sizeWarning', () => {
  it('warns about small phone shots', () => {
    expect(sizeWarning(506, 1100)).toMatch(/soft on phones/);
  });

  it('warns about small desktop shots', () => {
    expect(sizeWarning(1000, 700)).toMatch(/soft on phones/);
  });

  it('is quiet for large enough photos', () => {
    expect(sizeWarning(1179, 2556)).toBeNull();
    expect(sizeWarning(1400, 875)).toBeNull();
  });
});
