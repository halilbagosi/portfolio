/** Damped spring. `damping` is a ratio: 1 = critically damped, <1 rings. */
export class Spring {
  value: number;
  target: number;
  velocity = 0;

  constructor(
    value = 0,
    private stiffness = 120,
    private damping = 1,
  ) {
    this.value = value;
    this.target = value;
  }

  step(dt: number): number {
    // Sub-step so large frame gaps stay stable.
    const n = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / n;
    const c = 2 * this.damping * Math.sqrt(this.stiffness);
    for (let i = 0; i < n; i++) {
      const a = this.stiffness * (this.target - this.value) - c * this.velocity;
      this.velocity += a * h;
      this.value += this.velocity * h;
    }
    return this.value;
  }

  snap(v: number) {
    this.value = this.target = v;
    this.velocity = 0;
  }
}
