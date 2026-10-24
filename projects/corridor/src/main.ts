import GUI from "lil-gui";
import {
  DoubleSide,
  GLSL3,
  Matrix4,
  Mesh,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
  RepeatWrapping,
  Scene,
  ShaderMaterial,
  TextureLoader,
  Vector2,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
} from "three";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { postFragment, postVertex, wallFragment, wallVertex } from "./shaders.ts";

// matrixDef.h, rows as written. EDGE's bottom tap was -9 in the original, which made
// the kernel sum to -2 and turned the frame black; it is +9 here (a Laplacian).
// DOUBLE summed to 2 and doubled the brightness; it averages here.
const K = (k: number, ...rows: number[]) =>
  new Matrix4().set(...(rows.map((v) => v * k) as Parameters<Matrix4["set"]>));
const KERNELS = {
  identity: K(1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
  blur: K(1 / 16, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1),
  emboss: K(1 / 9, -18, -9, 0, 0, -9, 9, 9, 0, 0, 9, 18, 0, 0, 0, 0, 0),
  sharpen: K(1 / 9, 0, -3, 0, 0, -3, 21, -3, 0, 0, -3, 0, 0, 0, 0, 0, 0),
  edge: K(1 / 9, 0, 9, 0, 0, 9, -36, 9, 0, 0, 9, 0, 0, 0, 0, 0, 0),
  double: K(0.5, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
};
type KernelName = keyof typeof KERNELS;
const EFFECTS = ["none", "dizzy", "glow", "blink", "poster"] as const;
type Effect = (typeof EFFECTS)[number];

const WALK = 0.48; // texture units per second (0.008 per frame at 60 fps)
const RUN = 1.08;
const SIDE_SPEED = 1.2;
const SIDE_MAX = 0.8;

const state = { kernel: "identity" as KernelName, effect: "none" as Effect };

const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
document.body.prepend(renderer.domElement);
const canvas = renderer.domElement;

const scene = new Scene();
const camera = new PerspectiveCamera(45, 1, 0.1, 100);

// Pass 1 renders into this target; pass 2 reads it through the post shader.
const target = new WebGLRenderTarget(1, 1, { depthBuffer: true });

const stone = new TextureLoader().load("./stone.jpg");
stone.wrapS = stone.wrapT = RepeatWrapping;
stone.anisotropy = renderer.capabilities.getMaxAnisotropy();

const wallUniforms = {
  uMap: { value: stone },
  uScroll: { value: 0 },
  uLampPos: { value: new Vector3() },
  uLightDir: { value: new Vector3(0, 0, -1) },
  uFlicker: { value: 1 },
};
const wallMat = new ShaderMaterial({
  glslVersion: GLSL3,
  vertexShader: wallVertex,
  fragmentShader: wallFragment,
  uniforms: wallUniforms,
  side: DoubleSide,
});

// The corridor: an open box 2 wide and 128 long, scaled 2× and stood along -z, as in
// the original. Its UVs repeat the stone 16 times along the length.
new OBJLoader().load("./corridor.obj", (obj) => {
  obj.traverse((child) => {
    if (child instanceof Mesh) child.material = wallMat;
  });
  obj.scale.setScalar(2);
  obj.rotation.x = Math.PI / 2;
  scene.add(obj);
});

const postUniforms = {
  uScene: { value: target.texture },
  uTexel: { value: new Vector2() },
  uKernel: { value: KERNELS.identity },
  uDizzy: { value: 1 },
  uMotionBlur: { value: false },
  uGlow: { value: 1 },
  uPoster: { value: 0 },
  uBlink: { value: 1 },
};
const post = new Mesh(
  new PlaneGeometry(2, 2),
  new ShaderMaterial({
    glslVersion: GLSL3,
    vertexShader: postVertex,
    fragmentShader: postFragment,
    uniforms: postUniforms,
    depthTest: false,
  }),
);
const postScene = new Scene().add(post);
const postCam = new OrthographicCamera();

// Input: the pointer aims the flashlight; W (or holding the pointer down) walks,
// Shift runs, A/D sidestep. The exercise's keys pick the post effects.
const keys = new Set<string>();
const aim = new Vector2();
let held = false;
const KEY_KERNEL: Record<string, KernelName> = {
  "1": "identity",
  "2": "blur",
  "3": "emboss",
  "4": "sharpen",
  "5": "edge",
};
const KEY_EFFECT: Record<string, Effect> = {
  n: "none",
  z: "dizzy",
  g: "glow",
  b: "blink",
  p: "poster",
};
addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  keys.add(k);
  if (KEY_KERNEL[k]) state.kernel = KEY_KERNEL[k];
  if (KEY_EFFECT[k]) state.effect = KEY_EFFECT[k];
  for (const c of gui.controllersRecursive()) c.updateDisplay();
});
addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
addEventListener("blur", () => keys.clear());
canvas.addEventListener("pointermove", (e) => {
  aim.set((e.clientX / innerWidth) * 2 - 1, 1 - (e.clientY / innerHeight) * 2);
});
canvas.addEventListener("pointerdown", (e) => {
  canvas.setPointerCapture(e.pointerId);
  aim.set((e.clientX / innerWidth) * 2 - 1, 1 - (e.clientY / innerHeight) * 2);
  held = true;
});
const release = () => {
  held = false;
};
canvas.addEventListener("pointerup", release);
canvas.addEventListener("pointercancel", release);

const gui = new GUI({ title: "Corridor" });
gui
  .add(
    state,
    "kernel",
    Object.keys(KERNELS).filter((k) => k !== "double"),
  )
  .name("kernel (1–5)");
gui.add(state, "effect", EFFECTS).name("effect (n z g b p)");
if (innerWidth < 700) gui.close();

function resize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  const w = Math.round(innerWidth * renderer.getPixelRatio());
  const h = Math.round(innerHeight * renderer.getPixelRatio());
  target.setSize(w, h);
  postUniforms.uTexel.value.set(1 / w, 1 / h);
}
addEventListener("resize", resize);
resize();

let side = 0;
let stride = 0; // walking phase, radians
let t = 0;
let last = performance.now();
renderer.setAnimationLoop((now) => {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  t += dt;

  const walking = keys.has("w") || keys.has("arrowup") || held;
  const running = walking && keys.has("shift");
  const speed = running ? RUN : WALK;
  if (walking) {
    wallUniforms.uScroll.value += speed * dt;
    stride += dt * (running ? 13 : 9);
  }
  if (keys.has("a") || keys.has("arrowleft")) side = Math.min(SIDE_MAX, side + SIDE_SPEED * dt);
  if (keys.has("d") || keys.has("arrowright")) side = Math.max(-SIDE_MAX, side - SIDE_SPEED * dt);

  // Head bob while walking; the dizzy effect adds a slow circle of the head.
  const bob = walking ? Math.sin(stride) * (running ? 0.11 : 0.05) : 0;
  const dizzy = state.effect === "dizzy";
  camera.position.set(
    -side + (dizzy ? 0.15 * Math.sin(t) : 0),
    bob,
    0.2 + (dizzy ? 0.1 * Math.cos(t) : 0),
  );

  // The flashlight sits at the camera and points through the pointer.
  const tanY = Math.tan((camera.fov * Math.PI) / 360);
  wallUniforms.uLampPos.value.copy(camera.position);
  wallUniforms.uLightDir.value.set(aim.x * tanY * camera.aspect, aim.y * tanY, -1);
  // A new random brightness on about one frame in four: the bulb is dying.
  if (Math.random() < 0.25) wallUniforms.uFlicker.value = 0.5 + Math.random() * 0.5;

  postUniforms.uKernel.value = dizzy ? KERNELS.double : KERNELS[state.kernel];
  postUniforms.uDizzy.value = dizzy ? 1 + 4 * Math.abs(Math.sin(t)) : 1;
  postUniforms.uMotionBlur.value = running;
  postUniforms.uGlow.value = state.effect === "glow" ? 1.7 : 1;
  postUniforms.uPoster.value = state.effect === "poster" ? 2 : 0;
  // Blink: the eye shuts about once a second.
  postUniforms.uBlink.value =
    state.effect === "blink" ? Math.min(0.5, Math.abs(Math.sin(t * Math.PI)) * 1.5) : 1;

  renderer.setRenderTarget(target);
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);
  renderer.render(postScene, postCam);
});
