import GUI from "lil-gui";
import {
  BufferAttribute,
  BufferGeometry,
  CubeTextureLoader,
  DoubleSide,
  Euler,
  GLSL3,
  Group,
  Matrix4,
  Mesh,
  type Object3D,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
  RepeatWrapping,
  Scene,
  ShaderMaterial,
  type Texture,
  TextureLoader,
  Vector2,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
} from "three";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import {
  itemFragment,
  itemVertex,
  postFragment,
  postVertex,
  tileFragment,
  tileVertex,
} from "./shaders.ts";

// main.cpp's still life: file, scale, position, texture, tile size.
const ITEMS = [
  { obj: "table", scale: 0.1, pos: [0, 0, 0], tex: "wood", size: 2.5 },
  { obj: "teapot", scale: 0.002, pos: [1, 2.5, -1], tex: "redMetal", size: 1 },
  { obj: "chair", scale: 0.1, pos: [3, 0, 3], tex: "wood", size: 2 },
  { obj: "bottle", scale: 0.01, pos: [1, 2.5, 1], tex: "bottle", size: 1 },
  { obj: "wineglass", scale: 1, pos: [-1, 2.5, 1], tex: "metal", size: 0.6 },
  { obj: "wineglass", scale: 1, pos: [-1, 2.5, -1], tex: "metal", size: 0.6 },
  { obj: "chair", scale: 0.1, pos: [-3, 0, 4], tex: "wood", size: 1.5 },
] as const;

// The nine points of view, in tile-grid order: the center tile sees the object as you
// do, the others from the side, above or below, each also turned 40° about its own axis.
const POVS: [number, number][] = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [0, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
];
const SPACING = 2.02;
const HALF = 1.2;
const VIEW_W = 320; // the original rendered each view at 1024×768; 63 of those is a lot
const VIEW_H = 240;
const WALK = 3;
const RUN = 9;
const TURN = Math.PI / 3;

const params = { painting: true, refreshEvery: 1 };

const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
document.body.prepend(renderer.domElement);
const canvas = renderer.domElement;

const loader = new TextureLoader();
const tex = (name: string) => {
  const t = loader.load(`./tex/${name}.jpg`);
  t.wrapS = t.wrapT = RepeatWrapping;
  return t;
};
const brush = tex("lir");

const scene = new Scene();
scene.background = new CubeTextureLoader()
  .setPath("./sky/")
  .load(["pxpos.jpg", "pxneg.jpg", "ypos.jpg", "yneg.jpg", "zpos.jpg", "zneg.jpg"]);
const camera = new PerspectiveCamera(45, 1, 0.1, 200);
camera.position.set(0, 2, 17);
const look = new Euler(-0.05, 0, 0, "YXZ");

// Views: each object, drawn alone into nine small render targets per frame -------------
const viewScene = new Scene();
const viewCam = new PerspectiveCamera(45, VIEW_W / VIEW_H, 0.1, 200);
viewCam.matrixAutoUpdate = false;
viewCam.matrixWorldAutoUpdate = false;
const eyeCam = new PerspectiveCamera();
const back2 = new Matrix4().makeTranslation(0, 0, -2);
const texel = new Vector2(1 / VIEW_W, 1 / VIEW_H);

interface Item {
  model: Object3D | null;
  scale: number;
  targets: WebGLRenderTarget[];
  tiles: Group;
  jitter: Vector3[];
  noise: Float32Array[];
}

const objCache = new Map<string, Promise<Group>>();
const loadObj = (name: string) => {
  let p = objCache.get(name);
  if (!p) {
    p = new OBJLoader().loadAsync(`./obj/${name}.obj`);
    objCache.set(name, p);
  }
  return p;
};

const quad = new BufferGeometry();
quad.setAttribute("position", new BufferAttribute(new Float32Array(18), 3));
quad.setAttribute(
  "aCorner",
  new BufferAttribute(new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), 2),
);

const items: Item[] = ITEMS.map((def) => {
  const targets = POVS.map(() => new WebGLRenderTarget(VIEW_W, VIEW_H));
  const tiles = new Group();
  tiles.position.fromArray(def.pos);
  const jitter = POVS.map(() => new Vector3());
  POVS.forEach(([gx, gy], i) => {
    const tile = new Mesh(
      quad,
      new ShaderMaterial({
        glslVersion: GLSL3,
        vertexShader: tileVertex,
        fragmentShader: tileFragment,
        uniforms: {
          uView: { value: (targets[i] as WebGLRenderTarget).texture },
          uBrush: { value: brush },
          uTexel: { value: texel },
          uCenter: { value: new Vector2(gx * SPACING * def.size, gy * SPACING * def.size) },
          uJitter: { value: jitter[i] },
          uHalf: { value: HALF * def.size },
          uScale: { value: def.size },
        },
        transparent: true,
        depthWrite: false,
      }),
    );
    tile.frustumCulled = false;
    tiles.add(tile);
  });
  scene.add(tiles);
  const item: Item = {
    model: null,
    scale: def.scale,
    targets,
    tiles,
    jitter,
    // Each tile's own table of random offsets (the original's 256×256 random texture).
    noise: POVS.map(() => Float32Array.from({ length: 64 }, () => Math.random() - 0.5)),
  };
  loadObj(def.obj).then((g) => {
    const model = g.clone();
    const mat = new ShaderMaterial({
      glslVersion: GLSL3,
      vertexShader: itemVertex,
      fragmentShader: itemFragment,
      uniforms: { uMap: { value: tex(def.tex) } },
      side: DoubleSide,
    });
    model.traverse((c) => {
      if (c instanceof Mesh) c.material = mat;
    });
    model.matrixAutoUpdate = false;
    item.model = model;
  });
  return item;
});

const dir = new Vector3();
const axis = new Vector3();
const rot = new Matrix4();
const scaleM = new Matrix4();
function renderViews() {
  camera.getWorldDirection(dir);
  for (const item of items) {
    if (!item.model) continue;
    viewScene.add(item.model);
    POVS.forEach(([px, py], i) => {
      // The view: an eye one unit off to the side (pov), looking toward where you look,
      // with the object two units in front.
      eyeCam.position.set(px, py, 0);
      eyeCam.up.set(0, 1, 0);
      eyeCam.lookAt(dir);
      eyeCam.updateMatrixWorld();
      viewCam.matrixWorldInverse.multiplyMatrices(back2, eyeCam.matrixWorldInverse);
      viewCam.matrixWorld.copy(viewCam.matrixWorldInverse).invert();
      // glm::rotate in 2013 took degrees: -40° about the pov axis.
      axis.set(px, py, 0);
      scaleM.makeScale(item.scale, item.scale, item.scale);
      if (axis.lengthSq() > 0) rot.makeRotationAxis(axis.normalize(), (-40 * Math.PI) / 180);
      else rot.identity();
      (item.model as Object3D).matrix.multiplyMatrices(scaleM, rot);
      (item.model as Object3D).matrixWorldNeedsUpdate = true;
      renderer.setRenderTarget(item.targets[i] as WebGLRenderTarget);
      renderer.setClearColor(0x333333, 0);
      renderer.clear();
      renderer.render(viewScene, viewCam);
    });
    viewScene.remove(item.model);
  }
  renderer.setRenderTarget(null);
}

// Tiles turn to face you, and their corners take new random offsets as you look around:
// updateTile indexed its random table by |direction| × 50, so the shapes snap between
// states rather than drift.
function updateTiles() {
  camera.getWorldDirection(dir);
  const ix = Math.floor(Math.abs(dir.x) * 50);
  const iy = Math.floor(Math.abs(dir.y) * 50);
  const iz = Math.floor(Math.abs(dir.z) * 50);
  for (const item of items) {
    item.tiles.quaternion.copy(camera.quaternion);
    item.jitter.forEach((j, t) => {
      const n = item.noise[t] as Float32Array;
      j.set(n[ix % 64] as number, n[iy % 64] as number, n[iz % 64] as number);
    });
  }
}

// Painting pass ------------------------------------------------------------------------
const frame = new WebGLRenderTarget(1, 1);
const postUniforms = {
  uScene: { value: frame.texture as Texture },
  uCanvas: { value: tex("canvas") },
  uPaper: { value: tex("paper") },
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

// Controls: drag to look, W/S or press-and-hold to walk, A/D turn, Shift runs ----------
const keys = new Set<string>();
addEventListener("keydown", (e) => keys.add(e.key.toLowerCase()));
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
  look.x = Math.max(-1.2, Math.min(1.2, look.x - dy * 0.004));
  drag.x = e.clientX;
  drag.y = e.clientY;
});
const release = () => {
  drag = null;
};
canvas.addEventListener("pointerup", release);
canvas.addEventListener("pointercancel", release);

const gui = new GUI({ title: "Cubism" });
gui.add(params, "painting").name("painting pass");
if (innerWidth < 700) gui.close();

function resize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  frame.setSize(innerWidth * renderer.getPixelRatio(), innerHeight * renderer.getPixelRatio());
}
addEventListener("resize", resize);
resize();

const forward = new Vector3();
let last = performance.now();
renderer.setAnimationLoop((now) => {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  if (keys.has("a") || keys.has("arrowleft")) look.y += TURN * dt;
  if (keys.has("d") || keys.has("arrowright")) look.y -= TURN * dt;
  camera.quaternion.setFromEuler(look);
  const hold = drag && !drag.moved && now - drag.t > 300;
  const step =
    (keys.has("w") || keys.has("arrowup") || hold ? 1 : 0) -
    (keys.has("s") || keys.has("arrowdown") ? 1 : 0);
  if (step) {
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    camera.position.addScaledVector(forward, step * (keys.has("shift") ? RUN : WALK) * dt);
  }
  camera.updateMatrixWorld();

  renderViews();
  updateTiles();
  renderer.setClearColor(0x333333, 1);
  if (params.painting) {
    renderer.setRenderTarget(frame);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(postScene, postCam);
  } else renderer.render(scene, camera);
});
