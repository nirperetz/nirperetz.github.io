// The 2013 shaders (phong_{point,spot,dir}, toon, circles, plus the fixed-function
// Gouraud path), rewritten in GLSL ES 3.0. gl_LightSource and gl_FrontMaterial are gone,
// so the light arrives as uniforms and the two materials are constants. Lighting is in
// view space. One program switches mode on a uniform: these branches are uniform across
// a draw call, so they cost nothing measurable and switching modes needs no recompile.

const lighting = /* glsl */ `
struct Mat { vec3 ambient; vec3 diffuse; vec3 specular; float shininess; };
// The exercise's materials: shiny red outside, green inside (two-sided lighting), so
// holes and open edges show the back faces.
const Mat FRONT = Mat(vec3(1.0, 0.0, 0.0), vec3(1.0, 0.0, 0.0), vec3(1.0), 80.0);
const Mat BACK = Mat(vec3(0.0, 1.0, 0.0), vec3(0.0, 0.8, 0.0), vec3(0.0, 0.43, 0.22), 20.0);
const vec3 GLOBAL_AMBIENT = vec3(0.2); // OpenGL's default light-model ambient

uniform int uLightType;   // 0 point, 1 spot, 2 directional
uniform vec3 uLightPos;   // view space
uniform vec3 uLightAxis;  // view space, unit: from the model center toward the light
uniform float uSpotCos;
uniform float uSpotExp;

// Direction to the light at P, and its attenuation (distance falloff and spot cone).
vec3 toLight(vec3 P, out float atten) {
  if (uLightType == 2) { atten = 1.0; return uLightAxis; }
  vec3 d = uLightPos - P;
  float dist = length(d);
  vec3 L = d / dist;
  atten = 1.0 / (1.0 + 0.1 * dist + 0.05 * dist * dist);
  if (uLightType == 1) {
    float c = dot(L, uLightAxis); // the spot aims at the model center
    atten *= smoothstep(uSpotCos - 0.01, uSpotCos + 0.01, c) * pow(max(c, 0.0), uSpotExp);
  }
  return L;
}

// Phong reflection. The 2013 shaders dotted the reflection vector with N instead of the
// view vector; this is the textbook R·V.
vec3 shade(vec3 P, vec3 N, Mat m) {
  float atten;
  vec3 L = toLight(P, atten);
  vec3 c = GLOBAL_AMBIENT * m.ambient;
  float NdotL = dot(N, L);
  if (NdotL > 0.0) {
    vec3 R = reflect(-L, N);
    float s = pow(max(dot(R, normalize(-P)), 0.0), m.shininess);
    c += atten * (NdotL * m.diffuse + s * m.specular);
  }
  return c;
}
`;

export const surfaceVertex = /* glsl */ `
${lighting}
in vec3 prev;
in vec3 flatNormal;
uniform float uMorph;
uniform bool uFlat;
uniform int uShading;     // 0 Gouraud, 1 Phong, 2 toon, 3 circles
out vec3 vPos;
out vec3 vNormal;
out vec3 vObj;
out vec3 vFront;
out vec3 vBack;

void main() {
  vec3 p = mix(prev, position, uMorph);
  vObj = p;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vPos = mv.xyz;
  vNormal = normalize(normalMatrix * (uFlat ? flatNormal : normal));
  // Gouraud: light the vertices, interpolate colors. Both sides, as with
  // GL_LIGHT_MODEL_TWO_SIDE.
  if (uShading == 0) {
    vFront = shade(vPos, vNormal, FRONT);
    vBack = shade(vPos, -vNormal, BACK);
  }
  gl_Position = projectionMatrix * mv;
}
`;

export const surfaceFragment = /* glsl */ `
${lighting}
uniform int uShading;
uniform float uRingPeriod;
in vec3 vPos;
in vec3 vNormal;
in vec3 vObj;
in vec3 vFront;
in vec3 vBack;
out vec4 fragColor;

void main() {
  vec3 N = normalize(vNormal);
  if (!gl_FrontFacing) N = -N;
  vec3 c;
  if (uShading == 0) {
    c = gl_FrontFacing ? vFront : vBack;
  } else if (uShading == 1) {
    c = gl_FrontFacing ? shade(vPos, N, FRONT) : shade(vPos, N, BACK);
  } else if (uShading == 2) {
    // toon_fs.glsl: four bands by N·L, the exercise's colors.
    float atten;
    float i = dot(toLight(vPos, atten), N);
    c = i > 0.97 ? vec3(1.0, 0.5, 0.5)
      : i > 0.7 ? vec3(0.6, 0.3, 0.3)
      : i > 0.4 ? vec3(0.4, 0.2, 0.2)
      : vec3(0.2, 0.1, 0.1);
  } else {
    // circles_fs.glsl: black and white shells around the model center, lit.
    float band = mod(floor(length(vObj) / uRingPeriod), 2.0);
    float atten;
    vec3 L = toLight(vPos, atten);
    float NdotL = max(dot(N, L), 0.0);
    float s = NdotL > 0.0 ? pow(max(dot(reflect(-L, N), normalize(-vPos)), 0.0), 80.0) : 0.0;
    c = vec3(0.08 + NdotL * band) + s * 0.6;
  }
  fragColor = vec4(c, 1.0);
}
`;

export const wireVertex = /* glsl */ `
in vec3 prev;
uniform float uMorph;
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(mix(prev, position, uMorph), 1.0);
}
`;

export const wireFragment = /* glsl */ `
uniform vec3 uColor;
out vec4 fragColor;
void main() { fragColor = vec4(uColor, 1.0); }
`;
