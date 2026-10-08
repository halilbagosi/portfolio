import { cubicBezier, homography, lerpQuad, matrix3d, rectQuad, type Quad } from './anim/quad';
import { WheelSum } from './input/gestures';

interface OpenOptions {
  title: string;
  urls: string[];
  index: number;
  /** Where the card is on screen, as its projected corners; the image grows out of and returns to it. Read every frame of the flight. */
  from: () => Quad;
  onClose: (index: number) => void;
  /** The image has landed back on the card and the viewer is gone. */
  onReturned?: () => void;
}

/** Corner radius as a fraction of the card's width (phone screenshots) or shorter side (others). */
export const CARD_RADIUS = { phone: 0.11, other: 0.035 };

/** Flight out of the card. */
const OPEN_MS = 500;
/** Return flight. Exits run a little faster than entrances. */
const CLOSE_MS = 440;
/** The last of the return, in which the card (already back underneath) takes over as the image fades off it. */
const HANDOFF_MS = 180;
/** The viewer's ease-drawer curve, so a flight driven here matches the CSS transitions around it. */
const drawer = cubicBezier(0.32, 0.72, 0, 1);
/** A slide to the next screenshot from rest (a released drag goes at the finger's speed instead). */
const SLIDE_MS = 440;
/** A drag let go short of the threshold springs back. */
const SNAP_MS = 320;
/** How far a press may wander and still be a tap; past it the drag picks its axis. */
const SLOP = 8;

const icon = (d: string) =>
  `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;

interface Drag {
  id: number;
  x: number;
  y: number;
  axis: 'x' | 'y' | null;
  dx: number;
  dy: number;
  vx: number;
  vy: number;
  t: number;
  /** Direction of the neighbour peeking in beside the image (1 = next, -1 = previous, 0 = none yet). */
  peek: number;
}

/**
 * Full-screen viewer for screenshots at their true aspect ratio. Opens from the card it was
 * clicked on and returns to it. Screenshots sit side by side like a strip of film: a drag pulls
 * the next one in under the finger, and arrows, keys and trackpad swipes slide the strip along.
 * Dragging down lets go of the image, back onto its card.
 */
export class Lightbox {
  private root: HTMLDivElement;
  private fig: HTMLElement;
  private backdrop: HTMLElement;
  private imgs: [HTMLImageElement, HTMLImageElement];
  /** Which of the two images is on show; the other waits off to the side for the next swap. */
  private cur = 0;
  private titleEl: HTMLElement;
  private dots: HTMLElement;
  private opts: OpenOptions | null = null;
  private index = 0;
  private reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private closeTimer = 0;
  private closing = false;
  /** Frame request of the flight between card and viewer, and where the image is on screen mid-flight. */
  private flight = 0;
  private quad: Quad = rectQuad(0, 0, 1, 1);
  private lift = 1;
  private slideTimer = 0;
  private settleSlide: (() => void) | null = null;
  private returned: (() => void) | undefined;
  private drag: Drag | null = null;
  private wheel = new WheelSum();

  constructor() {
    this.root = document.createElement('div');
    this.root.id = 'lightbox';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="lb-backdrop"></div>
      <figure class="lb-figure"><img class="lb-img" alt="" draggable="false" /><img class="lb-img lb-spare" alt="" draggable="false" aria-hidden="true" /></figure>
      <div class="lb-bar lb-glass">
        <button class="lb-btn lb-prev" aria-label="Previous screenshot">${icon('M14.5 6 8.5 12l6 6')}</button>
        <div class="lb-meta"><p class="lb-title"></p><div class="lb-dots" aria-hidden="true"></div></div>
        <button class="lb-btn lb-next" aria-label="Next screenshot">${icon('M9.5 6l6 6-6 6')}</button>
      </div>
      <button class="lb-btn lb-close lb-glass" aria-label="Close">${icon('M7 7l10 10M17 7 7 17')}</button>`;
    document.body.appendChild(this.root);
    this.fig = this.root.querySelector('.lb-figure')!;
    this.backdrop = this.root.querySelector('.lb-backdrop')!;
    const imgs = this.root.querySelectorAll<HTMLImageElement>('.lb-img');
    this.imgs = [imgs[0], imgs[1]];
    for (const im of this.imgs) im.addEventListener('load', () => this.size(im));
    window.addEventListener('resize', () => this.opts && this.imgs.forEach((im) => this.size(im)));
    this.titleEl = this.root.querySelector('.lb-title')!;
    this.dots = this.root.querySelector('.lb-dots')!;

    this.root.querySelector('.lb-prev')!.addEventListener('click', () => this.go(-1));
    this.root.querySelector('.lb-next')!.addEventListener('click', () => this.go(1));
    this.root.querySelector('.lb-close')!.addEventListener('click', () => this.close());
    window.addEventListener('keydown', (e) => {
      if (!this.opts) return;
      if (e.key === 'Escape') this.close();
      else if (e.key === 'ArrowRight') this.go(1);
      else if (e.key === 'ArrowLeft') this.go(-1);
    });
    // Trackpad: a sideways two-finger swipe slides one screenshot, momentum and all.
    this.root.addEventListener(
      'wheel',
      (e) => {
        if (!this.opts || Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
        e.preventDefault();
        const dir = this.wheel.push(e.deltaX, e.deltaMode, performance.now());
        if (dir) this.go(dir);
      },
      { passive: false },
    );
    this.fig.addEventListener('pointerdown', (e) => this.onDown(e));
    this.fig.addEventListener('pointermove', (e) => this.onMove(e));
    this.fig.addEventListener('pointerup', (e) => this.onUp(e, false));
    this.fig.addEventListener('pointercancel', (e) => this.onUp(e, true));
  }

  get isOpen() {
    return this.opts !== null;
  }

  private get img() {
    return this.imgs[this.cur];
  }

  private get spare() {
    return this.imgs[1 - this.cur];
  }

  open(o: OpenOptions) {
    // Reopened mid-return: drop the pending teardown and let the previous card show again.
    if (this.closing) this.finishClose();
    this.opts = o;
    this.index = o.index;
    this.root.hidden = false;
    this.root.classList.remove('closing');
    this.root.classList.toggle('single', o.urls.length < 2);
    this.dots.replaceChildren(...o.urls.map(() => document.createElement('i')));
    this.titleEl.textContent = o.title;
    this.park(this.spare);
    this.load(this.img, this.index);
    this.label();
    // Warm the rest so a swap never waits on the network or a decode.
    for (const u of o.urls) {
      const im = new Image();
      im.src = u;
      void im.decode().catch(() => {});
    }
    // Fly out of the card: the image is pinned to the card's projected corners and released to its
    // natural place, so it leaves the card exactly as the card was drawn, perspective and all.
    const start = () => {
      if (this.opts !== o) return;
      this.size(this.img);
      this.root.classList.add('open');
      if (this.reduced) return;
      const to = this.layoutQuad(this.img);
      this.fly(this.img, () => o.from(), () => to, OPEN_MS, { lift: [0, 1], done: () => this.land() });
    };
    // decode() waits for the picture just assigned (a bare `complete` can still describe the previous one).
    void this.img.decode().catch(() => {}).then(start);
    (this.root.querySelector(o.urls.length < 2 ? '.lb-close' : '.lb-next') as HTMLButtonElement).focus({ preventScroll: true });
  }

  close() {
    const o = this.opts;
    if (!o) return;
    this.opts = null;
    this.drag = null;
    this.finishSlide();
    o.onClose(this.index);
    this.returned = o.onReturned;
    // Where the image is right now (a drag's offset included), even if it is still on its way out.
    const img = this.img;
    const r = img.getBoundingClientRect();
    const here = this.flight ? this.quad : rectQuad(r.left, r.top, r.width, r.height);
    const lift = this.flight ? this.lift : 1;
    this.halt();
    this.root.classList.remove('open', 'dragging');
    this.root.classList.add('closing');
    this.backdrop.style.opacity = ''; // fades on from wherever a drag-down left it
    this.root.style.removeProperty('--chrome');
    this.closing = true;
    if (this.reduced) return this.finishClose();
    // Return to the card as it is drawn each frame (it may still be settling into its slot), so
    // the image never lands on a stale target. The card is shown again for the last stretch and the
    // image fades off it, which hides any difference in how the two are lit.
    this.fly(img, () => here, () => o.from(), CLOSE_MS, {
      lift: [lift, 0],
      handoff: HANDOFF_MS,
      onHandoff: () => this.handBack(),
      done: () => {
        this.closeTimer = window.setTimeout(() => this.finishClose(), 50);
      },
    });
  }

  private handBack() {
    const cb = this.returned;
    this.returned = undefined;
    cb?.();
  }

  private finishClose() {
    clearTimeout(this.closeTimer);
    this.closeTimer = 0;
    this.closing = false;
    this.halt();
    this.root.hidden = true;
    this.root.classList.remove('closing');
    for (const im of this.imgs) {
      im.style.transition = 'none';
      im.style.transform = im.style.translate = im.style.scale = '';
      im.style.removeProperty('--lift');
      void im.offsetWidth;
      im.style.transition = '';
    }
    this.img.style.opacity = '';
    this.park(this.spare);
    this.handBack();
  }

  // ---- The flight between card and viewer ---------------------------------------------------

  private halt() {
    cancelAnimationFrame(this.flight);
    this.flight = 0;
  }

  /** The flight is over (or cut short by a touch): the image rests in its natural place. */
  private land() {
    const img = this.img;
    this.halt();
    img.style.transform = '';
    img.style.transition = '';
    img.style.removeProperty('--lift');
  }

  /** The image's natural box on screen, measured without any transform on it. */
  private layoutQuad(el: HTMLImageElement): Quad {
    const s = el.style;
    const keep = [s.transform, s.translate, s.scale];
    s.transform = '';
    s.translate = s.scale = 'none';
    const n = el.getBoundingClientRect();
    [s.transform, s.translate, s.scale] = keep;
    return rectQuad(n.left, n.top, n.width, n.height);
  }

  /**
   * Carry the image from one quad to another, a frame at a time. Each frame maps the image's
   * corners onto the blend of the two quads (a projective transform, so perspective and the
   * corner radius stay true to the card), and both ends are read live. `lift` is the weight of
   * the viewer's own shadow, which fades as the image sits down on the card.
   */
  private fly(
    el: HTMLImageElement,
    from: () => Quad,
    to: () => Quad,
    ms: number,
    o: { lift: [number, number]; handoff?: number; onHandoff?: () => void; done: () => void },
  ) {
    cancelAnimationFrame(this.flight);
    const [[x0, y0], , [x1, y1]] = this.layoutQuad(el);
    const w = x1 - x0;
    const h = y1 - y0;
    const cx = x0 + w / 2;
    const cy = y0 + h / 2;
    const src = rectQuad(-w / 2, -h / 2, w, h);
    const t0 = performance.now();
    let handed = false;
    el.style.transition = 'none';
    el.style.translate = el.style.scale = '';
    const frame = (now: number) => {
      const spent = Math.max(0, now - t0);
      const t = Math.min(1, spent / ms);
      const p = drawer(t);
      const q = lerpQuad(from(), to(), p);
      this.quad = q;
      this.lift = o.lift[0] + (o.lift[1] - o.lift[0]) * p;
      el.style.transform = matrix3d(homography(src, q.map(([x, y]) => [x - cx, y - cy]) as Quad));
      el.style.setProperty('--lift', this.lift.toFixed(3));
      if (o.handoff && ms - spent < o.handoff) {
        if (!handed) {
          handed = true;
          o.onHandoff?.();
        }
        // The card comes in under the opaque image first (HANDBACK in stack.ts); only then does the image fade off it.
        el.style.opacity = String(Math.min(1, Math.max(0, (ms - spent) / (o.handoff / 2))));
      }
      if (t < 1) this.flight = requestAnimationFrame(frame);
      else {
        this.flight = 0;
        o.done();
      }
    };
    frame(t0);
  }

  // ---- The strip ------------------------------------------------------------------------

  private load(el: HTMLImageElement, i: number) {
    const o = this.opts!;
    // Keyed by address, not index: the same position in another project is a different picture.
    if (el.getAttribute('src') !== o.urls[i]) el.src = o.urls[i];
    el.alt = `${o.title} screenshot ${i + 1} of ${o.urls.length}`;
    if (el.complete && el.naturalWidth) this.size(el);
  }

  private label() {
    [...this.dots.children].forEach((d, k) => d.classList.toggle('on', k === this.index));
  }

  /** The spare image out of sight, ready to be dealt in. */
  private park(el: HTMLImageElement) {
    el.style.transition = 'none';
    el.style.opacity = '0';
    el.style.translate = el.style.scale = '';
    el.classList.add('lb-spare');
  }

  /** Centre-to-centre spacing of neighbours: each just clears the screen as the other lands. */
  private gap() {
    const w = Math.max(parseFloat(this.img.style.width) || 0, parseFloat(this.spare.style.width) || 0);
    return innerWidth / 2 + w / 2 + 24;
  }

  private neighbour(d: number) {
    const n = this.opts!.urls.length;
    return (this.index + d + n) % n;
  }

  /** Bring a neighbour in beside the image, at the strip's offset dx. */
  private peek(d: number, dx: number) {
    const s = this.spare;
    this.load(s, this.neighbour(d));
    s.classList.remove('lb-spare');
    s.style.transition = 'none';
    s.style.opacity = '1';
    s.style.translate = `${dx + d * this.gap()}px 0`;
  }

  /** Snap a slide in progress to its end, so the next one starts from rest. */
  private finishSlide() {
    clearTimeout(this.slideTimer);
    const done = this.settleSlide;
    this.settleSlide = null;
    done?.();
  }

  /**
   * Slide the strip one screenshot along. From a drag, the image is already part way (dx) and the
   * neighbour already beside it; the slide carries on at the finger's speed.
   */
  private go(d: number, fromDrag = 0, speed = 0) {
    if (!this.opts || this.opts.urls.length < 2) return;
    this.finishSlide();
    if (!fromDrag) this.peek(d, 0);
    this.index = this.neighbour(d);
    this.label();
    const a = this.img;
    const b = this.spare;
    this.cur = 1 - this.cur;
    b.classList.remove('lb-spare');
    a.classList.add('lb-spare');
    a.setAttribute('aria-hidden', 'true');
    b.removeAttribute('aria-hidden');
    if (this.reduced) {
      b.style.translate = '';
      this.park(a);
      return;
    }
    const gap = this.gap();
    const left = Math.abs(gap - Math.abs(fromDrag));
    // A released flick keeps its pace (within reason); from rest, the usual glide.
    const ms = speed > 0 ? Math.min(SLIDE_MS, Math.max(240, (left / speed) * 1.6)) : SLIDE_MS;
    void b.offsetWidth;
    const tr = `translate ${ms}ms var(--ease-swipe), opacity ${ms}ms var(--ease-out)`;
    a.style.transition = b.style.transition = tr;
    a.style.translate = `${-d * gap}px 0`;
    a.style.opacity = '0.35';
    b.style.translate = '0px 0';
    this.settleSlide = () => {
      this.park(a);
      b.style.transition = '';
    };
    this.slideTimer = window.setTimeout(() => this.finishSlide(), ms);
  }

  // ---- Dragging ---------------------------------------------------------------------------

  private onDown(e: PointerEvent) {
    if (!this.opts || !e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
    this.finishSlide();
    if (this.flight) this.land(); // a touch mid-flight takes the image where it is going
    this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, axis: null, dx: 0, dy: 0, vx: 0, vy: 0, t: e.timeStamp, peek: 0 };
    this.fig.setPointerCapture(e.pointerId);
  }

  private onMove(e: PointerEvent) {
    const g = this.drag;
    if (!g || e.pointerId !== g.id) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    const dt = Math.max(1, e.timeStamp - g.t);
    // Velocity (px/ms), lightly smoothed so one jittery sample can't decide a release.
    g.vx = g.vx * 0.6 + ((dx - g.dx) / dt) * 0.4;
    g.vy = g.vy * 0.6 + ((dy - g.dy) / dt) * 0.4;
    g.dx = dx;
    g.dy = dy;
    g.t = e.timeStamp;
    if (!g.axis) {
      if (Math.hypot(dx, dy) < SLOP) return;
      g.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      this.root.classList.add('dragging');
      this.img.style.transition = 'none';
    }
    const img = this.img;
    if (g.axis === 'x') {
      const single = this.opts!.urls.length < 2;
      // Nothing beside it: the image gives a little and resists, like a rubber band.
      const x = single ? Math.sign(dx) * Math.sqrt(Math.abs(dx)) * 4 : dx;
      img.style.translate = `${x}px 0`;
      if (single) return;
      const d = dx < 0 ? 1 : -1;
      if (d !== g.peek) {
        g.peek = d;
        this.peek(d, x);
      } else this.spare.style.translate = `${x + d * this.gap()}px 0`;
    } else {
      // Down lets go of it (it shrinks a little and the room comes back); up only gives a little.
      const y = dy > 0 ? dy : -Math.sqrt(-dy) * 3;
      const k = Math.max(0, dy) / innerHeight;
      img.style.translate = `${dx * 0.5}px ${y}px`;
      img.style.scale = String(1 - Math.min(0.35, k * 0.6));
      this.backdrop.style.opacity = String(1 - Math.min(1, k * 2.2));
      this.root.style.setProperty('--chrome', String(1 - Math.min(1, k * 5)));
    }
  }

  private onUp(e: PointerEvent, cancelled: boolean) {
    const g = this.drag;
    if (!g || e.pointerId !== g.id) return;
    this.drag = null;
    this.root.classList.remove('dragging');
    // A tap off the image closes it, as clicking outside any sheet does.
    if (!g.axis) {
      // (The event's target is the figure, which holds the capture; ask what is under the point.)
      if (!cancelled && document.elementFromPoint(e.clientX, e.clientY) !== this.img) this.close();
      return;
    }
    const img = this.img;
    if (g.axis === 'x' && g.peek) {
      const d = g.peek;
      const flung = Math.abs(g.vx) > 0.35 && Math.sign(g.vx) === -d;
      if (!cancelled && (Math.abs(g.dx) > innerWidth * 0.18 || flung)) return this.go(d, g.dx, Math.abs(g.vx));
      const s = this.spare;
      img.style.transition = s.style.transition = `translate ${SNAP_MS}ms var(--ease-swipe)`;
      img.style.translate = '0px 0';
      s.style.translate = `${d * this.gap()}px 0`;
      this.settleSlide = () => {
        this.park(s);
        img.style.transition = '';
      };
      this.slideTimer = window.setTimeout(() => this.finishSlide(), SNAP_MS);
      return;
    }
    if (g.axis === 'y' && !cancelled && (g.dy > 120 || (g.vy > 0.5 && g.dy > 30))) return this.close();
    img.style.transition = `translate ${SNAP_MS}ms var(--ease-swipe), scale ${SNAP_MS}ms var(--ease-swipe)`;
    img.style.translate = img.style.scale = '';
    this.backdrop.style.opacity = '';
    this.root.style.removeProperty('--chrome');
    this.slideTimer = window.setTimeout(() => (img.style.transition = ''), SNAP_MS);
  }

  // ---- Sizing -----------------------------------------------------------------------------

  /**
   * Phones: as large as the screen allows between the close button and the bar, so a portrait
   * screenshot reads like the phone it came from. Larger screens: a natural, comfortable size
   * rather than filling the screen; desktop shots at a reading width, phone shots at about
   * the height of a phone held in front of you.
   */
  private size(el: HTMLImageElement) {
    const nw = el.naturalWidth;
    const nh = el.naturalHeight;
    if (!nw || !nh) return;
    const a = nw / nh;
    const cs = getComputedStyle(this.fig);
    const maxW = this.fig.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const maxH = this.fig.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    if (maxW <= 0 || maxH <= 0) return;
    const phone = innerWidth <= 640;
    let w: number;
    let h: number;
    if (phone) {
      w = Math.min(maxW, maxH * a);
      h = w / a;
    } else {
      if (a < 0.8) {
        h = Math.min(maxH, 720);
        w = h * a;
      } else {
        w = Math.min(maxW, 960);
        h = w / a;
      }
      const k = Math.min(1, maxW / w, maxH / h);
      w *= k;
      h *= k;
    }
    const fw = Math.round(w);
    const fh = Math.round(h);
    el.style.width = `${fw}px`;
    el.style.height = `${fh}px`;
    // Corners in the same proportion as the card in the stack (see CardStack: device-like for
    // phone screenshots, a small radius otherwise). The flight to and from the card is a pure
    // scale, so the corners then shrink exactly into the card's instead of snapping at the end.
    el.style.borderRadius = `${(a < 0.75 ? fw * CARD_RADIUS.phone : Math.min(fw, fh) * CARD_RADIUS.other).toFixed(1)}px`;
  }
}
