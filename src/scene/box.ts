import * as THREE from 'three';
import { basicVert, sdRoundGLSL } from './shaders';

/**
 * Portrait screens (phones) get a tall, narrow box with the projects stacked as rows, seen from
 * a little higher so text lying on the plate reads larger. Decided once per load; main.ts reloads
 * if the viewport flips orientation.
 */
export const isPortraitViewport = () => innerWidth / innerHeight < 0.8;
export const PORTRAIT = isPortraitViewport();
export const INTERIOR_W = PORTRAIT ? 3.9 : 6;
export const INTERIOR_D = PORTRAIT ? 7 : 3.9;
export const MARGIN = 0.17;
export const GAP = 0.14;
export const TOP_Y = 0.9;
/** Outer wall height: taller than the top plate sits above the table, so the box reads as a solid block. */
export const WALL_H = 1.5;
export const CARD_DEPTH = 0.24;
export const WELL_RADIUS = 0.2;
export const OUTER_W = INTERIOR_W + MARGIN * 2;
export const OUTER_D = INTERIOR_D + MARGIN * 2;
export const OUTER_R = WELL_RADIUS + MARGIN;
export const MAX_WELLS = 12;
/** Camera elevation, shared so deep content can be offset to look centred in its opening. */
export const ELEVATION = THREE.MathUtils.degToRad(PORTRAIT ? 64 : 57);

/** Points around a rounded rectangle (x, z), counter-clockwise seen from above. */
export function roundedRing(w: number, d: number, r: number, seg = 10, out: number[] = []) {
  out.length = 0;
  r = Math.max(0.001, Math.min(r, w / 2, d / 2));
  const corners: [number, number, number][] = [
    [w / 2 - r, d / 2 - r, 0],
    [-w / 2 + r, d / 2 - r, Math.PI / 2],
    [-w / 2 + r, -d / 2 + r, Math.PI],
    [w / 2 - r, -d / 2 + r, (3 * Math.PI) / 2],
  ];
  for (const [cx, cz, a0] of corners) {
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (i / seg) * (Math.PI / 2);
      out.push(cx + Math.cos(a) * r, cz + Math.sin(a) * r);
    }
  }
  return out;
}

/** Open vertical tube along a rounded-rect outline. Attribute `aV`: 0 at the top ring, 1 at the bottom. */
export function tubeGeometry(seg = 10) {
  const count = 4 * (seg + 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 2 * 3), 3));
  const v = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) v[count + i] = 1;
  g.setAttribute('aV', new THREE.BufferAttribute(v, 1));
  const idx: number[] = [];
  for (let i = 0; i < count; i++) {
    const j = (i + 1) % count;
    idx.push(i, count + i, j, j, count + i, count + j);
  }
  g.setIndex(idx);
  return g;
}

const ringTmp: number[] = [];
export function updateTube(g: THREE.BufferGeometry, w: number, d: number, r: number, height: number, seg = 10) {
  const ring = roundedRing(w, d, r, seg, ringTmp);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const n = ring.length / 2;
  for (let i = 0; i < n; i++) {
    pos.setXYZ(i, ring[i * 2], 0, ring[i * 2 + 1]);
    pos.setXYZ(n + i, ring[i * 2], -height, ring[i * 2 + 1]);
  }
  pos.needsUpdate = true;
  g.computeBoundingSphere();
}

/** Rounded-rectangle outline on a shape or path (x, y), centred. */
function roundedRectShape<T extends THREE.Path>(w: number, d: number, r: number, path: T): T {
  const x = -w / 2;
  const y = -d / 2;
  r = Math.max(0.0001, r);
  path.moveTo(x + r, y);
  path.lineTo(x + w - r, y);
  path.quadraticCurveTo(x + w, y, x + w, y + r);
  path.lineTo(x + w, y + d - r);
  path.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  path.lineTo(x + r, y + d);
  path.quadraticCurveTo(x, y + d, x, y + d - r);
  path.lineTo(x, y + r);
  path.quadraticCurveTo(x, y, x + r, y);
  return path;
}

/**
 * Outer walls: dark anodised sides that catch a little light along the top and fall away into
 * black toward the table, which gives the box its depth. The front face (toward the viewer) is
 * lit more than the grazing sides, and a soft sheen follows the parallax.
 */
function createShell() {
  const geo = tubeGeometry(12);
  updateTube(geo, OUTER_W, OUTER_D, OUTER_R, WALL_H, 12);
  const uniforms = { uSheen: { value: 0 } };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    // Outward faces only: the sections look through the box, and its inner faces must not block them.
    side: THREE.BackSide, // the ring winds clockwise seen from outside, so its outward faces are the back faces
    vertexShader: /* glsl */ `
      attribute float aV;
      varying float vV;
      varying vec3 vWorld;
      void main() {
        vV = aV;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      ${sdRoundGLSL}
      uniform float uSheen;
      varying float vV;
      varying vec3 vWorld;
      void main() {
        // Flat-ish normal from screen derivatives: which way this bit of wall faces in plan.
        vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
        vec2 nxz = normalize(n.xz + 1e-5);
        float front = smoothstep(0.0, 1.0, abs(nxz.y));    // faces toward / away from the viewer
        float left = smoothstep(0.2, 1.0, abs(nxz.x)) * step(vWorld.x, 0.0); // the key light is up and left
        float face = 0.45 + 0.55 * front + 0.2 * left;

        // Falloff into black: bright just under the rim, gone well before the table.
        float fall = pow(1.0 - smoothstep(0.0, 0.85, vV), 1.8);
        vec3 col = vec3(0.042) * fall * face;
        // Sheen: a soft vertical band of light drifting across the front with the parallax.
        col += vec3(0.03) * exp(-pow((vWorld.x - uSheen) / 1.6, 2.0)) * fall * front;
        // Rim: a hairline where the wall meets the top, like a chamfer catching light.
        col += vec3(0.06) * (1.0 - smoothstep(0.0, 0.035, vV)) * (0.6 + 0.4 * front);
        col += (hash(gl_FragCoord.xy) - 0.5) / 255.0; // dither: no banding in the long gradient
        gl_FragColor = vec4(max(col, 0.0), 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = TOP_Y;
  mesh.renderOrder = -2; // before the section shafts, which are drawn over everything behind them
  return { mesh, uniforms };
}

/**
 * The top surface with every section cut out of it. Each opening gets a hairline lip;
 * the glow stays inside the sections, so the surface itself stays black.
 */
function createTopPlate() {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uSize: { value: new THREE.Vector2(OUTER_W, OUTER_D) },
      uOuterR: { value: OUTER_R },
      uR: { value: WELL_RADIUS },
      uRects: { value: Array.from({ length: MAX_WELLS }, () => new THREE.Vector4()) },
      uCol: { value: Array.from({ length: MAX_WELLS }, () => new THREE.Color()) },
      uI: { value: new Array(MAX_WELLS).fill(0) },
      uCount: { value: 0 },
    },
    vertexShader: basicVert,
    fragmentShader: /* glsl */ `
      ${sdRoundGLSL}
      #define MAXW ${MAX_WELLS}
      uniform vec2 uSize; uniform float uOuterR; uniform float uR;
      uniform vec4 uRects[MAXW]; uniform vec3 uCol[MAXW]; uniform float uI[MAXW]; uniform int uCount;
      varying vec2 vUv;
      void main() {
        vec2 p = (vUv - 0.5) * uSize;
        p.y = -p.y; // plane v runs toward -z; work in (x, z)
        float outer = sdRound(p, uSize * 0.5, uOuterR);
        float dmin = 1e3;
        for (int i = 0; i < MAXW; i++) {
          if (i >= uCount) break;
          vec4 r = uRects[i];
          float d = sdRound(p - r.xy, r.zw * 0.5, min(uR, min(r.z, r.w) * 0.5));
          dmin = min(dmin, d);
        }
        // Everything in screen pixels: a hard cut (discard) or a sub-pixel band breaks into
        // stair-stepped dashes on the grazing, foreshortened edges. Edges get exact pixel
        // coverage instead, and the lip is never thinner than one pixel (a thinner line keeps
        // its brightness by fading rather than breaking up).
        float px = max(length(vec2(dFdx(dmin), dFdy(dmin))), 1e-5);
        float pxo = max(length(vec2(dFdx(outer), dFdy(outer))), 1e-5);
        float e = dmin / px;                                   // pixels from the opening
        float cover = clamp(e + 0.5, 0.0, 1.0) * clamp(-outer / pxo + 0.5, 0.0, 1.0);
        if (cover <= 0.0) discard;
        float lipPx = 0.009 / px;                              // the lip's true width in pixels
        float lw = max(1.0, lipPx);
        float lip = (clamp(e + 0.5, 0.0, 1.0) - clamp(e - lw + 0.5, 0.0, 1.0)) * min(1.0, lipPx);
        float rim = clamp(1.0 - (-outer / pxo - 0.5) / max(1.0, 0.02 / pxo), 0.0, 1.0);
        vec3 col = vec3(0.0022) + vec3(0.001) * (p.y / uSize.y); // near-black, faint front-to-back falloff
        col += vec3(0.05) * lip;                                 // lip of each opening
        col += vec3(0.03) * rim;                                 // outer edge catch
        col += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
        gl_FragColor = vec4(col, cover);
        #include <colorspace_fragment>
      }`,
  });
  // Blended rather than cut out, so the openings' edges are antialiased. It sorts after the
  // screenshot cards (negative renderOrder) and before the labels and glass on top of it.
  mat.transparent = true;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(OUTER_W, OUTER_D), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = TOP_Y;
  return { mesh, uniforms: mat.uniforms };
}

export type TopPlate = ReturnType<typeof createTopPlate>;

export function createBox() {
  const group = new THREE.Group();
  const shell = createShell();
  group.add(shell.mesh);
  const top = createTopPlate();
  group.add(top.mesh);

  // Table: black like the page, with the box footprint cut out. The wells run far below it;
  // this keeps them visible only through their openings.
  const table = roundedRectShape(80, 80, 0, new THREE.Shape());
  table.holes.push(roundedRectShape(OUTER_W - 0.02, OUTER_D - 0.02, OUTER_R, new THREE.Path()));
  const tableMesh = new THREE.Mesh(new THREE.ShapeGeometry(table, 16), new THREE.MeshBasicMaterial({ color: '#000000' }));
  tableMesh.rotation.x = -Math.PI / 2;
  tableMesh.position.y = TOP_Y - WALL_H; // at the foot of the walls
  tableMesh.renderOrder = -2;
  group.add(tableMesh);

  return { group, top, shell: shell.uniforms };
}
