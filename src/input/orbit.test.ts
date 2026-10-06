import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { errorVector, FACE_Q, faceToward, Orbit, topElevation } from './orbit';

const EL = THREE.MathUtils.degToRad(57);
const view = new THREE.Vector3(0, Math.sin(EL), Math.cos(EL));
const K = Math.PI / 800; // radians per pixel: an 800px-tall viewport
const make = (reduced = false) => new Orbit(view, () => K, reduced);
const settle = (o: Orbit, each?: (o: Orbit) => void) => {
  for (let i = 0; i < 600 && !o.atRest; i++) {
    o.update(1 / 60);
    each?.(o);
  }
};
const angleTo = (o: Orbit, f: 'top' | 'bottom') => o.quaternion.angleTo(FACE_Q[f]);

describe('faces', () => {
  it('knows which face looks at the viewer', () => {
    expect(faceToward(FACE_Q.top, view)).toBe('top');
    expect(faceToward(FACE_Q.bottom, view)).toBe('bottom');
  });

  it('measures the viewer’s elevation above the top plane', () => {
    expect(topElevation(FACE_Q.top, view)).toBeCloseTo(Math.sin(EL));
    expect(topElevation(FACE_Q.bottom, view)).toBeCloseTo(-Math.sin(EL));
  });

  it('turns a half turn the way it already spins', () => {
    const away = errorVector(FACE_Q.top, FACE_Q.bottom, new THREE.Vector3(-1, 0, 0));
    const toward = errorVector(FACE_Q.top, FACE_Q.bottom, new THREE.Vector3(1, 0, 0));
    expect(away.x).toBeLessThan(0);
    expect(toward.x).toBeGreaterThan(0);
    expect(away.length()).toBeCloseTo(Math.PI);
  });
});

describe('Orbit', () => {
  it('settles back to the top after a small, slow drag', () => {
    const o = make();
    expect(o.begin(0, 500, 0)).toBe(true);
    o.move(0, 480, 100);
    o.end(400); // paused before letting go: no momentum
    expect(o.engaged).toBe(true);
    settle(o);
    expect(o.atRest).toBe(true);
    expect(o.face).toBe('top');
    expect(angleTo(o, 'top')).toBeLessThan(1e-3);
  });

  it('turns onto its underside after a flick up', () => {
    const o = make();
    o.begin(0, 500, 0);
    o.move(0, 450, 16);
    o.move(0, 400, 32);
    o.end(40);
    settle(o);
    expect(o.face).toBe('bottom');
    expect(angleTo(o, 'bottom')).toBeLessThan(1e-3);
  });

  it('with the lid off, cannot be flicked over and stays above the rim', () => {
    const o = make();
    o.setLimits(false, false);
    o.begin(0, 500, 0);
    let low = 1;
    for (let i = 1; i <= 40; i++) {
      o.move(0, 500 - i * 60, i * 16); // drags up 2400px: far past the rim if unchecked
      low = Math.min(low, topElevation(o.quaternion, view));
    }
    o.end(40 * 16 + 8);
    settle(o, (s) => (low = Math.min(low, topElevation(s.quaternion, view))));
    expect(low).toBeGreaterThanOrEqual(Math.sin(THREE.MathUtils.degToRad(10)) - 1e-6);
    expect(o.face).toBe('top');
    expect(angleTo(o, 'top')).toBeLessThan(1e-3);
  });

  it('keeps the hard stop when a fast flick toward the rim is released with the lid off', () => {
    const o = make();
    o.setLimits(false, false);
    o.begin(0, 800, 0);
    for (let i = 1; i <= 8; i++) o.move(0, 800 - i * 40, i * 16); // 40px every 16ms
    o.end(8 * 16 + 8);
    let low = topElevation(o.quaternion, view);
    o.update(1 / 60);
    low = Math.min(low, topElevation(o.quaternion, view));
    settle(o, (s) => (low = Math.min(low, topElevation(s.quaternion, view))));
    expect(low).toBeGreaterThanOrEqual(Math.sin(THREE.MathUtils.degToRad(10)) - 1e-6);
    expect(o.face).toBe('top');
  });

  it('ignores input while locked', () => {
    const o = make();
    o.setLimits(true, true);
    expect(o.begin(0, 0, 0)).toBe(false);
    o.move(300, 300, 16);
    expect(angleTo(o, 'top')).toBe(0);
  });

  it('flips over its far edge and back, never rolling toward the viewer', () => {
    const o = make();
    o.flip('bottom');
    let towardViewer = -Infinity;
    const up = new THREE.Vector3();
    settle(o, (s) => (towardViewer = Math.max(towardViewer, up.set(0, 1, 0).applyQuaternion(s.quaternion).z)));
    expect(towardViewer).toBeLessThanOrEqual(1e-3); // the top went away from the viewer (allowing for step error at the end)
    expect(o.face).toBe('bottom');
    expect(angleTo(o, 'bottom')).toBeLessThan(1e-3);
    o.flip('top');
    settle(o);
    expect(angleTo(o, 'top')).toBeLessThan(1e-3);
  });

  it('does not flip to the underside with the lid off', () => {
    const o = make();
    o.setLimits(false, false);
    o.flip('bottom');
    expect(o.atRest).toBe(true);
    expect(o.face).toBe('top');
  });

  it('settles back to the top when locked mid-turn', () => {
    const o = make();
    o.flip('bottom');
    o.update(1 / 60);
    o.setLimits(true, true);
    settle(o);
    expect(o.face).toBe('top');
    expect(angleTo(o, 'top')).toBeLessThan(1e-3);
  });

  it('snaps instead of animating under reduced motion', () => {
    const o = make(true);
    o.flip('bottom');
    o.update(1 / 60);
    expect(o.atRest).toBe(true);
    expect(angleTo(o, 'bottom')).toBeLessThan(1e-6);
  });
});
