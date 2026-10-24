// phong.cgfx and postprocess.cgfx from the 2013 exercises, in GLSL ES 3.0.

// The corridor walls, lit only by a flickering flashlight held at the camera.
export const wallVertex = /* glsl */ `
uniform float uScroll;
out vec2 vUv;
out vec3 vWorld;
out vec3 vNormal;
void main() {
  // Walking never moves the camera: the texture slides along the walls instead.
  vUv = uv + vec2(uScroll, 0.0);
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

export const wallFragment = /* glsl */ `
uniform sampler2D uMap;
uniform vec3 uLampPos;
uniform vec3 uLightDir;
uniform float uFlicker;
in vec2 vUv;
in vec3 vWorld;
in vec3 vNormal;
out vec4 fragColor;

const vec3 LAMP = vec3(0.9, 0.85, 0.67);
const vec3 AMBIENT = vec3(0.4);
const float KD = 0.3;

void main() {
  vec3 color = texture(uMap, vUv).rgb;
  vec3 toLamp = uLampPos - vWorld;
  float dist = length(toLamp);
  vec3 L = toLamp / dist;
  vec3 N = faceforward(vNormal, -L, vNormal);
  float NdotL = dot(N, L);
  float atten = 1.0 / (0.002 + 0.06 * dist + 0.002 * dist * dist);
  float effect = 0.0;
  if (NdotL > 0.0) {
    // A 60° cone, sharpened by pow(·, 50), with two brighter rings whose size depends
    // on distance: the hot spot of a cheap flashlight.
    float cutOff = radians(60.0);
    float spot = dot(normalize(uLightDir), -L);
    if (spot > cos(cutOff)) {
      effect = pow(spot, 50.0);
      if (spot > cos(cutOff / 10.0 * dist)) {
        effect *= 1.1;
        if (spot > cos(cutOff / 15.0 * dist)) effect *= 1.1;
      }
    }
  }
  vec3 c = uFlicker * atten * color * effect * KD * LAMP + max(NdotL, 0.0) * color * AMBIENT;
  fragColor = vec4(c, 1.0);
}
`;

export const postVertex = /* glsl */ `
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

// One 4×4 convolution with any kernel, then the non-linear effects.
export const postFragment = /* glsl */ `
uniform sampler2D uScene;
uniform vec2 uTexel;
uniform mat4 uKernel;     // rows as written in matrixDef.h; the center tap is [1][1]
uniform float uDizzy;     // stretches the horizontal taps: seeing double
uniform bool uMotionBlur;
uniform float uGlow;
uniform float uPoster;
uniform float uBlink;     // half the height of the open eye, 0..0.5
in vec2 vUv;
out vec4 fragColor;

void main() {
  vec2 dx = vec2(uTexel.x * uDizzy, 0.0);
  vec2 dy = vec2(0.0, uTexel.y);

  if (uMotionBlur) {
    // Running: smear outward from the center, the direction of travel.
    vec2 dir = normalize(vUv - 0.5 + 1e-5) * -8.0 * uTexel;
    vec3 c = texture(uScene, vUv).rgb * 0.7
      + texture(uScene, vUv + dir).rgb * 0.4
      + texture(uScene, vUv + dir * 2.0).rgb * 0.2
      + texture(uScene, vUv + dir * 3.0).rgb * 0.1;
    fragColor = vec4(c / 1.4, 1.0);
    return;
  }

  vec3 c = vec3(0.0);
  for (int r = 0; r < 4; r++) {
    for (int k = 0; k < 4; k++) {
      // GLSL indexes [column][row], so uKernel[k][r] is row r, column k as written.
      c += texture(uScene, vUv + float(k - 1) * dx - float(r - 1) * dy).rgb * uKernel[k][r];
    }
  }

  if (c.r + c.g + c.b > 0.7) c *= uGlow;
  if (uPoster > 0.0) c = floor(c * uPoster + 0.5) / uPoster;
  if (abs(vUv.y - 0.5) > uBlink) c = vec3(0.02);
  fragColor = vec4(c, 1.0);
}
`;
