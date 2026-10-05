import * as THREE from 'three';
import { Spring } from '../anim/springs';
import type { Project } from '../config/projects';
import { CARD_DEPTH, TOP_Y, WELL_RADIUS } from './box';
import type { Rect } from './layout';
import { sdRoundGLSL } from './shaders';
import { CardStack } from './stack';
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

interface Label {
  mesh: THREE.Mesh;
  w: number;
  h: number;
}

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

  /** Focused, this section is taller than wide (portrait): facts on top, screenshots below. */
  focusTall = false;

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

  /** elevation: the camera's current elevation (radians), which changes as it moves over a section. */
  update(dt: number, time: number, reveal: number, elevation: number) {
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

    // Stack area: wide sections put it on the right, tall ones below the title; focused, it takes
    // the right side (or, focused in a tall portrait box, the lower part below the facts).
    const wide = w / d > 1.6;
    const band = this.kind.h + this.title.h + this.caption.h + 0.42;
    const m = Math.min(0.2, w * 0.08, d * 0.1);
    const restA = wide
      ? { x0: w * 0.02, x1: w / 2 - m * 0.6, z0: -d / 2 + m * 0.6, z1: d / 2 - m * 0.6 }
      : { x0: -w / 2 + m * 0.6, x1: w / 2 - m * 0.6, z0: -d / 2 + Math.min(band, d * 0.36), z1: d / 2 - m * 0.6 };
    const focA =
      this.focusTall
        ? { x0: -w / 2 + 0.12, x1: w / 2 - 0.12, z0: -d / 2 + d * TALL_SPLIT, z1: d / 2 - 0.12 }
        : { x0: -w / 2 + w * 0.5, x1: w / 2 - 0.12, z0: -d / 2 + 0.12, z1: d / 2 - 0.12 };
    const lerp = THREE.MathUtils.lerp;
    const x0 = lerp(restA.x0, focA.x0, f);
    const x1 = lerp(restA.x1, focA.x1, f);
    const z0 = lerp(restA.z0, focA.z0, f);
    const z1 = lerp(restA.z1, focA.z1, f);
    const aw = Math.max(0.01, x1 - x0);
    const ad = Math.max(0.01, z1 - z0);
    // Deep content looks shifted toward the viewer; pull it back so it reads centred in the opening.
    const shift = Math.min(CARD_DEPTH / Math.tan(elevation), Math.max(0, ad * 0.25));
    this.stack.group.position.set((x0 + x1) / 2, TOP_Y - CARD_DEPTH, (z0 + z1) / 2 - shift);
    const presence = THREE.MathUtils.smoothstep(Math.min(w, d), 0.6, 1.0);
    this.stack.setClip(x, z, w / 2 - 0.01, d / 2 - 0.01, Math.min(WELL_RADIUS, w / 2, d / 2));
    this.stack.update(dt, aw, ad, dim * 0.8 + (1 - reveal), presence);

    // Resting labels: kind, title, caption top-left. A thin strip shows only the title.
    const pad = Math.min(0.24, w * 0.1);
    const textOn = (1 - THREE.MathUtils.smoothstep(f, 0, 0.35)) * reveal * THREE.MathUtils.smoothstep(w, 0.8, 1.3) * THREE.MathUtils.smoothstep(d, 0.36, 0.48);
    const roomy = THREE.MathUtils.smoothstep(d, 0.75, 1.0);
    const textW = wide ? w * 0.5 - pad : w - pad * 2;
    const k = Math.min(1 - 0.4 * (1 - roomy), textW / this.title.w, (d - 0.14) / this.title.h);
    const th = this.title.h * k;
    const kh = this.kind.h;
    const top = -d / 2 + pad;
    const titleZ = lerp(0, top + kh + 0.03 + th / 2, roomy);
    const left = -w / 2 + pad;
    this.place(this.kind, Math.min(1, textW / this.kind.w), left, top + kh / 2, textOn * roomy * (1 - dim));
    this.place(this.title, k, left, titleZ, textOn * (1 - 0.55 * dim));
    const ck = Math.min(1, textW / this.caption.w);
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
