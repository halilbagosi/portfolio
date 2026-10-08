import { describe, expect, it } from 'vitest';
import { Cadence } from './cadence';

/** Feeds `seconds` of frames from `next` (frame interval in seconds); returns how many step-downs were asked for. */
function run(c: Cadence, seconds: number, next: (i: number) => number) {
  let t = 0;
  let steps = 0;
  for (let i = 0; t < seconds; i++) {
    const dt = next(i);
    t += dt;
    if (c.push(dt)) steps++;
  }
  return steps;
}

describe('Cadence', () => {
  it('keeps a steady 60 Hz display sharp', () => {
    expect(run(new Cadence(), 30, () => 1 / 60)).toBe(0);
  });

  it('keeps 60 Hz sharp when callback timing jitters (short/long pairs, as measured on a phone)', () => {
    // Every 40th frame lands 12 ms early and the next one 12 ms late: still 60 fps, nothing missed.
    const jitter = (i: number) => (i % 40 === 0 ? 1 / 60 - 0.012 : i % 40 === 1 ? 1 / 60 + 0.012 : 1 / 60);
    expect(run(new Cadence(), 30, jitter)).toBe(0);
  });

  it('keeps a 30 Hz display (Low Power Mode) sharp', () => {
    expect(run(new Cadence(), 30, () => 1 / 30)).toBe(0);
  });

  it('steps down when a 60 Hz display only gets 35 fps', () => {
    const c = new Cadence();
    run(c, 2, () => 1 / 60); // learn the display
    expect(run(c, 10, () => 1 / 35)).toBeGreaterThan(0);
  });

  it('steps down when a struggling 60 Hz device misses every other frame', () => {
    expect(run(new Cadence(), 15, (i) => (i % 2 ? 1 / 30 : 1 / 60))).toBeGreaterThan(0);
  });

  it('ignores the first seconds (shader compiles and uploads)', () => {
    expect(run(new Cadence(), 3.5, () => 1 / 20)).toBe(0);
  });
});
