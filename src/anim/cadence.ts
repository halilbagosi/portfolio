/** Frames looked at together when learning the display's interval: a median of this many ignores jitter. */
const WINDOW = 5;

/**
 * Tells when frames keep missing the display's own cadence (so resolution should step down).
 * Slow means missing the display's interval, not merely under 60 fps: a phone capped at 30 Hz
 * (Low Power Mode) is keeping up. The interval is learned as the shortest *median* of recent
 * frames: callback timing jitters by several ms even at a locked 60 Hz, and a single early
 * frame taken as the interval would make every normal frame look late.
 */
export class Cadence {
  private age = 0;
  private slow = 0;
  /** The display's frame interval (seconds): 1/30 in Low Power Mode, 1/60 or 1/120 otherwise. */
  private base = 1;
  private recent: number[] = [];

  /** One frame's raw interval (seconds). True when resolution should step down now. */
  push(dt: number): boolean {
    this.age += dt;
    this.recent.push(dt);
    if (this.recent.length > WINDOW) this.recent.shift();
    if (this.recent.length === WINDOW) {
      const median = [...this.recent].sort((a, b) => a - b)[WINDOW >> 1];
      if (median > 0.004) this.base = Math.min(this.base, median);
    }
    // The first seconds are ignored: texture uploads, shader compiles and the lid's normal map make
    // startup frames long on any device, and must not cost the whole session its sharpness.
    if (this.age < 4) return false;
    if (dt > this.base * 1.5 && dt < 0.25) this.slow += dt;
    else this.slow = Math.max(0, this.slow - dt * 0.5);
    if (this.slow <= 1.5) return false;
    this.slow = 0;
    return true;
  }
}
