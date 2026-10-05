import * as THREE from 'three';
import { Spring } from '../anim/springs';
import { OUTER_D, OUTER_R, OUTER_W, PORTRAIT, TOP_Y } from './box';
import { brushedRoughness, engravingMaps, heightToNormal } from './textures';

const LW = OUTER_W + 0.06;
const LD = OUTER_D + 0.06;
const LR = OUTER_R + 0.03;
const LT = 0.2;
const CHAMFER = 0.035;
const REST_Y = TOP_Y + CHAMFER;

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
 * Machined aluminium lid: brushed top with a diamond-cut chamfer, engraved with a name
 * and role. The only lit object in the scene.
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

  constructor(private reduced: boolean) {
    const aspect = LD / LW;
    // The tall (portrait) lid spans a phone's width (~1200 device px at 3x): a bit over that keeps
    // the engraving crisp without the full desktop map's cost.
    const res = PORTRAIT ? 1600 : 2048;
    // Narrow lid: set the name larger so it reads at phone size.
    const { height, mask } = engravingMaps(res, Math.round(res * aspect), PORTRAIT ? 1.3 : 1);
    const normal = heightToNormal(height, 3.6);
    const rough = brushedRoughness(1024, Math.round(1024 * aspect), mask);
    const color = new THREE.CanvasTexture(height);
    color.colorSpace = THREE.SRGBColorSpace;
    color.anisotropy = 8;
    // Extrude caps use shape coordinates as UVs: map them onto 0..1.
    for (const t of [normal, rough, color]) {
      t.repeat.set(1 / LW, 1 / LD);
      t.offset.set(0.5, 0.5);
    }

    const tint = new THREE.Color('#d6d9de');
    const top = new THREE.MeshPhysicalMaterial({
      color: tint,
      map: color,
      metalness: 1,
      roughness: 1,
      roughnessMap: rough,
      normalMap: normal,
      anisotropy: 0.7,
      clearcoat: 0.1,
      clearcoatRoughness: 0.4,
      transparent: true,
    });
    // Diamond-cut edges: polished, so they flash as the cursor moves.
    const edge = new THREE.MeshPhysicalMaterial({
      color: '#eef0f3',
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

    if (!this.reduced && this.state === 'closed' && time > this.nextKnock) {
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
