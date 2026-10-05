import * as THREE from 'three';

/** Normalised pointer (-1..1) with smoothing, plus a raycaster helper. */
export class Pointer {
  x = 0;
  y = 0;
  sx = 0;
  sy = 0;
  inside = false;
  readonly ndc = new THREE.Vector2();
  private ray = new THREE.Raycaster();
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  constructor(private el: HTMLElement, private camera: THREE.Camera) {
    el.addEventListener('pointermove', (e) => this.set(e));
    el.addEventListener('pointerdown', (e) => this.set(e));
    el.addEventListener('pointerleave', () => (this.inside = false));
  }

  private set(e: PointerEvent) {
    const r = this.el.getBoundingClientRect();
    this.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    this.y = -(((e.clientY - r.top) / r.height) * 2 - 1);
    this.ndc.set(this.x, this.y);
    this.inside = true;
  }

  /** Eases the smoothed values toward the raw ones. */
  update(dt: number) {
    const k = 1 - Math.exp(-dt * 6);
    this.sx += (this.x - this.sx) * k;
    this.sy += (this.y - this.sy) * k;
  }

  cast(objects: THREE.Object3D[], recursive = true) {
    this.ray.setFromCamera(this.ndc, this.camera);
    return this.ray.intersectObjects(objects, recursive);
  }

  /** Point where the pointer ray crosses the horizontal plane y = height. */
  onPlane(height: number, out = new THREE.Vector3()) {
    this.ray.setFromCamera(this.ndc, this.camera);
    this.plane.constant = -height;
    return this.ray.ray.intersectPlane(this.plane, out);
  }
}
