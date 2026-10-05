import * as THREE from 'three';

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

/** Horizontally brushed roughness streaks (grayscale). Engraved pixels are rougher. */
export function brushedRoughness(w: number, h: number, engrave?: HTMLCanvasElement): THREE.CanvasTexture {
  const c = canvas(w, h);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = 'rgb(88,88,88)';
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 9000; i++) {
    const g = 60 + Math.random() * 70;
    ctx.fillStyle = `rgba(${g},${g},${g},${0.06 + Math.random() * 0.12})`;
    const len = 80 + Math.random() * w * 0.7;
    ctx.fillRect(Math.random() * w - len / 2, Math.random() * h, len, 1 + Math.random() * 1.5);
  }
  if (engrave) {
    ctx.globalCompositeOperation = 'lighten';
    ctx.globalAlpha = 0.9;
    ctx.drawImage(engrave, 0, 0, w, h);
  }
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

/**
 * Engraving height map (white = surface, black = groove) + roughness mask.
 * Just the name and role, centred.
 */
export function engravingMaps(w: number, h: number, scale = 1) {
  const height = canvas(w, h);
  const hc = height.getContext('2d')!;
  hc.fillStyle = '#fff';
  hc.fillRect(0, 0, w, h);
  hc.fillStyle = '#000';
  hc.textBaseline = 'alphabetic';
  const u = (w / 100) * scale; // layout unit

  // Baseline sits just above centre so name + role together read as centred.
  const y = h / 2 - u * 0.1;
  hc.font = `500 ${u * 4.4}px ${FONT}`;
  drawTracked(hc, 'HALIL BAGOSI', w / 2, y, u * 0.85);
  hc.font = `500 ${u * 1.35}px ${FONT}`;
  drawTracked(hc, 'SOFTWARE ENGINEER', w / 2, y + u * 3.3, u * 0.7);

  const mask = canvas(w, h);
  const mc = mask.getContext('2d')!;
  mc.drawImage(height, 0, 0);
  const d = mc.getImageData(0, 0, w, h);
  for (let i = 0; i < d.data.length; i += 4) {
    const g = ((255 - d.data[i]) / 255) * 200;
    d.data[i] = d.data[i + 1] = d.data[i + 2] = g;
  }
  mc.putImageData(d, 0, 0);
  return { height, mask };
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
export function specSheetTexture(s: SpecSheet, widthUnits: number, textScale = 1) {
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

    ctx.font = `600 18px ${FONT}`;
    ctx.fillStyle = s.eyebrowColor;
    if (draw) drawTracked(ctx, s.eyebrow.toUpperCase(), 0, y + 12, 2.2, pad);
    y += 24 + 6;
    text(s.title, `600 58px ${FONT}`, '#ffffff', pad, 66);
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
      const pair = s.rows[i].half && s.rows[i + 1]?.half ? [s.rows[i], s.rows[++i]] : [s.rows[i]];
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
