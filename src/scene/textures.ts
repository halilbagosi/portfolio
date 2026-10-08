import * as THREE from 'three';
import { drawGlyph, glyphFor } from './glyphs';

export const FONT = `ui-sans-serif, -apple-system, "SF Pro Display", Inter, "Helvetica Neue", Arial, sans-serif`;

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Draws text with manual tracking (ctx.letterSpacing is not available everywhere). */
export function drawTracked(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  y: number,
  tracking: number,
  /** Start x for left-aligned text (otherwise centred on cx). */
  left?: number,
) {
  const chars = [...text];
  const widths = chars.map((ch) => ctx.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + tracking * (chars.length - 1);
  let x = left ?? cx - total / 2;
  ctx.textAlign = 'left';
  chars.forEach((ch, i) => {
    ctx.fillText(ch, x, y);
    x += widths[i] + tracking;
  });
}

/**
 * Bead-blasted anodised aluminium (a MacBook's finish): an even, fine-grained matte. Per-pixel
 * noise around the base roughness and no direction, so the sheen is soft, with no streaks.
 */
export function beadBlastRoughness(w: number, h: number, base = 0.52, spread = 0.05): THREE.CanvasTexture {
  const c = canvas(w, h);
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const g = Math.round((base + (Math.random() * 2 - 1) * spread) * 255);
    img.data[i] = img.data[i + 1] = img.data[i + 2] = g;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 8;
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

/** Converts a grayscale height canvas (white = raised) into a tangent-space normal map. */
export function heightToNormal(src: HTMLCanvasElement, strength: number): THREE.CanvasTexture {
  const { width: w, height: h } = src;
  const s = src.getContext('2d')!.getImageData(0, 0, w, h).data;
  const out = canvas(w, h);
  const octx = out.getContext('2d')!;
  const img = octx.createImageData(w, h);
  const raw = (x: number, y: number) => s[(Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))) * 4] / 255;
  // 3x3 blur of the height field (ctx.filter is not available in Safari).
  const H = (x: number, y: number) =>
    (raw(x - 1, y - 1) + raw(x, y - 1) + raw(x + 1, y - 1) + raw(x - 1, y) + raw(x, y) + raw(x + 1, y) + raw(x - 1, y + 1) + raw(x, y + 1) + raw(x + 1, y + 1)) / 9;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = -(H(x + 1, y) - H(x - 1, y)) * strength;
      const ny = (H(x, y + 1) - H(x, y - 1)) * strength;
      const l = Math.hypot(nx, ny, 1);
      const i = (y * w + x) * 4;
      img.data[i] = ((nx / l) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((ny / l) * 0.5 + 0.5) * 255;
      img.data[i + 2] = ((1 / l) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(out);
  t.anisotropy = 8;
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

/** A rectangle on a canvas, in its pixels. */
export interface PxBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface Engraving {
  /** Height map: white = surface, black = groove. */
  height: HTMLCanvasElement;
  /** Where the metal is cut (grey 0–200), for shading and for the laser. */
  mask: HTMLCanvasElement;
  /** Each engraved line's ink box, in the order the laser takes them: name, role, socials. */
  lines: PxBox[];
  /** Each social's box, with its link. */
  links: (PxBox & { href: string })[];
}

/** Width of text as drawTracked sets it. */
function trackedWidth(ctx: CanvasRenderingContext2D, text: string, tracking: number) {
  const chars = [...text];
  return chars.reduce((a, ch) => a + ctx.measureText(ch).width, 0) + tracking * (chars.length - 1);
}

/**
 * Engraving maps: name and role centred, and the socials as engraved logos (no text) in a row along the bottom.
 */
export function engravingMaps(
  w: number,
  h: number,
  name: string,
  role: string,
  socials: { text: string; href: string }[],
  o: { scale?: number; stack?: boolean } = {},
): Engraving {
  const height = canvas(w, h);
  const hc = height.getContext('2d')!;
  hc.fillStyle = '#fff';
  hc.fillRect(0, 0, w, h);
  hc.fillStyle = '#000';
  hc.textBaseline = 'alphabetic';
  const u = (w / 100) * (o.scale ?? 1); // layout unit
  const stack = !!o.stack;
  const type = {
    name: { size: u * 4.4, track: u * 0.85 },
    role: stack ? { size: u * 2.1, track: u * 1.0 } : { size: u * 1.35, track: u * 0.7 },
  };
  const font = (t: { size: number }) => `500 ${t.size}px ${FONT}`;
  /** Widest a line may be: it stays inside the lid's rounded corners. */
  const maxW = w * 0.86;

  // Name and role are centred on the lid; the socials sit along its bottom as logos only.
  const roleAt = u * (stack ? 4.2 : 3.4);
  const yName = h / 2 + (type.name.size * 0.74 - roleAt) / 2;

  const pad = Math.ceil(u * 0.3);
  const box = (x: number, width: number, y: number, size: number): PxBox => ({
    x0: Math.max(0, x - pad),
    x1: Math.min(w, x + width + pad),
    y0: Math.max(0, y - size * 0.8 - pad),
    y1: Math.min(h, y + size * 0.25 + pad),
  });
  const lines: PxBox[] = [];
  const links: (PxBox & { href: string })[] = [];
  const line = (text: string, y: number, t: { size: number; track: number }) => {
    hc.font = font(t);
    const k = Math.min(1, maxW / trackedWidth(hc, text, t.track));
    const f = { size: t.size * k, track: t.track * k };
    hc.font = font(f);
    const tw = trackedWidth(hc, text, f.track);
    drawTracked(hc, text, w / 2, y, f.track);
    lines.push(box(w / 2 - tw / 2, tw, y, f.size));
  };
  line(name.toUpperCase(), yName, type.name);
  line(role.toUpperCase(), yName + roleAt, type.role);

  // Logos: a row near the bottom edge, shrunk if there are too many to fit. Each link's hit area is
  // its logo plus half the gap each side, and well above and below it, so it is easy to tap.
  if (socials.length) {
    const n = socials.length;
    const natural = u * (stack ? 6 : 4.6);
    const k = Math.min(1, maxW / (n * natural * 2.5 - natural * 1.5));
    const size = natural * k;
    const gap = size * 1.5;
    const cy = h - u * (stack ? 10 : 9);
    hc.fillStyle = hc.strokeStyle = '#000';
    let x = w / 2 - (n * size + (n - 1) * gap) / 2;
    for (const s of socials) {
      drawGlyph(hc, glyphFor(s.href), x + size / 2, cy, size);
      lines.push({ x0: Math.max(0, x - pad), x1: Math.min(w, x + size + pad), y0: cy - size / 2 - pad, y1: Math.min(h, cy + size / 2 + pad) });
      links.push({
        x0: Math.max(0, x - gap / 2),
        x1: Math.min(w, x + size + gap / 2),
        y0: Math.max(0, cy - size * 1.2),
        y1: Math.min(h, cy + size * 1.2),
        href: s.href,
      });
      x += size + gap;
    }
  }

  const mask = canvas(w, h);
  const mc = mask.getContext('2d')!;
  mc.drawImage(height, 0, 0);
  const d = mc.getImageData(0, 0, w, h);
  for (let i = 0; i < d.data.length; i += 4) {
    const g = ((255 - d.data[i]) / 255) * 200;
    d.data[i] = d.data[i + 1] = d.data[i + 2] = g;
  }
  mc.putImageData(d, 0, 0);
  return { height, mask, lines, links };
}

export interface ChipStyle {
  font: string;
  color: string;
  padX: number;
  padY: number;
  lineHeight: number;
}

/** Text label texture. Returns size in world units (PX per unit). */
export const PX = 220;
/**
 * Text canvases are drawn at this multiple of PX. On screen a world unit spans ~300 device
 * pixels on a 2x desktop and more on a 3x phone, so 1x text textures would be magnified (soft);
 * mipmaps take care of the cases where they're shown smaller.
 */
const SS = 2.5;

/**
 * Text lies on a plate seen at an angle, so the GPU picks a blurrier mip level than the text's
 * on-screen size needs. Bias label sampling toward the sharper level (WebGL has no sampler LOD
 * bias, so it goes in the shader).
 */
export const TEXT_LOD_BIAS = -0.6;
const sharpMap = THREE.ShaderChunk.map_fragment.replace('texture2D( map, vMapUv )', `texture2D( map, vMapUv, ${TEXT_LOD_BIAS.toFixed(2)} )`);
export function sharpenText<T extends THREE.Material>(m: T): T {
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', sharpMap);
  };
  m.customProgramCacheKey = () => 'sharp-text';
  return m;
}

/** A canvas of w x h layout px, backed at SS resolution (draw in layout px). */
function textCanvas(w: number, h: number) {
  const c = canvas(Math.ceil(w * SS), Math.ceil(h * SS));
  const ctx = c.getContext('2d')!;
  ctx.scale(SS, SS);
  return { c, ctx };
}

export function labelTexture(lines: string[], style: ChipStyle, maxWidthUnits?: number) {
  const meas = canvas(8, 8).getContext('2d')!;
  meas.font = style.font;
  let wrapped = lines;
  if (maxWidthUnits) {
    const maxPx = maxWidthUnits * PX - style.padX * 2;
    wrapped = [];
    for (const line of lines) {
      let cur = '';
      for (const word of line.split(' ')) {
        const next = cur ? `${cur} ${word}` : word;
        if (meas.measureText(next).width > maxPx && cur) {
          wrapped.push(cur);
          cur = word;
        } else cur = next;
      }
      wrapped.push(cur);
    }
  }
  const textW = Math.max(...wrapped.map((l) => meas.measureText(l).width));
  const wpx = Math.ceil(textW + style.padX * 2);
  const hpx = Math.ceil(wrapped.length * style.lineHeight + style.padY * 2);
  const { c, ctx } = textCanvas(wpx, hpx);
  ctx.font = style.font;
  ctx.fillStyle = style.color;
  ctx.textBaseline = 'middle';
  wrapped.forEach((l, i) => ctx.fillText(l, style.padX, style.padY + style.lineHeight * (i + 0.5)));
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  return { tex, w: wpx / PX, h: hpx / PX };
}

/** Square token texture: big initial on a soft plate. */
export function tokenTexture(label: string, tint: string) {
  const s = 256;
  const c = canvas(s, s);
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, s, s);
  g.addColorStop(0, '#2a2d33');
  g.addColorStop(1, '#14161a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  ctx.strokeStyle = tint;
  ctx.lineWidth = 6;
  ctx.strokeRect(14, 14, s - 28, s - 28);
  ctx.fillStyle = '#e8eaee';
  ctx.font = `600 ${s * 0.5}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label.charAt(0).toUpperCase(), s / 2, s / 2 + 8);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export interface SpecSheet {
  eyebrow: string;
  eyebrowColor: string;
  title: string;
  body: string;
  /** Label/value rows; consecutive `half` rows share a line as two columns. */
  rows: { label: string; value: string; dot?: string; half?: boolean }[];
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxPx: number) {
  const out: string[] = [];
  let cur = '';
  for (const word of text.split(' ')) {
    const next = cur ? `${cur} ${word}` : word;
    if (ctx.measureText(next).width > maxPx && cur) {
      out.push(cur);
      cur = word;
    } else cur = next;
  }
  out.push(cur);
  return out;
}

/**
 * One panel of project facts, set like a spec sheet: eyebrow, title and purpose, a hairline,
 * then small tracked labels over plain values. Hierarchy from type alone; colour only where it
 * carries meaning (the kind, and a status dot).
 */
/** pairAll: a wide sheet sets every two rows side by side, wrapping within their columns. */
export function specSheetTexture(s: SpecSheet, widthUnits: number, textScale = 1, pairAll = false) {
  const W = Math.round((widthUnits * PX) / textScale);
  const pad = 42;
  const inner = W - pad * 2;
  const colGap = 24;
  const label = `600 15px ${FONT}`;
  const value = `500 23px ${FONT}`;

  const layout = (ctx: CanvasRenderingContext2D, draw: boolean) => {
    let y = pad;
    const text = (t: string, font: string, color: string, x: number, lineH: number) => {
      ctx.font = font;
      ctx.fillStyle = color;
      if (draw) ctx.fillText(t, x, y + lineH / 2);
      y += lineH;
    };
    ctx.textBaseline = 'middle';

    const eyebrow = s.eyebrow.toUpperCase();
    ctx.font = `600 18px ${FONT}`;
    const ew = ctx.measureText(eyebrow).width + 2.2 * Math.max(0, [...eyebrow].length - 1);
    if (ew > inner) ctx.font = `600 ${Math.floor((18 * inner) / ew)}px ${FONT}`;
    ctx.fillStyle = s.eyebrowColor;
    if (draw) drawTracked(ctx, eyebrow, 0, y + 12, 2.2, pad);
    y += 24 + 6;
    // A long name in a narrow sheet steps down rather than running past the edge.
    ctx.font = `600 58px ${FONT}`;
    const ts = Math.min(58, Math.floor((58 * inner) / Math.max(1, ctx.measureText(s.title).width)));
    text(s.title, `600 ${ts}px ${FONT}`, '#ffffff', pad, 66 * (ts / 58));
    y += 6;
    ctx.font = `400 24px ${FONT}`;
    for (const l of wrapText(ctx, s.body, inner)) text(l, `400 24px ${FONT}`, 'rgba(245,245,247,0.72)', pad, 33);

    y += 24;
    if (draw) {
      ctx.fillStyle = 'rgba(255,255,255,0.13)';
      ctx.fillRect(pad, y, inner, 1.5);
    }
    y += 1.5 + 22;

    for (let i = 0; i < s.rows.length; i++) {
      // Half rows share a line only where both values fit their column; a narrow sheet stacks them.
      ctx.font = value;
      const fits = (r: SpecSheet['rows'][number]) => ctx.measureText(r.value).width + (r.dot ? 20 : 0) <= (inner - colGap) / 2;
      const next = s.rows[i + 1];
      const pair = next && (pairAll || (s.rows[i].half && next.half && fits(s.rows[i]) && fits(next))) ? [s.rows[i], s.rows[++i]] : [s.rows[i]];
      const colW = pair.length === 2 ? (inner - colGap) / 2 : inner;
      const top = y;
      let bottom = y;
      pair.forEach((r, k) => {
        const x = pad + k * (colW + colGap);
        y = top;
        ctx.font = label;
        ctx.fillStyle = 'rgba(235,235,245,0.42)';
        if (draw) drawTracked(ctx, r.label.toUpperCase(), 0, y + 9, 1.6, x);
        y += 18 + 6;
        ctx.font = value;
        const dotW = r.dot ? 20 : 0;
        if (r.dot && draw) {
          ctx.fillStyle = r.dot;
          ctx.beginPath();
          ctx.arc(x + 5, y + 15, 5, 0, Math.PI * 2);
          ctx.fill();
        }
        for (const l of wrapText(ctx, r.value, colW - dotW)) text(l, value, 'rgba(245,245,247,0.9)', x + dotW, 30);
        bottom = Math.max(bottom, y);
      });
      y = bottom + 18;
    }
    return y - 18 + pad;
  };

  const meas = canvas(8, 8).getContext('2d')!;
  const H = Math.ceil(layout(meas, false));
  const { c, ctx } = textCanvas(W, H);
  layout(ctx, true);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  return { tex, w: (W * textScale) / PX, h: (H * textScale) / PX };
}
