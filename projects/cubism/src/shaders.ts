// vertex.cg, tile.cg and postprocess.cgfx from the 2013 final project, in GLSL ES 3.0.

// Each object is drawn into its tile textures with this: mostly its own texture, tinted
// by its raw object-space normal.
export const itemVertex = /* glsl */ `
out vec2 vUv;
out vec3 vNormal;
void main() {
  vUv = uv;
  vNormal = normal;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const itemFragment = /* glsl */ `
uniform sampler2D uMap;
in vec2 vUv;
in vec3 vNormal;
out vec4 fragColor;
void main() {
  fragColor = vec4(0.2 * vNormal + 0.8 * texture(uMap, vUv).rgb, 1.0);
}
`;

// A tile: one of the nine views of an object, on a quad that faces the viewer and whose
// corners are pushed around by random amounts chosen from where you are looking.
export const tileVertex = /* glsl */ `
in vec2 aCorner;           // -1 or 1 per axis
uniform vec2 uCenter;      // the tile's place in its 3×3 grid
uniform vec3 uJitter;      // x1, x2, x3 of updateTile
uniform float uHalf;
uniform float uScale;     // the object's realSize
out vec2 vUv;
void main() {
  vUv = aCorner * 0.5 + 0.5;
  // updateTile's corner offsets, per corner, as in the original.
  vec2 j = aCorner.x < 0.0
    ? (aCorner.y < 0.0 ? vec2(uJitter.x, uJitter.y) : vec2(uJitter.z, uJitter.x + uJitter.y))
    : (aCorner.y < 0.0 ? vec2(uJitter.y, uJitter.z) : vec2(uJitter.z + uJitter.y, uJitter.x));
  vec3 p = vec3(uCenter + aCorner * uHalf + j * uScale, uJitter.z * 0.01 * uScale);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

// Silhouettes from a 4×4 box filter compared with the center tap; everything else is
// the view mixed with a brush-stroke texture that also sets the opacity.
export const tileFragment = /* glsl */ `
uniform sampler2D uView;
uniform sampler2D uBrush;
uniform vec2 uTexel;
in vec2 vUv;
out vec4 fragColor;
void main() {
  vec4 sum = vec4(0.0);
  for (int y = -1; y <= 2; y++)
    for (int x = -1; x <= 2; x++)
      sum += texture(uView, vUv + vec2(x, y) * uTexel);
  vec4 t1 = texture(uView, vUv);
  vec4 edge = abs(sum - t1 * 16.0);
  if (edge.r + edge.g + edge.b > 1.0) {
    fragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }
  vec4 t2 = texture(uBrush, vec2(1.0 - vUv.x, vUv.y));
  float w = 1.0 - t2.r;
  vec4 c = w * vec4(t2.rgb, w) + 2.0 * (1.0 - w) * t1;
  fragColor = vec4(c.rgb * 0.4, clamp(c.a, 0.0, 1.0));
}
`;

export const postVertex = /* glsl */ `
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

// The painting pass: where the frame is far from mid-gray it keeps its own color (and a
// little paper), elsewhere the canvas shows through; then a warm sepia and a vignette.
export const postFragment = /* glsl */ `
uniform sampler2D uScene;
uniform sampler2D uCanvas;
uniform sampler2D uPaper;
in vec2 vUv;
out vec4 fragColor;
void main() {
  vec4 s = texture(uScene, vUv);
  vec3 d = abs(s.rgb - 0.7);
  float x = d.x + d.y + d.z;
  vec3 c = x * (2.0 * s.rgb + texture(uPaper, vUv).rgb * 0.2) + 0.5 * (1.0 - x) * texture(uCanvas, vUv).rgb;
  c = (c + vec3(0.429, 0.1718, 0.0742)) / 2.0;
  float fade = abs(vUv.x - 0.5) + abs(vUv.y - 0.5);
  fragColor = vec4(c - fade * fade * fade * fade, 1.0);
}
`;
