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

  it('ignores trackpad momentum after firing, however long it streams', () => {
    const w = new WheelSum();
    let fired = 0;
    // A flick: a quick push, then ~1.5s of decaying momentum, events 16ms apart.
    let t = 0;
    for (let d = 60; d > 0.5; d *= 0.95, t += 16) fired += Math.abs(w.push(d, 0, t));
    expect(fired).toBe(1);
  });

  it('takes a fresh push during momentum as the next scroll', () => {
    const w = new WheelSum();
    let t = 0;
    let fired = 0;
    for (let i = 0; i < 30; i++, t += 16) fired += Math.abs(w.push(60 * 0.92 ** i, 0, t));
    for (let i = 0; i < 4; i++, t += 16) fired += Math.abs(w.push(50, 0, t));
    expect(fired).toBe(2);
  });

  it('steps again for a mouse wheel that keeps turning, and after a pause', () => {
    const w = new WheelSum();
    let fired = 0;
    for (let t = 0; t <= 800; t += 50) fired += Math.abs(w.push(100, 0, t));
    expect(fired).toBe(2);
    expect(w.push(100, 0, 1200)).toBe(1);
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
