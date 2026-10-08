/**
 * Social logos for the lid's engraving, drawn as plain shapes (no text, no images) in whatever
 * fill and stroke the context has. Marks follow the brands' own, simplified where the original is
 * too fine to engrave.
 */

export type GlyphKind = 'github' | 'linkedin' | 'email' | 'x' | 'instagram' | 'youtube' | 'link';

/** Which logo a link gets, from where it points. */
export function glyphFor(href: string): GlyphKind {
  if (href.startsWith('mailto:')) return 'email';
  let host = '';
  try {
    host = new URL(href).hostname.replace(/^www\./, '');
  } catch {
    return 'link';
  }
  if (host === 'github.com') return 'github';
  if (host === 'linkedin.com') return 'linkedin';
  if (host === 'x.com' || host === 'twitter.com') return 'x';
  if (host === 'instagram.com') return 'instagram';
  if (host === 'youtube.com' || host === 'youtu.be') return 'youtube';
  return 'link';
}

const GITHUB =
  'M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z';
const LINKEDIN =
  'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z';
const X =
  'M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z';

/** A rounded rectangle path by arcs (every canvas has arcTo; roundRect is newer). */
function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** A squircle (superellipse corners) path, like an app icon's tile. */
function squircle(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const k = 2 / 3;
  const corners: [number, number, number][] = [
    [x + w - r, y + r, -Math.PI / 2],
    [x + w - r, y + h - r, 0],
    [x + r, y + h - r, Math.PI / 2],
    [x + r, y + r, Math.PI],
  ];
  corners.forEach(([cx, cy, a0], j) => {
    for (let i = 0; i <= 12; i++) {
      const a = a0 + (i / 12) * (Math.PI / 2);
      const c = Math.cos(a);
      const s = Math.sin(a);
      const px = cx + r * Math.sign(c) * Math.abs(c) ** k;
      const py = cy + r * Math.sign(s) * Math.abs(s) ** k;
      if (j === 0 && i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
  });
  ctx.closePath();
}

/**
 * Draws a logo centred on (cx, cy), `size` across, in the context's current fill (and stroke colour,
 * which should match). Set `knock` to the background colour for the shapes cut out of solid marks.
 */
export function drawGlyph(ctx: CanvasRenderingContext2D, kind: GlyphKind, cx: number, cy: number, size: number, knock = '#fff') {
  ctx.save();
  ctx.translate(cx - size / 2, cy - size / 2);
  if (kind === 'github') {
    ctx.scale(size / 16, size / 16);
    ctx.fill(new Path2D(GITHUB));
  } else if (kind === 'linkedin') {
    ctx.scale(size / 24, size / 24);
    ctx.fill(new Path2D(LINKEDIN));
  } else if (kind === 'x') {
    ctx.scale(size / 24, size / 24);
    ctx.fill(new Path2D(X), 'evenodd');
  } else {
    ctx.scale(size / 24, size / 24);
    ctx.lineWidth = 2;
    ctx.lineCap = ctx.lineJoin = 'round';
    ctx.beginPath();
    if (kind === 'email') {
      // Apple Mail's icon: a solid squircle tile with a white envelope, its flap a single fold.
      squircle(ctx, 0.5, 0.5, 23, 23, 8.5);
      ctx.fill();
      ctx.fillStyle = knock;
      ctx.beginPath();
      rrect(ctx, 4.2, 6.6, 15.6, 10.8, 1.8);
      ctx.fill();
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(4.9, 7.6);
      ctx.lineTo(12, 13.1);
      ctx.lineTo(19.1, 7.6);
      ctx.stroke();
    } else if (kind === 'instagram') {
      rrect(ctx, 2.5, 2.5, 19, 19, 5.5);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(12, 12, 4.4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(17.5, 6.5, 1.2, 0, Math.PI * 2);
      ctx.fill();
    } else if (kind === 'youtube') {
      rrect(ctx, 1, 4.5, 22, 15, 4.5);
      ctx.fill();
      ctx.fillStyle = knock;
      ctx.beginPath();
      ctx.moveTo(9.7, 8.6);
      ctx.lineTo(15.6, 12);
      ctx.lineTo(9.7, 15.4);
      ctx.closePath();
      ctx.fill();
    } else {
      // A globe, for anything without a mark of its own.
      ctx.lineWidth = 1.7;
      ctx.arc(12, 12, 9.5, 0, Math.PI * 2);
      ctx.moveTo(2.5, 12);
      ctx.lineTo(21.5, 12);
      ctx.moveTo(16.5, 12);
      ctx.ellipse(12, 12, 4.5, 9.5, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.restore();
}
