/**
 * Device tilt as a pointer substitute on touch devices: x/y in -1..1, like the pointer's NDC.
 * Neutral is however the phone is being held: a slowly adapting baseline follows the posture,
 * so a deliberate tilt reads as movement and then eases back to centre. iOS needs a permission
 * tap first (`enable` from a user gesture); elsewhere it starts on its own. Sensor events are
 * noisy and arrive unsynced with frames, so `update` smooths them.
 */
export class Motion {
  x = 0;
  y = 0;
  active = false;
  private asked = false;
  private listening = false;
  private rawX = 0;
  private rawY = 0;
  private baseX = NaN;
  private baseY = NaN;

  constructor() {
    const D = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: unknown } }).DeviceOrientationEvent;
    if (D && typeof D.requestPermission !== 'function') this.listen();
  }

  /** iOS: motion is only granted from a tap, and hasn't been asked for yet. */
  get needsPermission() {
    const D = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: unknown } }).DeviceOrientationEvent;
    return !!D && typeof D.requestPermission === 'function' && !this.asked;
  }

  async enable() {
    if (this.asked || this.listening || !('DeviceOrientationEvent' in window)) return;
    this.asked = true;
    const D = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
    if (typeof D.requestPermission !== 'function') return this.listen();
    try {
      if ((await D.requestPermission()) === 'granted') this.listen();
    } catch {
      /* ignore: the idle drift covers it */
    }
  }

  private listen() {
    if (this.listening) return;
    this.listening = true;
    window.addEventListener('deviceorientation', (e) => {
      if (e.gamma == null || e.beta == null) return;
      // Map device axes to screen axes for the current rotation.
      const angle = screen.orientation?.angle ?? 0;
      let sx = e.gamma;
      let sy = e.beta;
      if (angle === 90) [sx, sy] = [e.beta, -e.gamma];
      else if (angle === 270 || angle === -90) [sx, sy] = [-e.beta, e.gamma];
      else if (angle === 180) [sx, sy] = [-e.gamma, -e.beta];
      if (Number.isNaN(this.baseX)) {
        this.baseX = sx;
        this.baseY = sy;
      }
      this.rawX = sx;
      this.rawY = sy;
      this.active = true;
    });
  }

  /** Smooths toward the latest reading; the baseline drifts to the held posture over a few seconds. */
  update(dt: number) {
    if (!this.active) return;
    const b = 1 - Math.exp(-dt / 2.5);
    this.baseX += (this.rawX - this.baseX) * b;
    this.baseY += (this.rawY - this.baseY) * b;
    const tx = Math.max(-1, Math.min(1, (this.rawX - this.baseX) / 18));
    const ty = Math.max(-1, Math.min(1, (this.rawY - this.baseY) / 18));
    const k = 1 - Math.exp(-dt * 7);
    this.x += (tx - this.x) * k;
    this.y += (ty - this.y) * k;
  }
}
