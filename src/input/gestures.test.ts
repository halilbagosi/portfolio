import { describe, expect, it } from 'vitest';
import { FLICK_MS, swipeDir, WheelSum } from './gestures';

describe('WheelSum', () => {
  it('fires once the deltas of one gesture add past 70px', () => {
    const w = new WheelSum();
    expect(w.push(40, 0, 0)).toBe(0);
    expect(w.push(40, 0, 50)).toBe(1);
    expect(w.push(40, 0, 60)).toBe(0); // starts over after firing
  });

  it('forgets deltas after a 250ms pause', () => {
    const w = new WheelSum();
    w.push(60, 0, 0);
    expect(w.push(20, 0, 400)).toBe(0);
  });

  it('counts line-mode deltas as 16px lines, both ways', () => {
    const w = new WheelSum();
    expect(w.push(-5, 1, 0)).toBe(-1);
  });
});

describe('swipeDir', () => {
  it('reads a quick vertical flick', () => {
    expect(swipeDir(0, -120, 200)).toBe(1); // finger up: like scrolling down
    expect(swipeDir(10, 120, 200)).toBe(-1);
  });

  it('ignores short, slow or sideways moves', () => {
    expect(swipeDir(0, -40, 200)).toBe(0);
    expect(swipeDir(0, -120, 900)).toBe(0);
    expect(swipeDir(100, -120, 200)).toBe(0);
  });

  it('takes a shorter window when asked (a drag that turned the box must be a quick flick)', () => {
    expect(swipeDir(0, -120, 500)).toBe(1);
    expect(swipeDir(0, -120, 500, FLICK_MS)).toBe(0);
    expect(swipeDir(0, -120, 200, FLICK_MS)).toBe(1);
  });
});
