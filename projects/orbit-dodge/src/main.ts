import { type Game, newGame, press, RING, shipPosition, sizes, step } from "./game.ts";

const { canvas, ctx } = getStage();
const STEP = 1 / 120; // fixed simulation step; rendering runs at display rate

let game: Game = newGame();
let best = readBest();

// Input: any key, click or tap is the one button.
const onPress = (e: Event) => {
  e.preventDefault();
  const wasOver = game.phase === "over";
  game = press(game);
  if (wasOver) best = readBest();
};
addEventListener("keydown", (e) => {
  if (!e.repeat && e.key !== "Tab") onPress(e);
});
canvas.addEventListener("pointerdown", onPress);

function resize() {
  const dpr = Math.min(devicePixelRatio, 2);
  canvas.width = Math.floor(innerWidth * dpr);
  canvas.height = Math.floor(innerHeight * dpr);
}
addEventListener("resize", resize);
resize();

let last = performance.now();
let acc = 0;
function frame(now: number) {
  acc += Math.min(0.25, (now - last) / 1000);
  last = now;
  while (acc >= STEP) {
    const wasPlaying = game.phase === "playing";
    game = step(game, STEP);
    if (wasPlaying && game.phase === "over") saveBest(game.score);
    acc -= STEP;
  }
  draw(game);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

function draw(g: Game) {
  const { width: w, height: h } = canvas;
  const unit = Math.min(w, h);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#0b0b12";
  ctx.fillRect(0, 0, w, h);
  ctx.setTransform(unit, 0, 0, unit, w / 2, h / 2);

  ctx.lineWidth = 1.5 / unit;
  ctx.strokeStyle = "rgb(255 255 255 / 0.12)";
  ctx.beginPath();
  ctx.arc(0, 0, RING, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = "#ffcf5a";
  for (const s of g.sparks) dot(s.x, s.y, sizes.SPARK_R * (0.8 + 0.2 * Math.sin(g.time * 8)));
  ctx.fillStyle = "#8a8fa8";
  for (const r of g.rocks) dot(r.x, r.y, sizes.ROCK_R);

  const ship = shipPosition(g);
  ctx.fillStyle = g.phase === "over" ? "#ff4d4d" : "#7dfcd3";
  dot(ship.x, ship.y, sizes.SHIP_R);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#e9e6f2";
  ctx.textAlign = "center";
  const px = (n: number) => `${Math.round(n * unit)}px ui-monospace, Menlo, monospace`;
  ctx.font = px(0.05);
  ctx.fillText(String(Math.floor(g.score)), w / 2, h / 2 + 0.018 * unit);
  ctx.font = px(0.026);
  const msg =
    g.phase === "ready"
      ? "press any key or tap to start, again to reverse"
      : g.phase === "over"
        ? `game over · best ${Math.floor(best)} · press to retry`
        : "";
  if (msg) ctx.fillText(msg, w / 2, h - 0.08 * unit);
}

function dot(x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function getStage() {
  const canvas = document.querySelector<HTMLCanvasElement>("#game");
  const ctx = canvas?.getContext("2d");
  if (!canvas || !ctx) throw new Error("Orbit Dodge needs a <canvas id=game> with 2D support");
  return { canvas, ctx };
}

// Best score is a per-browser convenience, so storage failures are ignored.
function readBest(): number {
  try {
    return Number(localStorage.getItem("orbit-dodge:best")) || 0;
  } catch {
    return 0;
  }
}
function saveBest(score: number) {
  best = Math.max(best, score);
  try {
    localStorage.setItem("orbit-dodge:best", String(best));
  } catch {}
}
