// Shader Garden: one fullscreen triangle, four fragment shaders, zero dependencies.
// Shared uniforms: uRes (px), uTime (s), uPointer (0..1, y up).

const VERT = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

const HEADER = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uPointer;
out vec4 outColor;
#define PI 3.14159265
vec3 palette(float t, vec3 a, vec3 b, vec3 c, vec3 d) { return a + b * cos(2.0 * PI * (c * t + d)); }
`;

const SHADERS = {
  bloom: `
void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - uRes) / uRes.y;
  vec2 m = (uPointer - 0.5) * 2.0;
  vec3 col = vec3(0.0);
  vec2 p = uv;
  for (float i = 0.0; i < 4.0; i++) {
    p = fract(p * (1.4 + 0.1 * m.x)) - 0.5;
    float d = length(p) * exp(-length(uv));
    vec3 c = palette(length(uv) + i * 0.4 + uTime * 0.3, vec3(0.5), vec3(0.5), vec3(1.0), vec3(0.26, 0.42, 0.56));
    d = abs(sin(d * 8.0 + uTime) / 8.0);
    col += c * pow(0.012 / d, 1.15);
  }
  outColor = vec4(col, 1.0);
}`,

  dunes: `
float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + 1.0), f.x), f.y);
}
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 sky = mix(vec3(0.98, 0.62, 0.42), vec3(0.32, 0.22, 0.45), uv.y);
  vec3 col = sky;
  for (float i = 5.0; i >= 1.0; i--) {
    float x = uv.x * (1.5 + i * 0.6) + uTime * 0.02 * i + uPointer.x * i * 0.3;
    float h = 0.12 * i + 0.18 * noise(vec2(x, i * 7.0)) + 0.05 * noise(vec2(x * 4.0, i));
    vec3 layer = mix(vec3(0.85, 0.42, 0.3), vec3(0.18, 0.1, 0.2), i / 5.0);
    col = mix(col, layer, smoothstep(0.003, 0.0, uv.y - (1.0 - h)) );
  }
  float sun = smoothstep(0.09, 0.08, length((uv - vec2(0.7, 0.72 + 0.1 * uPointer.y)) * vec2(uRes.x / uRes.y, 1.0)));
  col = mix(col, vec3(1.0, 0.92, 0.75), sun * step(0.5, col.r));
  outColor = vec4(col, 1.0);
}`,

  tunnel: `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  uv += (uPointer - 0.5) * 0.4;
  float a = atan(uv.y, uv.x);
  float r = length(uv);
  vec2 st = vec2(a / PI, 0.3 / r + uTime * 0.4);
  float grid = smoothstep(0.92, 1.0, max(fract(st.x * 8.0), fract(st.y * 4.0)));
  vec3 col = palette(st.y * 0.2, vec3(0.5), vec3(0.5), vec3(1.0, 1.0, 0.5), vec3(0.8, 0.9, 0.3));
  col *= grid * smoothstep(0.0, 0.4, r) + 0.06;
  outColor = vec4(col * r * 2.2, 1.0);
}`,

  metaballs: `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  float field = 0.0;
  for (float i = 0.0; i < 7.0; i++) {
    vec2 c = 0.35 * vec2(sin(uTime * (0.4 + i * 0.13) + i), cos(uTime * (0.3 + i * 0.11) + i * 2.0));
    field += 0.018 / dot(uv - c, uv - c);
  }
  field += 0.03 / dot(uv - (uPointer - 0.5) * vec2(uRes.x / uRes.y, 1.0), uv - (uPointer - 0.5) * vec2(uRes.x / uRes.y, 1.0));
  float edge = smoothstep(0.95, 1.05, field);
  vec3 col = mix(vec3(0.04, 0.05, 0.09), palette(field * 0.15 + uTime * 0.05, vec3(0.6), vec3(0.4), vec3(1.0), vec3(0.0, 0.33, 0.67)), edge);
  outColor = vec4(col, 1.0);
}`,
};

const canvas = document.getElementById("stage");
const gl = canvas.getContext("webgl2");
if (!gl) {
  document.body.insertAdjacentHTML(
    "beforeend",
    "<p style='padding:24px'>WebGL2 is not available here.</p>",
  );
  throw new Error("no webgl2");
}

gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

function compile(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
    throw new Error(gl.getShaderInfoLog(s) ?? "compile failed");
  return s;
}

function program(fragBody) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl.VERTEX_SHADER, VERT));
  gl.attachShader(p, compile(gl.FRAGMENT_SHADER, HEADER + fragBody));
  gl.bindAttribLocation(p, 0, "aPos");
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS))
    throw new Error(gl.getProgramInfoLog(p) ?? "link failed");
  return {
    p,
    uRes: gl.getUniformLocation(p, "uRes"),
    uTime: gl.getUniformLocation(p, "uTime"),
    uPointer: gl.getUniformLocation(p, "uPointer"),
  };
}

const programs = Object.fromEntries(
  Object.entries(SHADERS).map(([name, src]) => [name, program(src)]),
);
const names = Object.keys(programs);
let current = names.includes(location.hash.slice(1)) ? location.hash.slice(1) : names[0];

gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

// UI: one button per shader, number keys, and the URL hash remembers the choice.
const presets = document.querySelector(".presets");
const buttons = names.map((name, i) => {
  const b = document.createElement("button");
  b.role = "tab";
  b.textContent = `${i + 1} ${name}`;
  b.onclick = () => select(name);
  presets.append(b);
  return b;
});
function select(name) {
  current = name;
  history.replaceState(null, "", `#${name}`);
  for (const [i, b] of buttons.entries())
    b.setAttribute("aria-selected", String(names[i] === name));
}
select(current);
addEventListener("keydown", (e) => {
  const n = Number(e.key);
  if (n >= 1 && n <= names.length) select(names[n - 1]);
});

const pointer = [0.5, 0.5];
canvas.addEventListener("pointermove", (e) => {
  pointer[0] = e.clientX / innerWidth;
  pointer[1] = 1 - e.clientY / innerHeight;
});

function frame(ms) {
  const dpr = Math.min(devicePixelRatio, 2);
  const w = Math.floor(innerWidth * dpr);
  const h = Math.floor(innerHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
    gl.viewport(0, 0, w, h);
  }
  const prog = programs[current];
  gl.useProgram(prog.p);
  gl.uniform2f(prog.uRes, w, h);
  gl.uniform1f(prog.uTime, ms / 1000);
  gl.uniform2f(prog.uPointer, pointer[0], pointer[1]);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
