import {
  CanvasTexture,
  CircleGeometry,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  RingGeometry,
  Scene,
  Timer,
  Vector2,
  WebGLRenderer,
} from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { BALL_R, type Brick, Game, type Kind, RIM_R0, RIM_R1, WALLS } from "./game.ts";

// The original colors: blue-to-cyan rings (R = 0.18·ring, G = 0.3 + 0.05·j,
// B = 0.7 + 0.01·j), specials in shades of red, pale cyan walls, teal paddles that turn
// red while magnetized and fade back as the magnet runs out.
const SPECIAL: Record<Exclude<Kind, "regular">, Color> = {
  magnet: new Color(1, 0, 0),
  enlarge: new Color(1, 0.2, 0.2),
  shrink: new Color(1, 0.1, 0.1),
};
const PADDLE = new Color(0, 0.5, 0.5);
const MAGNET = new Color(1, 0, 0);

const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
document.body.prepend(renderer.domElement);

const scene = new Scene();
scene.background = new Color("#000000");
const camera = new OrthographicCamera(-1, 1, 1, -1, -1, 1);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new Vector2(1, 1), 0.3, 0.25, 0.6));
composer.addPass(new OutputPass());

const game = new Game();

for (const w of WALLS) {
  scene.add(
    new Mesh(
      new RingGeometry(RIM_R0, RIM_R1, 32, 1, w.a0, w.len),
      new MeshBasicMaterial({ color: new Color(0.6, 0.85, 0.85) }),
    ),
  );
}

const paddleMat = new MeshBasicMaterial({ color: PADDLE.clone() });
const paddles = [0, 1].map(() => {
  const m = new Mesh(new RingGeometry(RIM_R0, RIM_R1, 48, 1, -0.5, 1), paddleMat);
  scene.add(m);
  return m;
});
let paddleHalf = -1;

// The ball: ten stacked discs from red to black, each smaller and shifted, so it looks
// lit from one side. A radial gradient does the same in one texture.
const ballCanvas = document.createElement("canvas");
ballCanvas.width = ballCanvas.height = 64;
const g = ballCanvas.getContext("2d") as CanvasRenderingContext2D;
const grad = g.createRadialGradient(40, 24, 2, 32, 32, 32);
grad.addColorStop(0, "#ff0000");
grad.addColorStop(1, "#000000");
g.fillStyle = grad;
g.beginPath();
g.arc(32, 32, 32, 0, Math.PI * 2);
g.fill();
const ball = new Mesh(
  new CircleGeometry(BALL_R, 32),
  new MeshBasicMaterial({ map: new CanvasTexture(ballCanvas), transparent: true }),
);
scene.add(ball);

const bricks = new Group();
scene.add(bricks);
const brickMeshes = new Map<number, Mesh>();
const dying: { mesh: Mesh; t: number }[] = [];

function baseColor(b: Brick) {
  if (b.kind !== "regular") return SPECIAL[b.kind];
  return new Color(
    0.18 * b.ring,
    Math.min(1, 0.3 + 0.05 * b.index),
    Math.min(1, 0.7 + 0.01 * b.index),
  );
}

function buildBricks() {
  for (const m of brickMeshes.values()) {
    m.geometry.dispose();
    (m.material as MeshBasicMaterial).dispose();
  }
  bricks.clear();
  brickMeshes.clear();
  for (const b of game.bricks) {
    const mesh = new Mesh(
      new RingGeometry(b.r0, b.r1, Math.max(8, Math.ceil(b.len * 40)), 1, b.a0, b.len),
      new MeshBasicMaterial({ color: baseColor(b), transparent: true }),
    );
    mesh.userData.base = baseColor(b);
    bricks.add(mesh);
    brickMeshes.set(b.id, mesh);
  }
}

function shatter(b: Brick) {
  const mesh = brickMeshes.get(b.id);
  if (!mesh) return;
  brickMeshes.delete(b.id);
  dying.push({ mesh, t: 0 });
}

// HUD
const $ = (id: string) => document.getElementById(id) as HTMLElement;
const hud = { score: $("score"), lives: $("lives"), level: $("level"), msg: $("msg"), fx: $("fx") };
function message(text: string) {
  hud.msg.textContent = text;
  hud.msg.style.opacity = text ? "1" : "0";
}

// Input: a/d (or arrows) turn both paddles, as in the original; on touch or mouse the
// pointer's angle steers the bottom paddle. Space or a click serves and releases the
// magnet; r restarts.
const keys = new Set<string>();
addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  keys.add(k);
  if (k === " ") {
    e.preventDefault();
    game.launch();
  }
  if (k === "r") game.restart();
});
addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
addEventListener("blur", () => keys.clear());
const canvas = renderer.domElement;
canvas.addEventListener("pointermove", (e) => {
  const x = e.clientX - innerWidth / 2;
  const y = innerHeight / 2 - e.clientY;
  game.aim(Math.hypot(x, y) > 8 ? Math.atan2(y, x) : null);
});
canvas.addEventListener("pointerdown", (e) => {
  canvas.dispatchEvent(new PointerEvent("pointermove", e));
  game.launch();
});

function resize() {
  const aspect = innerWidth / innerHeight;
  const s = 1.06;
  camera.left = -s * Math.max(aspect, 1);
  camera.right = s * Math.max(aspect, 1);
  camera.top = s / Math.min(aspect, 1);
  camera.bottom = -s / Math.min(aspect, 1);
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
}
addEventListener("resize", resize);
resize();
buildBricks();

const timer = new Timer();
timer.connect(document);
const tint = new Color();
renderer.setAnimationLoop((time) => {
  timer.update(time);
  const dt = Math.min(timer.getDelta(), 1 / 30);
  // a turns the paddles clockwise (paddleSpeed = -3°), d counter-clockwise.
  const turn =
    (keys.has("d") || keys.has("arrowright") ? 1 : 0) -
    (keys.has("a") || keys.has("arrowleft") ? 1 : 0);
  game.step(dt, turn);

  for (const e of game.events.splice(0)) {
    if (e.type === "break") shatter(e.brick);
    else if (e.type === "level") {
      buildBricks();
      message(e.level === 1 ? "click or space to serve" : `level ${e.level} · click or space`);
    } else if (e.type === "lost" && !game.over) message("click or space to serve");
    else if (e.type === "over") message(`game over · ${game.score} · click to restart`);
  }
  if (!game.serving && !game.over) message(game.stuck !== null ? "space or click to release" : "");

  // The bricks' colors drift in a slow loop, a small change to R, G and B each frame.
  const s = timer.getElapsed();
  for (const mesh of brickMeshes.values()) {
    const base = mesh.userData.base as Color;
    (mesh.material as MeshBasicMaterial).color.setRGB(
      base.r + 0.12 * Math.sin(s * 0.9),
      base.g + 0.12 * Math.sin(s * 0.7 + 2),
      base.b + 0.12 * Math.sin(s * 0.5 + 4),
    );
  }
  for (let i = dying.length - 1; i >= 0; i--) {
    const d = dying[i];
    if (!d) continue;
    d.t += dt * 3.5;
    d.mesh.scale.setScalar(1 + d.t * 0.25);
    (d.mesh.material as MeshBasicMaterial).opacity = 1 - d.t;
    if (d.t >= 1) {
      bricks.remove(d.mesh);
      d.mesh.geometry.dispose();
      (d.mesh.material as MeshBasicMaterial).dispose();
      dying.splice(i, 1);
    }
  }

  if (paddleHalf !== game.paddleHalf) {
    paddleHalf = game.paddleHalf;
    for (const p of paddles) {
      p.geometry.dispose();
      p.geometry = new RingGeometry(RIM_R0, RIM_R1, 48, 1, -paddleHalf, paddleHalf * 2);
    }
  }
  game.paddles.forEach((a, i) => {
    (paddles[i] as Mesh).rotation.z = a;
  });
  paddleMat.color.copy(tint.copy(PADDLE).lerp(MAGNET, game.magnetFraction));
  ball.position.set(game.ball.x, game.ball.y, 0);

  hud.score.textContent = String(game.score);
  hud.lives.textContent = "●".repeat(Math.max(0, game.lives));
  hud.level.textContent = String(game.level);
  hud.fx.textContent = game.magnetTime > 0 ? `magnet ${Math.ceil(game.magnetTime)}` : "";

  composer.render();
});
