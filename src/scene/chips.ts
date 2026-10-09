import * as THREE from 'three';
import { Spring } from '../anim/springs';
import type { Project } from '../config/projects';
import { TOP_Y } from './box';
import { SIDE_SPLIT, TALL_SPLIT } from './well';
import { basicVert, sdRoundGLSL } from './shaders';
import { FONT, labelTexture, specSheetTexture, TEXT_LOD_BIAS, type ChipStyle } from './textures';
import { kindTint, statusTint } from './tints';

/**
 * Liquid glass. A flat 2D panel floating in 3D: it samples the scene behind it (uScene),
 * bends it at the rounded edge like a lens, frosts it, filters it through a tint, and
 * catches a specular rim from the cursor's direction.
 */
const glassFrag = /* glsl */ `
${sdRoundGLSL}
uniform sampler2D uScene;
uniform sampler2D uLabel;
uniform vec2 uRes;
uniform vec2 uSize;
uniform float uRadius;
uniform vec2 uLight;
uniform float uOpacity;
uniform float uPx;
uniform vec3 uTint;
uniform float uTintAmt;
varying vec2 vUv;

float sd(vec2 p) { return sdRound(p, uSize * 0.5, uRadius); }

void main() {
  vec2 p = (vUv - 0.5) * uSize;
  float d = sd(p);
  float aa = fwidth(d) * 0.75;
  float mask = 1.0 - smoothstep(-aa, aa, d);
  if (mask <= 0.0) discard;

  vec2 e = vec2(0.003, 0.0);
  vec2 n = normalize(vec2(sd(p + e.xy) - sd(p - e.xy), sd(p + e.yx) - sd(p - e.yx)) + 1e-5);
  float bevel = min(uRadius, 0.12);
  float edge = 1.0 - smoothstep(0.0, bevel, -d);
  vec2 suv = gl_FragCoord.xy / uRes;

  vec2 off = -n * edge * edge * 0.08 * uPx / uRes;
  float blur = 0.03 * uPx;
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 12; i++) {
    float a = float(i) * 2.39996;
    float r = sqrt((float(i) + 0.5) / 12.0) * blur;
    acc += texture2D(uScene, suv + off + vec2(cos(a), sin(a)) * r / uRes).rgb;
  }
  vec3 col = acc / 12.0;
  col.r = mix(col.r, texture2D(uScene, suv + off * 1.2).r, edge * 0.5);
  col.b = mix(col.b, texture2D(uScene, suv + off * 0.8).b, edge * 0.5);

  col = col * mix(vec3(1.0), uTint * 1.5, uTintAmt) * 1.08 + uTint * uTintAmt * 0.11 + 0.014;

  vec2 L = normalize(uLight + 1e-5);
  float rimLine = 1.0 - smoothstep(0.0, 0.012, -d);
  float spec = pow(max(dot(n, L), 0.0), 4.0);
  col += rimLine * (0.06 + 0.45 * spec);
  col += edge * 0.025 * (0.5 + spec);

  vec4 lab = texture2D(uLabel, vUv, ${TEXT_LOD_BIAS.toFixed(2)});
  col = mix(col, lab.rgb, lab.a);
  gl_FragColor = vec4(col, mask * uOpacity);
  #include <colorspace_fragment>
}
`;

/** Stacked in a tall section: the facts' side inset and text scale (the size they read at on a phone). */
const STACK_INSET = 0.18;
const STACK_TEXT = 0.92;
const FACTS_TOP = 0.22;

const pill = (size: number, weight = 500, color = '#f5f5f7'): ChipStyle => ({
  font: `${weight} ${size}px ${FONT}`,
  color,
  padX: Math.round(size * 0.95),
  padY: Math.round(size * 0.5),
  lineHeight: Math.round(size * 1.3),
});

export interface GlassShared {
  scene: THREE.Texture;
  res: THREE.Vector2;
}

interface LabelTex {
  tex: THREE.Texture;
  w: number;
  h: number;
}

class Chip {
  readonly group = new THREE.Group();
  readonly mesh: THREE.Mesh;
  readonly mat: THREE.ShaderMaterial;
  readonly w: number;
  readonly d: number;
  // Appear: critically damped. Hover tilt: critically damped, a touch slower.
  readonly o = new Spring(0, 170, 1);
  readonly lift = new Spring(0.06, 170, 1);
  readonly tx = new Spring(0, 150, 1);
  readonly tz = new Spring(0, 150, 1);
  readonly hover = new Spring(0, 220, 1);
  delay = 0;
  home = new THREE.Vector3();

  constructor(label: LabelTex, shared: GlassShared, tint: string, tintAmt: number, radius: number, readonly link?: string) {
    this.w = label.w;
    this.d = label.h;
    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uScene: { value: shared.scene },
        uLabel: { value: label.tex },
        uRes: { value: shared.res },
        uSize: { value: new THREE.Vector2(this.w, this.d) },
        uRadius: { value: Math.min(radius, this.d / 2) },
        uLight: { value: new THREE.Vector2(0, 1) },
        uOpacity: { value: 0 },
        uPx: { value: 100 },
        uTint: { value: new THREE.Color(tint) },
        uTintAmt: { value: tintAmt },
      },
      vertexShader: basicVert,
      fragmentShader: glassFrag,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(this.w, this.d), this.mat);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.userData.link = link;
    this.mesh.renderOrder = 2;
    this.group.add(this.mesh);
  }
}

/** Liquid-glass info for one project, laid out over the left part of its expanded section. */
export class ChipSet {
  readonly group = new THREE.Group();
  readonly linkMeshes: THREE.Object3D[] = [];
  private chips: Chip[] = [];
  private shown = false;
  private shownFor = 0;
  /** Built tall: how far down the section the facts reach (from its top edge), for the photos below. */
  factsDepth = 0;
  private built = false;
  private builtD = 0;
  private tallBuilt = false;

  constructor(private project: Project, private shared: GlassShared) {
    this.group.visible = false;
  }

  get textures() {
    return this.chips.map((c) => c.mat.uniforms.uLabel.value as THREE.Texture);
  }

  /** side: a tall section with its photos beside the facts (see Well.focusSide). */
  build(w: number, d: number, side = false) {
    if (this.built) return;
    this.built = true;
    this.builtD = d;
    this.tallBuilt = d > w;
    const p = this.project;
    // Tall (portrait): the facts span the whole width above the screenshots, fields two to a line,
    // so the block is short and the landscape shots below can take the full width too; or, beside
    // phone screenshots, they take the left column at full height.
    const tall = d > w;
    const stacked = tall && !side;
    const maxW = stacked ? w - STACK_INSET * 2 : tall ? w * SIDE_SPLIT - 0.33 : w * 0.44;
    const ts = stacked ? STACK_TEXT : tall ? 1.12 : 1;
    const sh = this.shared;
    const mk = (label: LabelTex, tint: string, amt: number, radius = 1, link?: string) => new Chip(label, sh, tint, amt, radius, link);

    // One panel of facts, set like a spec sheet, and a quiet button per link beneath it.
    const sheet = mk(
      specSheetTexture(
        {
          eyebrow: p.kind,
          eyebrowColor: kindTint(p.kind),
          title: p.title,
          body: p.purpose,
          rows: [
            { label: 'Stack', value: p.stack.join(', ') },
            { label: 'Architecture', value: p.architecture },
            { label: 'Timeline', value: p.duration, half: true },
            { label: 'Status', value: p.status, dot: statusTint(p.status), half: true },
          ],
        },
        maxW,
        ts,
        stacked,
      ),
      '#8E8E93',
      0.04,
      0.16,
    );
    const groups: Chip[][] = [[sheet]];
    if (p.links.length) groups.push(p.links.map((l) => mk(labelTexture([`View on ${l.label}  \u2197`], pill(Math.round(23 * ts), 500, 'rgba(245,245,247,0.92)')), '#8E8E93', 0.04, 1, l.href)));

    // Wrap each group into rows no wider than maxW; groups get more air than rows within them.
    const gap = 0.08;
    const rows: Chip[][] = [];
    const endsGroup: boolean[] = [];
    for (const g of groups) {
      let row: Chip[] = [];
      let rw = 0;
      g.forEach((c, i) => {
        if (row.length && rw + gap + c.w > maxW) {
          rows.push(row);
          endsGroup.push(false);
          row = [];
          rw = 0;
        }
        rw += (row.length ? gap : 0) + c.w;
        row.push(c);
        if (i === g.length - 1) {
          rows.push(row);
          endsGroup.push(true);
        }
      });
    }
    const rowH = rows.map((r) => Math.max(...r.map((c) => c.d)));
    const spacing = rows.map((_, i): number => (i === rows.length - 1 ? 0 : endsGroup[i] ? 0.16 : 0.08));
    const total = rowH.reduce((a, b) => a + b, 0) + spacing.reduce((a, b) => a + b, 0);
    const fit = Math.min(1, (stacked ? d * TALL_SPLIT - 0.3 : d - 0.42) / total);
    this.group.scale.set(fit, 1, fit); // flat panels: scale in plan only, keep their height
    this.factsDepth = FACTS_TOP + total * fit;
    let z = tall ? (-d / 2 + FACTS_TOP) / fit : -total / 2;
    const x0 = (-w / 2 + (stacked ? STACK_INSET : tall ? 0.25 : 0.28)) / fit;
    let order = 0;
    rows.forEach((row, ri) => {
      let x = x0;
      for (const c of row) {
        c.home.set(x + c.w / 2, 0, z + c.d / 2);
        c.group.position.copy(c.home);
        c.delay = order++ * 0.022;
        this.group.add(c.group);
        this.chips.push(c);
        if (c.link) this.linkMeshes.push(c.mesh);
        x += c.w + gap;
      }
      z += rowH[ri] + spacing[ri];
    });
  }

  /**
   * Centre the glass on a section's rect. A tall section's facts hang from its top edge, and it may
   * have been built against a deeper rect than the one it ended up with (see openSizes in main.ts).
   */
  place(r: { x: number; z: number; d: number }) {
    this.group.position.set(r.x, 0, r.z + (this.tallBuilt ? (this.builtD - r.d) / 2 : 0));
  }

  setShown(v: boolean) {
    if (v && !this.shown) this.shownFor = 0;
    this.shown = v;
    if (v) this.group.visible = true;
  }

  /**
   * cursor: pointer position on the chip plane in this group's local space (or null).
   * pxPerUnit: approximate screen pixels per world unit, for blur/refraction scale.
   */
  update(dt: number, cursor: THREE.Vector3 | null, pxPerUnit: number) {
    this.shownFor += dt;
    let anyVisible = false;
    const baseY = TOP_Y + 0.18;
    for (const c of this.chips) {
      // Enter staggered and settle down into place; leave together and faster.
      const on = this.shown && this.shownFor > c.delay;
      c.o.target = on ? 1 : 0;
      c.lift.target = on ? 0 : 0.04;
      const o = c.o.step(this.shown ? dt : dt * 1.8);
      const lift = c.lift.step(dt);

      let near = 0;
      if (cursor && on) {
        const dx = cursor.x - c.home.x;
        const dz = cursor.z - c.home.z;
        near = Math.abs(dx) < c.w / 2 && Math.abs(dz) < c.d / 2 ? 1 : 0;
        const fall = Math.exp(-(dx * dx + dz * dz) / 2.0);
        c.tx.target = THREE.MathUtils.clamp(dz * 0.06, -0.08, 0.08) * fall;
        c.tz.target = THREE.MathUtils.clamp(-dx * 0.04, -0.08, 0.08) * fall;
        c.mat.uniforms.uLight.value.set(dx, -dz);
      } else {
        c.tx.target = c.tz.target = 0;
      }
      c.hover.target = near;
      const h = c.hover.step(dt);
      c.group.position.set(c.home.x, baseY + lift + h * 0.035, c.home.z);
      c.group.rotation.set(c.tx.step(dt), 0, c.tz.step(dt));
      const sc = (0.965 + 0.035 * o) * (1 + h * 0.02);
      c.group.scale.set(sc, 1, sc);
      c.mat.uniforms.uOpacity.value = o;
      c.mat.uniforms.uPx.value = pxPerUnit;
      if (o > 0.002) anyVisible = true;
    }
    if (!anyVisible && !this.shown) this.group.visible = false;
  }
}
