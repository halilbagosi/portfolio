export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface OpenOptions {
  title: string;
  urls: string[];
  index: number;
  /** Where the image comes from on screen (the card); it grows out of and returns to this rect. */
  from: () => Rect;
  onClose: (index: number) => void;
  /** The image has landed back on the card and the viewer is gone. */
  onReturned?: () => void;
}

/** Corner radius as a fraction of the card's width (phone screenshots) or shorter side (others). */
export const CARD_RADIUS = { phone: 0.11, other: 0.035 };

/** Return flight; matches `#lightbox.closing .lb-img` in style.css. Exits run a little faster than entrances. */
const CLOSE_MS = 420;
/** Outgoing half of a screenshot swap. */
const SWAP_OUT_MS = 140;

/**
 * Full-screen viewer for screenshots at their true aspect ratio. Opens from the card it
 * was clicked on and returns to it; arrows / keys / swipe cycle through the set.
 */
export class Lightbox {
  private root: HTMLDivElement;
  private img: HTMLImageElement;
  private label: HTMLParagraphElement;
  private opts: OpenOptions | null = null;
  private index = 0;
  private reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private touchX = 0;
  private closeTimer = 0;
  private swapTimer = 0;
  private returned: (() => void) | undefined;

  constructor() {
    this.root = document.createElement('div');
    this.root.id = 'lightbox';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="lb-backdrop"></div>
      <figure class="lb-figure"><img class="lb-img" alt="" /></figure>
      <button class="lb-btn lb-prev" aria-label="Previous screenshot">&#8249;</button>
      <button class="lb-btn lb-next" aria-label="Next screenshot">&#8250;</button>
      <button class="lb-btn lb-close" aria-label="Close">&#10005;</button>
      <p class="lb-label"></p>`;
    document.body.appendChild(this.root);
    this.img = this.root.querySelector('.lb-img')!;
    this.img.addEventListener('load', () => this.size());
    window.addEventListener('resize', () => this.opts && this.size());
    this.label = this.root.querySelector('.lb-label')!;

    this.root.querySelector('.lb-prev')!.addEventListener('click', () => this.step(-1));
    this.root.querySelector('.lb-next')!.addEventListener('click', () => this.step(1));
    this.root.querySelector('.lb-close')!.addEventListener('click', () => this.close());
    this.root.querySelector('.lb-backdrop')!.addEventListener('click', () => this.close());
    this.root.querySelector('.lb-figure')!.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) this.close();
    });
    window.addEventListener('keydown', (e) => {
      if (!this.opts) return;
      if (e.key === 'Escape') this.close();
      else if (e.key === 'ArrowRight') this.step(1);
      else if (e.key === 'ArrowLeft') this.step(-1);
    });
    this.root.addEventListener('touchstart', (e) => (this.touchX = e.touches[0].clientX), { passive: true });
    this.root.addEventListener('touchend', (e) => {
      const dx = e.changedTouches[0].clientX - this.touchX;
      if (Math.abs(dx) > 40) this.step(dx < 0 ? 1 : -1);
    });
  }

  get isOpen() {
    return this.opts !== null;
  }

  open(o: OpenOptions) {
    // Reopened mid-return: drop the pending teardown and let the previous card show again.
    if (this.closeTimer) this.finishClose();
    this.opts = o;
    this.index = o.index;
    this.root.hidden = false;
    this.root.classList.remove('closing');
    this.show(false);
    // FLIP: start at the card's rect, then release to the natural layout.
    const start = () => {
      this.size();
      this.img.style.transition = 'none';
      this.place(o.from());
      void this.img.offsetWidth;
      this.img.style.transition = '';
      this.root.classList.add('open');
      this.img.style.transform = '';
    };
    if (this.img.complete) start();
    else this.img.addEventListener('load', start, { once: true });
    (this.root.querySelector('.lb-next') as HTMLButtonElement).focus({ preventScroll: true });
  }

  close() {
    const o = this.opts;
    if (!o) return;
    this.opts = null;
    clearTimeout(this.swapTimer);
    this.img.classList.remove('out-left', 'out-right', 'in-left', 'in-right');
    o.onClose(this.index);
    this.returned = o.onReturned;
    this.root.classList.remove('open');
    this.root.classList.add('closing');
    if (this.reduced) return this.finishClose();
    // Return along the same path it came from. Wait one frame so the card has settled into
    // its slot (the stack snaps on its next update) and the target rect is final.
    requestAnimationFrame(() => this.place(o.from()));
    this.closeTimer = window.setTimeout(() => this.finishClose(), CLOSE_MS + 20);
  }

  private finishClose() {
    clearTimeout(this.closeTimer);
    this.closeTimer = 0;
    this.root.hidden = true;
    this.root.classList.remove('closing');
    this.img.style.transition = 'none';
    this.img.style.transform = '';
    void this.img.offsetWidth;
    this.img.style.transition = '';
    const cb = this.returned;
    this.returned = undefined;
    cb?.();
  }

  private step(d: number) {
    if (!this.opts) return;
    const n = this.opts.urls.length;
    this.index = (this.index + d + n) % n;
    this.show(true, d);
  }

  private show(animate: boolean, dir = 1) {
    const o = this.opts!;
    const swap = () => {
      this.img.src = o.urls[this.index];
      this.img.alt = `${o.title} screenshot ${this.index + 1} of ${o.urls.length}`;
      this.label.textContent = `${o.title}  ·  ${this.index + 1} / ${o.urls.length}`;
    };
    clearTimeout(this.swapTimer);
    if (!animate || this.reduced) return swap();
    // Out the way it's going, in from the other side: a short fade-slide, quicker out than in.
    this.img.classList.remove('in-left', 'in-right', 'out-left', 'out-right');
    this.img.classList.add(dir > 0 ? 'out-left' : 'out-right');
    this.swapTimer = window.setTimeout(() => {
      swap();
      this.img.classList.remove('out-left', 'out-right');
      this.img.classList.add(dir > 0 ? 'in-right' : 'in-left');
      void this.img.offsetWidth;
      this.img.classList.remove('in-right', 'in-left');
    }, SWAP_OUT_MS);
  }

  /**
   * Natural, comfortable size rather than filling the screen: desktop screenshots at a reading
   * width, phone screenshots at about the height of a phone held in front of you.
   */
  private size() {
    const nw = this.img.naturalWidth;
    const nh = this.img.naturalHeight;
    if (!nw || !nh) return;
    const a = nw / nh;
    const phone = innerWidth <= 640;
    const maxW = phone ? innerWidth - 32 : innerWidth * 0.84;
    const maxH = innerHeight * (phone ? 0.7 : 0.72);
    let w: number;
    let h: number;
    if (a < 0.8) {
      h = Math.min(maxH, 640);
      w = h * a;
    } else {
      w = Math.min(maxW, 880);
      h = w / a;
    }
    const k = Math.min(1, maxW / w, maxH / h);
    const fw = Math.round(w * k);
    const fh = Math.round(h * k);
    this.img.style.width = `${fw}px`;
    this.img.style.height = `${fh}px`;
    // Corners in the same proportion as the card in the stack (see CardStack: device-like for
    // phone screenshots, a small radius otherwise). The flight to and from the card is a pure
    // scale, so the corners then shrink exactly into the card's instead of snapping at the end.
    this.img.style.borderRadius = `${(a < 0.75 ? fw * CARD_RADIUS.phone : Math.min(fw, fh) * CARD_RADIUS.other).toFixed(1)}px`;
  }

  /** Transform the image so it covers `r` (in its untransformed layout box). */
  private place(r: Rect) {
    const b = this.img.getBoundingClientRect();
    if (!b.width || !b.height) return;
    const cur = this.img.style.transform;
    this.img.style.transform = '';
    const n = this.img.getBoundingClientRect();
    this.img.style.transform = cur;
    const sx = r.w / n.width;
    const sy = r.h / n.height;
    const tx = r.x + r.w / 2 - (n.left + n.width / 2);
    const ty = r.y + r.h / 2 - (n.top + n.height / 2);
    this.img.style.transform = `translate(${tx}px, ${ty}px) scale(${sx}, ${sy})`;
  }
}
