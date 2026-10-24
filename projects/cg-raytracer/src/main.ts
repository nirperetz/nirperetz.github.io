import GUI from "lil-gui";
import {
  FloatType,
  GLSL3,
  HalfFloatType,
  LinearFilter,
  type MagnificationTextureFilter,
  Matrix3,
  Mesh,
  NearestFilter,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
  RepeatWrapping,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  type Texture,
  TextureLoader,
  Vector2,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { type Material, SCENES, type SceneDef, type Vec3 } from "./scenes.ts";
import {
  displayFragment,
  MAX_MATERIALS,
  MAX_SPHERES,
  quadVertex,
  traceFragment,
} from "./trace.glsl.ts";

// Stop refining here; the image has long converged and the GPU can rest.
const MAX_SAMPLES = 2048;
// The original camera: pixelSide = tan(fov_h) / (h / 2), i.e. tan(50°) per half image.
const TAN_HALF = Math.tan((50 * Math.PI) / 180);

const params = {
  scene: "final",
  depth: 6,
  gloss: 0,
  lightScale: 1,
  resolution: Math.min(devicePixelRatio, 1),
  samples: "0",
  original: false,
};

const renderer = new WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
renderer.setPixelRatio(1);
document.body.prepend(renderer.domElement);
const canvas = renderer.domElement;

// The camera only stores the view: the shader builds its own rays from it.
const camera = new PerspectiveCamera();
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.minDistance = 6;
controls.maxDistance = 90;
controls.maxPolarAngle = Math.PI * 0.62;

const loader = new TextureLoader();
const texture = (url: string, filter: MagnificationTextureFilter = LinearFilter) => {
  const t = loader.load(url, reset);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.minFilter = t.magFilter = filter;
  t.generateMipmaps = false;
  return t;
};

const blankMat = () => ({
  diffuse: new Vector3(),
  specular: new Vector3(),
  shininess: 1,
  reflection: new Vector3(),
  transparency: new Vector3(),
  ior: 1,
  ambient: new Vector3(),
  tex: 0,
});
const uniforms = {
  uMats: { value: Array.from({ length: MAX_MATERIALS }, blankMat) },
  uSpheres: {
    value: Array.from({ length: MAX_SPHERES }, () => ({
      center: new Vector3(),
      radius: 1,
      mat: 0,
    })),
  },
  uSphereCount: { value: 0 },
  uPlaneY: { value: 0 },
  uPlaneHalf: { value: 100 },
  uPlaneMat: { value: 0 },
  uCylinder: { value: false },
  uCylA: { value: new Vector3() },
  uCylB: { value: new Vector3() },
  uCylR: { value: 1 },
  uCylMat: { value: 0 },
  uLights: {
    value: [0, 1].map(() => ({ center: new Vector3(), color: new Vector3(), radius: 0 })),
  },
  uAmbient: { value: new Vector3() },
  uBackground: { value: new Vector3() },
  // The checkerboard is sampled unfiltered, like the original's BImage lookups; the
  // per-frame pixel jitter does the anti-aliasing.
  uChecker: { value: texture("./checker.png", NearestFilter) as Texture },
  uWarning: { value: texture("./warning.png") as Texture },
  uEarth: { value: texture("./earth.jpg") as Texture },
  uPrev: { value: null as Texture | null },
  uResolution: { value: new Vector2() },
  uCamPos: { value: new Vector3() },
  uCamBasis: { value: new Matrix3() },
  uTanHalf: { value: TAN_HALF },
  uFrame: { value: 0 },
  uMaxDepth: { value: params.depth },
  uGloss: { value: 0 },
  uLightScale: { value: 1 },
};

const traceMat = new ShaderMaterial({
  glslVersion: GLSL3,
  vertexShader: quadVertex,
  fragmentShader: traceFragment,
  uniforms,
  depthTest: false,
  depthWrite: false,
});
const displayUniforms = { uTex: { value: null as Texture | null } };
const displayMat = new ShaderMaterial({
  glslVersion: GLSL3,
  vertexShader: quadVertex,
  fragmentShader: displayFragment,
  uniforms: displayUniforms,
  depthTest: false,
  depthWrite: false,
});
const quad = new Mesh(new PlaneGeometry(2, 2), traceMat);
const quadScene = new Scene().add(quad);
const quadCam = new OrthographicCamera();

// Two float targets, ping-ponged: each frame reads the running mean from one and writes
// the updated mean to the other. Float, because a half-float mean stops changing once
// 1/frames drops below its precision (~1/2048).
const floatOk = renderer.extensions.has("EXT_color_buffer_float");
const makeTarget = () =>
  new WebGLRenderTarget(1, 1, {
    type: floatOk ? FloatType : HalfFloatType,
    format: RGBAFormat,
    minFilter: LinearFilter,
    magFilter: LinearFilter,
    depthBuffer: false,
  });
let read = makeTarget();
let write = makeTarget();
let frame = 0;

function reset() {
  frame = 0;
}

const v3 = (out: Vector3, v: Vec3 | undefined) => out.set(...(v ?? [0, 0, 0]));

function loadScene(def: SceneDef) {
  const mats: Material[] = [];
  const add = (m: Material) => mats.push(m) - 1;
  def.spheres.forEach((sp, i) => {
    const u = uniforms.uSpheres.value[i];
    if (!u) return;
    v3(u.center, sp.center);
    u.radius = sp.radius;
    u.mat = add(sp.mat);
  });
  uniforms.uSphereCount.value = Math.min(def.spheres.length, MAX_SPHERES);
  uniforms.uPlaneY.value = def.plane.y;
  uniforms.uPlaneHalf.value = def.plane.half;
  uniforms.uPlaneMat.value = add(def.plane.mat);
  uniforms.uCylinder.value = Boolean(def.cylinder);
  if (def.cylinder) {
    v3(uniforms.uCylA.value, def.cylinder.a);
    v3(uniforms.uCylB.value, def.cylinder.b);
    uniforms.uCylR.value = def.cylinder.radius;
    uniforms.uCylMat.value = add(def.cylinder.mat);
  }
  mats.forEach((m, i) => {
    const u = uniforms.uMats.value[i];
    if (!u) return;
    v3(u.diffuse, m.diffuse);
    v3(u.specular, m.specular);
    u.shininess = m.shininess ?? 25;
    v3(u.reflection, m.reflection);
    v3(u.transparency, m.transparency);
    u.ior = m.ior ?? 1;
    v3(u.ambient, m.ambient);
    u.tex = m.tex ?? 0;
  });
  def.lights.forEach((l, i) => {
    const u = uniforms.uLights.value[i];
    if (!u) return;
    v3(u.center, l.center);
    v3(u.color, l.color);
    u.radius = l.radius;
  });
  v3(uniforms.uAmbient.value, def.ambient);
  v3(uniforms.uBackground.value, def.background);
  camera.position.set(...def.camera.pos);
  controls.target.set(...def.camera.target);
  controls.update();
  original.hidden = !(params.original && params.scene === "final");
  reset();
}

function resize() {
  const w = Math.max(1, Math.round(innerWidth * params.resolution));
  const h = Math.max(1, Math.round(innerHeight * params.resolution));
  renderer.setSize(innerWidth, innerHeight);
  renderer.setDrawingBufferSize(w, h, 1);
  read.setSize(w, h);
  write.setSize(w, h);
  uniforms.uResolution.value.set(w, h);
  reset();
}

// UI ------------------------------------------------------------------------------------
const original = document.getElementById("original") as HTMLImageElement;
const gui = new GUI({ title: "Ray Tracer" });
gui
  .add(params, "scene", Object.fromEntries(Object.entries(SCENES).map(([k, v]) => [v.label, k])))
  .onChange((k: string) => SCENES[k] && loadScene(SCENES[k]));
gui.add(params, "depth", 1, 8, 1).name("ray depth").onChange(reset);
gui.add(params, "gloss", 0, 15, 0.5).name("glossy cutoff °").onChange(reset);
gui.add(params, "lightScale", 0, 4, 0.1).name("light size ×").onChange(reset);
gui.add(params, "resolution", 0.25, 1, 0.25).name("resolution").onChange(resize);
gui.add(params, "samples").name("samples").disable();
gui
  .add(params, "original")
  .name("show 2013 render")
  .onChange(() => {
    original.hidden = !(params.original && params.scene === "final");
  });
if (innerWidth < 700) gui.close();

controls.addEventListener("change", reset);
addEventListener("resize", resize);
resize();
const first = SCENES[params.scene];
if (first) loadScene(first);

// Frame -----------------------------------------------------------------------------------
const basis = new Matrix3();
let shown = -1;
renderer.setAnimationLoop(() => {
  controls.update();
  if (frame < MAX_SAMPLES) {
    camera.updateMatrixWorld();
    uniforms.uCamPos.value.copy(camera.position);
    uniforms.uCamBasis.value.copy(basis.setFromMatrix4(camera.matrixWorld));
    uniforms.uFrame.value = frame;
    uniforms.uMaxDepth.value = params.depth;
    uniforms.uGloss.value = (params.gloss * Math.PI) / 180;
    uniforms.uLightScale.value = params.lightScale;
    uniforms.uPrev.value = read.texture;
    quad.material = traceMat;
    renderer.setRenderTarget(write);
    renderer.render(quadScene, quadCam);
    [read, write] = [write, read];
    frame++;
  }
  displayUniforms.uTex.value = read.texture;
  quad.material = displayMat;
  renderer.setRenderTarget(null);
  renderer.render(quadScene, quadCam);
  if (frame !== shown && (frame % 8 === 0 || frame === MAX_SAMPLES || frame < 8)) {
    shown = frame;
    params.samples = frame >= MAX_SAMPLES ? `${frame} (done)` : String(frame);
    for (const c of gui.controllers) c.updateDisplay();
  }
});
