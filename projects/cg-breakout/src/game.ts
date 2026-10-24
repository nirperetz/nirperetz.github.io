// Polar Breakout, after the version Nir Peretz and Tomer Franco handed in (2012): the
// bricks sit in four rings at the center, and two mirrored paddles ride the rim between
// four fixed wall segments. Everything is in polar coordinates on the unit disc (the
// original's 700-pixel window, divided by 350). This module is pure game state and
// physics; main.ts draws it.

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

/** Brick kinds, from the `hit` enum in Brick.h. */
export type Kind = "regular" | "magnet" | "enlarge" | "shrink";

export interface Brick {
  id: number;
  kind: Kind;
  r0: number;
  r1: number;
  /** Start angle and angular length, in radians. */
  a0: number;
  len: number;
  ring: number;
  index: number;
  alive: boolean;
}

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export type Event =
  | { type: "break"; brick: Brick }
  | { type: "bounce" }
  | { type: "lost" }
  | { type: "level"; level: number }
  | { type: "over" };

const PX = 1 / 350;
const THICKNESS = 17 * PX;
export const BALL_R = 10 * PX;
export const RIM_R0 = 333 * PX; // height/2 - THICKNESS
export const RIM_R1 = RIM_R0 + THICKNESS;
/** The fixed wall segments between the paddles: 30–60°, 120–150°, 210–240°, 300–330°. */
export const WALLS = [30, 120, 210, 300].map((a) => ({ a0: a * DEG, len: 30 * DEG }));
const PADDLE_HALF = 20 * DEG; // 250–290° and 70–110°
const MIN_HALF = 5 * DEG;
const MAX_HALF = 45 * DEG;
const PADDLE_SPEED = 150 * DEG; // 3° per 20 ms tick
const BALL_SPEED = 300 * PX; // 6 px per 20 ms tick
const MAGNET_TIME = 12; // 600 ticks
const RINGS = 4;
const GAP = 8 * PX;

const wrap = (a: number) => ((a % TAU) + TAU) % TAU;
/** Signed shortest angle from a to b, in (-π, π]. */
const angleDiff = (a: number, b: number) => wrap(b - a + Math.PI) - Math.PI;

export class Game {
  bricks: Brick[] = [];
  ball: Ball = { x: 0, y: 0, vx: 0, vy: 0 };
  /** Waiting for a serve. */
  serving = true;
  /** Stuck to a paddle by the magnet, at this angle relative to paddle 0's center. */
  stuck: number | null = null;
  /** Center of paddle 0; paddle 1 is always opposite. */
  paddle = 270 * DEG;
  paddleHalf = PADDLE_HALF;
  targetPaddle: number | null = null;
  magnetTime = 0;
  level = 1;
  score = 0;
  lives = 3;
  over = false;
  events: Event[] = [];

  constructor() {
    this.loadLevel(1);
  }

  get speed() {
    return BALL_SPEED * (1 + 0.1 * (this.level - 1));
  }

  /** Both paddle centers. */
  get paddles() {
    return [this.paddle, wrap(this.paddle + Math.PI)];
  }

  restart() {
    this.score = 0;
    this.lives = 3;
    this.over = false;
    this.loadLevel(1);
  }

  loadLevel(level: number) {
    this.level = level;
    this.paddle = 270 * DEG;
    this.paddleHalf = PADDLE_HALF;
    this.magnetTime = 0;
    this.bricks = [];
    // init(): 4, 8, 16, 32 bricks per ring, 25 px apart, 1° gap at each end.
    let index = 0;
    for (let ring = 0; ring < RINGS; ring++) {
      const count = 4 * 2 ** ring;
      const step = 360 / count;
      const r0 = 30 * PX + ring * (THICKNESS + GAP);
      for (let j = 0; j < count; j++) {
        const start = Math.floor(180 / count) + j * step + 1;
        this.bricks.push({
          id: index,
          kind: "regular",
          r0,
          r1: r0 + THICKNESS,
          a0: wrap(start * DEG),
          len: (step - 2) * DEG,
          ring,
          index: j,
          alive: true,
        });
        index++;
      }
    }
    // The specials, assigned in the original's order, so later kinds win: index 0 ends
    // up a shrink brick.
    for (let i = 0; i < 5; i++) {
      (this.bricks[i * 11] as Brick).kind = "magnet";
      (this.bricks[i * 9] as Brick).kind = "enlarge";
      (this.bricks[i * 5] as Brick).kind = "shrink";
    }
    this.serve();
    this.events.push({ type: "level", level });
  }

  /** The ball waits where init() put it: low in the window, aimed up and right at 50°. */
  private serve() {
    this.serving = true;
    this.stuck = null;
    this.ball = { x: 0, y: (55 - 350) * PX, vx: 0, vy: 0 };
  }

  /** Serve, release a magnetized ball toward the center, or restart after game over. */
  launch() {
    if (this.over) {
      this.restart();
      return;
    }
    if (this.serving) {
      this.serving = false;
      this.ball.vx = Math.cos(50 * DEG) * this.speed;
      this.ball.vy = Math.sin(50 * DEG) * this.speed;
    } else if (this.stuck !== null) {
      const a = Math.atan2(this.ball.y, this.ball.x) + Math.PI;
      this.ball.vx = Math.cos(a) * this.speed;
      this.ball.vy = Math.sin(a) * this.speed;
      this.stuck = null;
    }
  }

  /** Steer by pointer: paddle 0 follows the pointer's angle. */
  aim(angle: number | null) {
    this.targetPaddle = angle;
  }

  step(dt: number, keys: number) {
    if (this.over) return;
    let move = keys * PADDLE_SPEED * dt;
    if (!keys && this.targetPaddle !== null) {
      const d = angleDiff(this.paddle, this.targetPaddle);
      move = Math.sign(d) * Math.min(Math.abs(d), PADDLE_SPEED * dt);
    }
    this.paddle = wrap(this.paddle + move);
    this.magnetTime = Math.max(0, this.magnetTime - dt);

    const ball = this.ball;
    if (this.serving) return;
    if (this.stuck !== null) {
      // The magnet holds the ball against the inner face of the paddle it hit.
      const a = this.paddle + this.stuck;
      ball.x = Math.cos(a) * (RIM_R0 - BALL_R);
      ball.y = Math.sin(a) * (RIM_R0 - BALL_R);
      return;
    }
    // Substeps keep each move under half a ball radius, so nothing tunnels.
    const n = Math.ceil((this.speed * dt) / (BALL_R * 0.5));
    for (let i = 0; i < n && this.stuck === null; i++) this.move(dt / n);

    if (Math.hypot(ball.x, ball.y) > 1.15) {
      this.lives--;
      this.events.push({ type: "lost" });
      if (this.lives <= 0) {
        this.over = true;
        this.events.push({ type: "over" });
      } else this.serve();
    }
    if (!this.bricks.some((b) => b.alive)) {
      this.score += 500 * this.level;
      this.loadLevel(this.level + 1);
    }
  }

  private move(dt: number) {
    const ball = this.ball;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    for (const brick of this.bricks) {
      if (!brick.alive) continue;
      const nrm = sectorContact(ball, brick.r0, brick.r1, brick.a0, brick.len);
      if (!nrm) continue;
      reflect(ball, nrm);
      this.hit(brick);
      return;
    }
    // Paddles first, then the walls, as in timer().
    for (const center of this.paddles) {
      const a0 = center - this.paddleHalf;
      const nrm = sectorContact(ball, RIM_R0, RIM_R1, a0, this.paddleHalf * 2);
      if (!nrm) continue;
      if (ball.x * nrm[0] + ball.y * nrm[1] > 0) continue; // only the inner face
      const angle = Math.atan2(ball.y, ball.x);
      if (this.magnetTime > 0) {
        this.stuck = angleDiff(this.paddle, angle);
        ball.vx = 0;
        ball.vy = 0;
        return;
      }
      this.paddleBounce(center, angle);
      this.events.push({ type: "bounce" });
      return;
    }
    for (const w of WALLS) {
      const nrm = sectorContact(ball, RIM_R0, RIM_R1, w.a0, w.len);
      if (!nrm) continue;
      reflect(ball, nrm);
      this.events.push({ type: "bounce" });
      return;
    }
  }

  /**
   * Paddle::ChageBallDir: the mirror reflection, averaged (weight 1.5 to 1) with a vector
   * that leans toward whichever end of the paddle the ball hit, from straight inward at
   * the center to past the paddle's end at its tips.
   */
  private paddleBounce(center: number, angle: number) {
    const ball = this.ball;
    const s = Math.hypot(ball.vx, ball.vy);
    const rx = Math.cos(angle);
    const ry = Math.sin(angle);
    const dot = ball.vx * rx + ball.vy * ry;
    const mx = (ball.vx - 2 * dot * rx) / s;
    const my = (ball.vy - 2 * dot * ry) / s;
    const offset = Math.max(-1, Math.min(1, angleDiff(center, angle) / this.paddleHalf));
    const lean = angle + Math.PI - offset * (Math.PI / 2 + this.paddleHalf);
    let vx = Math.cos(lean) + 1.5 * mx;
    let vy = Math.sin(lean) + 1.5 * my;
    // Never send it back out through the paddle.
    const inward = vx * rx + vy * ry;
    if (inward > -0.2) {
      vx -= (inward + 0.2) * rx;
      vy -= (inward + 0.2) * ry;
    }
    const len = Math.hypot(vx, vy);
    ball.vx = (vx / len) * s;
    ball.vy = (vy / len) * s;
  }

  private hit(brick: Brick) {
    brick.alive = false;
    this.score += 10 * this.level * (RINGS - brick.ring);
    this.events.push({ type: "break", brick });
    // manageHit()
    if (brick.kind === "magnet") this.magnetTime = MAGNET_TIME;
    else if (brick.kind === "enlarge")
      this.paddleHalf = Math.min(MAX_HALF, this.paddleHalf + 3 * DEG);
    else if (brick.kind === "shrink")
      this.paddleHalf = Math.max(MIN_HALF, this.paddleHalf - 2 * DEG);
  }

  get magnetFraction() {
    return this.magnetTime / MAGNET_TIME;
  }
}

/**
 * Contact normal between the ball and an annular sector, or null if they don't touch.
 * Finds the closest point of the sector to the ball center in polar coordinates
 * (clamp the angle to the sector, then the radius to the ring).
 */
function sectorContact(
  ball: Ball,
  r0: number,
  r1: number,
  a0: number,
  len: number,
): [number, number] | null {
  const r = Math.hypot(ball.x, ball.y);
  const th = Math.atan2(ball.y, ball.x);
  const d = wrap(th - a0);
  let t = th;
  if (d > len) t = d - len < TAU - d ? a0 + len : a0;
  if (d <= len && r >= r0 && r <= r1) {
    // Center inside the sector: push out through the nearer ring edge.
    const out = r - r0 < r1 - r ? -1 : 1;
    return [Math.cos(th) * out, Math.sin(th) * out];
  }
  const rc = Math.min(r1, Math.max(r0, r));
  const dx = ball.x - Math.cos(t) * rc;
  const dy = ball.y - Math.sin(t) * rc;
  const dist = Math.hypot(dx, dy);
  if (dist >= BALL_R || dist === 0) return null;
  return [dx / dist, dy / dist];
}

/** Mirror the velocity about the contact normal, if the ball is moving into the surface. */
function reflect(ball: Ball, [nx, ny]: [number, number]) {
  const dot = ball.vx * nx + ball.vy * ny;
  if (dot >= 0) return;
  ball.vx -= 2 * dot * nx;
  ball.vy -= 2 * dot * ny;
}
