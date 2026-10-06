import { h } from '../dom';

const SIZES = { desktop: { w: 1280, h: 800 }, phone: { w: 390, h: 844 } } as const;
type Mode = keyof typeof SIZES;

/**
 * The real site in an iframe, at a desktop or phone size scaled to fit. It opens on the edited
 * project through the site's dev-only #open-<index> hash. Saving content reloads it on its own
 * (Vite reloads the site when site.json changes).
 */
export class Preview {
  readonly el: HTMLElement;
  private frame = h('iframe', { title: 'Site preview' });
  private stage = h('div', { class: 'preview-stage' }, this.frame);
  private mode: Mode = 'desktop';
  private hash = '#open';
  private n = 0;

  constructor() {
    const buttons = (Object.keys(SIZES) as Mode[]).map((m) =>
      h(
        'button',
        {
          type: 'button',
          class: m === this.mode ? 'on' : '',
          onclick: () => {
            this.mode = m;
            for (const b of buttons) b.classList.toggle('on', b.textContent === m);
            this.fit();
          },
        },
        m,
      ),
    );
    this.el = h(
      'section',
      { class: 'preview' },
      h(
        'div',
        { class: 'preview-bar' },
        h('span', {}, 'Preview'),
        h('span', { class: 'spacer' }),
        h('div', { class: 'seg' }, ...buttons),
        h('button', { class: 'btn small', type: 'button', onclick: () => this.reload() }, 'Reload'),
      ),
      this.stage,
    );
    new ResizeObserver(() => this.fit()).observe(this.stage);
    this.reload();
  }

  /** Point the preview at `hash`; the site reads it on load, so a change means a reload. */
  show(hash: string, force = false) {
    if (hash === this.hash && !force) return;
    this.hash = hash;
    this.reload();
  }

  reload() {
    // A changing query makes it a real navigation (a hash-only change wouldn't reload).
    this.frame.src = `/?preview=${++this.n}${this.hash}`;
  }

  private fit() {
    const size = SIZES[this.mode];
    const r = this.stage.getBoundingClientRect();
    const s = Math.min(r.width / size.w, r.height / size.h, 1);
    Object.assign(this.frame.style, { width: `${size.w}px`, height: `${size.h}px`, transform: `translate(-50%, -50%) scale(${s})` });
  }
}
