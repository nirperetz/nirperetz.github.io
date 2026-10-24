import {
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
import { BALL_R, type Brick, Game, type Kind, PADDLE_R0, PADDLE_R1 } from "./game.ts";

const COLORS: Record<Kind, string> = {
  regular: "#ff5a3c",
  slow: "#3cc8ff",
  triple: "#ff3cc8",
  magnet: "#ffd23c",
  passive: "#5a5a66",
};
// Regular bricks shade from hot (inner) to cool (outer) rings.
const RING_TINT = ["#ff4630", "#ff7a2e", "#ffa936", "#ffd05a", "#c8e070", "#78d8a0"];

const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
document.body.prepend(renderer.domElement);

const scene = new Scene();
scene.background = new Color("#07070a");
const camera = new OrthographicCamera(-1, 1, 1, -1, -1, 1);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new Vector2(1, 1), 0.35, 0.25, 0.55);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const game = new Game();

// Static pieces: the rim the paddle rides on.
const rim = new Mesh(
  new RingGeometry(PADDLE_R1 + 0.012, PADDLE_R1 + 0.016, 256),
  new MeshBasicMaterial({ color: "#2a2a35" }),
);
scene.add(rim);

const paddleMat = new MeshBasicMaterial({ color: "#f2efe8" });
const paddle = new Mesh(
  new RingGeometry(PADDLE_R0, PADDLE_R1, 48, 1, -game.paddleHalf, game.paddleHalf * 2),
  paddleMat,
);
scene.add(paddle);

const ballGeo = new CircleGeometry(BALL_R, 32);
const ballMat = new MeshBasicMaterial({ color: "#fff4ec" });
const balls = new Group();
scene.add(balls);

// Brick meshes are rebuilt per level; each sits at angle 0 and is rotated into place,
// so a spinning ring only updates rotation.z.
const bricks = new Group();
scene.add(bricks);
const brickMeshes = new Map<number, Mesh>();
const dying: { mesh: Mesh; t: number }[] = [];

function buildBricks() {
  for (const m of brickMeshes.values()) {
    m.geometry.dispose();
    (m.material as MeshBasicMaterial).dispose();
  }
  bricks.clear();
  brickMeshes.clear();
  for (const b of game.bricks) {
    const color = b.kind === "regular" ? (RING_TINT[b.ring] ?? COLORS.regular) : COLORS[b.kind];
    const mesh = new Mesh(
      new RingGeometry(b.r0, b.r1, Math.max(6, Math.ceil(b.len * 40)), 1, 0, b.len),
      new MeshBasicMaterial({ color, transparent: true }),
    );
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

// Input: the pointer's angle around the center steers the paddle; click or space serves.
const keys = new Set<string>();
addEventListener("keydown", (e) => {
  keys.add(e.key.toLowerCase());
  if (e.key === " ") {
    e.preventDefault();
    game.launch();
  }
});
addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
renderer.domElement.addEventListener("pointermove", (e) => {
  const x = e.clientX - innerWidth / 2;
  const y = innerHeight / 2 - e.clientY;
  if (Math.hypot(x, y) > 8) game.aim(Math.atan2(y, x));
});
renderer.domElement.addEventListener("pointerdown", (e) => {
  renderer.domElement.dispatchEvent(new PointerEvent("pointermove", e));
  game.launch();
});

function resize() {
  const aspect = innerWidth / innerHeight;
  const s = 1.08;
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
renderer.setAnimationLoop((time) => {
  timer.update(time);
  const dt = Math.min(timer.getDelta(), 1 / 30);
  // As in the original, d turns the paddle counter-clockwise: rightward at the bottom.
  const kb =
    (keys.has("d") || keys.has("arrowright") ? 1 : 0) -
    (keys.has("a") || keys.has("arrowleft") ? 1 : 0);
  game.nudge(kb, dt);
  game.step(dt);

  for (const e of game.events.splice(0)) {
    if (e.type === "break") shatter(e.brick);
    else if (e.type === "level") {
      buildBricks();
      message(e.level === 1 ? "click or space to serve" : `level ${e.level}`);
    } else if (e.type === "lost" && !game.over) message("click or space to serve");
    else if (e.type === "over") message(`game over · ${game.score} · click to restart`);
  }
  if (game.balls.some((b) => b.held === null)) message("");

  for (const b of game.bricks) {
    const mesh = brickMeshes.get(b.id);
    if (mesh) mesh.rotation.z = b.a0;
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

  paddle.rotation.z = game.paddle;
  paddleMat.color.set(game.magnetTime > 0 ? COLORS.magnet : "#f2efe8");
  ballMat.color.set(game.slowTime > 0 ? COLORS.slow : "#fff4ec");
  while (balls.children.length < game.balls.length) balls.add(new Mesh(ballGeo, ballMat));
  while (balls.children.length > game.balls.length) balls.children.pop();
  game.balls.forEach((b, i) => {
    balls.children[i]?.position.set(b.x, b.y, 0);
  });

  hud.score.textContent = String(game.score);
  hud.lives.textContent = "●".repeat(Math.max(0, game.lives));
  hud.level.textContent = String(game.level);
  const fx = [
    game.slowTime > 0 ? `slow ${Math.ceil(game.slowTime)}` : "",
    game.magnetTime > 0 ? `magnet ${Math.ceil(game.magnetTime)}` : "",
  ];
  hud.fx.textContent = fx.filter(Boolean).join(" · ");

  composer.render();
});
