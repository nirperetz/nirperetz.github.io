import {
  ACESFilmicToneMapping,
  AnimationMixer,
  Box3,
  Color,
  DirectionalLight,
  Group,
  type Material,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  ShadowMaterial,
  Sphere,
  SRGBColorSpace,
  Timer,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { type GLTF, GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { CATALOG, type Entry } from "./catalog.ts";

const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = SRGBColorSpace;
renderer.toneMapping = ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
document.getElementById("stage")?.prepend(renderer.domElement);
const canvas = renderer.domElement;

const scene = new Scene();
scene.background = new Color("#16161a");
// Image-based light from three's procedural studio room: soft, even, no HDR download.
const pmrem = new PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.9;

const key = new DirectionalLight(0xffffff, 1.6);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.bias = -0.0005;
scene.add(key, key.target);

// A floor that only shows the shadow.
const floor = new Mesh(new PlaneGeometry(1, 1), new ShadowMaterial({ opacity: 0.35 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const camera = new PerspectiveCamera(35, 1, 0.01, 1000);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.6;
controls.addEventListener("start", () => {
  controls.autoRotate = false;
});

const draco = new DRACOLoader().setDecoderPath("./draco/");
const loader = new GLTFLoader().setDRACOLoader(draco);

const $ = (id: string) => document.getElementById(id) as HTMLElement;
const list = $("list");
const info = { title: $("title"), meta: $("meta"), note: $("note"), stats: $("stats") };
const buttons = {
  clay: $("clay") as HTMLButtonElement,
  wire: $("wire") as HTMLButtonElement,
  play: $("play") as HTMLButtonElement,
};

let current: { entry: Entry; root: Object3D; mixer: AnimationMixer | null } | null = null;
let loading = 0;
const view = { clay: false, wire: false, playing: true };
const clay = new MeshStandardMaterial({ color: 0xd9d4cc, roughness: 0.75 });
const originals = new Map<Mesh, Material | Material[]>();

for (const e of CATALOG) {
  const li = document.createElement("button");
  li.type = "button";
  li.className = "item";
  li.dataset.id = e.id;
  li.innerHTML = `<span>${e.title}</span><small>${e.year} · ${e.tool}</small>`;
  li.addEventListener("click", () => {
    location.hash = e.id;
  });
  list.append(li);
}

async function show(id: string) {
  const entry = CATALOG.find((e) => e.id === id) ?? (CATALOG[0] as Entry);
  for (const el of list.querySelectorAll(".item"))
    el.classList.toggle("on", (el as HTMLElement).dataset.id === entry.id);
  info.title.textContent = entry.title;
  info.meta.textContent = `${entry.year} · ${entry.origin} · ${entry.tool}`;
  info.note.textContent = entry.note ?? "";
  info.stats.textContent = "loading…";
  const ticket = ++loading;
  const url = `./models/${entry.id}.glb`;
  let gltf: GLTF;
  let bytes = 0;
  try {
    const res = await fetch(url);
    const buf = await res.arrayBuffer();
    bytes = buf.byteLength;
    gltf = await loader.parseAsync(buf, "./models/");
  } catch {
    if (ticket === loading) info.stats.textContent = "couldn't load this one";
    return;
  }
  if (ticket !== loading) return; // a newer pick won

  if (current) {
    scene.remove(current.root);
    current.mixer?.stopAllAction();
  }
  originals.clear();
  // A holder, so the per-model turn and the floor offset never touch animated nodes.
  const root = new Group().add(gltf.scene);
  if (entry.turn)
    gltf.scene.rotation.set(
      ...(entry.turn.map((d) => (d * Math.PI) / 180) as [number, number, number]),
    );
  let tris = 0;
  root.traverse((o) => {
    if (o instanceof Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      originals.set(o, o.material);
      const g = o.geometry;
      tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
    }
  });
  scene.add(root);

  let mixer: AnimationMixer | null = null;
  if (gltf.animations.length) {
    mixer = new AnimationMixer(root);
    for (const clip of gltf.animations) mixer.clipAction(clip).play();
  }
  buttons.play.hidden = !mixer;
  current = { entry, root, mixer };
  frame(
    root,
    mixer,
    gltf.animations.reduce((m, c) => Math.max(m, c.duration), 0),
  );
  applyLook();
  info.stats.textContent = `${Math.round(tris).toLocaleString()} triangles · ${(bytes / 1e6).toFixed(1)} MB${gltf.animations.length ? " · animated" : ""}`;
}

/**
 * Stand the model on the floor, centered, and pull the camera back until it fits. Animated
 * models are measured over their whole motion, sampled at nine points in time.
 */
function bounds(root: Object3D, mixer: AnimationMixer | null, duration: number) {
  const box = new Box3();
  const steps = mixer && duration > 0 ? 8 : 0;
  for (let i = 0; i <= steps; i++) {
    mixer?.setTime((duration * i) / Math.max(steps, 1));
    root.updateMatrixWorld(true);
    box.union(new Box3().setFromObject(root, true));
  }
  mixer?.setTime(0);
  return box;
}

function frame(root: Object3D, mixer: AnimationMixer | null, duration: number) {
  const box = bounds(root, mixer, duration);
  const center = box.getCenter(new Vector3());
  root.position.x -= center.x;
  root.position.z -= center.z;
  root.position.y -= box.min.y;
  const sphere = bounds(root, mixer, duration).getBoundingSphere(new Sphere());
  const r = sphere.radius || 1;
  const dist = (r / Math.sin((camera.fov * Math.PI) / 360)) * 1.15;
  controls.target.copy(sphere.center);
  camera.position
    .copy(sphere.center)
    .add(new Vector3(0.6, 0.35, 1).normalize().multiplyScalar(dist));
  camera.near = dist / 100;
  camera.far = dist * 20;
  camera.updateProjectionMatrix();
  controls.minDistance = r * 0.3;
  controls.maxDistance = dist * 4;
  controls.autoRotate = true;
  floor.scale.setScalar(r * 8);
  floor.position.set(sphere.center.x, 0, sphere.center.z);
  key.position.copy(sphere.center).add(new Vector3(r * 2, r * 4, r * 2.5));
  key.target.position.copy(sphere.center);
  const cam = key.shadow.camera;
  cam.left = cam.bottom = -r * 2;
  cam.right = cam.top = r * 2;
  cam.near = r * 0.5;
  cam.far = r * 12;
  cam.updateProjectionMatrix();
}

/** Clay: one plain material for everything, to read the form. Wire: wireframe on top of that. */
function applyLook() {
  for (const [mesh, mat] of originals) {
    mesh.material = view.clay || view.wire ? clay : mat;
  }
  clay.wireframe = view.wire;
  buttons.clay.classList.toggle("on", view.clay);
  buttons.wire.classList.toggle("on", view.wire);
}
buttons.clay.addEventListener("click", () => {
  view.clay = !view.clay;
  applyLook();
});
buttons.wire.addEventListener("click", () => {
  view.wire = !view.wire;
  applyLook();
});
buttons.play.addEventListener("click", () => {
  view.playing = !view.playing;
  buttons.play.textContent = view.playing ? "pause" : "play";
});

function resize() {
  const stage = $("stage");
  const w = stage.clientWidth;
  const h = stage.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}
addEventListener("resize", resize);
resize();

addEventListener("hashchange", () => show(location.hash.slice(1)));
addEventListener("keydown", (e) => {
  if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "j" && e.key !== "k") return;
  const i = CATALOG.findIndex((x) => x.id === current?.entry.id);
  const next =
    CATALOG[
      (i + (e.key === "ArrowDown" || e.key === "j" ? 1 : -1) + CATALOG.length) % CATALOG.length
    ];
  if (next) location.hash = next.id;
  e.preventDefault();
});
show(location.hash.slice(1));

const timer = new Timer();
timer.connect(document);
renderer.setAnimationLoop((t) => {
  timer.update(t);
  if (view.playing) current?.mixer?.update(timer.getDelta());
  controls.update();
  renderer.render(scene, camera);
});
