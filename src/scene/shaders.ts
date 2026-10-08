/** Shared GLSL snippets. */

/**
 * Corners are superellipses (|x|^N + |y|^N = r^N), not circular arcs: their curvature eases in from
 * zero at the straight edge instead of jumping, which is what makes a rounded rectangle look smooth.
 */
export const CORNER_N = 3;
/**
 * A superellipse corner of the same radius looks tighter than a circular one (it hugs the sharp
 * corner). Radii are stretched by this, so corners cut off as much as the round ones used to.
 */
export const CORNER_K = 1.42;

export const sdRoundGLSL = /* glsl */ `
float sdRound(vec2 p, vec2 b, float r) {
  r = min(r * ${CORNER_K.toFixed(3)}, min(b.x, b.y));
  vec2 q = abs(p) - b + r;
  vec2 m = max(q, 0.0);
  float corner = pow(m.x * m.x * m.x + m.y * m.y * m.y, 1.0 / ${CORNER_N.toFixed(1)}); // the ${CORNER_N}-norm
  return corner + min(max(q.x, q.y), 0.0) - r;
}
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
`;

export const basicVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
