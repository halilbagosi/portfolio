import type { About, Social } from '../content/schema';
import { CORNER_K, CORNER_N } from './shaders';
import { drawTracked, FONT } from './textures';

/** Layout pixels per world unit (the labels' scale), and the canvas's backing scale on top. */
export const CARD_PX = 220;
export const CARD_SS = 2;

/** Printed on a black box: white for what matters, greys for the rest. */
const WHITE = '#f5f5f7';
const GREY = '#a1a1a6';
const DIM = '#86868b';
const FAINT = '#6e6e73';
const GREEN = '#30d158';
export const LINK = '#2997ff';
const f = (weight: number, size: number) => `${weight} ${size}px ${FONT}`;
const HEAD = f(600, 18);
const ITEM = f(600, 18);
const NOTE = f(400, 17);
const META = f(400, 16);
const BODY = f(400, 18);
const FINE = f(400, 13);
/** Between the header and the sections, and above the fine print. */
const GAP = 32;
/** Inside a section, above and below its content; and between the wide card's columns. */
const IN = 20;
const COL_GAP = 64;
/** A link's touch target: a row this tall (the card is a third of its size on a phone). */
const TAP_H = 48;

/** One thing to draw, in layout px (y down; text at its baseline). */
export type Op =
  | { kind: 'text'; x: number; y: number; text: string; font: string; color: string; tracking: number }
  /** The portrait, as an app icon: a rounded square of side 2r centred on (cx, cy). */
  | { kind: 'photo'; cx: number; cy: number; r: number }
  | { kind: 'rule'; x: number; y: number; w: number; h: number }
  /** A small printed regulatory-style mark, s px square: a crossed-out bin, or a ring. */
  | { kind: 'mark'; x: number; y: number; s: number; glyph: 'bin' | 'ring' };

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
    ...a.achievements.map((t) => `Achievement: ${[t.title, t.detail, t.year].filter(Boolean).join(', ')}.`),
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

/** The city: a location's first part ("Kavajë, Albania" → "Kavajë"). */
const cityOf = (location: string) => location.split(',')[0].trim() || location;

/** Where a layout pass draws to: the card itself, or a scratch pen used only to measure a block's height. */
interface Pen {
  ops: Op[];
  links: CardLink[];
}

/** One entry of a list section: a title, the line under it, and a date set flush right. */
interface Entry {
  title: string;
  sub: string;
  meta: string;
}

/** A run of inline text (a fact, a link) for `flow`. */
interface Run {
  t: string;
  font: string;
  color: string;
  href?: string;
}

/** The fine print's height: its marks, with the line beside them. */
const FOOT_H = 24;

/**
 * The About card, laid out like a tech-specs page: the person (portrait, name, role, key facts) across
 * the top, then sections, each a hairline, a heading on the left and its content on the right: About,
 * Experience, Achievements, Skills, Contact. Wide cards balance the sections over two columns; tall
 * ones stack them. The fine print rests on the bottom margin.
 *
 * Experience and Achievements show at most `limit` entries each (newest / most notable first, as listed),
 * then "+ N more". `fitAbout` lowers it only when the card cannot fit them all even at its smallest scale.
 * Returns `bottom`, how far down the content reaches with the fine print packed up under the rest (what
 * has to fit inside the padded card), and `hidden`, how many entries the limit left out.
 * Pure: `measure` supplies text widths, so it is tested without a canvas.
 */
export function layoutAbout(
  input: CardInput,
  w: number,
  h: number,
  measure: Measure,
  limit = Infinity,
): { ops: Op[]; links: CardLink[]; bottom: number; hidden: number } {
  const card: Pen = { ops: [], links: [] };
  const a = input.about;
  const wide = w > h;
  const pad = cardPad(w, h);
  let hidden = 0;

  const text = (p: Pen, x: number, y: number, t: string, font: string, color: string) => {
    p.ops.push({ kind: 'text', x, y, text: t, font, color, tracking: 0 });
    return measure(t, font);
  };

  /**
   * Runs set one after another from (x, y), wrapping at colW: facts with a separator between them, or links
   * with a gap. Rows are rowH apart; a link's target is a full row tall. Returns the y below the last row.
   */
  const flow = (p: Pen, x: number, y: number, colW: number, runs: Run[], size: number, rowH: number, sep: string, gap = 0) => {
    let cx = x;
    let row = 0;
    runs.forEach((r, i) => {
      const t = fit(r.t, r.font, colW, measure);
      const tw = measure(t, r.font);
      const sw = i && sep ? measure(sep, r.font) : 0;
      if (i && cx + sw + gap + tw > x + colW) {
        cx = x;
        row++;
      } else if (i) {
        if (sep) text(p, cx, y + row * rowH + size, sep, r.font, DIM);
        cx += sw + gap;
      }
      const base = y + row * rowH + size;
      text(p, cx, base, t, r.font, r.color);
      if (r.href) {
        // Centred on the text's x-height, reaching half the gap sideways: neighbouring targets never overlap.
        const mid = base - size * 0.35;
        p.links.push({ href: r.href, x0: (cx - gap / 2 + 2) / w, y0: (mid - rowH / 2) / h, x1: (cx + tw + gap / 2 - 2) / w, y1: (mid + rowH / 2) / h });
      }
      cx += tw;
    });
    return y + row * rowH + size + size * 0.25;
  };

  /** Portrait, name and role, then the key facts under them. Returns the y below. */
  const header = (p: Pen, x: number, y: number, colW: number) => {
    const s = 88;
    p.ops.push({ kind: 'photo', cx: x + s / 2, cy: y + s / 2, r: s / 2 });
    const tx = x + s + 24;
    const tw = colW - s - 24;
    text(p, tx, y + 44, fit(input.name, f(600, 40), tw, measure), f(600, 40), WHITE);
    text(p, tx, y + 76, fit(input.role, f(400, 21), tw, measure), f(400, 21), GREY);
    const fact = f(400, 17);
    const facts: Run[] = [
      { t: a.availability, font: f(500, 17), color: a.available ? GREEN : GREY },
      { t: `${a.years}+ years experience`, font: fact, color: GREY },
      { t: a.location, font: fact, color: GREY },
      ...(a.workPreference ? [{ t: a.workPreference, font: fact, color: GREY }] : []),
    ];
    return flow(p, x, y + s + 24, colW, facts, 17, 26, '  ·  ');
  };

  /** Entries, each a title (with its date flush right) and a line under it; then "+ N more" if cut short. */
  const list = (p: Pen, x: number, y: number, colW: number, entries: Entry[]) => {
    const shown = entries.slice(0, limit);
    hidden += entries.length - shown.length;
    shown.forEach((e, i) => {
      if (i) y += 18;
      const mw = e.meta ? measure(fit(e.meta, META, colW / 2, measure), META) : 0;
      const titles = wrap(e.title, ITEM, colW - (mw ? mw + 16 : 0), 2, measure);
      if (e.meta) text(p, x + colW - mw, y + 18, fit(e.meta, META, colW / 2, measure), META, DIM);
      titles.forEach((t, j) => text(p, x, y + 18 + j * 24, t, ITEM, WHITE));
      y += 18 + (titles.length - 1) * 24;
      for (const l of e.sub ? wrap(e.sub, NOTE, colW, 2, measure) : []) {
        y += 24;
        text(p, x, y, l, NOTE, GREY);
      }
      y += 5;
    });
    const more = entries.length - shown.length;
    if (more) {
      y += 18;
      text(p, x, y + 16, `+ ${more} more`, f(400, 16), DIM);
      y += 20;
    }
    return y;
  };

  const paragraph = (p: Pen, x: number, y: number, colW: number, t: string, maxLines: number) => {
    const lines = wrap(t, BODY, colW, maxLines, measure);
    lines.forEach((l, i) => text(p, x, y + 18 + i * 27, l, BODY, GREY));
    return y + 18 + (lines.length - 1) * 27 + 5;
  };

  type Body = (p: Pen, x: number, y: number, colW: number) => number;
  const contacts = contactLinks(a, input.socials);
  const sections: [string, Body][] = [
    ['About', (p, x, y, cw) => paragraph(p, x, y, cw, a.bio, 8)],
    ...(a.timeline.length
      ? [['Experience', (p, x, y, cw) => list(p, x, y, cw, a.timeline.map((t) => ({ title: t.role, sub: t.org, meta: t.period })))] as [string, Body]]
      : []),
    ...(a.achievements.length
      ? [['Achievements', (p, x, y, cw) => list(p, x, y, cw, a.achievements.map((t) => ({ title: t.title, sub: t.detail, meta: t.year })))] as [string, Body]]
      : []),
    ['Skills', (p, x, y, cw) => paragraph(p, x, y, cw, a.skills.join(', '), 5)],
    [
      'Contact',
      (p, x, y, cw) =>
        flow(p, x, y, cw, contacts.map((l) => ({ t: `${l.label} ›`, font: f(500, 18), color: LINK, href: l.href })), 18, TAP_H, '', 32),
    ],
  ];

  /** A section: a hairline, its heading on the left and its body on the right. Returns the y below. */
  const section = (p: Pen, x: number, y: number, colW: number, [title, body]: [string, Body]) => {
    const hc = Math.min(180, Math.round(colW * 0.3));
    p.ops.push({ kind: 'rule', x, y, w: colW, h: 1 });
    text(p, x, y + IN + 18, fit(title, HEAD, hc - 16, measure), HEAD, WHITE);
    return Math.max(y + IN + 22, body(p, x + hc, y + IN, colW - hc)) + IN;
  };

  /** The fine print: the marks, then "Designed by … in …" beside them, on one line. */
  const footer = (p: Pen, x: number, y: number, colW: number) => {
    const initials = initialsOf(input.name);
    p.ops.push({ kind: 'mark', x, y, s: FOOT_H, glyph: 'bin' });
    p.ops.push({ kind: 'mark', x: x + FOOT_H + 10, y, s: FOOT_H, glyph: 'ring' });
    const mf = f(600, 8);
    text(p, x + FOOT_H + 10 + (FOOT_H - measure(initials, mf)) / 2, y + FOOT_H / 2 + 3, initials, mf, FAINT);
    const tx = x + 2 * FOOT_H + 26;
    text(p, tx, y + 17, fit(`Designed by ${input.name} in ${cityOf(a.location)}. Assembled in the browser.`, FINE, x + colW - tx, measure), FINE, FAINT);
  };

  const inner = w - pad * 2;
  let y = header(card, pad, pad, inner) + GAP;
  let flowBottom: number;
  if (wide) {
    // Two columns, split where their heights come closest (a section is measured on a scratch pen).
    const cw = (inner - COL_GAP) / 2;
    const heights = sections.map((s) => {
      const before = hidden;
      const ht = section({ ops: [], links: [] }, 0, 0, cw, s);
      hidden = before;
      return ht;
    });
    const sum = (from: number, to: number) => heights.slice(from, to).reduce((t, v) => t + v, 0);
    let split = 1;
    for (let k = 1; k < sections.length; k++)
      if (Math.max(sum(0, k), sum(k, sections.length)) < Math.max(sum(0, split), sum(split, sections.length))) split = k;
    let ly = y;
    let ry = y;
    sections.forEach((s, i) => (i < split ? (ly = section(card, pad, ly, cw, s)) : (ry = section(card, pad + cw + COL_GAP, ry, cw, s))));
    flowBottom = Math.max(ly, ry);
  } else {
    for (const s of sections) y = section(card, pad, y, inner, s);
    flowBottom = y;
  }
  footer(card, pad, Math.max(flowBottom + GAP, h - pad - FOOT_H), inner);
  return { ...card, bottom: flowBottom + GAP + FOOT_H, hidden };
}

/** The scales the card is drawn at, and the step they are searched in. */
export const FIT_MIN = 0.7;
export const FIT_MAX = 1.6;
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
  /** The entries left out to make it fit (0 when everything is shown). */
  hidden: number;
}

/**
 * Lays the card out on a logical canvas of `w / scale` by `h / scale`, drawn scaled to the card: above 1
 * the type grows to fill a sparse card, below 1 it shrinks to fit a full one. Picks the largest scale in
 * FIT_MIN..FIT_MAX whose content fits inside the card's padding and loses no more text to ellipses than
 * the scale-1 layout does (a narrower logical column cuts text that was whole, and the cut text is
 * shorter, which would make a bigger scale look like it fits). If nothing fits with every entry shown,
 * shows fewer Experience and Achievements entries, one at a time, until it does. Link rects are fractions
 * of the card, so they stay valid.
 */
export function fitAbout(input: CardInput, w: number, h: number, measure: Measure): FittedAbout {
  const baseCuts = cutCount(layoutAbout(input, w, h, measure).ops);
  const most = Math.max(1, input.about.timeline.length, input.about.achievements.length);
  const steps = Math.round((FIT_MAX - FIT_MIN) / FIT_STEP);
  for (let limit = most; limit >= 1; limit--)
    for (let i = steps; i >= 0; i--) {
      const scale = Math.round((FIT_MIN + i * FIT_STEP) * 1e6) / 1e6;
      const lw = w / scale;
      const lh = h / scale;
      const { ops, links, bottom, hidden } = layoutAbout(input, lw, lh, measure, limit);
      if (bottom <= lh - cardPad(lw, lh) && cutCount(ops) <= baseCuts) return { ops, links, scale, lw, lh, hidden };
    }
  const lw = w / FIT_MIN;
  const lh = h / FIT_MIN;
  const { ops, links, hidden } = layoutAbout(input, lw, lh, measure, 1);
  return { ops, links, scale: FIT_MIN, lw, lh, hidden };
}

/** A rounded rectangle with superellipse corners (continuous curvature, like the box's own), as a path on ctx. */
function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  r = Math.min(r * CORNER_K, w / 2, h / 2);
  const k = 2 / CORNER_N;
  const SEG = 12;
  const corner = (cx: number, cy: number, a0: number) => {
    for (let i = 0; i <= SEG; i++) {
      const a = a0 + (i / SEG) * (Math.PI / 2);
      const c = Math.cos(a);
      const s = Math.sin(a);
      const px = cx + r * Math.sign(c) * Math.abs(c) ** k;
      const py = cy + r * Math.sign(s) * Math.abs(s) ** k;
      if (a0 === -Math.PI / 2 && i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
  };
  corner(x + w - r, y + r, -Math.PI / 2); // canvas y runs down: this one is the top right, then clockwise
  corner(x + w - r, y + h - r, 0);
  corner(x + r, y + h - r, Math.PI / 2);
  corner(x + r, y + r, Math.PI);
  ctx.closePath();
}

/** The portrait as an app icon: a superellipse square, cover-cropped. */
function portrait(ctx: CanvasRenderingContext2D, op: Extract<Op, { kind: 'photo' }>, initials: string, photo?: HTMLImageElement) {
  const x = op.cx - op.r;
  const y = op.cy - op.r;
  const s = op.r * 2;
  const icon = () => {
    ctx.beginPath();
    rrect(ctx, x, y, s, s, s * 0.16);
  };
  ctx.save();
  icon();
  ctx.clip();
  if (photo?.naturalWidth) {
    const k = Math.max(s / photo.naturalWidth, s / photo.naturalHeight);
    const pw = photo.naturalWidth * k;
    const ph = photo.naturalHeight * k;
    ctx.drawImage(photo, op.cx - pw / 2, op.cy - ph / 2, pw, ph);
  } else {
    const g = ctx.createLinearGradient(x, y, x, y + s);
    g.addColorStop(0, '#3a3a3e');
    g.addColorStop(1, '#1c1c1f');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, s, s);
    ctx.fillStyle = WHITE;
    ctx.font = f(600, Math.round(op.r * 0.75));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initials, op.cx, op.cy + op.r * 0.04);
  }
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 1;
  icon();
  ctx.stroke();
}

/** The fine print's marks, stroked thin like printed regulatory marks. */
function mark(ctx: CanvasRenderingContext2D, op: Extract<Op, { kind: 'mark' }>) {
  const { x, y, s } = op;
  const P = (u: number, v: number): [number, number] => [x + s * u, y + s * v];
  const path = (...pts: [number, number][]) => pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
  ctx.save();
  ctx.strokeStyle = FAINT;
  ctx.lineWidth = 1.4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  if (op.glyph === 'ring') {
    ctx.arc(x + s / 2, y + s / 2, s / 2 - 1, 0, Math.PI * 2);
  } else {
    // The crossed-out wheelie bin: lid and handle, a tapering body, a wheel, then the cross over it all.
    path(P(0.2, 0.24), P(0.8, 0.24));
    path(P(0.42, 0.24), P(0.42, 0.16), P(0.58, 0.16), P(0.58, 0.24));
    path(P(0.26, 0.3), P(0.32, 0.82), P(0.68, 0.82), P(0.74, 0.3));
    ctx.closePath();
    ctx.moveTo(...P(0.72, 0.9));
    ctx.arc(x + s * 0.66, y + s * 0.9, s * 0.06, 0, Math.PI * 2);
    path(P(0.12, 0.08), P(0.88, 0.96));
    path(P(0.88, 0.08), P(0.12, 0.96));
  }
  ctx.stroke();
  ctx.restore();
}

/**
 * Draws the card on a canvas CARD_SS * `scale` times its logical size (`w` by `h`, from `fitAbout`): the
 * matte black of a printed box and everything printed on it. `corner` is the physical corner
 * radius in layout px at scale 1 (unused by the print, kept for callers).
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
  const g = ctx.createRadialGradient(w / 2, h * 0.45, 0, w / 2, h * 0.45, Math.max(w, h) * 0.75);
  g.addColorStop(0, '#0f0f10');
  g.addColorStop(1, '#0a0a0b');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  for (const op of ops) {
    if (op.kind === 'rule') {
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      ctx.fillRect(op.x, op.y, op.w, op.h);
    } else if (op.kind === 'mark') mark(ctx, op);
    else if (op.kind === 'photo') portrait(ctx, op, o.initials, o.photo);
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  for (const op of ops) {
    if (op.kind !== 'text') continue;
    ctx.font = op.font;
    ctx.fillStyle = op.color;
    if (op.tracking) drawTracked(ctx, op.text, 0, op.y, op.tracking, op.x);
    else ctx.fillText(op.text, op.x, op.y);
  }
  ctx.restore();
}
