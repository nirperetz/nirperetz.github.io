import GUI from "lil-gui";
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  CubeTextureLoader,
  DoubleSide,
  Euler,
  GLSL3,
  LineSegments,
  Mesh,
  PerspectiveCamera,
  PlaneGeometry,
  Points,
  RepeatWrapping,
  Scene,
  ShaderMaterial,
  TextureLoader,
  Vector3,
  WebGLRenderer,
} from "three";
import {
  groundFragment,
  groundVertex,
  rainFragment,
  rainVertex,
  tornadoFragment,
  tornadoVertex,
  waterFragment,
  waterVertex,
} from "./shaders.ts";
import { generate, heightAt, SIZE, type Terrain } from "./terrain.ts";

const WALK = 3; // units per second (0.05 a frame)
const RUN = 12.6; // 0.21 a frame
const TURN = Math.PI / 3; // A/D: 1° a frame
const TORNADO_PARTICLES = 1500;
const RAIN_DROPS = 12000;

const params = { rain: true, tornado: true, seed: Math.floor(Math.random() * 1e6) };

const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
document.body.prepend(renderer.domElement);
const canvas = renderer.domElement;

const scene = new Scene();
const sky = new CubeTextureLoader()
  .setPath("./sky/")
  .load(["pxpos.jpg", "pxneg.jpg", "ypos.jpg", "yneg.jpg", "zpos.jpg", "zneg.jpg"]);
scene.background = sky;
// Under the sea the sky goes away and a blue veil (#under in index.html) closes in.
const underwaterColor = new Color(0.05, 0.18, 0.26);
const veil = document.getElementById("under") as HTMLElement;

const camera = new PerspectiveCamera(45, 1, 0.1, 400);
// The original's start: at the shore, looking in toward the island.
camera.position.set(15, 5, 0);
const look = new Euler(0, Math.PI / 2, 0, "YXZ");

const sun = new Vector3(1, 1, 1).normalize();
const tex = (url: string) => {
  const t = new TextureLoader().load(url);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
};
const time = { value: 0 };

// Ground ----------------------------------------------------------------------------------
const groundMat = new ShaderMaterial({
  glslVersion: GLSL3,
  vertexShader: groundVertex,
  fragmentShader: groundFragment,
  uniforms: {
    uSand: { value: tex("./ses.jpg") },
    uGrass: { value: tex("./grass.jpg") },
    uStone: { value: tex("./stone.jpg") },
    uCaustics: { value: tex("./water.jpg") },
    uTime: time,
    uSun: { value: sun },
  },
});
const ground = new Mesh(new BufferGeometry(), groundMat);
scene.add(ground);
let terrain: Terrain;

function buildIsland(seed: number) {
  terrain = generate(seed);
  const { n, heights } = terrain;
  const g = new PlaneGeometry(SIZE, SIZE, n - 1, n - 1);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position as BufferAttribute;
  // PlaneGeometry rows run from -z to +z after the rotation, matching the height grid.
  for (let i = 0; i < pos.count; i++) pos.setY(i, heights[i] as number);
  g.computeVertexNormals();
  ground.geometry.dispose();
  ground.geometry = g;
}

// Sea floor beyond the island, so the transparent sea has something under it.
const seabed = new Mesh(new PlaneGeometry(800, 800).rotateX(-Math.PI / 2), groundMat);
seabed.position.y = -2.5;
scene.add(seabed);

// Sea -------------------------------------------------------------------------------------
const water = new Mesh(
  new PlaneGeometry(800, 800).rotateX(-Math.PI / 2),
  new ShaderMaterial({
    glslVersion: GLSL3,
    vertexShader: waterVertex,
    fragmentShader: waterFragment,
    uniforms: { uSky: { value: sky }, uTime: time, uSun: { value: sun } },
    transparent: true,
    side: DoubleSide,
    depthWrite: false,
  }),
);
water.renderOrder = 1;
scene.add(water);

// Tornado ---------------------------------------------------------------------------------
const tornadoGeo = new BufferGeometry();
tornadoGeo.setAttribute(
  "position",
  new BufferAttribute(new Float32Array(TORNADO_PARTICLES * 3), 3),
);
// One particle born per frame, as in the feedback shader: the funnel builds up over
// TORNADO_PARTICLES / 60 seconds and then recycles.
tornadoGeo.setAttribute(
  "aBirth",
  new BufferAttribute(
    Float32Array.from({ length: TORNADO_PARTICLES }, (_, i) => i / 60),
    1,
  ),
);
tornadoGeo.setAttribute(
  "aSeed",
  new BufferAttribute(Float32Array.from({ length: TORNADO_PARTICLES }, Math.random), 1),
);
const tornadoUniforms = {
  uTime: time,
  uLife: { value: TORNADO_PARTICLES / 60 },
  uPixel: { value: 1 },
};
const tornado = new Points(
  tornadoGeo,
  new ShaderMaterial({
    glslVersion: GLSL3,
    vertexShader: tornadoVertex,
    fragmentShader: tornadoFragment,
    uniforms: tornadoUniforms,
    transparent: true,
    depthWrite: false,
  }),
);
tornado.frustumCulled = false;
tornado.renderOrder = 2;
scene.add(tornado);

// Rain ------------------------------------------------------------------------------------
const rainGeo = new BufferGeometry();
const seeds = new Float32Array(RAIN_DROPS * 6);
const ends = new Float32Array(RAIN_DROPS * 2);
for (let i = 0; i < RAIN_DROPS; i++) {
  const s = [Math.random(), Math.random(), Math.random()];
  seeds.set([...s, ...s], i * 6);
  ends.set([0, 1], i * 2);
}
rainGeo.setAttribute("position", new BufferAttribute(new Float32Array(RAIN_DROPS * 6), 3));
rainGeo.setAttribute("aSeed", new BufferAttribute(seeds, 3));
rainGeo.setAttribute("aEnd", new BufferAttribute(ends, 1));
const rainCenter = new Vector3();
const rain = new LineSegments(
  rainGeo,
  new ShaderMaterial({
    glslVersion: GLSL3,
    vertexShader: rainVertex,
    fragmentShader: rainFragment,
    uniforms: { uTime: time, uCenter: { value: rainCenter } },
    transparent: true,
    depthWrite: false,
  }),
);
rain.frustumCulled = false;
rain.renderOrder = 3;
scene.add(rain);

// Controls: drag to look, W/S or hold still to move, A/D turn, Shift runs.
const keys = new Set<string>();
addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  keys.add(k);
  if (k === "r") params.rain = !params.rain;
  if (k === "t") params.tornado = !params.tornado;
  if (k === "n") newIsland();
  for (const c of gui.controllers) c.updateDisplay();
});
addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
addEventListener("blur", () => keys.clear());
let drag: { x: number; y: number; moved: boolean; t: number } | null = null;
canvas.addEventListener("pointerdown", (e) => {
  canvas.setPointerCapture(e.pointerId);
  drag = { x: e.clientX, y: e.clientY, moved: false, t: performance.now() };
});
canvas.addEventListener("pointermove", (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x;
  const dy = e.clientY - drag.y;
  if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
  look.y -= dx * 0.004;
  look.x = Math.max(-1.4, Math.min(1.4, look.x - dy * 0.004));
  drag.x = e.clientX;
  drag.y = e.clientY;
});
const release = () => {
  drag = null;
};
canvas.addEventListener("pointerup", release);
canvas.addEventListener("pointercancel", release);

const gui = new GUI({ title: "Island" });
gui.add(params, "rain").name("rain (r)");
gui.add(params, "tornado").name("tornado (t)");
gui.add({ newIsland }, "newIsland").name("new island (n)");
if (innerWidth < 700) gui.close();

function newIsland() {
  params.seed = Math.floor(Math.random() * 1e6);
  buildIsland(params.seed);
  time.value = 0; // the tornado starts building again
}

function resize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  tornadoUniforms.uPixel.value =
    (innerHeight * renderer.getPixelRatio() * 0.5) / Math.tan((camera.fov * Math.PI) / 360);
}
addEventListener("resize", resize);
resize();
buildIsland(params.seed);

const forward = new Vector3();
let last = performance.now();
renderer.setAnimationLoop((now) => {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  time.value += dt;

  if (keys.has("a") || keys.has("arrowleft")) look.y += TURN * dt;
  if (keys.has("d") || keys.has("arrowright")) look.y -= TURN * dt;
  camera.quaternion.setFromEuler(look);
  // Holding the pointer still for a moment walks forward (touch screens have no W).
  const hold = drag && !drag.moved && now - drag.t > 300;
  const dir =
    (keys.has("w") || keys.has("arrowup") || hold ? 1 : 0) -
    (keys.has("s") || keys.has("arrowdown") ? 1 : 0);
  if (dir) {
    camera.getWorldDirection(forward);
    camera.position.addScaledVector(forward, dir * (keys.has("shift") ? RUN : WALK) * dt);
  }
  // You can swim and dive, but not walk through the ground.
  camera.position.y = Math.max(
    camera.position.y,
    heightAt(terrain, camera.position.x, camera.position.z) + 0.4,
  );

  const below = camera.position.y < 0;
  scene.background = below ? underwaterColor : sky;
  veil.hidden = !below;
  rain.visible = params.rain && !below;
  tornado.visible = params.tornado;
  rainCenter.copy(camera.position);

  renderer.render(scene, camera);
});
