import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Cadence } from '../anim/cadence';
import { Spring } from '../anim/springs';
import { ELEVATION, OUTER_D, OUTER_W, PIVOT, PORTRAIT, TOP_Y, WALL_H } from './box';

/** Looking (almost) straight down on an open section: no foreshortening of its text and images. */
const TOP_DOWN = THREE.MathUtils.degToRad(87);
/** Overview framing: the box (plus a generous margin) fits the viewport, centred, with room to breathe. */
const REST_W = PORTRAIT ? OUTER_W + 0.9 : 8.0;
const REST_H = PORTRAIT ? OUTER_D * Math.sin(ELEVATION) + WALL_H * Math.cos(ELEVATION) + 1.5 : 6.3;
/** Space kept around an open section when the camera frames it from above. */
const VIEW_MARGIN = 0.7;
const tmpQ = new THREE.Quaternion();

export interface ViewRect {
  x: number;
  z: number;
  w: number;
  d: number;
}

/**
 * Renderer, camera and lid lighting. Everything except the lid is unlit, so the
 * lights and environment here only shape the steel.
 */
export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(24, 1, 0.1, 100);
  readonly lidLight: THREE.PointLight;
  private readonly key: THREE.DirectionalLight;
  /**
   * The box's orientation as seen. Turning it is drawn as the camera and its lights circling the
   * other way: the world stays put, so everything laid out in it (sections, hit-tests) still holds.
   */
  readonly orbit = new THREE.Quaternion();
  private orbitInv = new THREE.Quaternion();
  /** Where the lights sit with the box at rest; they circle with the camera. */
  private keyRest = new THREE.Vector3(-4, 10, 6);
  readonly lidLightRest = new THREE.Vector3(0, 3, 0.5);
  /** The environment's sway with the cursor, before the orbit. */
  readonly envSway = new THREE.Euler();
  /** Scene behind the glass chips, re-rendered each frame they are visible. */
  readonly backdrop: THREE.WebGLRenderTarget;
  readonly res = new THREE.Vector2();
  readonly target = new THREE.Vector3(0, PIVOT.y, 0.05); // middle of the block

  // Camera framing, all eased together (critically damped, ~0.7s): a touch slower than the
  // sections' own layout springs, so the view glides after the grid rather than racing it.
  private cam = (v: number) => new Spring(v, 70, 1);
  private vEl = this.cam(ELEVATION);
  private vX = this.cam(this.target.x);
  private vY = this.cam(this.target.y);
  private vZ = this.cam(this.target.z);
  private vW = this.cam(REST_W);
  private vH = this.cam(REST_H);
  /** 0 at the overview, 1 looking straight down (drives how parallax is applied). */
  private topDown = 0;
  private dpr = 1;
  /** Lowest the pixel ratio may step down to: below 2x, text and edges visibly soften. */
  private minDpr = 1;
  private cadence = new Cadence();
  private lookTarget = new THREE.Vector3();
  private parallax = { x: 0, y: 0 };
  private aspect = 1;
  dist = 20;

  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    if (!this.renderer.capabilities.isWebGL2) throw new Error('WebGL2 required');
    // Phones are 3x and held close: render at full native resolution there so text stays crisp.
    // Larger desktop canvases get 2x, which is plenty at arm's length.
    const native = window.devicePixelRatio || 1;
    const phone = matchMedia('(pointer: coarse)').matches;
    this.dpr = Math.min(native, phone ? 3 : 2);
    this.minDpr = Math.min(this.dpr, 2);
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.85;
    host.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color('#000000');
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.85;
    pmrem.dispose();

    this.key = new THREE.DirectionalLight(0xffffff, 1.2);
    this.key.position.copy(this.keyRest);
    this.lidLight = new THREE.PointLight(0xffffff, 22, 14, 1.4);
    this.lidLight.position.copy(this.lidLightRest);
    this.scene.add(this.key, this.lidLight);

    // Glass blurs what it shows, so its backdrop can be half resolution (a quarter of the pixels).
    this.backdrop = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: true });

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = this.host.clientWidth || window.innerWidth;
    const h = this.host.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.renderer.getDrawingBufferSize(this.res);
    this.backdrop.setSize(Math.ceil(this.res.x / 2), Math.ceil(this.res.y / 2));
    this.aspect = w / h;
    this.camera.aspect = this.aspect;
    this.camera.updateProjectionMatrix();
  }

  setParallax(x: number, y: number) {
    this.parallax.x = x;
    this.parallax.y = y;
  }

  /** Current pixel ratio (for the dev stats readout). */
  get pixelRatio() {
    return this.dpr;
  }

  /** Screen pixels per world unit at distance 1 from the camera (for sizes divided by view depth, like point sprites). */
  get pxPerUnitAtOne() {
    return this.res.y / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2));
  }

  /** Screen pixels per world unit at the box (for glass blur/refraction scale). */
  get pxPerUnit() {
    return this.pxPerUnitAtOne / this.dist;
  }

  /**
   * Overview (null): the box at its usual tilt. A section: the camera moves over it and looks
   * straight down, framing it, so nothing on it is foreshortened. Underside: the same straight-on
   * framing of the whole plate; with the box rolled onto its back (the orbit), that is its bottom.
   */
  setView(r: ViewRect | 'underside' | null, snap = false) {
    if (r === 'underside') {
      this.vEl.target = TOP_DOWN;
      this.vX.target = 0;
      this.vY.target = TOP_Y;
      this.vZ.target = 0;
      this.vW.target = OUTER_W + VIEW_MARGIN;
      this.vH.target = OUTER_D + VIEW_MARGIN;
    } else if (r) {
      this.vEl.target = TOP_DOWN;
      this.vX.target = r.x;
      this.vY.target = TOP_Y;
      this.vZ.target = r.z;
      this.vW.target = r.w + VIEW_MARGIN;
      this.vH.target = r.d + VIEW_MARGIN;
    } else {
      this.vEl.target = ELEVATION;
      this.vX.target = 0;
      this.vY.target = PIVOT.y;
      this.vZ.target = 0.05;
      this.vW.target = REST_W;
      this.vH.target = REST_H;
    }
    if (snap) for (const sp of this.views) sp.snap(sp.target);
  }

  private get views() {
    return [this.vEl, this.vX, this.vY, this.vZ, this.vW, this.vH];
  }

  /**
   * Where the camera is without parallax, for content that compensates for the viewing angle.
   * Parallax is left out on purpose: deep content shifting with it is what reads as depth.
   */
  readonly restEye = new THREE.Vector3();

  update(dt: number) {
    const [baseEl, x, y, z, fw, fh] = this.views.map((sp) => sp.step(dt));
    this.target.set(x, y, z);
    this.topDown = THREE.MathUtils.clamp((baseEl - ELEVATION) / (TOP_DOWN - ELEVATION), 0, 1);
    const vfov = THREE.MathUtils.degToRad(this.camera.fov);
    const t = Math.tan(vfov / 2);
    this.dist = Math.max(fh / 2 / t, fw / 2 / (t * this.aspect));
    this.restEye.set(x, y + Math.sin(baseEl) * this.dist, z + Math.cos(baseEl) * this.dist);

    // Parallax: orbiting a little in azimuth reads as depth at the tilt, but seen from straight
    // above it would spin the picture, so from above it becomes a slight sideways lean instead.
    const k = this.topDown;
    const el = baseEl + this.parallax.y * 0.03;
    const az = this.parallax.x * 0.05 * (1 - k);
    const lean = this.parallax.x * 0.03 * k * this.dist;
    const tg = this.target;
    this.camera.position.set(
      tg.x + Math.sin(az) * this.dist * Math.cos(el) + lean,
      tg.y + Math.sin(el) * this.dist,
      tg.z + Math.cos(az) * this.dist * Math.cos(el),
    );
    // Near straight-down, "up" from world Y is ill-defined (the lean above would roll the picture):
    // hand it over to the box's far edge, so the screen's top stays the box's back.
    this.camera.up.set(0, 1 - k, -k).normalize();
    // Orbit: the camera, its target and the lights circle the box's centre by the inverse of the
    // box's turn, so on screen the box itself turns under a fixed studio light.
    const inv = this.orbitInv.copy(this.orbit).invert();
    const around = (v: THREE.Vector3) => v.sub(PIVOT).applyQuaternion(inv).add(PIVOT);
    around(this.camera.position);
    this.camera.up.applyQuaternion(inv);
    this.camera.lookAt(around(this.lookTarget.copy(tg)));
    around(this.restEye);
    around(this.key.position.copy(this.keyRest));
    around(this.lidLight.position.copy(this.lidLightRest));
    this.scene.environmentRotation.setFromQuaternion(tmpQ.setFromEuler(this.envSway).premultiply(inv));
  }

  /** Steps the pixel ratio down if frames keep missing the display's cadence (keeps motion smooth on slower GPUs). */
  adapt(rawDt: number) {
    if (!this.cadence.push(rawDt) || this.dpr <= this.minDpr) return;
    this.dpr = Math.max(this.minDpr, this.dpr - 0.25);
    this.renderer.setPixelRatio(this.dpr);
    this.resize();
  }

  /** Compile every shader and upload textures up front, so opening a section the first time does not hitch. */
  warm(textures: THREE.Texture[]) {
    this.renderer.compile(this.scene, this.camera);
    for (const t of textures) this.renderer.initTexture(t);
  }

  /** Renders the backdrop for glass first (with glass hidden), then the full frame. */
  render(glass: THREE.Object3D[]) {
    const r = this.renderer;
    if (glass.some((g) => g.visible)) {
      const vis = glass.map((g) => g.visible);
      glass.forEach((g) => (g.visible = false));
      r.setRenderTarget(this.backdrop);
      r.render(this.scene, this.camera);
      r.setRenderTarget(null);
      glass.forEach((g, i) => (g.visible = vis[i]));
    }
    r.render(this.scene, this.camera);
  }
}
