import * as THREE from 'three';
import { Spring } from '../anim/springs';
import { settings } from '../config/projects';
import { OUTER_D, OUTER_R, OUTER_W, PORTRAIT, roundedRectShape, TOP_Y } from './box';
import { EtchSchedule } from './etch';
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

/** Etch time meaning "long finished": everything cut, cooled. */
const DONE = 1e4;
/** The normal map's chunk with the groove relief scaled by whether the laser has passed. */
const OPENED_NORMALS = THREE.ShaderChunk.normal_fragment_maps.replace('mapN.xy *= normalScale;', 'mapN.xy *= normalScale * opened;');
// A three.js upgrade that rewords the chunk would make the replace above miss: the grooves would then show before they are cut.
if (import.meta.env.DEV && OPENED_NORMALS === THREE.ShaderChunk.normal_fragment_maps) {
  console.warn('lid: normal_fragment_maps no longer contains "mapN.xy *= normalScale;"; grooves will show before the laser cuts them');
}

/** The etch's reveal times as a half-float texture (rows flipped: a DataTexture's first row is v = 0). */
function revealTexture(etch: EtchSchedule) {
  const t = etch.revealTimes(4);
  const data = new Uint16Array(t.width * t.height);
  for (let j = 0; j < t.height; j++)
    for (let i = 0; i < t.width; i++) data[(t.height - 1 - j) * t.width + i] = THREE.DataUtils.toHalfFloat(t.data[j * t.width + i]);
  const tex = new THREE.DataTexture(data, t.width, t.height, THREE.RedFormat, THREE.HalfFloatType);
  // Nearest, not linear: texels outside the lines hold 0, and blending that into a line's edge texels
  // would lower their reveal time, so the letters' edges would show long before the laser reached them.
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Shades the engraving as cut metal, as far as the laser has got: where it has passed (reveal
 * time ≤ etch time) the mask turns the surface raw aluminium (lighter, a little rougher) and the
 * groove's relief appears. Freshly cut metal glows orange and cools through red to nothing.
 */
function engrave(m: THREE.MeshPhysicalMaterial, mask: THREE.Texture, reveal: THREE.Texture) {
  const uniforms = { uMask: { value: mask }, uRaw: { value: RAW }, uReveal: { value: reveal }, uEtchTime: { value: DONE } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform sampler2D uMask;
uniform sampler2D uReveal;
uniform vec3 uRaw;
uniform float uEtchTime;
float cut;    // cut through to raw metal (0..1)
float opened; // the laser has passed here (0 or 1)
float heat;   // freshly cut, still glowing`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
float tCut = texture2D(uReveal, vNormalMapUv).r;
opened = step(tCut, uEtchTime);
cut = texture2D(uMask, vNormalMapUv).r * (255.0 / 200.0) * opened;
heat = cut * exp(-max(uEtchTime - tCut, 0.0) / 0.8);
diffuseColor.rgb = mix(diffuseColor.rgb, uRaw, cut);`,
      )
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.55, cut);')
      .replace('#include <normal_fragment_maps>', OPENED_NORMALS)
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
totalEmissiveRadiance += mix(vec3(0.5, 0.04, 0.0), vec3(1.0, 0.5, 0.12), heat) * heat * 2.5;`,
      );
  };
  m.customProgramCacheKey = () => 'lid-engrave';
  return uniforms;
}

export type LidState = 'closed' | 'leaving' | 'gone' | 'returning';

/** Lid outline: the box's rounded rectangle, slightly oversized. */
const lidShape = () => roundedRectShape(LW, LD, LR, new THREE.Shape(), 24);

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
  /** The laser's route over the engraving. */
  readonly etch: EtchSchedule;
  private cut: { uEtchTime: { value: number } };
  private etchTime = DONE;

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
      clearcoat: 0.06, // the anodised oxide layer
      clearcoatRoughness: 0.5,
      transparent: true,
    });
    // The laser's route: name, role, then the socials, each with its time budget.
    const px = eng.mask.getContext('2d')!.getImageData(0, 0, this.mapW, this.mapH).data;
    const budget = (i: number) => (i === 0 ? 1.6 : i === 1 ? 0.8 : 1.1 / Math.max(1, eng.lines.length - 2));
    this.etch = new EtchSchedule(
      { data: px, width: this.mapW, height: this.mapH, stride: 4 },
      eng.lines.map((b, i) => ({ ...b, duration: budget(i) })),
      Math.max(2, Math.round(this.mapW / 700)),
    );
    this.cut = engrave(top, mask, revealTexture(this.etch));
    // The chamfer: raw aluminium, satin, so it only catches a soft line of light.
    const edge = new THREE.MeshPhysicalMaterial({
      color: '#a9abae',
      metalness: 1,
      roughness: 0.4,
      transparent: true,
    });
    this.mats = [top, edge];

    const geo = new THREE.ExtrudeGeometry(lidShape(), {
      depth: LT - CHAMFER * 2,
      bevelEnabled: true,
      bevelThickness: CHAMFER,
      bevelSize: CHAMFER,
      bevelSegments: 1,
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

  /** The social engraved where a ray hit the lid's top, if any. None before the laser has cut them: a tap there opens the lid. */
  linkAt(hit: THREE.Intersection): string | null {
    if (this.etchTime < this.etch.total) return null;
    if (!hit.uv || !hit.face || hit.face.normal.y < 0.9) return null; // the top cap only
    // Cap uvs are shape coordinates; the map's y runs down while shape y runs to the back.
    const x = (hit.uv.x / LW + 0.5) * this.mapW;
    const y = (0.5 - hit.uv.y / LD) * this.mapH;
    return this.links.find((l) => x >= l.x0 && x <= l.x1 && y >= l.y0 && y <= l.y1)?.href ?? null;
  }

  /** Seconds into the etch: what has been cut by then shows, and freshly cut metal glows. */
  setEtchTime(t: number) {
    this.etchTime = t;
    this.cut.uEtchTime.value = t;
  }

  /** A point just above the lid's top (its own space) for engraving-map pixel (x, y). */
  surfacePoint(x: number, y: number, out: THREE.Vector3) {
    return out.set((x / this.mapW - 0.5) * LW, LID_TOP + 0.003, (y / this.mapH - 0.5) * LD);
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
