import * as THREE from 'three';
import { LID_TOP, type Lid } from './lid';

/**
 * Above the lid (a transparent mesh at order 0) and the section glass (2): the spot is drawn over
 * the metal it is on, whichever way the sort by depth would have put them.
 */
const ORDER = 3;

const SPARKS = 200;
const GRAVITY = -4.5;
/** Seconds before the laser starts: shaders and textures have warmed by then. */
const DELAY = 0.5;
/** Seconds after the last cut for the glow to cool before the effect is put away. */
const COOL = 1.5;

/** Soft round glow: white, alpha falling off from the centre. */
function glowTexture() {
  const s = 64;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  return new THREE.CanvasTexture(c);
}

const glowMat = (map: THREE.Texture, color: string) =>
  new THREE.SpriteMaterial({ map, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, opacity: 0 });

/**
 * The laser at work on the lid when the page first loads: a white-hot spot with a violet halo, a
 * small light skimming the metal with it, and orange sparks thrown off while it cuts. The visible
 * parts live in the lid's group, so they ride the lid's knocks; the light lives in the scene (see
 * `light`) and is placed from the lid's transform. It drives the lid's etch time; the lid shades what
 * has been cut, and the glow of fresh grooves.
 */
export class Laser {
  done = false;
  private t = -DELAY;
  private core: THREE.Sprite;
  private halo: THREE.Sprite;
  /**
   * In the scene, not the lid's group: three only counts lights of visible objects, and the lid is
   * hidden once it is gone, which would change the light count and recompile every lit material.
   */
  private light = new THREE.PointLight('#d4c8ff', 0, 0.9, 2);
  private at = new THREE.Vector3();
  private sparks: THREE.Points;
  private pos = new Float32Array(SPARKS * 3);
  private vel = new Float32Array(SPARKS * 3);
  private life = new Float32Array(SPARKS);
  private span = new Float32Array(SPARKS).fill(1);
  private heat = new Float32Array(SPARKS);
  private next = 0;
  private carry = 0;
  private spot = new THREE.Vector3();

  constructor(
    private lid: Lid,
    scene: THREE.Object3D,
  ) {
    const glow = glowTexture();
    this.core = new THREE.Sprite(glowMat(glow, '#ffffff'));
    this.core.scale.setScalar(0.05);
    this.halo = new THREE.Sprite(glowMat(glow, '#8f7dff'));
    this.halo.scale.setScalar(0.26);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('aHeat', new THREE.BufferAttribute(this.heat, 1));
    this.sparks = new THREE.Points(
      geo,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uScale: { value: 1 } },
        vertexShader: /* glsl */ `
          attribute float aHeat;
          uniform float uScale;
          varying float vHeat;
          void main() {
            vHeat = aHeat;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = max(1.0, 0.012 * uScale * (0.4 + aHeat) / -mv.z);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          varying float vHeat;
          void main() {
            float a = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5));
            vec3 c = mix(vec3(0.7, 0.08, 0.0), vec3(1.0, 0.75, 0.35), vHeat);
            gl_FragColor = vec4(c * vHeat * 2.0, a * vHeat);
          }`,
      }),
    );
    this.sparks.frustumCulled = false; // they fly about; the bounds would go stale
    for (const o of [this.core, this.halo, this.sparks]) o.renderOrder = ORDER;
    lid.group.add(this.core, this.halo, this.sparks);
    scene.add(this.light);
    lid.setEtchTime(-1); // nothing cut yet
  }

  /** The last groove is cut (the glow may still be cooling). */
  get cutDone() {
    return this.done || this.t >= this.lid.etch.total;
  }

  /** `pxScale`: device pixels per world unit at distance 1 (for the sparks' size). */
  update(dt: number, pxScale: number) {
    if (this.done) return;
    this.t += dt;
    const etch = this.lid.etch;
    this.lid.setEtchTime(this.t < 0 ? -1 : this.t);
    const s = etch.spotAt(Math.max(0, this.t));
    const active = this.t >= 0 && this.t < etch.total;
    const on = active && s.firing;
    this.lid.surfacePoint(s.x, s.y, this.spot);
    const flicker = 0.75 + Math.random() * 0.25;
    this.core.position.copy(this.spot);
    this.halo.position.copy(this.spot);
    this.core.material.opacity = on ? flicker : active ? 0.08 : 0;
    this.halo.material.opacity = on ? 0.55 * flicker : active ? 0.04 : 0;
    this.lid.group.updateWorldMatrix(true, false); // the lid moved this frame; its world matrix is only refreshed at render
    this.light.position.copy(this.lid.group.localToWorld(this.at.copy(this.spot)));
    this.light.position.y += 0.06;
    this.light.intensity = on ? 2.5 * flicker : 0;
    if (on) {
      this.carry += dt * 120;
      while (this.carry >= 1) {
        this.carry--;
        this.emit();
      }
    }
    this.stepSparks(dt);
    (this.sparks.material as THREE.ShaderMaterial).uniforms.uScale.value = pxScale;
    if (this.t > etch.total + COOL) this.finish();
  }

  /** Ends the etch at once: everything cut and cooled, the effect put away. */
  finish() {
    if (this.done) return;
    this.done = true;
    this.lid.setEtchTime(1e4);
    this.core.visible = this.halo.visible = this.sparks.visible = false;
    this.light.intensity = 0; // stays in the scene, always: the number of lights is part of every lit shader
  }

  private emit() {
    const i = this.next;
    this.next = (this.next + 1) % SPARKS;
    const k = i * 3;
    this.pos[k] = this.spot.x;
    this.pos[k + 1] = this.spot.y;
    this.pos[k + 2] = this.spot.z;
    this.vel[k] = (Math.random() - 0.5) * 1.6;
    this.vel[k + 1] = 0.6 + Math.random();
    this.vel[k + 2] = (Math.random() - 0.5) * 1.6;
    this.life[i] = this.span[i] = 0.3 + Math.random() * 0.4;
  }

  private stepSparks(dt: number) {
    for (let i = 0; i < SPARKS; i++) {
      if (this.life[i] <= 0) {
        this.heat[i] = 0;
        continue;
      }
      const k = i * 3;
      this.vel[k + 1] += GRAVITY * dt;
      this.pos[k] += this.vel[k] * dt;
      this.pos[k + 1] += this.vel[k + 1] * dt;
      this.pos[k + 2] += this.vel[k + 2] * dt;
      this.life[i] -= dt;
      if (this.pos[k + 1] < LID_TOP) this.life[i] = 0; // fell back onto the metal
      this.heat[i] = Math.max(0, this.life[i] / this.span[i]);
    }
    this.sparks.geometry.attributes.position.needsUpdate = true;
    this.sparks.geometry.attributes.aHeat.needsUpdate = true;
  }
}
