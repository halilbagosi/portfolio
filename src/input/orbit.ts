import * as THREE from 'three';

export type Face = 'top' | 'bottom';

const X = new THREE.Vector3(1, 0, 0);
const UP = new THREE.Vector3(0, 1, 0);

/** Resting orientations: as it sits, or rolled back over its far edge onto its lid. */
export const FACE_Q: Record<Face, THREE.Quaternion> = {
  top: new THREE.Quaternion(),
  bottom: new THREE.Quaternion().setFromAxisAngle(X, -Math.PI),
};

/** Lid off: lowest the viewer may get above the top plane (soft limit, then a hard stop). */
const MIN_OPEN = Math.sin(THREE.MathUtils.degToRad(20));
const HARD_OPEN = Math.sin(THREE.MathUtils.degToRad(10));
/** Settle spring, critically damped (~0.5 s). */
const STIFF = 60;
const DAMP = 2 * Math.sqrt(STIFF);
/** How far a flick is projected ahead to pick the face it is heading for (seconds, capped angle). */
const TAU = 0.35;
const MAX_LEAD = 1.9;
const MAX_W = 12;
/** A pause this long before letting go means there is no flick. */
const STILL_MS = 80;

const tmpV = new THREE.Vector3();

/** Sine of the viewer's elevation above the box's top plane (`view`: unit direction from the box to the viewer). */
export function topElevation(q: THREE.Quaternion, view: THREE.Vector3) {
  return tmpV.copy(UP).applyQuaternion(q).dot(view);
}

/** The face turned toward the viewer. */
export function faceToward(q: THREE.Quaternion, view: THREE.Vector3): Face {
  return topElevation(q, view) >= 0 ? 'top' : 'bottom';
}

/** Where a box turning at ω would end up as its spin dies away (lead capped below a half turn). */
export function project(q: THREE.Quaternion, omega: THREE.Vector3, tau: number) {
  const angle = Math.min(omega.length() * tau, MAX_LEAD);
  if (angle < 1e-6) return q.clone();
  return new THREE.Quaternion().setFromAxisAngle(omega.clone().normalize(), angle).multiply(q);
}

/**
 * Rotation vector (axis × angle) from q to target the short way. Near a half turn both ways are
 * about as short, so it keeps going the way it already spins (ω): a flick decides the direction.
 */
export function errorVector(q: THREE.Quaternion, target: THREE.Quaternion, omega: THREE.Vector3, out = new THREE.Vector3()) {
  const e = target.clone().multiply(q.clone().invert());
  if (e.w < 0) e.set(-e.x, -e.y, -e.z, -e.w);
  const s = Math.sqrt(Math.max(0, 1 - e.w * e.w));
  if (s < 1e-7) return out.set(0, 0, 0);
  let angle = 2 * Math.acos(Math.min(1, e.w));
  out.set(e.x / s, e.y / s, e.z / s);
  if (angle > 2.5 && out.dot(omega) < 0) {
    out.negate();
    angle = 2 * Math.PI - angle;
  }
  return out.multiplyScalar(angle);
}

/**
 * The box in the hand. Dragging turns it about world axes as seen (sideways about the vertical,
 * up and down about the horizontal), so it always follows the finger. Let go and it springs to a
 * resting face, carrying the flick's momentum. A quick flick up rolls it onto its back.
 * The scene draws this by orbiting the camera the other way (Stage).
 */
export class Orbit {
  readonly quaternion = new THREE.Quaternion();
  /** Angular velocity (world axes, rad/s). */
  readonly omega = new THREE.Vector3();
  /** The face it rests on, or is heading to. */
  face: Face = 'top';
  private mode: 'rest' | 'drag' | 'settle' = 'rest';
  private lidOn = true;
  private locked = false;
  private last = { x: 0, y: 0, t: 0 };
  private flick = new THREE.Vector3();
  private stepQ = new THREE.Quaternion();
  private err = new THREE.Vector3();
  private axis = new THREE.Vector3();

  constructor(
    private view: THREE.Vector3,
    private radPerPx: () => number,
    private reduced = false,
  ) {}

  /** From grabbing until it has come to rest. */
  get engaged() {
    return this.mode !== 'rest';
  }

  get atRest() {
    return this.mode === 'rest';
  }

  get dragging() {
    return this.mode === 'drag';
  }

  /**
   * Lid on: free, and both faces. Lid off: stays above the rim and on the top. Locked (a section is
   * open, the lid is moving): no input, and it goes back to the top.
   */
  setLimits(lidOn: boolean, locked: boolean) {
    this.lidOn = lidOn;
    this.locked = locked;
    if (locked && this.mode === 'drag') {
      this.omega.set(0, 0, 0);
      this.settleTo('top');
    }
    if ((locked || !lidOn) && this.face !== 'top') this.settleTo('top');
  }

  begin(x: number, y: number, now = performance.now()) {
    if (this.locked) return false;
    this.mode = 'drag';
    this.omega.set(0, 0, 0);
    this.flick.set(0, 0, 0);
    this.last = { x, y, t: now };
    return true;
  }

  move(x: number, y: number, now = performance.now()) {
    if (this.mode !== 'drag') return;
    const k = this.radPerPx();
    const dt = Math.max(1e-3, (now - this.last.t) / 1000);
    const yaw = (x - this.last.x) * k; // right: the front turns right (about world Y)
    let pitch = (y - this.last.y) * k; // up: the top rolls away (about world X, negative)
    this.last = { x, y, t: now };
    const before = topElevation(this.quaternion, this.view);
    let next = this.turned(yaw, pitch);
    if (!this.lidOn) {
      // Above the rim only: past the soft limit the drag gets heavy, at the hard stop it stops.
      const e = topElevation(next, this.view);
      if (e < MIN_OPEN && e < before) {
        pitch *= 0.25;
        next = this.turned(yaw, pitch);
        if (topElevation(next, this.view) < HARD_OPEN) next = this.turned(yaw, (pitch = 0));
        if (topElevation(next, this.view) < HARD_OPEN) {
          this.flick.multiplyScalar(0.5); // a rejected step is no flick: don't release a stale velocity
          return;
        }
      }
    }
    this.quaternion.copy(next).normalize();
    // Velocity for the flick: a short running average of the drag.
    this.flick.lerp(tmpV.set(pitch / dt, yaw / dt, 0), 1 - Math.exp(-dt / 0.05));
  }

  end(now = performance.now()) {
    if (this.mode !== 'drag') return;
    this.omega.copy(now - this.last.t > STILL_MS ? tmpV.set(0, 0, 0) : this.flick).clampLength(0, MAX_W);
    // Lid off: only the turn about the vertical carries on. Pitch momentum would coast the camera
    // past the hard stop (the settle spring has no elevation clamp); yaw cannot change elevation.
    if (!this.lidOn) this.omega.set(0, this.omega.y, 0);
    this.settleTo(this.lidOn ? faceToward(project(this.quaternion, this.omega, TAU), this.view) : 'top');
  }

  /** Turn to a face: onto its back over the far edge, or back toward the viewer. */
  flip(face: Face) {
    if (this.locked || this.mode === 'drag' || face === this.face || (face === 'bottom' && !this.lidOn)) return;
    this.omega.set(face === 'bottom' ? -6 : 6, 0, 0);
    this.settleTo(face);
  }

  /** Straight to a face, no motion. */
  snap(face: Face) {
    this.face = face;
    this.quaternion.copy(FACE_Q[face]);
    this.omega.set(0, 0, 0);
    this.mode = 'rest';
  }

  update(dt: number) {
    if (this.mode !== 'settle') return;
    if (this.reduced) return this.snap(this.face);
    const n = Math.max(1, Math.ceil(dt * 120));
    const h = dt / n;
    const target = FACE_Q[this.face];
    for (let i = 0; i < n; i++) {
      errorVector(this.quaternion, target, this.omega, this.err);
      this.omega.addScaledVector(this.err, STIFF * h).addScaledVector(this.omega, -DAMP * h);
      const w = this.omega.length();
      if (w > 1e-9) {
        this.stepQ.setFromAxisAngle(this.axis.copy(this.omega).divideScalar(w), w * h);
        this.quaternion.premultiply(this.stepQ).normalize();
      }
    }
    if (errorVector(this.quaternion, target, this.omega, this.err).length() < 1e-3 && this.omega.length() < 1e-2) this.snap(this.face);
  }

  private settleTo(face: Face) {
    this.face = face;
    this.mode = 'settle';
  }

  /** The current orientation turned by yaw (world Y) and pitch (world X), as seen. */
  private turned(yaw: number, pitch: number) {
    return new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ')).multiply(this.quaternion);
  }
}
