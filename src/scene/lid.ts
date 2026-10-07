import * as THREE from 'three';
import { Spring } from '../anim/springs';
import { settings } from '../config/projects';
import { OUTER_D, OUTER_R, OUTER_W, PORTRAIT, TOP_Y } from './box';
import { beadBlastRoughness, engravingMaps, heightToNormal, type PxBox } from './textures';

const LW = OUTER_W + 0.06;
const LD = OUTER_D + 0.06;
const LR = OUTER_R + 0.03;
const LT = 0.2;
const CHAMFER = 0.035;
const REST_Y = TOP_Y + CHAMFER;

/** The lid's top surface in its own space (the extrusion's front cap: depth plus the bevel). */
export const LID_TOP = LT - CHAMFER;
/** Space Gray anodised aluminium, as on a MacBook. */
const ANODISED = '#7d7e80';
/** Raw aluminium, where the laser has cut through the anodising: bright and a little frosted. */
const RAW = new THREE.Color('#d9dbde');

/**
 * Shades the engraving as cut metal: where the mask says the laser went through the anodising,
 * the surface turns raw aluminium (lighter, a little rougher). The normal map gives the groove.
 */
function engrave(m: THREE.MeshPhysicalMaterial, mask: THREE.Texture) {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uMask = { value: mask };
    sh.uniforms.uRaw = { value: RAW };
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uMask;\nuniform vec3 uRaw;\nfloat cut;')
      .replace(
        '#include <color_fragment>',
        '#include <color_fragment>\ncut = texture2D(uMask, vNormalMapUv).r * (255.0 / 200.0);\ndiffuseColor.rgb = mix(diffuseColor.rgb, uRaw, cut);',
      )
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.55, cut);');
  };
  m.customProgramCacheKey = () => 'lid-engrave';
}

export type LidState = 'closed' | 'leaving' | 'gone' | 'returning';

/** Lid outline: the box's rounded rectangle, slightly oversized. */
function lidShape() {
  const s = new THREE.Shape();
  const x = -LW / 2;
  const y = -LD / 2;
  s.moveTo(x + LR, y);
  s.lineTo(x + LW - LR, y);
  s.quadraticCurveTo(x + LW, y, x + LW, y + LR);
  s.lineTo(x + LW, y + LD - LR);
  s.quadraticCurveTo(x + LW, y + LD, x + LW - LR, y + LD);
  s.lineTo(x + LR, y + LD);
  s.quadraticCurveTo(x, y + LD, x, y + LD - LR);
  s.lineTo(x, y + LR);
  s.quadraticCurveTo(x, y, x + LR, y);
  return s;
}

/**
 * Space Gray anodised aluminium lid: bead-blasted top with a diamond-cut chamfer, laser-engraved
 * with name, role and socials (raw metal shows where the laser cut). The only lit object in the scene.
 */
export class Lid {
  readonly group = new THREE.Group();
  readonly hit: THREE.Object3D;
  state: LidState = 'closed';
  private progress = new Spring(0, 40, 1);
  private lift = new Spring(0, 900, 0.08);
  private rx = new Spring(0, 900, 0.07);
  private rz = new Spring(0, 900, 0.07);
  private nextKnock = 2.0;
  private queued: number[] = [];
  private mats: THREE.MeshPhysicalMaterial[];
  /** The engraving map's size, and each engraved social's box on it. */
  private mapW: number;
  private mapH: number;
  private links: (PxBox & { href: string })[];

  constructor(private reduced: boolean) {
    const aspect = LD / LW;
    // The tall (portrait) lid spans a phone's width (~1200 device px at 3x): a bit over that keeps
    // the engraving crisp without the full desktop map's cost.
    this.mapW = PORTRAIT ? 1600 : 2048;
    this.mapH = Math.round(this.mapW * aspect);
    // Narrow lid: larger type, and the socials one per line.
    const eng = engravingMaps(this.mapW, this.mapH, settings.identity.name, settings.identity.role, settings.socials, {
      scale: PORTRAIT ? 1.3 : 1,
      stack: PORTRAIT,
    });
    this.links = eng.links;
    const normal = heightToNormal(eng.height, 3.6);
    const rough = beadBlastRoughness(1024, Math.round(1024 * aspect));
    // Extrude caps use shape coordinates as UVs: map them onto 0..1.
    for (const t of [normal, rough]) {
      t.repeat.set(1 / LW, 1 / LD);
      t.offset.set(0.5, 0.5);
    }
    // Sampled through the normal map's (already mapped) uv in the shader patch.
    const mask = new THREE.CanvasTexture(eng.mask);
    mask.colorSpace = THREE.NoColorSpace;

    const top = new THREE.MeshPhysicalMaterial({
      color: ANODISED,
      metalness: 1,
      roughness: 1,
      roughnessMap: rough,
      normalMap: normal,
      clearcoat: 0.15, // the anodised oxide layer
      clearcoatRoughness: 0.5,
      transparent: true,
    });
    engrave(top, mask);
    // Diamond-cut edges: polished raw aluminium (cut through the anodising), so they flash as the cursor moves.
    const edge = new THREE.MeshPhysicalMaterial({
      color: '#e4e6e9',
      metalness: 1,
      roughness: 0.08,
      transparent: true,
    });
    this.mats = [top, edge];

    const geo = new THREE.ExtrudeGeometry(lidShape(), {
      depth: LT - CHAMFER * 2,
      bevelEnabled: true,
      bevelThickness: CHAMFER,
      bevelSize: CHAMFER,
      bevelSegments: 1,
      curveSegments: 24,
    });
    geo.rotateX(-Math.PI / 2);
    const lid = new THREE.Mesh(geo, [top, edge]);
    this.group.add(lid);
    this.hit = lid;
    this.group.position.y = REST_Y;
  }

  /** Lift off. Also reverses a lid that is on its way back down, from wherever it is. */
  open() {
    if (this.state !== 'closed' && this.state !== 'returning') return;
    if (this.state === 'closed') this.lift.velocity += 1.4;
    this.state = 'leaving';
    this.progress.target = 1;
  }

  /** Put the lid back on: it comes back down the path it left by and settles with a soft knock. */
  close() {
    if (this.state !== 'gone' && this.state !== 'leaving') return;
    this.state = 'returning';
    this.progress.target = 0;
    this.group.visible = true;
  }

  /** Remove the lid instantly (no animation). */
  skip() {
    this.state = 'gone';
    this.progress.snap(1);
    this.group.visible = false;
  }

  get openness() {
    return this.progress.value;
  }

  /** The social engraved where a ray hit the lid's top, if any. */
  linkAt(hit: THREE.Intersection): string | null {
    if (!hit.uv || !hit.face || hit.face.normal.y < 0.9) return null; // the top cap only
    // Cap uvs are shape coordinates; the map's y runs down while shape y runs to the back.
    const x = (hit.uv.x / LW + 0.5) * this.mapW;
    const y = (0.5 - hit.uv.y / LD) * this.mapH;
    return this.links.find((l) => x >= l.x0 && x <= l.x1 && y >= l.y0 && y <= l.y1)?.href ?? null;
  }

  update(dt: number, time: number) {
    const p = this.progress.step(dt);
    if (this.state === 'leaving' && p > 0.995) {
      this.state = 'gone';
      this.group.visible = false;
    }
    if (this.state === 'returning' && p < 0.004) {
      this.state = 'closed';
      this.nextKnock = time + 3;
      // Landing: a small settle, as if it was set down a touch unevenly.
      this.lift.velocity += 0.5;
      this.rx.velocity += (Math.random() - 0.5) * 0.5;
      this.rz.velocity += (Math.random() - 0.5) * 0.5;
    }

    if (!this.reduced && settings.motion.lidKnock && this.state === 'closed' && time > this.nextKnock) {
      this.nextKnock = time + 3 + Math.random() * 3.5;
      this.queued = [0, 0.15, 0.32].slice(0, Math.random() < 0.5 ? 2 : 3).map((t) => time + t);
    }
    while (this.queued.length && this.queued[0] <= time) {
      this.queued.shift();
      this.lift.velocity += 0.6 + Math.random() * 0.3;
      this.rx.velocity += (Math.random() - 0.5) * 0.4;
      this.rz.velocity += (Math.random() - 0.5) * 0.4;
    }
    const lift = this.lift.step(dt);
    const rx = this.rx.step(dt);
    const rz = this.rz.step(dt);

    // Exit: rises, tips back from the front edge, and leaves up and away, fading.
    const e = p * p * (3 - 2 * p);
    const up = this.reduced ? 0 : e * e;
    this.group.position.set(0, REST_Y + Math.max(0, lift) * 0.06 + e * 1.2 + up * 6, -up * 7);
    this.group.rotation.set(rx * 0.04 - e * 0.55, 0, rz * 0.04 + e * 0.06);
    const fade = 1 - THREE.MathUtils.smoothstep(p, 0.45, 0.95);
    for (const m of this.mats) m.opacity = fade;
  }
}
