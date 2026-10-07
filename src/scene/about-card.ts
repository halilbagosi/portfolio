import type { About, Social } from '../content/schema';
import { drawTracked, FONT } from './textures';

/** Layout pixels per world unit (the labels' scale), and the canvas's backing scale on top. */
export const CARD_PX = 220;
export const CARD_SS = 2;

const WHITE = '#f5f5f7';
const BODY = 'rgba(245,245,247,0.78)';
const MUTED = 'rgba(235,235,245,0.45)';
const LINK = '#6cb4ff';
const GREEN = '#30d158';
const GREY = '#8e8e93';
const f = (weight: number, size: number) => `${weight} ${size}px ${FONT}`;
const LABEL = f(600, 13);
const LABEL_TRACK = 1.8;
const GAP = 24;
/** A link's touch target: its row height, and how far it reaches past the text sideways. */
const TAP_H = 48;
const TAP_X = 10;

/** One thing to draw, in layout px (y down; text at its baseline). */
export type Op =
  | { kind: 'text'; x: number; y: number; text: string; font: string; color: string; tracking: number }
  | { kind: 'photo'; cx: number; cy: number; r: number }
  | { kind: 'pill'; x: number; y: number; w: number; h: number }
  | { kind: 'dot'; cx: number; cy: number; r: number; color: string }
  | { kind: 'rule'; x: number; y: number; w: number; h: number };

/** A clickable area, as fractions of the card (0..1, y down). */
export interface CardLink {
  href: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface CardInput {
  name: string;
  role: string;
  about: About;
  socials: Social[];
}

/** The margin kept clear on every side of the card; the layout never draws into it. */
export const cardPad = (w: number, h: number) => (w > h ? 64 : 56);

/** The link at a uv hit (u right, v up), if any. */
export function linkAtUv(links: CardLink[], u: number, v: number): string | null {
  const y = 1 - v; // the card runs top-down, uv bottom-up
  return links.find((l) => u >= l.x0 && u <= l.x1 && y >= l.y0 && y <= l.y1)?.href ?? null;
}

/** Width of text in a font, with optional tracking between characters. */
export type Measure = (text: string, font: string, tracking?: number) => number;

export function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

/** Email, résumé, then every social that isn't that same email: what a recruiter clicks. */
export function contactLinks(about: About, socials: Social[]): { label: string; href: string }[] {
  const mail = `mailto:${about.email}`;
  return [
    { label: about.email, href: mail },
    ...(about.resume ? [{ label: 'Résumé', href: about.resume }] : []),
    ...socials.filter((s) => s.href !== mail).map((s) => ({ label: s.label, href: s.href })),
  ];
}

/** The About as plain sentences, for screen readers and the no-WebGL page. */
export function aboutLines(a: About): string[] {
  return [
    a.bio,
    `${a.years}+ years of experience.`,
    `Based in ${a.location}${a.workPreference ? ` · ${a.workPreference}` : ''}.`,
    a.availability,
    `Skills: ${a.skills.join(', ')}.`,
    ...a.timeline.map((t) => `${t.role}, ${t.org}, ${t.period}.`),
  ];
}

/** Text cut to fit a width, with an ellipsis. Cuts by code point, so an emoji is never split. */
function fit(text: string, font: string, maxW: number, measure: Measure, tracking = 0) {
  if (measure(text, font, tracking) <= maxW) return text;
  const chars = [...text];
  while (chars.length && measure(`${chars.join('')}…`, font, tracking) > maxW) chars.pop();
  return `${chars.join('').trimEnd()}…`;
}

/**
 * Words wrapped to a width, at most `maxLines` (the last one ellipsed if cut). A word wider than
 * the column (a URL) is ellipsed on its own rather than hard-broken: a URL split mid-way is no more
 * readable, and one cut word keeps the line count, so the block's height stays bounded.
 */
function wrap(text: string, font: string, maxW: number, maxLines: number, measure: Measure) {
  const out: string[] = [];
  let cur = '';
  for (const word of text.split(/\s+/).filter(Boolean).map((wd) => fit(wd, font, maxW, measure))) {
    const next = cur ? `${cur} ${word}` : word;
    if (cur && measure(next, font) > maxW) {
      out.push(cur);
      cur = word;
    } else cur = next;
  }
  if (cur) out.push(cur);
  if (out.length <= maxLines) return out;
  const kept = out.slice(0, maxLines);
  kept[maxLines - 1] = fit(`${kept[maxLines - 1]}…`, font, maxW, measure);
  return kept;
}

/**
 * The About card: what to draw (layout px, CARD_PX per world unit) and where its links are. Wide
 * cards set the person on the left and the details in a right column; tall ones stack everything.
 * Also returns `bottom`, how far down the content reaches (text with a descender allowance, pills, the
 * portrait, the dot, the tall card's rule; not the wide card's divider, which spans the card by design).
 * Pure: `measure` supplies text widths, so it is tested without a canvas.
 */
export function layoutAbout(
  input: CardInput,
  w: number,
  h: number,
  measure: Measure,
): { ops: Op[]; links: CardLink[]; bottom: number } {
  const ops: Op[] = [];
  const links: CardLink[] = [];
  const a = input.about;
  const wide = w > h;
  const pad = cardPad(w, h);

  const text = (x: number, y: number, t: string, font: string, color: string, tracking = 0) => {
    ops.push({ kind: 'text', x, y, text: t, font, color, tracking });
    return measure(t, font, tracking);
  };
  const label = (x: number, y: number, t: string) => text(x, y, t.toUpperCase(), LABEL, MUTED, LABEL_TRACK);

  /** A titled block in a column, from y; returns the y below it. */
  type Block = (x: number, y: number, colW: number) => number;

  const bio: Block = (x, y, colW) => {
    label(x, y + 13, 'About');
    y += 13 + 16;
    for (const l of wrap(a.bio, f(400, 21), colW, wide ? 4 : 6, measure)) {
      text(x, y + 21, l, f(400, 21), BODY);
      y += 30;
    }
    return y;
  };

  const skills: Block = (x, y, colW) => {
    label(x, y + 13, 'Skills');
    y += 13 + 14;
    const font = f(500, 16);
    const ph = 32;
    let cx = x;
    for (const s of a.skills) {
      const t = fit(s, font, colW - 28, measure);
      const pw = measure(t, font) + 28;
      if (cx > x && cx + pw > x + colW) {
        cx = x;
        y += ph + 8;
      }
      ops.push({ kind: 'pill', x: cx, y, w: pw, h: ph });
      text(cx + 14, y + 22, t, font, WHITE);
      cx += pw + 8;
    }
    return y + ph;
  };

  const place: Block = (x, y, colW) => {
    const half = a.workPreference ? (colW - 24) / 2 : colW;
    const value = f(500, 20);
    // Side by side while neither value would be cut at half width; otherwise (tall card) stacked, full width
    // each. The wide card keeps them side by side: its right column has no spare height for a second row.
    if (!wide && a.workPreference && (measure(a.location, value) > half || measure(a.workPreference, value) > half)) {
      label(x, y + 13, 'Location');
      text(x, y + 47, fit(a.location, value, colW, measure), value, WHITE);
      label(x, y + 73, 'Work');
      text(x, y + 107, fit(a.workPreference, value, colW, measure), value, WHITE);
      return y + 113;
    }
    label(x, y + 13, 'Location');
    text(x, y + 47, fit(a.location, value, half, measure), value, WHITE);
    if (a.workPreference) {
      label(x + half + 24, y + 13, 'Work');
      text(x + half + 24, y + 47, fit(a.workPreference, value, half, measure), value, WHITE);
    }
    return y + 53;
  };

  const timeline: Block = (x, y, colW) => {
    label(x, y + 13, 'Experience');
    y += 13 + 12;
    for (const t of a.timeline) {
      text(x, y + 20, fit(t.role, f(600, 19), colW, measure), f(600, 19), WHITE);
      text(x, y + 44, fit(`${t.org} · ${t.period}`, f(400, 17), colW, measure), f(400, 17), MUTED);
      y += 52;
    }
    return y - 6;
  };

  const contact: Block = (x, y, colW) => {
    label(x, y + 13, 'Contact');
    y += 13 + 12;
    const font = f(500, 19);
    let cx = x;
    for (const l of contactLinks(a, input.socials)) {
      const t = fit(l.label, font, colW - 8, measure);
      const lw = measure(t, font);
      if (cx > x && cx + lw > x + colW) {
        cx = x;
        y += TAP_H;
      }
      text(cx, y + 20, t, font, LINK);
      // A finger-sized target around the text (the card is a third of its size on a phone). Rows are
      // TAP_H apart and items 2 * TAP_X + 4 apart, so neighbouring rects never overlap.
      links.push({
        href: l.href,
        x0: (cx - TAP_X) / w,
        y0: (y + 14 - TAP_H / 2) / h,
        x1: (cx + lw + TAP_X) / w,
        y1: (y + 14 + TAP_H / 2) / h,
      });
      cx += lw + 2 * TAP_X + 4;
    }
    return y + 26;
  };

  /** Portrait, name and role: stacked, or the name beside the portrait. Returns the y below. */
  const person = (x: number, y: number, colW: number, r: number, beside: boolean) => {
    ops.push({ kind: 'photo', cx: x + r, cy: y + r, r });
    const name = f(600, 40);
    const role = f(500, 15);
    if (beside) {
      const tx = x + 2 * r + 28;
      const tw = colW - 2 * r - 28;
      text(tx, y + r - 4, fit(input.name, name, tw, measure), name, WHITE);
      text(tx, y + r + 30, fit(input.role.toUpperCase(), role, tw, measure, 2.2), role, MUTED, 2.2);
      return y + 2 * r;
    }
    y += 2 * r + 30;
    text(x, y + 36, fit(input.name, name, colW, measure), name, WHITE);
    text(x, y + 68, fit(input.role.toUpperCase(), role, colW, measure, 2.2), role, MUTED, 2.2);
    return y + 72;
  };

  /** The big "N+" with its caption, then availability. Returns the y below. */
  const years = (x: number, y: number, colW: number) => {
    const size = wide ? 108 : 96;
    const base = y + size * 0.82;
    const nw = text(x, base, `${a.years}+`, f(600, size), WHITE);
    label(x + nw + 16, base - 22, 'Years of');
    label(x + nw + 16, base, 'experience');
    y = base + 30;
    ops.push({ kind: 'dot', cx: x + 7, cy: y + 13, r: 6, color: a.available ? GREEN : GREY });
    text(x + 24, y + 20, fit(a.availability, f(500, 19), colW - 24, measure), f(500, 19), WHITE);
    return y + 30;
  };

  const blocks: Block[] = [bio, skills, place, ...(a.timeline.length ? [timeline] : []), contact];
  const column = (x: number, y: number, colW: number) => {
    for (const b of blocks) y = b(x, y, colW) + GAP;
  };

  if (wide) {
    const inner = w - pad * 2;
    const leftW = Math.round(inner * 0.32);
    const rightX = pad + leftW + 56;
    const y = person(pad, pad, leftW, Math.min(96, leftW * 0.3), false);
    years(pad, y + GAP, leftW);
    ops.push({ kind: 'rule', x: rightX - 28, y: pad, w: 1.5, h: h - pad * 2 });
    column(rightX, pad, w - pad - rightX);
  } else {
    const colW = w - pad * 2;
    let y = person(pad, pad, colW, 84, true) + GAP;
    y = years(pad, y, colW) + GAP;
    ops.push({ kind: 'rule', x: pad, y, w: colW, h: 1.5 });
    column(pad, y + 1.5 + GAP, colW);
  }
  return { ops, links, bottom: contentBottom(ops, wide) };
}

/** Descender depth below a text baseline, as a fraction of the font size. */
const DESCENT = 0.2;

/** The largest y any op reaches (layout px). The wide card's full-height divider is left out. */
function contentBottom(ops: Op[], wide: boolean) {
  let bottom = 0;
  for (const op of ops) {
    let y = 0;
    if (op.kind === 'text') y = op.y + (parseFloat(op.font.split(' ')[1]) || 0) * DESCENT;
    else if (op.kind === 'photo' || op.kind === 'dot') y = op.cy + op.r;
    else if (op.kind === 'pill' || (op.kind === 'rule' && !wide)) y = op.y + op.h;
    bottom = Math.max(bottom, y);
  }
  return bottom;
}

/** The largest scale the card is drawn up by, and the step it is searched in. */
export const FIT_MAX = 1.7;
const FIT_STEP = 0.05;

/** How many text ops were cut short with an ellipsis. */
export const cutCount = (ops: Op[]) => ops.filter((o) => o.kind === 'text' && o.text.endsWith('…')).length;

/** `fitAbout`'s result: the layout at a logical `lw` by `lh`, to be drawn `scale` times larger. */
export interface FittedAbout {
  ops: Op[];
  links: CardLink[];
  scale: number;
  lw: number;
  lh: number;
}

/**
 * Lays the card out on a smaller logical canvas (`w / scale` by `h / scale`) that is drawn scaled up, so
 * the type grows to fill the card. Picks the largest scale in 1..FIT_MAX whose content still fits inside
 * the card's padding and loses no more text to ellipses than the scale-1 layout does (a narrower logical
 * column cuts text that was whole, and the cut text is shorter, which would make a bigger scale look like
 * it fits). Falls back to scale 1. Link rects are fractions of the card, so they stay valid.
 */
export function fitAbout(input: CardInput, w: number, h: number, measure: Measure): FittedAbout {
  const base = layoutAbout(input, w, h, measure);
  const baseCuts = cutCount(base.ops);
  for (let i = Math.round((FIT_MAX - 1) / FIT_STEP); i > 0; i--) {
    const scale = Math.round((1 + i * FIT_STEP) * 1e6) / 1e6;
    const lw = w / scale;
    const lh = h / scale;
    const { ops, links, bottom } = layoutAbout(input, lw, lh, measure);
    if (bottom <= lh - cardPad(lw, lh) && cutCount(ops) <= baseCuts) return { ops, links, scale, lw, lh };
  }
  return { ops: base.ops, links: base.links, scale: 1, lw: w, lh: h };
}

/** roundRect where it exists; Safari before 16 lacks it, and square corners beat a card that fails to draw. */
function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

function portrait(ctx: CanvasRenderingContext2D, op: Extract<Op, { kind: 'photo' }>, initials: string, photo?: HTMLImageElement) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(op.cx, op.cy, op.r, 0, Math.PI * 2);
  ctx.clip();
  if (photo?.naturalWidth) {
    // Cover the circle, centred.
    const k = Math.max((2 * op.r) / photo.naturalWidth, (2 * op.r) / photo.naturalHeight);
    const pw = photo.naturalWidth * k;
    const ph = photo.naturalHeight * k;
    ctx.drawImage(photo, op.cx - pw / 2, op.cy - ph / 2, pw, ph);
  } else {
    const g = ctx.createLinearGradient(op.cx - op.r, op.cy - op.r, op.cx + op.r, op.cy + op.r);
    g.addColorStop(0, '#3a3a3e');
    g.addColorStop(1, '#1c1c1f');
    ctx.fillStyle = g;
    ctx.fillRect(op.cx - op.r, op.cy - op.r, op.r * 2, op.r * 2);
    ctx.fillStyle = WHITE;
    ctx.font = f(600, Math.round(op.r * 0.75));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initials, op.cx, op.cy + op.r * 0.04);
  }
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(op.cx, op.cy, op.r, 0, Math.PI * 2);
  ctx.stroke();
}

/**
 * Draws the card on a canvas CARD_SS * `scale` times its logical size (`w` by `h`, from `fitAbout`): a
 * dark anodised plate (a touch lighter in the middle) with a machined hairline border following its
 * rounded corners. `corner` is the physical corner radius in layout px at scale 1.
 */
export function drawAbout(
  ctx: CanvasRenderingContext2D,
  ops: Op[],
  w: number,
  h: number,
  scale: number,
  o: { initials: string; corner: number; photo?: HTMLImageElement },
) {
  ctx.save();
  ctx.setTransform(CARD_SS * scale, 0, 0, CARD_SS * scale, 0, 0);
  const inset = 20 / scale;
  const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
  g.addColorStop(0, '#121214');
  g.addColorStop(1, '#09090a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1.5 / scale;
  ctx.beginPath();
  rrect(ctx, inset, inset, w - 2 * inset, h - 2 * inset, Math.max(4, o.corner - 20) / scale);
  ctx.stroke();
  for (const op of ops) {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    if (op.kind === 'text') {
      ctx.font = op.font;
      ctx.fillStyle = op.color;
      if (op.tracking) drawTracked(ctx, op.text, 0, op.y, op.tracking, op.x);
      else ctx.fillText(op.text, op.x, op.y);
    } else if (op.kind === 'pill') {
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      rrect(ctx, op.x, op.y, op.w, op.h, op.h / 2);
      ctx.fill();
      ctx.stroke();
    } else if (op.kind === 'dot') {
      ctx.fillStyle = op.color;
      ctx.beginPath();
      ctx.arc(op.cx, op.cy, op.r, 0, Math.PI * 2);
      ctx.fill();
    } else if (op.kind === 'rule') {
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.fillRect(op.x, op.y, op.w, op.h);
    } else portrait(ctx, op, o.initials, o.photo);
  }
  ctx.restore();
}
