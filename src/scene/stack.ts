import * as THREE from 'three';
import { settings } from '../config/projects';
import { type Quad } from '../anim/quad';
import { CARD_RADIUS } from '../lightbox';
import { sdRoundGLSL } from './shaders';

const cardVert = /* glsl */ `
varying vec2 vUv;
varying vec2 vWorld;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const SHADOW_PAD = 0.22;
/** Seconds for a card the viewer has just returned to fade back in. */
const HANDBACK = 0.09;

const cardFrag = /* glsl */ `
${sdRoundGLSL}
uniform sampler2D uMap;
uniform vec2 uSize;
uniform float uPad;
uniform float uR;
uniform float uDim;
uniform float uShade;
uniform float uOpacity;
uniform float uCrop;    // share of the image's height shown, from the top (1 = all of it)
uniform float uFade;    // 0..1: how much the card's lower part fades out into the section
uniform vec4 uClip;     // section opening in world xz: centre, half size
uniform float uClipR;
varying vec2 vUv;
varying vec2 vWorld;
void main() {
  vec2 full = uSize + 2.0 * uPad;
  vec2 p = (vUv - 0.5) * full;
  float d = sdRound(p, uSize * 0.5, uR);
  float aa = fwidth(d) * 0.75;
  float mask = 1.0 - smoothstep(-aa, aa, d);

  // Two-layer shadow: a tight contact shadow and a wide, soft ambient one, both offset toward the viewer.
  float d1 = sdRound(p - vec2(0.0, -0.02), uSize * 0.5, uR);
  float d2 = sdRound(p - vec2(0.0, -0.06), uSize * 0.5, uR);
  float sh = 0.32 * exp(-max(d1, 0.0) * 38.0) + 0.3 * exp(-max(d2, 0.0) * 9.0);
  sh *= smoothstep(uPad, uPad * 0.55, max(abs(p.x) - uSize.x * 0.5, abs(p.y) - uSize.y * 0.5)); // reach zero before the plane edge

  vec2 q = p / uSize + 0.5;
  q.y = 1.0 - uCrop * (1.0 - q.y);
  vec3 img = texture2D(uMap, clamp(q, 0.0, 1.0)).rgb;
  vec3 col = img * (1.0 - uShade) * mix(1.0, 0.3, uDim);
  // Hairline edge, like a photo's paper edge catching light: barely there.
  col = mix(col, vec3(1.0), (1.0 - smoothstep(0.0, 0.006, -d)) * 0.12 * mask);

  // Cards live inside the section: anything past its walls is cut away (soft-edged).
  float dc = sdRound(vWorld - uClip.xy, uClip.zw, uClipR);
  float clip = 1.0 - smoothstep(-fwidth(dc), 0.0, dc);

  // A cropped card has no bottom edge: its lower half dissolves into the dark, shadow and all.
  float fade = mix(1.0, smoothstep(-uSize.y * 0.5, uSize.y * 0.05, p.y), uFade);
  float a = (mask + sh * (1.0 - mask)) * uOpacity * clip * fade;
  if (a <= 0.002) discard;
  gl_FragColor = vec4(col * (mask * uOpacity * clip * fade / max(a, 1e-4)), a);
  #include <colorspace_fragment>
}
`;

/** Below this width/height a screenshot is a phone's (portrait): it gets device corners and may be cropped. */
const TALL = 0.75;

/** The share of a screenshot's height shown at a given crop (0 = whole, 1 = cropped): only portrait ones crop, to their top half. */
export const shownHeight = (aspect: number, crop: number) => (aspect < TALL ? 1 - 0.5 * crop : 1);

/** Rest pose per slot behind the top card: a gentle fan, as in a Messages photo stack. */
const SLOT_ROT = [0, 0.045, -0.04, 0.07];

/** How long each photo stays on top before the next flip, once it has arrived (s); set in the dashboard. */
const DWELL = settings.motion.photoDwell;
/**
 * A flip, all on timed curves (no springs, so nothing lurches off from rest or turns back mid-move):
 * the top card eases aside for OUT s, dissolving as it goes, then fades in at the back already in
 * place. The cards behind move up one slot along one eased curve, a beat after it starts leaving.
 */
const OUT = 0.56;
const DISSOLVE_FROM = 0.3; // share of OUT before the leaving card starts to dissolve
const RETURN_FADE = 0.4;
const MOVE = 0.6;
const MOVE_DELAY = 0.07;

/** CSS-style cubic-bezier easing (x1, y1, x2, y2), solved for y at x. */
function bezier(x1: number, y1: number, x2: number, y2: number) {
  const a = (p1: number, p2: number) => 1 - 3 * p2 + 3 * p1;
  const b = (p1: number, p2: number) => 3 * p2 - 6 * p1;
  const c = (p1: number) => 3 * p1;
  const at = (t: number, p1: number, p2: number) => ((a(p1, p2) * t + b(p1, p2)) * t + c(p1)) * t;
  const slope = (t: number, p1: number, p2: number) => 3 * a(p1, p2) * t * t + 2 * b(p1, p2) * t + c(p1);
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 6; i++) {
      const s = slope(t, x1, x2);
      if (Math.abs(s) < 1e-6) break;
      t -= (at(t, x1, x2) - x) / s;
    }
    return at(THREE.MathUtils.clamp(t, 0, 1), y1, y2);
  };
}
/** Leaving: a soft start, then a long glide out (as a hand would slide it off). */
const easeLeave = bezier(0.35, 0, 0.15, 1);
/** Moving up a slot: gentle in and out, like the sheet curve used elsewhere. */
const easeMove = bezier(0.4, 0, 0.2, 1);

/** Pose of a card at a (fractional) slot, so a move between slots is one continuous blend. */
function slotPose(f: number) {
  const i = Math.min(Math.floor(f), SLOT_ROT.length - 1);
  const j = Math.min(i + 1, SLOT_ROT.length - 1);
  const k = Math.min(f, SLOT_ROT.length - 1) - i;
  const deep = Math.min(f, 3);
  return { rot: SLOT_ROT[i] + (SLOT_ROT[j] - SLOT_ROT[i]) * k, y: -f * 0.022, s: 1 - deep * 0.025, shade: deep * 0.16 };
}

const loader = new THREE.ImageLoader();
const plane = new THREE.PlaneGeometry(1, 1);

class Card {
  readonly pivot = new THREE.Group();
  readonly mesh: THREE.Mesh;
  readonly mat: THREE.ShaderMaterial;
  readonly tex: THREE.Texture;
  aspect = 1;
  /** Resolves once the image has loaded (or failed) and its aspect is known. */
  readonly loaded: Promise<void>;
  /** Where the card sits in the stack, eased between slots (0 = top). */
  slotF = 0;
  private from = 0;
  private to = 0;
  private moveAt = -Infinity;
  /** When this card last swiped off the top (stack clock); it is leaving while t < OUT. */
  flipAt = -Infinity;

  /** Fetches the photo (once). Only the lead card loads up front; the rest wait their turn (see CardStack.loadRest). */
  load() {
    if (this.started) return this.loaded;
    this.started = true;
    loader.load(
      this.url,
      (img) => {
        this.tex.image = img;
        this.tex.needsUpdate = true;
        this.aspect = img.width / img.height;
        this.done();
      },
      undefined,
      () => this.done(),
    );
    return this.loaded;
  }

  /** Head for a slot: from wherever the card is now, along the move curve. */
  goTo(slot: number, now: number, snap: boolean) {
    if (snap) {
      this.slotF = this.from = this.to = slot;
      this.moveAt = -Infinity;
      return;
    }
    if (slot === this.to) return;
    this.from = this.slotF;
    this.to = slot;
    this.moveAt = now;
  }

  stepSlot(now: number) {
    const k = easeMove(THREE.MathUtils.clamp((now - this.moveAt - MOVE_DELAY) / MOVE, 0, 1));
    this.slotF = this.from + (this.to - this.from) * k;
    return this.slotF;
  }

  private started = false;
  private done = () => {};

  constructor(private url: string) {
    this.loaded = new Promise((r) => (this.done = r));
    this.tex = new THREE.Texture();
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 8;
    this.tex.generateMipmaps = true;
    this.tex.minFilter = THREE.LinearMipmapLinearFilter;
    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uMap: { value: this.tex },
        uSize: { value: new THREE.Vector2(1, 1) },
        uPad: { value: SHADOW_PAD },
        uR: { value: 0.05 },
        uDim: { value: 0 },
        uShade: { value: 0 },
        uOpacity: { value: 1 },
        uCrop: { value: 1 },
        uFade: { value: 0 },
        uClip: { value: new THREE.Vector4(0, 0, 100, 100) },
        uClipR: { value: 0.2 },
      },
      vertexShader: cardVert,
      fragmentShader: cardFrag,
    });
    this.mesh = new THREE.Mesh(plane, this.mat);
    this.mesh.rotation.x = -Math.PI / 2;
    this.pivot.add(this.mesh);
  }
}

/**
 * Screenshots stacked like photos in Messages. Hovering deals through them: the top card
 * swipes out to the side, then settles in at the back while the next one comes forward.
 */
export class CardStack {
  readonly group = new THREE.Group();
  private cards: Card[];
  private top = 0;
  private hovered = false;
  private nextAt = 0;
  private clock = 0;
  private snapNext = false;
  /** The top card is out in the full-screen viewer; hide it here so there is only one of it. */
  get held() {
    return this._held;
  }

  /** Taking hold hides the card at once; letting go brings it back over HANDBACK seconds, shadow and all. */
  set held(v: boolean) {
    this._held = v;
    if (v) this.heldK = 0;
  }

  private _held = false;
  /** 0 while the viewer holds the card, easing to 1 once it is let go. */
  private heldK = 1;

  constructor(readonly urls: string[], private reduced: boolean) {
    this.cards = urls.map((u) => new Card(u));
    this.cards.forEach((c) => this.group.add(c.pivot));
    this.cards[0].load();
  }

  /** Starts fetching the other photos, once the first screen no longer needs the bandwidth. */
  loadRest() {
    return Promise.all(this.cards.slice(1).map((c) => c.load()));
  }

  get meshes() {
    return this.cards.map((c) => c.mesh);
  }

  get textures() {
    return this.cards.map((c) => c.tex);
  }

  /** The first photo has loaded, so leadAspect is final. */
  get leadLoaded() {
    return this.cards[0].loaded;
  }

  /** Width / height of the first photo, the one on top at rest (1 until it has loaded). */
  get leadAspect() {
    return this.cards[0].aspect;
  }

  get topIndex() {
    return this.top;
  }

  /**
   * Jump to a card without the swipe (used when returning from the full-screen viewer).
   * The cards settle into their new slots on the next update, so the viewer has a still target.
   */
  setTop(i: number) {
    const n = this.cards.length;
    this.top = ((i % n) + n) % n;
    this.cards.forEach((c) => (c.flipAt = -Infinity));
    this.snapNext = true;
  }

  /** Screen-space corners (CSS px, clockwise from top-left) of the top card, for flying the viewer to and from it. */
  topQuad(camera: THREE.Camera, canvas: HTMLCanvasElement): Quad {
    const c = this.cards[this.top];
    const u = c.mat.uniforms;
    const fx = u.uSize.value.x / (u.uSize.value.x + 2 * u.uPad.value) / 2;
    const fy = u.uSize.value.y / (u.uSize.value.y + 2 * u.uPad.value) / 2;
    c.mesh.updateWorldMatrix(true, false);
    const r = canvas.getBoundingClientRect();
    const v = new THREE.Vector3();
    return [[-fx, fy], [fx, fy], [fx, -fy], [-fx, -fy]].map(([px, py]) => {
      v.set(px, py, 0).applyMatrix4(c.mesh.matrixWorld).project(camera);
      return [r.left + ((v.x + 1) / 2) * r.width, r.top + ((1 - v.y) / 2) * r.height];
    }) as Quad;
  }

  setHovered(v: boolean) {
    if (v && !this.hovered) this.nextAt = this.clock + 0.9;
    this.hovered = v;
  }

  next() {
    if (this.cards.length < 2) return;
    if (!this.reduced) this.cards[this.top].flipAt = this.clock;
    this.top = (this.top + 1) % this.cards.length;
  }

  /** Area (w x d) the stack may occupy; cards keep their own aspect within it. */
  /** clip: the section opening in world space (centre x/z, half w/d) and its corner radius. */
  setClip(cx: number, cz: number, hw: number, hd: number, r: number) {
    for (const c of this.cards) {
      c.mat.uniforms.uClip.value.set(cx, cz, hw, hd);
      c.mat.uniforms.uClipR.value = r;
    }
  }

  /** crop: 0..1, how far portrait screenshots are cut to their top half (small sections at rest). */
  update(dt: number, aw: number, ad: number, dim: number, presence = 1, crop = 0) {
    this.clock += dt;
    if (!this._held) this.heldK = Math.min(1, this.heldK + dt / HANDBACK);
    if (this.hovered && this.clock > this.nextAt) {
      this.next();
      this.nextAt = this.clock + OUT + DWELL;
    }
    const n = this.cards.length;
    this.cards.forEach((c, i) => {
      const slot = (i - this.top + n) % n;
      const t = this.clock - c.flipAt;
      const out = t < OUT;
      // Leaving: fully there, then dissolving as it clears the stack. Back in place: fading in behind.
      const flipFade = out
        ? 1 - THREE.MathUtils.smoothstep(t, OUT * DISSOLVE_FROM, OUT)
        : THREE.MathUtils.smoothstep(t, OUT, OUT + RETURN_FADE);
      const fw = aw * 0.9;
      const fd = ad * 0.9;
      const shown = shownHeight(c.aspect, crop);
      const va = c.aspect / shown; // aspect of the part on show
      const cw = Math.min(fw, fd * va);
      const cd = cw / va;

      // The leaving card has already taken its slot at the back; it only shows there once it has
      // dissolved off the top, so it never slides back in across the stack.
      c.goTo(slot, this.clock, this.snapNext || this.reduced || out);
      const pose = slotPose(c.stepSlot(this.clock));
      let s = pose.s;
      let x = 0;
      let rot = pose.rot;
      let y = pose.y;
      let shade = pose.shade;
      if (out) {
        // Off to the right: lifted a touch, turning a little, easing down to a stop as it fades.
        const e = easeLeave(t / OUT);
        x = cw * 0.62 * e;
        rot = -0.11 * e;
        y = 0.022 * Math.min(1, e * 2.5);
        s = 1 - 0.025 * e;
        shade = 0;
      }
      c.pivot.position.set(x, y, 0);
      c.pivot.rotation.y = rot;
      const w = cw * s;
      const h = cd * s;
      c.mesh.scale.set(w + SHADOW_PAD * 2, h + SHADOW_PAD * 2, 1);
      const u = c.mat.uniforms;
      u.uSize.value.set(w, h);
      // Phone screenshots get device-like corners; desktop ones a small, crisp radius.
      u.uR.value = c.aspect < TALL ? w * CARD_RADIUS.phone : Math.min(w, h) * CARD_RADIUS.other;
      u.uCrop.value = shown;
      u.uFade.value = (1 - shown) * 2;
      u.uDim.value = dim;
      u.uShade.value = shade;
      // Only the top few cards show; deeper ones fade rather than pop.
      u.uOpacity.value = (slot <= 3 || out ? 1 : 0) * flipFade * presence * (slot === 0 ? this.heldK : 1);
      c.mesh.visible = presence > 0.01 && cw > 0.05 && cd > 0.05;
      // Explicit draw order (after the shaft at -1, before labels and glass at 1+): back to front.
      c.mesh.renderOrder = out ? -0.4 : -0.9 + (n - slot) * 0.05;
    });
    this.snapNext = false;
  }
}
