// The 2013 CPU ray tracer (scene.hh, sphere.hh, cylinder.hh, polygon.hh) as one fragment
// shader. The original branched recursively at every hit, into a reflected and a
// refracted ray, each fanned into N jittered copies, with 12 shadow rays per sphere
// light. A shader can't recurse, so each frame traces ONE path per pixel: jittered
// through the pixel, one random point per light, and at each hit a random choice between
// reflection and refraction, weighted so the average over frames equals the full tree.
// Accumulating frames converges to the same image, and stays interactive while doing it.

export const MAX_SPHERES = 4;
export const MAX_MATERIALS = 8;

export const traceFragment = /* glsl */ `
precision highp float;
precision highp int;

struct Material {
  vec3 diffuse;
  vec3 specular;
  float shininess;
  vec3 reflection;
  vec3 transparency;
  float ior;
  vec3 ambient;
  int tex;           // 0 none, 1 checker, 2 warning, 3 earth
};
struct Sphere { vec3 center; float radius; int mat; };
struct Light { vec3 center; vec3 color; float radius; };

uniform Material uMats[${MAX_MATERIALS}];
uniform Sphere uSpheres[${MAX_SPHERES}];
uniform int uSphereCount;
uniform float uPlaneY;
uniform float uPlaneHalf;
uniform int uPlaneMat;
uniform bool uCylinder;
uniform vec3 uCylA;
uniform vec3 uCylB;
uniform float uCylR;
uniform int uCylMat;
uniform Light uLights[2];
uniform vec3 uAmbient;
uniform vec3 uBackground;

uniform sampler2D uChecker;
uniform sampler2D uWarning;
uniform sampler2D uEarth;
uniform sampler2D uPrev;

uniform vec2 uResolution;
uniform vec3 uCamPos;
uniform mat3 uCamBasis;     // right, up, back
uniform float uTanHalf;     // for the shorter side of the image
uniform int uFrame;
uniform int uMaxDepth;
uniform float uGloss;       // cone half-angle for reflected/refracted rays, radians
uniform float uLightScale;  // multiplies light radii: 0 gives hard shadows

in vec2 vUv;
out vec4 fragColor;

const float EPS = 1e-4;
const float INF = 1e30;
const float PI = 3.141592653589793;

// PCG hash: a decorrelated random stream per pixel and frame.
uint seed;
uint pcg(uint v) {
  uint s = v * 747796405u + 2891336453u;
  uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}
float rand() { seed = pcg(seed); return float(seed) / 4294967296.0; }
vec3 randUnit() {
  float z = rand() * 2.0 - 1.0;
  float a = rand() * 2.0 * PI;
  return vec3(sqrt(1.0 - z * z) * vec2(cos(a), sin(a)), z);
}
// A direction within a cone of half-angle 'angle' around unit vector d.
vec3 jitterCone(vec3 d, float angle) {
  if (angle <= 0.0) return d;
  float c = 1.0 - rand() * (1.0 - cos(angle));
  float s = sqrt(1.0 - c * c);
  float a = rand() * 2.0 * PI;
  vec3 t = normalize(abs(d.x) < 0.9 ? cross(d, vec3(1, 0, 0)) : cross(d, vec3(0, 1, 0)));
  return normalize(d * c + (t * cos(a) + cross(d, t) * sin(a)) * s);
}

struct Hit { float t; vec3 p; vec3 n; int mat; vec3 tex; };

bool sphere(vec3 o, vec3 d, Sphere s, inout Hit h) {
  vec3 oc = o - s.center;
  float b = dot(oc, d);
  float disc = b * b - dot(oc, oc) + s.radius * s.radius;
  if (disc < 0.0) return false;
  float r = sqrt(disc);
  float t = -b - r;
  if (t < EPS) t = -b + r;     // origin inside: take the far side
  if (t < EPS || t >= h.t) return false;
  h.t = t;
  h.p = o + d * t;
  h.n = (h.p - s.center) / s.radius;
  h.mat = s.mat;
  // Equirectangular. The original used atan instead of atan2, which wrapped the texture
  // twice around the sphere.
  vec2 uv = vec2(atan(h.n.x, h.n.z) / (2.0 * PI) + 0.5, asin(clamp(h.n.y, -1.0, 1.0)) / PI + 0.5);
  int tex = uMats[s.mat].tex;
  h.tex = tex == 3 ? textureLod(uEarth, uv, 0.0).rgb
        : tex == 2 ? textureLod(uWarning, uv, 0.0).rgb
        : tex == 1 ? textureLod(uChecker, uv, 0.0).rgb
        : vec3(1.0);
  return true;
}

// The ground: a 2·half square at y = uPlaneY, one checker image across all of it.
bool plane(vec3 o, vec3 d, inout Hit h) {
  if (abs(d.y) < 1e-8) return false;
  float t = (uPlaneY - o.y) / d.y;
  if (t < EPS || t >= h.t) return false;
  vec3 p = o + d * t;
  if (abs(p.x) > uPlaneHalf || abs(p.z) > uPlaneHalf) return false;
  h.t = t;
  h.p = p;
  h.n = vec3(0, 1, 0);
  h.mat = uPlaneMat;
  h.tex = uMats[uPlaneMat].tex == 1
    ? textureLod(uChecker, (p.xz + uPlaneHalf) / (2.0 * uPlaneHalf), 0.0).rgb
    : vec3(1.0);
  return true;
}

// Capped cylinder: checker on the side, the warning sign on the caps.
bool cylinder(vec3 o, vec3 d, inout Hit h) {
  vec3 axis = uCylB - uCylA;
  float height = length(axis);
  vec3 w = axis / height;
  vec3 u = normalize(abs(w.x) < 0.9 ? cross(w, vec3(1, 0, 0)) : cross(w, vec3(0, 0, 1)));
  vec3 v = cross(w, u);
  bool hit = false;
  // Side: |(o + d t - A) x w| = r.
  vec3 ao = o - uCylA;
  vec3 dp = d - dot(d, w) * w;
  vec3 op = ao - dot(ao, w) * w;
  float a = dot(dp, dp);
  float b = dot(dp, op);
  float c = dot(op, op) - uCylR * uCylR;
  float disc = b * b - a * c;
  if (a > 1e-12 && disc >= 0.0) {
    float r = sqrt(disc);
    for (int i = 0; i < 2; i++) {
      float t = (-b + (i == 0 ? -r : r)) / a;
      if (t < EPS || t >= h.t) continue;
      vec3 p = o + d * t;
      float y = dot(p - uCylA, w);
      if (y <= 0.0 || y >= height) continue;
      vec3 radial = (p - uCylA) - y * w;
      h.t = t;
      h.p = p;
      h.n = radial / uCylR;
      h.mat = uCylMat;
      float ang = atan(dot(radial, v), dot(radial, u)) / (2.0 * PI) + 0.5;
      h.tex = textureLod(uChecker, vec2(y / height, ang), 0.0).rgb;
      hit = true;
      break;
    }
  }
  // Caps.
  for (int i = 0; i < 2; i++) {
    vec3 cn = i == 0 ? -w : w;
    vec3 cc = i == 0 ? uCylA : uCylB;
    float dn = dot(d, cn);
    if (abs(dn) < 1e-8) continue;
    float t = dot(cc - o, cn) / dn;
    if (t < EPS || t >= h.t) continue;
    vec3 p = o + d * t;
    vec3 q = p - cc;
    if (dot(q, q) > uCylR * uCylR) continue;
    h.t = t;
    h.p = p;
    h.n = cn;
    h.mat = uCylMat;
    h.tex = textureLod(uWarning, vec2(dot(q, u), dot(q, v)) / (2.0 * uCylR) + 0.5, 0.0).rgb;
    hit = true;
  }
  return hit;
}

bool traceScene(vec3 o, vec3 d, out Hit h) {
  h.t = INF;
  bool hit = false;
  for (int i = 0; i < ${MAX_SPHERES}; i++) {
    if (i >= uSphereCount) break;
    hit = sphere(o, d, uSpheres[i], h) || hit;
  }
  hit = plane(o, d, h) || hit;
  if (uCylinder) hit = cylinder(o, d, h) || hit;
  return hit;
}

// Shadow rays stop at the light. Transparent objects block light too, as in the original.
bool occluded(vec3 o, vec3 d, float maxT) {
  Hit h;
  return traceScene(o, d, h) && h.t < maxT;
}

// Ambient plus diffuse and Phong specular from each light, one random point per light.
vec3 direct(Hit h, vec3 d, vec3 n) {
  Material m = uMats[h.mat];
  vec3 kd = m.diffuse * h.tex;
  vec3 c = m.ambient * uAmbient;
  for (int i = 0; i < 2; i++) {
    Light l = uLights[i];
    if (l.color == vec3(0.0)) continue;
    vec3 lp = l.center + randUnit() * l.radius * uLightScale;
    vec3 L = lp - h.p;
    float dist = length(L);
    L /= dist;
    float ndl = dot(n, L);
    if (ndl <= 0.0 || occluded(h.p + n * EPS * 10.0, L, dist)) continue;
    float spec = pow(max(dot(reflect(-L, n), -d), 0.0), m.shininess);
    c += l.color * (kd * ndl + m.specular * spec);
  }
  return c;
}

float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

void main() {
  seed = pcg(uint(gl_FragCoord.x) + pcg(uint(gl_FragCoord.y) + pcg(uint(uFrame))));

  // Jittered sample inside the pixel (the original's multi-ray anti-aliasing).
  vec2 px = gl_FragCoord.xy + vec2(rand(), rand()) - 0.5;
  vec2 ndc = (px * 2.0 - uResolution) / min(uResolution.x, uResolution.y);
  vec3 d = normalize(uCamBasis * vec3(ndc * uTanHalf, -1.0));
  vec3 o = uCamPos;

  vec3 color = vec3(0.0);
  vec3 weight = vec3(1.0);
  for (int depth = 0; depth < 8; depth++) {
    if (depth >= uMaxDepth) break;
    Hit h;
    if (!traceScene(o, d, h)) { color += weight * uBackground; break; }
    Material m = uMats[h.mat];
    bool entering = dot(d, h.n) < 0.0;
    vec3 n = entering ? h.n : -h.n;  // shading normal faces the ray
    color += weight * direct(h, d, n);

    float wr = lum(m.reflection);
    float wt = lum(m.transparency);
    if (wr + wt <= 0.0) break;
    if (rand() * (wr + wt) < wr) {
      weight *= m.reflection * (wr + wt) / wr;
      d = jitterCone(reflect(d, n), uGloss);
      o = h.p + n * EPS * 10.0;
    } else {
      vec3 t = refract(d, n, entering ? 1.0 / m.ior : m.ior);
      if (t == vec3(0.0)) break;  // total internal reflection: the original returned black
      weight *= m.transparency * (wr + wt) / wt;
      d = jitterCone(t, uGloss);
      o = h.p - n * EPS * 10.0;
    }
    if (max(weight.r, max(weight.g, weight.b)) < 0.01) break;
  }

  // Running mean of all frames since the last change.
  vec3 prev = texture(uPrev, vUv).rgb;
  fragColor = vec4(mix(prev, color, 1.0 / float(uFrame + 1)), 1.0);
}
`;

export const quadVertex = /* glsl */ `
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

// The original clamped each pixel to [0, 1] and wrote the bytes, with no gamma. Same here.
export const displayFragment = /* glsl */ `
uniform sampler2D uTex;
in vec2 vUv;
out vec4 fragColor;
void main() { fragColor = vec4(clamp(texture(uTex, vUv).rgb, 0.0, 1.0), 1.0); }
`;
