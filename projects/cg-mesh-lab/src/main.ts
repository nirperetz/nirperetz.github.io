import GUI from "lil-gui";
import {
  BufferAttribute,
  Color,
  DoubleSide,
  Euler,
  GLSL3,
  Group,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  type Quaternion,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { arcRotation, projectToBall } from "./arcball.ts";
import { buildGeometry } from "./geometry.ts";
import {
  catmullClark,
  faceCount,
  normalize,
  type PolyMesh,
  parseOBJ,
  parseOFF,
  vertexCount,
} from "./polymesh.ts";
import { surfaceFragment, surfaceVertex, wireFragment, wireVertex } from "./shaders.ts";

// Some files aren't y-up or face away: [file, x turn, then y turn, in degrees].
const MODELS: Record<string, string | [string, number, number]> = {
  "Bunny 5k": "bunny_5k.off",
  "Dragon 10k": ["dragon_10k.off", -90, 90],
  "Venus 5k": ["venus_5k.off", 0, 180],
  "Torso 5k": "female_torso_5k.off",
  "Warrior head 10k": "warrior_head_10k.off",
  House: "house.off",
  "Cube (triangles)": "cube.off",
  "Cube (quads)": "cube_quads.off",
  Torus: "torus_tri.obj",
  "Hemisphere (open)": "hemisphere.obj",
};
const SHADING = { Gouraud: 0, Phong: 1, Toon: 2, Circles: 3 };
const LIGHTS = { Point: 0, Spot: 1, Directional: 2 };
const MAX_FACES = 700_000;
const MORPH_SECONDS = 1.2;

const state = {
  model: "Bunny 5k",
  shading: 1,
  light: 0,
  wire: false,
  hidden: true,
  smooth: true,
  cutoff: 25,
  controlLight: false,
  level: 0,
  stats: "",
};

// Renderer and scene ----------------------------------------------------------------
const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
document.body.prepend(renderer.domElement);
const canvas = renderer.domElement;

const scene = new Scene();
scene.background = new Color("#000000");
// The exercise's camera: 30° field of view, zoom by changing it.
const camera = new PerspectiveCamera(30, 1, 0.1, 50);
camera.position.set(0, 0, 4.6);

const uniforms = {
  uMorph: { value: 1 },
  uFlat: { value: false },
  uShading: { value: 1 },
  uLightType: { value: 0 },
  uLightPos: { value: new Vector3() },
  uLightAxis: { value: new Vector3() },
  uSpotCos: { value: 0 },
  uSpotExp: { value: 2 },
  uRingPeriod: { value: 0.05 },
};
const surfaceMat = new ShaderMaterial({
  glslVersion: GLSL3,
  vertexShader: surfaceVertex,
  fragmentShader: surfaceFragment,
  uniforms,
  side: DoubleSide,
});
const wireMat = new ShaderMaterial({
  glslVersion: GLSL3,
  vertexShader: wireVertex,
  fragmentShader: wireFragment,
  uniforms: { uMorph: uniforms.uMorph, uColor: { value: new Color("#ff4a3a") } },
});
// Hidden-line removal, as in the exercise: fill the depth buffer with the surface pushed
// slightly back (polygon offset), then draw the edges depth-tested against it.
const depthMat = new ShaderMaterial({
  glslVersion: GLSL3,
  vertexShader: wireVertex,
  fragmentShader: wireFragment,
  uniforms: { uMorph: uniforms.uMorph, uColor: { value: new Color() } },
  side: DoubleSide,
  colorWrite: false,
  polygonOffset: true,
  polygonOffsetFactor: 1,
  polygonOffsetUnits: 1,
});

const model = new Group();
scene.add(model);
const surface = new Mesh(undefined, surfaceMat);
const depthOnly = new Mesh(undefined, depthMat);
const wire = new LineSegments(undefined, wireMat);
depthOnly.renderOrder = -1;
model.add(surface, depthOnly, wire);

// The light is the "shiny bunny" of the exercise: a small emissive bunny on a pivot
// around the model center, rotated with its own arcball when "m" is on.
const lightPivot = new Group();
scene.add(lightPivot);
const lightBunny = new Group();
lightBunny.position.set(0, 0.95, 0.3);
lightPivot.add(lightBunny);
const bunnyFill = new Mesh(undefined, new MeshBasicMaterial({ color: "#fffaf0" }));
const bunnyWire = new LineSegments(undefined, new MeshBasicMaterial({ color: "#fffaf0" }));
lightBunny.add(bunnyFill, bunnyWire);
lightBunny.scale.setScalar(0.13);

// Meshes ------------------------------------------------------------------------------
let base: PolyMesh | null = null;
let current: PolyMesh | null = null;
let morphT = 1;

function show(mesh: PolyMesh, from?: Float32Array) {
  const g = buildGeometry(mesh, from);
  surface.geometry.dispose();
  wire.geometry.dispose();
  surface.geometry = g.surface;
  depthOnly.geometry = g.surface;
  wire.geometry = g.wire;
  current = mesh;
  state.stats = `${faceCount(mesh).toLocaleString()} faces · ${vertexCount(mesh).toLocaleString()} verts`;
  refreshGui();
}

async function fetchMesh(entry: string | [string, number, number]) {
  const [file, rx, ry] = typeof entry === "string" ? [entry, 0, 0] : entry;
  const text = await (await fetch(`./models/${file}`)).text();
  const mesh = normalize(file.endsWith(".obj") ? parseOBJ(text) : parseOFF(text));
  if (rx || ry) {
    const m = new Matrix4().makeRotationFromEuler(
      new Euler((rx * Math.PI) / 180, (ry * Math.PI) / 180, 0, "YXZ"),
    );
    new BufferAttribute(mesh.positions, 3).applyMatrix4(m);
  }
  return mesh;
}

function loadMesh(mesh: PolyMesh) {
  base = mesh;
  state.level = 0;
  morphT = 1;
  uniforms.uMorph.value = 1;
  show(mesh);
}

async function loadModel(name: string) {
  const entry = MODELS[name];
  if (entry) loadMesh(await fetchMesh(entry));
}

function subdivide() {
  if (!current) return;
  if (faceCount(current) * 4 > MAX_FACES) {
    toast("that's enough faces for a browser");
    return;
  }
  const { mesh, from } = catmullClark(current);
  state.level++;
  morphT = 0;
  uniforms.uMorph.value = 0;
  show(mesh, from);
}

function resetSubdivision() {
  if (base) loadMesh(base);
}

// Input: left drag rotates, right or shift drag pans, wheel or pinch zooms. "m" sends
// rotate and pan to the light instead of the model.
const target = () => (state.controlLight ? lightPivot : model);
const pointers = new Map<number, Vector2>();
let drag: { mode: "rotate" | "pan"; start: Vector3; q: Quaternion; p: Vector3 } | null = null;
let pinch: { dist: number; fov: number; mid: Vector2; p: Vector3 } | null = null;

canvas.addEventListener("contextmenu", (e) => e.preventDefault());
canvas.addEventListener("pointerdown", (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, new Vector2(e.clientX, e.clientY));
  if (pointers.size === 2) {
    drag = null;
    const [a, b] = [...pointers.values()] as [Vector2, Vector2];
    pinch = {
      dist: a.distanceTo(b),
      fov: camera.fov,
      mid: a.clone().add(b).multiplyScalar(0.5),
      p: target().position.clone(),
    };
    return;
  }
  const mode = e.button === 2 || e.shiftKey ? "pan" : "rotate";
  drag = {
    mode,
    start:
      mode === "rotate"
        ? projectToBall(e.clientX, e.clientY, innerWidth, innerHeight)
        : new Vector3(e.clientX, e.clientY, 0),
    q: target().quaternion.clone(),
    p: target().position.clone(),
  };
});
canvas.addEventListener("pointermove", (e) => {
  const pt = pointers.get(e.pointerId);
  if (!pt) return;
  pt.set(e.clientX, e.clientY);
  if (pinch && pointers.size === 2) {
    const [a, b] = [...pointers.values()] as [Vector2, Vector2];
    setFov((pinch.fov * pinch.dist) / Math.max(a.distanceTo(b), 1));
    const mid = a.clone().add(b).multiplyScalar(0.5);
    pan(pinch.p, mid.x - pinch.mid.x, mid.y - pinch.mid.y);
    return;
  }
  if (!drag) return;
  if (drag.mode === "rotate") {
    const to = projectToBall(e.clientX, e.clientY, innerWidth, innerHeight);
    target().quaternion.copy(arcRotation(drag.start, to).multiply(drag.q));
  } else pan(drag.p, e.clientX - drag.start.x, e.clientY - drag.start.y);
});
const release = (e: PointerEvent) => {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinch = null;
  drag = null;
};
canvas.addEventListener("pointerup", release);
canvas.addEventListener("pointercancel", release);
canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    setFov(camera.fov * Math.exp(e.deltaY * 0.001));
  },
  { passive: false },
);

/** Move the target in the view plane so it tracks the pointer at the model's depth. */
function pan(from: Vector3, dx: number, dy: number) {
  const perPixel = (2 * camera.position.z * Math.tan((camera.fov * Math.PI) / 360)) / innerHeight;
  target().position.set(from.x + dx * perPixel, from.y - dy * perPixel, from.z);
}

function setFov(fov: number) {
  camera.fov = Math.min(120, Math.max(5, fov));
  camera.updateProjectionMatrix();
}

// The exercise's keys, kept.
addEventListener("keydown", (e) => {
  if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey) return;
  const k = e.key.toLowerCase();
  if (k >= "0" && k <= "3") state.shading = Number(k);
  else if (k === "w") state.wire = !state.wire;
  else if (k === "h") state.hidden = !state.hidden;
  else if (k === "n") state.smooth = !state.smooth;
  else if (k === "l") state.light = (state.light + 1) % 3;
  else if (k === "m") state.controlLight = !state.controlLight;
  else if (k === "s") subdivide();
  else if (k === "r") reset();
  else if (k === "+" || k === "=") state.cutoff = Math.min(90, state.cutoff + 2);
  else if (k === "-") state.cutoff = Math.max(2, state.cutoff - 2);
  else return;
  refreshGui();
});

function reset() {
  model.quaternion.identity();
  model.position.set(0, 0, 0);
  lightPivot.quaternion.identity();
  lightPivot.position.set(0, 0, 0);
  setFov(30);
  resetSubdivision();
}

// Panel ---------------------------------------------------------------------------------
const gui = new GUI({ title: "Mesh Lab" });
gui.add(state, "model", Object.keys(MODELS)).name("model").onChange(loadModel);
gui.add({ subdivide }, "subdivide").name("subdivide (s)");
gui.add({ resetSubdivision }, "resetSubdivision").name("undo subdivision");
gui.add(state, "stats").name("mesh").disable();
const look = gui.addFolder("Display");
look.add(state, "shading", SHADING).name("shading (0–3)");
look.add(state, "smooth").name("vertex normals (n)");
look.add(state, "wire").name("wireframe (w)");
look.add(state, "hidden").name("hidden lines (h)");
const lightFolder = gui.addFolder("Light");
lightFolder.add(state, "light", LIGHTS).name("type (l)");
lightFolder.add(state, "cutoff", 2, 90, 1).name("spot cutoff (±)");
lightFolder.add(state, "controlLight").name("drag the light (m)");
gui.add({ reset }, "reset").name("reset view (r)");
if (innerWidth < 700) gui.close();

function refreshGui() {
  for (const c of gui.controllersRecursive()) c.updateDisplay();
}

// HUD helpers ---------------------------------------------------------------------------
const ball = document.getElementById("ball") as HTMLElement;
const toastEl = document.getElementById("toast") as HTMLElement;
let toastTimer = 0;
function toast(text: string) {
  toastEl.textContent = text;
  toastEl.style.opacity = "1";
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toastEl.style.opacity = "0";
  }, 1800);
}

// Drop an .off or .obj file anywhere to load it.
addEventListener("dragover", (e) => e.preventDefault());
addEventListener("drop", async (e) => {
  e.preventDefault();
  const file = e.dataTransfer?.files[0];
  if (!file) return;
  const text = await file.text();
  try {
    loadMesh(normalize(file.name.toLowerCase().endsWith(".obj") ? parseOBJ(text) : parseOFF(text)));
    toast(file.name);
  } catch {
    toast("couldn't read that file");
  }
});

function resize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}
addEventListener("resize", resize);
resize();

// Frame ---------------------------------------------------------------------------------
const lightView = new Vector3();
const centerView = new Vector3();
let last = performance.now();
renderer.setAnimationLoop((now) => {
  const dt = (now - last) / 1000;
  last = now;
  if (morphT < 1) {
    morphT = Math.min(1, morphT + dt / MORPH_SECONDS);
    uniforms.uMorph.value = 1 - (1 - morphT) ** 3;
  }

  surface.visible = !state.wire;
  wire.visible = state.wire;
  depthOnly.visible = state.wire && state.hidden;
  bunnyFill.visible = !state.wire;
  bunnyWire.visible = state.wire;
  uniforms.uShading.value = state.shading;
  uniforms.uFlat.value = !state.smooth;
  uniforms.uLightType.value = state.light;
  uniforms.uSpotCos.value = Math.cos((state.cutoff * Math.PI) / 180);
  ball.classList.toggle("light", state.controlLight);

  scene.updateMatrixWorld();
  lightBunny.getWorldPosition(lightView).applyMatrix4(camera.matrixWorldInverse);
  model.getWorldPosition(centerView).applyMatrix4(camera.matrixWorldInverse);
  uniforms.uLightPos.value.copy(lightView);
  uniforms.uLightAxis.value.subVectors(lightView, centerView).normalize();
  // Keep the bunny's face turned toward the model.
  lightBunny.lookAt(model.position);

  renderer.render(scene, camera);
});

// The bunny light uses the low-poly bunny, like the original.
fetchMesh("bunny_1k.off").then((m) => {
  const g = buildGeometry(m);
  bunnyFill.geometry = g.surface;
  bunnyWire.geometry = g.wire;
});
loadModel("Bunny 5k");
