import * as THREE from 'three';
import { Spring } from '../anim/springs';
import type { Project } from '../config/projects';
import { CARD_DEPTH, TOP_Y, WELL_RADIUS } from './box';
import type { Rect } from './layout';
import { sdRoundGLSL } from './shaders';
import { CardStack, shownHeight } from './stack';
import { FONT, labelTexture, sharpenText } from './textures';
import { kindTint } from './tints';

const glowGLSL = /* glsl */ `
uniform vec3 uA;
uniform vec3 uB;
uniform float uGlow;
uniform float uDim;
uniform float uReveal;
uniform float uTime;
uniform vec2 uSize;
vec3 glowColor(vec2 p) {
  float t = 0.5 + 0.7 * (p.x / max(uSize.x, 0.001)) + 0.1 * sin(uTime * 0.3 + p.y * 2.0);
  vec3 c = mix(uA, uB, clamp(t, 0.0, 1.0));
  return mix(c, vec3(dot(c, vec3(0.2126, 0.7152, 0.0722))), 0.25); // real light is a touch less saturated
}
float dimK() { return mix(1.0, 0.3, uDim) * uReveal; }
`;

/**
 * The inside of a section, drawn as one surface at the opening. Each pixel traces its
 * view ray into an endless rounded shaft: the wall it meets is shaded by how deep the hit
 * is, and light hanging in the depth is gathered along the way. One shader, so there are
 * no seams, no bottom and exact rounded corners.
 */
const shaftMat = () =>
  new THREE.ShaderMaterial({
    // The shaft is virtual: nothing real lies behind the opening, so it ignores depth and is
    // drawn right after the table and shell (renderOrder), before everything in front of it.
    depthWrite: false,
    depthTest: false,
    uniforms: { ...uniforms(), uCenter: { value: new THREE.Vector2() }, uR: { value: WELL_RADIUS }, uSeed: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      ${sdRoundGLSL}
      ${glowGLSL}
      uniform vec2 uCenter;
      uniform float uR;
      uniform float uSeed;
      varying vec3 vWorld;

      void main() {
        vec3 rd = normalize(vWorld - cameraPosition);
        vec2 p = vWorld.xz - uCenter;
        float lxz = max(length(rd.xz), 1e-4);
        vec2 dir = rd.xz / lxz;
        vec2 half_ = uSize * 0.5;
        float r = min(uR, min(half_.x, half_.y));

        // Exact exit (in plan) from the rounded shaft: straight walls first, then the corner arc.
        vec2 sgn = sign(dir + 1e-6);
        vec2 tw = (sgn * half_ - p) / (dir + sgn * 1e-6);
        float s = min(tw.x, tw.y);
        vec2 h0 = p + dir * s;
        vec2 cc = sign(h0) * (half_ - r);
        // Inward wall normal at the hit: axis-aligned on the flats, radial in the corners.
        vec2 nrm = tw.x < tw.y ? vec2(-sgn.x, 0.0) : vec2(0.0, -sgn.y);
        if (abs(h0.x) > half_.x - r && abs(h0.y) > half_.y - r) {
          vec2 oc = p - cc;
          float b = dot(oc, dir);
          float c = dot(oc, oc) - r * r;
          s = -b + sqrt(max(b * b - c, 0.0));
          nrm = normalize(cc - (p + dir * s));
        }
        float t = s / lxz;                 // distance along the ray
        float h = -rd.y * t;               // depth of the hit below the opening
        vec2 hit = p + dir * s;

        // Wall: lit from the depth. Brightness builds gently below the lip and then dissolves
        // into darkness; walls facing the viewer catch more than the grazing side walls, and the
        // rounded corners turn smoothly between the two.
        vec3 gc = glowColor(hit);
        float facing = 0.55 + 0.45 * smoothstep(-0.2, 1.0, nrm.y);
        float spread = 0.7 + 0.3 * exp(-pow(hit.x / (half_.x * 1.1), 2.0));
        float catchL = smoothstep(0.0, 0.8, h) * exp(-h * 1.15);
        vec3 col = gc * catchL * 0.12 * uGlow * spread * facing;
        col += vec3(0.012) * exp(-h * 40.0) * facing;  // faint light on the upper wall, just under the lip

        // Light suspended in the depth, gathered along the ray (soft, no surface to it).
        vec2 c = vec2(sin(uTime * 0.17 + uSeed) * 0.18, cos(uTime * 0.13 + uSeed) * 0.14) * uSize;
        float tEnd = min(t, 4.5 / max(-rd.y, 0.05));
        float acc = 0.0;
        for (int i = 0; i < 10; i++) {
          float tt = tEnd * (float(i) + 0.5) / 10.0;
          vec2 q = (p + rd.xz * tt - c) / half_;
          float hh = -rd.y * tt;
          acc += exp(-dot(q, q) * 1.3) * exp(-pow((hh - 1.25) / 0.85, 2.0));
        }
        acc *= tEnd / 10.0;
        col += glowColor(p) * acc * 0.012 * uGlow;
        // Looking straight down the middle you see the deepest point: let it go to black.
        vec2 qc = p / half_;
        col *= mix(1.0, 0.18, smoothstep(0.15, 0.85, 1.0 - max(abs(qc.x), abs(qc.y)) * 0.5 - length(qc) * 0.5) * smoothstep(1.0, 2.6, h));

        col *= dimK();
        col += (hash(gl_FragCoord.xy + fract(uTime)) - 0.5) / 255.0;
        gl_FragColor = vec4(max(col, 0.0), 1.0);
        #include <colorspace_fragment>
      }`,
  });

function uniforms() {
  return {
    uA: { value: new THREE.Color() },
    uB: { value: new THREE.Color() },
    uGlow: { value: 1 },
    uDim: { value: 0 },
    uReveal: { value: 0 },
    uTime: { value: 0 },
    uSize: { value: new THREE.Vector2(1, 1) },
  };
}

const unitPlane = new THREE.PlaneGeometry(1, 1);

/** In a tall focused section, the share of its depth given to the facts above the screenshots. */
export const TALL_SPLIT = 0.6;
/** Side by side in a tall section (phone screenshots): the share of its width given to the facts. */
export const SIDE_SPLIT = 0.56;
/** Margin of the photo area inside an open section, and the gap between the facts and the photos below them. */
const FOCUS_INSET = 0.12;
const PHOTOS_GAP = 0.1;
/** Below this width/height the lead screenshot is a phone's. */
const PHONE_SHOT = 0.75;

interface Label {
  mesh: THREE.Mesh;
  w: number;
  h: number;
}

export interface LabelScales {
  kind: number;
  title: number;
  caption: number;
}

const NO_CAPS: LabelScales = { kind: Infinity, title: Infinity, caption: Infinity };
const GAP_TEXT = 0.12;

/** One recessed bento section: an endless lit shaft, a screenshot stack and a resting title. */
export class Well {
  readonly group = new THREE.Group();
  readonly stack: CardStack;
  private shaft: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  private kind: Label;
  private title: Label;
  /** Same title, turned to run top-to-bottom for slim vertical strips. */
  private vTitle: Label;
  private caption: Label;
  private sx: Spring;
  private sz: Spring;
  private sw: Spring;
  private sd: Spring;
  // Focus shares the layout springs' stiffness so the stack area tracks the section exactly.
  // Dim and glow are light, not geometry: they ease a little slower, like light coming up.
  private dim = new Spring(0, 120, 1);
  private glow = new Spring(1, 90, 1);
  private focus = new Spring(0, 200, 1);
  // Label layout, eased so it never jumps: roomy (room for the kind and caption lines) follows the
  // section's height, which can cross its whole range in two frames mid-switch; side (0 = photos
  // below the labels, 1 = beside them) is a choice that flips.
  private roomy = new Spring(0, 140, 1);
  private side = new Spring(0, 200, 1);
  private placed = false;

  constructor(readonly project: Project, index: number, reduced: boolean) {
    this.mat = shaftMat();
    this.mat.uniforms.uA.value.set(project.glow[0]);
    this.mat.uniforms.uB.value.set(project.glow[1]);
    this.mat.uniforms.uSeed.value = index * 2.1;
    this.shaft = new THREE.Mesh(unitPlane, this.mat);
    this.shaft.rotation.x = -Math.PI / 2;
    this.shaft.position.y = TOP_Y - 0.0005;
    this.shaft.renderOrder = -1; // drawn first; the screenshots float in front of it
    this.group.add(this.shaft);

    this.stack = new CardStack(project.images, reduced);
    this.stack.group.position.y = TOP_Y - CARD_DEPTH;
    this.group.add(this.stack.group);

    this.kind = this.text(project.kind.toUpperCase(), `600 24px ${FONT}`, kindTint(project.kind), 0.004);
    this.title = this.text(project.title, `600 64px ${FONT}`, '#f5f5f7', 0.004);
    this.vTitle = {
      mesh: new THREE.Mesh(unitPlane, sharpenText((this.title.mesh.material as THREE.MeshBasicMaterial).clone())),
      w: this.title.w,
      h: this.title.h,
    };
    // In-plane quarter turn: the text's baseline runs toward the viewer, so it reads top to bottom.
    this.vTitle.mesh.rotation.set(-Math.PI / 2, 0, -Math.PI / 2);
    this.vTitle.mesh.position.y = TOP_Y + 0.004;
    this.vTitle.mesh.renderOrder = 1;
    this.group.add(this.vTitle.mesh);
    this.caption = this.text(project.caption, `400 32px ${FONT}`, '#9d9da6', 0.005);

    const s = (v: number) => new Spring(v, 320, 1);
    this.sx = s(0);
    this.sz = s(0);
    this.sw = s(1);
    this.sd = s(1);
  }

  private text(line: string, font: string, color: string, lift: number): Label {
    const size = parseInt(font.split(' ')[1]);
    const { tex, w, h } = labelTexture([line], { font, color, padX: 0, padY: 4, lineHeight: size * 1.25 });
    const mesh = new THREE.Mesh(unitPlane, sharpenText(new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false })));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = TOP_Y + lift;
    mesh.renderOrder = 1;
    this.group.add(mesh);
    return { mesh, w, h };
  }

  setRect(r: Rect, snap = false) {
    this.sx.target = r.x;
    this.sz.target = r.z;
    this.sw.target = r.w;
    this.sd.target = r.d;
    if (snap) [this.sx, this.sz, this.sw, this.sd].forEach((s) => s.snap(s.target));
  }

  /**
   * The section's place in the overview. Its resting look (portrait photos cropped or whole,
   * photos below or beside the labels) is decided from this, never from a size passed mid-motion,
   * so going in and out of a section is one continuous move instead of a few sequential snaps.
   */
  restRect: Rect = { x: 0, z: 0, w: 1, d: 1 };
  /** Where the section is headed (set on each focus change): the labels make room for it from the start. */
  private dest: Rect = { x: 0, z: 0, w: 1, d: 1 };
  setDest(r: Rect) {
    this.dest = r;
  }

  /** Label scales shared with sections that should match (the overview's smaller ones). */
  caps: LabelScales = { kind: Infinity, title: Infinity, caption: Infinity };
  /** The label scales this section would use on its own at rest, before the caps. */
  readonly restFit: LabelScales = { kind: 1, title: 1, caption: 1 };

  /** Focused, this section is taller than wide (portrait): facts on top, screenshots below. */
  focusTall = false;
  private sideLock: boolean | undefined;
  /** Tall and stacked: how far down the open section the facts reach (set once the glass is built). */
  factsDepth = 0;
  /** Tall and stacked: the depth the open section needs for its facts and full-width shots. */
  stackedDepth(w: number) {
    return this.factsDepth + PHOTOS_GAP + (w - FOCUS_INSET * 2) / this.stack.leadAspect + FOCUS_INSET;
  }
  /**
   * Tall and showing phone screenshots: facts and photos side by side instead, so a portrait shot
   * gets the section's full height rather than a short strip under the facts. Settled the first
   * time it is asked (when the glass is built), so the photos and the glass always agree.
   */
  focusSide(): boolean {
    this.sideLock ??= this.focusTall && this.stack.leadAspect < PHONE_SHOT;
    return this.sideLock;
  }

  private isFocused = false;
  private hovered = false;

  setState(dim: boolean, focused: boolean) {
    this.dim.target = dim ? 1 : 0;
    this.isFocused = focused;
    this.focus.target = focused ? 1 : 0;
    this.updateGlow();
  }

  /** Pointer over this (closed) section: it lights up a little, inviting the click. */
  setHover(v: boolean) {
    if (v === this.hovered) return;
    this.hovered = v;
    this.updateGlow();
  }

  private updateGlow() {
    this.glow.target = this.isFocused ? 1.2 : this.hovered ? 1.12 : 1;
  }

  get rect(): Rect {
    return { x: this.sx.value, z: this.sz.value, w: this.sw.value, d: this.sd.value };
  }

  /** 0..1 how far this section has opened into its focused state. */
  get focusProgress() {
    return this.focus.value;
  }

  get glowIntensity() {
    return this.glow.value * (1 - 0.75 * this.dim.value);
  }

  private place(l: Label, k: number, x: number, z: number, opacity: number) {
    l.mesh.scale.set(l.w * k, l.h * k, 1);
    l.mesh.position.set(x + (l.w * k) / 2, l.mesh.position.y, z);
    (l.mesh.material as THREE.MeshBasicMaterial).opacity = opacity;
  }

  /**
   * Resting layout of a w x d section: kind, title and caption top-left, sized to the width they
   * may use, and the photo area below them or beside them. Beside, the photo column is only as
   * wide as the photo needs (at most half) and the labels get the rest.
   */
  private plan(w: number, d: number, crop: number, roomy: number, caps: LabelScales) {
    const lerp = THREE.MathUtils.lerp;
    const pad = Math.min(0.24, w * 0.1);
    const top = -d / 2 + pad;
    const left = -w / 2 + pad;
    const kh = this.kind.h;
    // Label sizes for a text width, and where the block ends (bottom edge, right edge).
    const fitLabels = (textW: number) => {
      const kk = Math.min(1, textW / this.kind.w, caps.kind);
      const k = Math.min(1 - 0.4 * (1 - roomy), textW / this.title.w, (d - 0.14) / this.title.h, caps.title);
      const th = this.title.h * k;
      const titleZ = lerp(0, top + kh + 0.03 + th / 2, roomy);
      const ck = Math.min(1, textW / this.caption.w, caps.caption);
      const right = left + Math.max(this.title.w * k, Math.max(this.kind.w * kk, this.caption.w * ck) * roomy);
      return { textW, kk, k, th, titleZ, ck, bottom: titleZ + th / 2 + (0.03 + this.caption.h * ck) * roomy, right };
    };
    const m = Math.min(0.2, w * 0.08, d * 0.1) * 0.6;
    const aspect = this.stack.leadAspect / shownHeight(this.stack.leadAspect, crop);
    const photoW = Math.min((d - m * 2) * aspect, w * 0.5 - m);
    const below = fitLabels(w - pad * 2);
    const beside = fitLabels(Math.max(w * 0.5 - pad, w - pad - m - photoW - GAP_TEXT));
    const belowA = { x0: -w / 2 + m, x1: w / 2 - m, z0: below.bottom + GAP_TEXT, z1: d / 2 - m };
    const besideA = { x0: beside.right + GAP_TEXT, x1: w / 2 - m, z0: -d / 2 + m, z1: d / 2 - m };
    const shown = (a: typeof belowA) => {
      const cw = Math.min(Math.max(0, a.x1 - a.x0), Math.max(0, a.z1 - a.z0) * aspect);
      return (cw * cw) / aspect;
    };
    return {
      top,
      left,
      belowA,
      besideA,
      belowShown: shown(belowA),
      besideShown: shown(besideA),
      /** Labels for a blend of the two arrangements (0 = photos below, 1 = beside). */
      labels: (side: number) => fitLabels(lerp(below.textW, beside.textW, side)),
    };
  }

  /** eye: the camera at rest (no parallax); the photos sit deeper than the opening and are placed as seen from it. */
  update(dt: number, time: number, reveal: number, eye: THREE.Vector3) {
    const x = this.sx.step(dt);
    const z = this.sz.step(dt);
    const w = Math.max(0.08, this.sw.step(dt));
    const d = Math.max(0.08, this.sd.step(dt));
    const dim = this.dim.step(dt);
    const glow = this.glow.step(dt);
    const f = this.focus.step(dt);
    this.group.position.set(x, 0, z);

    this.shaft.scale.set(w, d, 1);
    const u = this.mat.uniforms;
    u.uTime.value = time;
    u.uDim.value = dim;
    u.uGlow.value = glow;
    u.uReveal.value = reveal;
    u.uSize.value.set(w, d);
    u.uCenter.value.set(x, z);

    const lerp = THREE.MathUtils.lerp;
    const smooth = THREE.MathUtils.smoothstep;

    // The resting look is settled from the overview rect: photos below or beside the labels
    // (whichever shows the first one bigger, with a little stickiness), and how far portrait
    // shots are cropped. Mid-motion sizes would flip these partway through a move.
    const rest = this.restRect;
    const restCrop = 1 - smooth(Math.min(rest.w, rest.d), 1.8, 2.4);
    const rp = this.plan(rest.w, rest.d, restCrop, smooth(rest.d, 0.75, 1.0), NO_CAPS);
    const stay = this.side.target > 0.5 ? 1.15 : 1 / 1.15;
    this.side.target = rp.besideShown * stay > rp.belowShown ? 1 : 0;
    const fit = rp.labels(this.side.target);
    this.restFit.kind = fit.kk;
    this.restFit.title = fit.k;
    this.restFit.caption = fit.ck;

    // Room for the kind and caption lines follows where the section is going, so the labels
    // rearrange alongside the move rather than when its height happens to pass a threshold.
    this.roomy.target = smooth(this.dest.d, 0.75, 1.0);
    if (!this.placed) {
      this.roomy.snap(this.roomy.target);
      this.side.snap(this.side.target);
    }
    this.placed = true;
    const roomy = this.roomy.step(dt);
    const side = this.side.step(dt);
    // Small sections at rest show portrait screenshots by their top half (fading out below), so
    // they read at a useful size; opening the section shows them whole. Eased in the square of the
    // fold, so the shown part's widening aspect never outpaces the area shrinking around it (no swell).
    const crop = restCrop * (1 - f) ** 2;
    const lp = this.plan(w, d, crop, roomy, this.caps);
    const { top, left } = lp;
    const kh = this.kind.h;
    const text = lp.labels(side);
    const restA = {
      x0: lerp(lp.belowA.x0, lp.besideA.x0, side),
      x1: lp.belowA.x1,
      z0: lerp(lp.belowA.z0, lp.besideA.z0, side),
      z1: lp.belowA.z1,
    };
    const focA =
      this.focusTall && !this.sideLock
        ? { x0: -w / 2 + FOCUS_INSET, x1: w / 2 - FOCUS_INSET, z0: -d / 2 + (this.factsDepth ? this.factsDepth + PHOTOS_GAP : d * TALL_SPLIT), z1: d / 2 - FOCUS_INSET }
        : { x0: -w / 2 + w * (this.sideLock ? SIDE_SPLIT : 0.5), x1: w / 2 - 0.08, z0: -d / 2 + 0.12, z1: d / 2 - 0.12 };
    const x0 = lerp(restA.x0, focA.x0, f);
    const x1 = lerp(restA.x1, focA.x1, f);
    const z0 = lerp(restA.z0, focA.z0, f);
    const z1 = lerp(restA.z1, focA.z1, f);
    // The photos lie CARD_DEPTH below the opening. Place them on the line of sight through the
    // area's centre, scaled up to match, so from the camera they sit exactly in the area.
    const depth = TOP_Y - CARD_DEPTH;
    const reach = (eye.y - depth) / Math.max(eye.y - TOP_Y, 0.01);
    const cx = x + (x0 + x1) / 2;
    const cz = z + (z0 + z1) / 2;
    // A section growing back to its resting size passes through photo areas larger than its final
    // one while the labels and photos are still settling into their arrangement, so the photos
    // swelled and then shrank. Past the final area, only the share that is still open counts.
    const fp = this.plan(rest.w, rest.d, restCrop, this.roomy.target, this.caps);
    const fs = this.side.target;
    const finW = fp.belowA.x1 - lerp(fp.belowA.x0, fp.besideA.x0, fs);
    const finD = fp.belowA.z1 - lerp(fp.belowA.z0, fp.besideA.z0, fs);
    const openK = Math.min(1, f * 4);
    const capped = (v: number, cap: number) => (v > cap ? cap + (v - cap) * openK : v);
    const aw = capped(Math.max(0.01, x1 - x0), Math.max(0.01, finW)) * reach;
    const ad = capped(Math.max(0.01, z1 - z0), Math.max(0.01, finD)) * reach;
    this.stack.group.position.set(eye.x + (cx - eye.x) * reach - x, depth, eye.z + (cz - eye.z) * reach - z);
    const presence = smooth(Math.min(w, d), 0.6, 1.0);
    this.stack.setClip(x, z, w / 2 - 0.01, d / 2 - 0.01, Math.min(WELL_RADIUS, w / 2, d / 2));
    this.stack.update(dt, aw, ad, dim * 0.8 + (1 - reveal), presence, crop);

    // Place the labels (a thin strip shows only the title, below).
    const textOn = (1 - smooth(f, 0, 0.35)) * reveal * smooth(w, 0.8, 1.3) * smooth(d, 0.36, 0.48);
    const { kk, k, th, titleZ, ck } = text;
    this.place(this.kind, kk, left, top + kh / 2, textOn * roomy * (1 - dim));
    this.place(this.title, k, left, titleZ, textOn * (1 - 0.55 * dim));
    this.place(this.caption, ck, left, titleZ + th / 2 + 0.03 + (this.caption.h * ck) / 2, textOn * roomy * (1 - dim));

    // Slim vertical strip: the title turns and runs down from the top, sized to fit the strip.
    const vertical = (1 - THREE.MathUtils.smoothstep(w, 0.72, 1.0)) * THREE.MathUtils.smoothstep(d / w, 1.4, 2.0);
    // One consistent size for every strip (small enough for longer names), shrinking only if it must.
    const vk = Math.min(0.42, (w - 0.2) / this.vTitle.h, (d - 0.36) / this.vTitle.w);
    const vw = this.vTitle.w * vk; // runs along z
    const vh = this.vTitle.h * vk; // spans x
    this.vTitle.mesh.scale.set(vw, vh, 1);
    this.vTitle.mesh.position.set(0, this.vTitle.mesh.position.y, -d / 2 + 0.2 + vw / 2);
    (this.vTitle.mesh.material as THREE.MeshBasicMaterial).opacity = vertical * reveal * (1 - 0.45 * dim);
  }
}
