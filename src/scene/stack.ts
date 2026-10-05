import * as THREE from 'three';
import { Spring } from '../anim/springs';
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

const cardFrag = /* glsl */ `
${sdRoundGLSL}
uniform sampler2D uMap;
uniform vec2 uSize;
uniform float uPad;
uniform float uR;
uniform float uDim;
uniform float uShade;
uniform float uOpacity;
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

  vec3 img = texture2D(uMap, clamp(p / uSize + 0.5, 0.0, 1.0)).rgb;
  vec3 col = img * (1.0 - uShade) * mix(1.0, 0.3, uDim);
  // Hairline edge, like a photo's paper edge catching light: barely there.
  col = mix(col, vec3(1.0), (1.0 - smoothstep(0.0, 0.006, -d)) * 0.12 * mask);

  // Cards live inside the section: anything past its walls is cut away (soft-edged).
  float dc = sdRound(vWorld - uClip.xy, uClip.zw, uClipR);
  float clip = 1.0 - smoothstep(-fwidth(dc), 0.0, dc);

  float a = (mask + sh * (1.0 - mask)) * uOpacity * clip;
  if (a <= 0.002) discard;
  gl_FragColor = vec4(col * (mask * uOpacity * clip / max(a, 1e-4)), a);
  #include <colorspace_fragment>
}
`;

/** Rest pose per slot behind the top card: a gentle fan, as in a Messages photo stack. */
const SLOT_ROT = [0, 0.045, -0.04, 0.07];

/** How long each photo stays on top before the next flip, once it has arrived (s). */
const DWELL = 2;
/** A flip: the top card slides aside for SWIPE s, dissolving over its last part, then fades in again at the back. */
const SWIPE = 0.36;
const DISSOLVE_FROM = 0.2;
const RETURN_FADE = 0.3;

const loader = new THREE.TextureLoader();
const plane = new THREE.PlaneGeometry(1, 1);

class Card {
  readonly pivot = new THREE.Group();
  readonly mesh: THREE.Mesh;
  readonly mat: THREE.ShaderMaterial;
  readonly tex: THREE.Texture;
  aspect = 1;
  // Critically damped: no wobble, and the next card settles forward in ~0.4s.
  x = new Spring(0, 150, 1);
  rot = new Spring(0, 150, 1);
  y = new Spring(0, 200, 1);
  s = new Spring(1, 170, 1);
  shade = new Spring(0, 140, 1);
  /** When this card last swiped off the top (stack clock); it stays on top while t < SWIPE. */
  flipAt = -Infinity;

  constructor(url: string) {
    this.tex = loader.load(url, (t) => {
      const img = t.image as HTMLImageElement;
      this.aspect = img.width / img.height;
    });
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
  held = false;

  constructor(readonly urls: string[], private reduced: boolean) {
    this.cards = urls.map((u) => new Card(u));
    this.cards.forEach((c) => this.group.add(c.pivot));
  }

  get meshes() {
    return this.cards.map((c) => c.mesh);
  }

  get textures() {
    return this.cards.map((c) => c.tex);
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

  /** Screen-space rect (CSS px) of the top card, for animating the viewer from it. */
  topRect(camera: THREE.Camera, canvas: HTMLCanvasElement) {
    const c = this.cards[this.top];
    const u = c.mat.uniforms;
    const fx = u.uSize.value.x / (u.uSize.value.x + 2 * u.uPad.value) / 2;
    const fy = u.uSize.value.y / (u.uSize.value.y + 2 * u.uPad.value) / 2;
    c.mesh.updateWorldMatrix(true, false);
    const r = canvas.getBoundingClientRect();
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [px, py] of [[-fx, -fy], [fx, -fy], [fx, fy], [-fx, fy]]) {
      const v = new THREE.Vector3(px, py, 0).applyMatrix4(c.mesh.matrixWorld).project(camera);
      const sx = r.left + ((v.x + 1) / 2) * r.width;
      const sy = r.top + ((1 - v.y) / 2) * r.height;
      x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
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

  update(dt: number, aw: number, ad: number, dim: number, presence = 1) {
    this.clock += dt;
    if (this.hovered && this.clock > this.nextAt) {
      this.next();
      this.nextAt = this.clock + SWIPE + DWELL;
    }
    const n = this.cards.length;
    this.cards.forEach((c, i) => {
      const slot = (i - this.top + n) % n;
      const t = this.clock - c.flipAt;
      const out = t < SWIPE;
      // Leaving: fully there, then dissolving as it clears the stack. Back in place: fading in behind.
      const flipFade = out
        ? 1 - THREE.MathUtils.smoothstep(t, DISSOLVE_FROM, SWIPE)
        : THREE.MathUtils.smoothstep(t, SWIPE, SWIPE + RETURN_FADE);
      const fw = aw * 0.9;
      const fd = ad * 0.9;
      const cw = Math.min(fw, fd * c.aspect);
      const cd = cw / c.aspect;

      // Swipe: slide out to the right (lifted, turning a little) while still on top, then tuck in at the back.
      c.x.target = out ? cw * 0.6 : 0;
      c.rot.target = out ? -0.1 : SLOT_ROT[Math.min(slot, SLOT_ROT.length - 1)];
      c.y.target = out ? 0.02 : -slot * 0.022;
      c.s.target = out ? 0.98 : 1 - Math.min(slot, 3) * 0.025;
      c.shade.target = out ? 0 : Math.min(slot, 3) * 0.16;
      if (this.snapNext) for (const sp of [c.x, c.rot, c.y, c.s, c.shade]) sp.snap(sp.target);

      const s = c.s.step(dt);
      c.pivot.position.set(c.x.step(dt), c.y.step(dt), 0);
      c.pivot.rotation.y = c.rot.step(dt);
      const w = cw * s;
      const h = cd * s;
      c.mesh.scale.set(w + SHADOW_PAD * 2, h + SHADOW_PAD * 2, 1);
      const u = c.mat.uniforms;
      u.uSize.value.set(w, h);
      // Phone screenshots get device-like corners; desktop ones a small, crisp radius.
      u.uR.value = c.aspect < 0.75 ? w * CARD_RADIUS.phone : Math.min(w, h) * CARD_RADIUS.other;
      u.uDim.value = dim;
      u.uShade.value = c.shade.step(dt);
      // Only the top few cards show; deeper ones fade rather than pop.
      u.uOpacity.value = (slot <= 3 || out ? 1 : 0) * flipFade * presence * (this.held && slot === 0 ? 0 : 1);
      c.mesh.visible = presence > 0.01 && cw > 0.05 && cd > 0.05;
      // Explicit draw order (after the shaft at -1, before labels and glass at 1+): back to front.
      c.mesh.renderOrder = out ? -0.4 : -0.9 + (n - slot) * 0.05;
    });
    this.snapNext = false;
  }
}
