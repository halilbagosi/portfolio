import * as THREE from 'three';
import { OUTER_D, OUTER_R, OUTER_W, roundedRectShape, TOP_Y, WALL_H } from './box';
import { TEXT_LOD_BIAS } from './textures';

/** Dark anodised plate until the About card is drawn. */
function plainPlate() {
  const t = new THREE.DataTexture(new Uint8Array([11, 11, 12, 255]), 1, 1);
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/**
 * The box's bottom: a plate closing the walls, facing down. It carries the About card, laid out
 * to read upright when the box lies on its back (its front edge then at the top of the screen).
 */
export class Underside {
  readonly mesh: THREE.Mesh;
  private uniforms = { uMap: { value: plainPlate() as THREE.Texture }, uSheen: { value: 0 } };

  constructor() {
    const geo = new THREE.ShapeGeometry(roundedRectShape(OUTER_W, OUTER_D, OUTER_R, new THREE.Shape()), 16);
    // Shape coordinates → 0..1 across the plate, so the card fills it edge to edge.
    const pos = geo.attributes.position;
    const uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / OUTER_W + 0.5, pos.getY(i) / OUTER_D + 0.5);
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap;
        uniform float uSheen;
        varying vec2 vUv;
        void main() {
          vec3 col = texture2D(uMap, vUv, ${TEXT_LOD_BIAS.toFixed(2)}).rgb;
          // A soft band of light drifting across with the parallax, like the walls' sheen.
          col += vec3(0.018) * exp(-pow((vUv.x - 0.5 - uSheen) / 0.22, 2.0));
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    // Facing down; shape +y runs to the box's front (+z), so the card's top is the front edge.
    this.mesh.rotation.x = Math.PI / 2;
    this.mesh.position.y = TOP_Y - WALL_H;
  }

  get texture(): THREE.Texture {
    return this.uniforms.uMap.value;
  }

  /** Sheen position across the plate (0 = centre). */
  set sheen(x: number) {
    this.uniforms.uSheen.value = x;
  }

  setCard(tex: THREE.Texture) {
    this.uniforms.uMap.value = tex;
  }
}
