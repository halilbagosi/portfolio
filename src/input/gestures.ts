/**
 * What a press, drag, scroll or swipe on the scene means. One place decides, so a drag that turns
 * the box is never also a click, and trackpad momentum never fires a scroll twice.
 */

/** Wheel deltas add up within one gesture; past 70px it counts as one scroll. */
export class WheelSum {
  private sum = 0;
  private at = -Infinity;

  push(deltaY: number, deltaMode: number, now: number): 1 | -1 | 0 {
    if (now - this.at > 250) this.sum = 0;
    this.at = now;
    this.sum += deltaY * (deltaMode === 1 ? 16 : 1);
    if (Math.abs(this.sum) <= 70) return 0;
    const dir = this.sum > 0 ? 1 : -1;
    this.sum = 0;
    return dir;
  }

  reset() {
    this.sum = 0;
  }
}

/** A deliberate, mostly vertical flick: 1 = swipe up (like scrolling down), -1 = swipe down, 0 = not one. */
export function swipeDir(dx: number, dy: number, ms: number): 1 | -1 | 0 {
  if (Math.abs(dy) < 60 || Math.abs(dy) < Math.abs(dx) * 1.5 || ms > 700) return 0;
  return dy < 0 ? 1 : -1;
}

/** Pixels a press may wander and still be a tap. */
export const DRAG_SLOP = 6;

export interface GestureHandlers {
  /** A click or tap that was not a drag (the Pointer already holds its position). */
  tap(): void;
  /** The press moved past the slop: start turning the box. False refuses (nothing to turn now). */
  dragStart(x: number, y: number): boolean;
  dragMove(x: number, y: number): void;
  dragEnd(): void;
  /** One scroll or swipe step: 1 = scroll down / swipe up, -1 = scroll up / swipe down. */
  vertical(dir: 1 | -1, source: 'wheel' | 'swipe'): void;
  /** False while something else (the photo viewer) owns the input. */
  enabled(): boolean;
}

export class Gestures {
  dragging = false;
  private wheel = new WheelSum();
  private rest = 0;
  private down: { id: number; x: number; y: number; t: number; touch: boolean; refused: boolean } | null = null;
  private swallowClick = false;

  constructor(
    private el: HTMLElement,
    private h: GestureHandlers,
  ) {
    el.addEventListener('wheel', (e) => this.onWheel(e), { passive: true });
    el.addEventListener('pointerdown', (e) => this.onDown(e));
    el.addEventListener('pointermove', (e) => this.onMove(e));
    el.addEventListener('pointerup', (e) => this.onUp(e, false));
    el.addEventListener('pointercancel', (e) => this.onUp(e, true));
    el.addEventListener('click', () => this.onClick());
  }

  /** Scrolls and swipes rest briefly after firing, so trackpad momentum doesn't fire them again. */
  private fire(dir: 1 | -1, source: 'wheel' | 'swipe') {
    const now = performance.now();
    if (now < this.rest) return;
    this.rest = now + 700;
    this.wheel.reset();
    this.h.vertical(dir, source);
  }

  private onWheel(e: WheelEvent) {
    if (!this.h.enabled() || this.dragging) return;
    const dir = this.wheel.push(e.deltaY, e.deltaMode, performance.now());
    if (dir) this.fire(dir, 'wheel');
  }

  private onDown(e: PointerEvent) {
    // A new press: a click swallowed after a touch drag (which never sends one) can't eat this one.
    this.swallowClick = false;
    if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0) || !this.h.enabled()) return;
    this.down = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), touch: e.pointerType !== 'mouse', refused: false };
  }

  private onMove(e: PointerEvent) {
    const d = this.down;
    if (!d || e.pointerId !== d.id || d.refused) return;
    if (!this.dragging) {
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < DRAG_SLOP) return;
      if (!this.h.dragStart(d.x, d.y)) {
        d.refused = true; // still a swipe candidate, and a mouse release still clicks
        return;
      }
      this.dragging = true;
      this.el.setPointerCapture(e.pointerId);
    }
    this.h.dragMove(e.clientX, e.clientY);
  }

  private onUp(e: PointerEvent, cancelled: boolean) {
    const d = this.down;
    if (!d || e.pointerId !== d.id) return;
    this.down = null;
    if (this.dragging) {
      this.dragging = false;
      this.swallowClick = true;
      this.h.dragEnd();
    }
    if (!cancelled && d.touch && this.h.enabled()) {
      const dir = swipeDir(e.clientX - d.x, e.clientY - d.y, performance.now() - d.t);
      if (dir) this.fire(dir, 'swipe');
    }
  }

  private onClick() {
    if (this.swallowClick) {
      this.swallowClick = false;
      return;
    }
    this.h.tap();
  }
}
