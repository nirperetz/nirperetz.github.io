// subdivide.cg (ground and water), tornado.cg and rain.cg, in GLSL ES 3.0.

const noise = /* glsl */ `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), f.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), f.x), f.y);
}
`;

export const groundVertex = /* glsl */ `
out vec3 vWorld;
out vec3 vNormal;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vNormal = normal;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

// Four textures picked by height with a little noise on the borders (sand, grass above
// 0.7, pebbles below the waterline), and moving caustics on everything under water.
export const groundFragment = /* glsl */ `
${noise}
uniform sampler2D uSand;
uniform sampler2D uGrass;
uniform sampler2D uStone;
uniform sampler2D uCaustics;
uniform float uTime;
uniform vec3 uSun;
in vec3 vWorld;
in vec3 vNormal;
out vec4 fragColor;

void main() {
  // The original gave every one of the 512×512 quads its own copy of the texture; the
  // fine repetition was the "dune" grain. Half a unit per repeat keeps that grain.
  vec2 uv = vWorld.xz * 0.5;
  float y = vWorld.y + (valueNoise(vWorld.xz * 2.0) - 0.5) * 0.4 + (valueNoise(vWorld.xz * 9.0) - 0.5) * 0.1;
  vec3 color = texture(uSand, uv).rgb;
  if (y > 0.7) color = mix(color, texture(uGrass, uv).rgb, smoothstep(0.7, 0.9, y));
  if (y < 0.0) color = mix(color, texture(uStone, uv).rgb, smoothstep(0.0, -0.3, y));
  vec3 N = normalize(vNormal);
  float diffuse = max(dot(N, uSun), 0.0);
  vec3 c = color * (0.45 + 0.75 * diffuse);
  if (vWorld.y < 0.0) {
    // Caustics: the water texture sampled twice, drifting in opposite directions.
    float k = texture(uCaustics, uv * 0.6 + uTime * 0.05).b * texture(uCaustics, uv * 0.45 - uTime * 0.04).b;
    float depth = clamp(-vWorld.y / 2.5, 0.0, 1.0);
    c = mix(c, vec3(0.05, 0.2, 0.3), depth * 0.7) + k * 0.35 * (1.0 - depth);
  }
  fragColor = vec4(c, 1.0);
}
`;

export const waterVertex = /* glsl */ `
out vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

// The sea: circular waves spreading from the island center and fading with distance,
// reflecting the skybox, more transparent the steeper you look down (the original's
// lerp(reflection, ground, dot(R, N))).
export const waterFragment = /* glsl */ `
uniform samplerCube uSky;
uniform float uTime;
uniform vec3 uSun;
in vec3 vWorld;
out vec4 fragColor;

void main() {
  vec2 p = vWorld.xz;
  float r = length(p) + 1e-3;
  // Ring waves (radial slope) plus a little cross chop so the far sea isn't a mirror.
  float ring = cos(r * 3.0 - uTime * 1.6) * 0.18 / (1.0 + r * 0.08);
  vec2 slope = p / r * ring
    + 0.05 * vec2(sin(p.x * 1.3 + uTime * 0.9 + p.y * 0.4), cos(p.y * 1.1 - uTime * 0.7 + p.x * 0.3));
  vec3 N = normalize(vec3(-slope.x, 1.0, -slope.y));
  vec3 V = normalize(cameraPosition - vWorld);
  bool below = cameraPosition.y < 0.0;
  if (below) N = -N;
  vec3 R = reflect(-V, N);
  float facing = clamp(dot(V, N), 0.0, 1.0);
  float fresnel = 0.04 + 0.96 * pow(1.0 - facing, 5.0);
  vec3 sky = texture(uSky, R).rgb;
  vec3 deep = vec3(0.04, 0.16, 0.24);
  float sun = pow(max(dot(R, uSun), 0.0), 400.0) * 3.0;
  vec3 c = mix(deep, sky, fresnel) + sun;
  float alpha = below ? 0.55 : mix(0.35, 1.0, fresnel);
  // The sea darkens toward the horizon, so it doesn't end in a seam against the sky.
  alpha = mix(alpha, 1.0, smoothstep(30.0, 120.0, length(vWorld - cameraPosition)));
  fragColor = vec4(c, alpha);
}
`;

// Tornado: each particle is born at the center, rises with y' = 1.002·y + 0.001 per
// frame (the feedback shader's update, solved in closed form so nothing is simulated on
// the CPU) and drifts outward as it rises; the swirl and widening funnel come from the
// display shader. It needs about 20 seconds to reach full height, as in the original.
export const tornadoVertex = /* glsl */ `
${noise}
in float aBirth;
in float aSeed;
uniform float uTime;
uniform float uLife;
uniform float uPixel;
out float vAlpha;
out float vShade;
void main() {
  float age = uTime - aBirth;
  if (age < 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; } // not born yet
  age = mod(age, uLife);
  float frames = age * 60.0;
  float y = 0.5 * (pow(1.002, frames) - 1.0);
  float angle = aSeed * 6.2831 + uTime * 2.5 + y * 0.6;
  // The funnel widens with height and wobbles: the display shader's fan of 11 points.
  float radius = (0.08 + y * 0.22) * (0.6 + 0.4 * fract(aSeed * 13.7)) + 0.2 * sin(y * 0.8 + uTime + aSeed * 20.0);
  vec3 p = position + vec3(cos(angle) * radius, y, sin(angle) * radius);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uPixel * (0.3 + y * 0.1) / -mv.z;
  vAlpha = 0.2 * smoothstep(0.0, 0.3, y) * (1.0 - smoothstep(8.5, 10.0, y));
  vShade = 0.22 + 0.35 * fract(aSeed * 31.3);
}
`;

export const tornadoFragment = /* glsl */ `
in float vAlpha;
in float vShade;
out vec4 fragColor;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  if (d > 1.0) discard;
  fragColor = vec4(vec3(vShade), vAlpha * (1.0 - d * d));
}
`;

// Rain: 200 drops a frame falling 0.4 a frame, as streaks 0.6 long, over a 60-unit square
// that follows the camera. Each streak's two vertices share a seed; aEnd says which end.
export const rainVertex = /* glsl */ `
in vec3 aSeed;     // x, z, phase
in float aEnd;
uniform float uTime;
uniform vec3 uCenter;
out float vAlpha;
void main() {
  float fall = 24.0;      // units per second (0.4 a frame)
  float span = 30.0;      // from y = 10 down to y = -20
  float y = 10.0 - mod(uTime * fall + aSeed.z * span, span);
  vec3 p = vec3(uCenter.x + (aSeed.x - 0.5) * 60.0, y + aEnd * 0.6, uCenter.z + (aSeed.y - 0.5) * 60.0);
  vAlpha = (aEnd > 0.5 ? 0.4 : 0.6) * step(0.0, y);
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;

export const rainFragment = /* glsl */ `
in float vAlpha;
out vec4 fragColor;
void main() { fragColor = vec4(vec3(0.75, 0.78, 0.82), vAlpha * 0.5); }
`;
