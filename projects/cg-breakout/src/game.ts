// Polar Breakout: bricks are annular sectors around the center, the paddle is an arc
// on the outer rim. All geometry lives in polar coordinates on the unit disc.
// This module is pure game state and physics; main.ts draws it.

const TAU = Math.PI * 2;

/** The 2012 exercise's brick kinds (`hit` enum in Brick.h), now all implemented. */
export type Kind = "regular" | "slow" | "triple" | "magnet" | "passive";

export interface Brick {
  id: number;
  kind: Kind;
  r0: number;
  r1: number;
  /** Start angle and angular length, in radians. The start moves when the ring spins. */
  a0: number;
  len: number;
  ring: number;
  alive: boolean;
}

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Held on the paddle (serve or magnet), at this angle offset from the paddle center. */
  held: number | null;
}

export type Event =
  | { type: "break"; brick: Brick }
  | { type: "bounce" }
  | { type: "lost" }
  | { type: "level"; level: number }
  | { type: "over" };

export const BALL_R = 0.017;
export const PADDLE_R0 = 0.9;
export const PADDLE_R1 = 0.935;
const PADDLE_HALF = 0.2;
const PADDLE_SPEED = 6.5; // rad/s
const BASE_SPEED = 0.85; // units/s
const SLOW_FACTOR = 0.55;
const EFFECT_TIME = 9; // seconds for slow and magnet
const MAX_DEFLECT = (65 * Math.PI) / 180;
const RING_R = 0.2;
const RING_W = 0.055;
const RING_GAP = 0.018;
const BRICK_GAP = 0.012; // rad

const wrap = (a: number) => ((a % TAU) + TAU) % TAU;
/** Signed shortest angle from a to b, in (-π, π]. */
const angleDiff = (a: number, b: number) => wrap(b - a + Math.PI) - Math.PI;

export class Game {
  bricks: Brick[] = [];
  balls: Ball[] = [];
  /** Angular speed of each ring, rad/s. */
  ringSpin: number[] = [];
  paddle = Math.PI * 1.5; // straight down, as in the original (260°–280°)
  targetPaddle = this.paddle;
  level = 1;
  score = 0;
  lives = 3;
  slowTime = 0;
  magnetTime = 0;
  over = false;
  events: Event[] = [];

  constructor() {
    this.loadLevel(1);
  }

  get paddleHalf() {
    return PADDLE_HALF;
  }

  get speed() {
    return BASE_SPEED * (1 + 0.08 * (this.level - 1)) * (this.slowTime > 0 ? SLOW_FACTOR : 1);
  }

  restart() {
    this.score = 0;
    this.lives = 3;
    this.over = false;
    this.loadLevel(1);
  }

  loadLevel(level: number) {
    this.level = level;
    this.slowTime = 0;
    this.magnetTime = 0;
    this.bricks = [];
    this.ringSpin = [];
    // Level 1 has three still rings; each level adds a ring (up to six) and spins them
    // in alternating directions, faster as you go.
    const rings = Math.min(2 + level, 6);
    let id = 0;
    for (let ring = 0; ring < rings; ring++) {
      const r0 = RING_R + ring * (RING_W + RING_GAP);
      // Equal arc length per brick, so outer rings get more bricks (the original doubled
      // the count per ring: 4, 8, 16, 32).
      const count = Math.max(6, Math.round((TAU * r0) / 0.19));
      const len = TAU / count;
      const offset = (ring % 2) * len * 0.5;
      for (let i = 0; i < count; i++) {
        this.bricks.push({
          id: id++,
          kind: pickKind(level, ring, i, rings),
          r0,
          r1: r0 + RING_W,
          a0: offset + i * len + BRICK_GAP / 2,
          len: len - BRICK_GAP,
          ring,
          alive: true,
        });
      }
      const spin = level === 1 ? 0 : (0.12 + 0.05 * level) * (ring % 2 ? -1 : 1) * (1 - ring * 0.1);
      this.ringSpin.push(spin);
    }
    this.balls = [this.servedBall()];
    this.events.push({ type: "level", level });
  }

  private servedBall(): Ball {
    return { x: 0, y: 0, vx: 0, vy: 0, held: 0 };
  }

  /** Release every held ball inward. */
  launch() {
    if (this.over) {
      this.restart();
      return;
    }
    for (const b of this.balls) {
      if (b.held === null) continue;
      const a = this.paddle + b.held;
      // Aim inward with a little of the hold offset as spin, like a paddle hit.
      const dir = a + Math.PI - (b.held / PADDLE_HALF) * MAX_DEFLECT * 0.5;
      b.vx = Math.cos(dir) * this.speed;
      b.vy = Math.sin(dir) * this.speed;
      b.held = null;
    }
  }

  /** Steer the paddle toward an absolute angle (pointer). */
  aim(angle: number) {
    this.targetPaddle = angle;
  }

  /** Steer the paddle by keyboard: -1, 0 or 1. */
  nudge(dir: number, dt: number) {
    if (dir) this.targetPaddle = this.paddle + dir * PADDLE_SPEED * dt;
  }

  step(dt: number) {
    if (this.over) return;
    const d = angleDiff(this.paddle, this.targetPaddle);
    this.paddle = wrap(this.paddle + Math.sign(d) * Math.min(Math.abs(d), PADDLE_SPEED * dt));
    this.slowTime = Math.max(0, this.slowTime - dt);
    this.magnetTime = Math.max(0, this.magnetTime - dt);
    for (const b of this.bricks) {
      const spin = this.ringSpin[b.ring] ?? 0;
      b.a0 = wrap(b.a0 + spin * dt);
    }

    // Keep every free ball at the current speed (slow-ball changes it mid-flight).
    const speed = this.speed;
    for (const ball of this.balls) {
      if (ball.held !== null) {
        const a = this.paddle + ball.held;
        const r = PADDLE_R0 - BALL_R - 0.004;
        ball.x = Math.cos(a) * r;
        ball.y = Math.sin(a) * r;
        continue;
      }
      const v = Math.hypot(ball.vx, ball.vy) || 1;
      ball.vx *= speed / v;
      ball.vy *= speed / v;
      // Substeps keep each move under half a ball radius, so nothing tunnels.
      const n = Math.ceil((speed * dt) / (BALL_R * 0.5));
      for (let i = 0; i < n && ball.held === null; i++) this.move(ball, dt / n);
    }

    const before = this.balls.length;
    this.balls = this.balls.filter((b) => Math.hypot(b.x, b.y) < 1.05);
    if (this.balls.length < before && this.balls.length === 0) {
      this.lives--;
      this.events.push({ type: "lost" });
      if (this.lives <= 0) {
        this.over = true;
        this.events.push({ type: "over" });
      } else {
        this.slowTime = 0;
        this.magnetTime = 0;
        this.balls = [this.servedBall()];
      }
    }
    if (!this.bricks.some((b) => b.alive && b.kind !== "passive")) {
      this.score += 500 * this.level;
      this.loadLevel(this.level + 1);
    }
  }

  private move(ball: Ball, dt: number) {
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    for (const brick of this.bricks) {
      if (!brick.alive) continue;
      const n = sectorContact(ball, brick.r0, brick.r1, brick.a0, brick.len);
      if (!n) continue;
      reflect(ball, n);
      if (brick.kind !== "passive") this.hit(brick);
      this.events.push({ type: "bounce" });
      return;
    }
    // Paddle: only an outward-moving ball can hit it, and the bounce angle depends on
    // where it lands on the arc rather than on a mirror reflection.
    const outward = ball.x * ball.vx + ball.y * ball.vy > 0;
    if (!outward) return;
    const a0 = this.paddle - PADDLE_HALF;
    if (!sectorContact(ball, PADDLE_R0, PADDLE_R1, a0, PADDLE_HALF * 2)) return;
    const offset = Math.max(
      -1,
      Math.min(1, angleDiff(this.paddle, Math.atan2(ball.y, ball.x)) / PADDLE_HALF),
    );
    if (this.magnetTime > 0) {
      ball.held = offset * PADDLE_HALF;
      return;
    }
    const dir = Math.atan2(ball.y, ball.x) + Math.PI - offset * MAX_DEFLECT;
    const s = Math.hypot(ball.vx, ball.vy);
    ball.vx = Math.cos(dir) * s;
    ball.vy = Math.sin(dir) * s;
    this.events.push({ type: "bounce" });
  }

  private hit(brick: Brick) {
    brick.alive = false;
    this.score += 10 * this.level * (brick.ring + 1);
    this.events.push({ type: "break", brick });
    switch (brick.kind) {
      case "slow":
        this.slowTime = EFFECT_TIME;
        break;
      case "magnet":
        this.magnetTime = EFFECT_TIME;
        break;
      case "triple": {
        // Two extra balls fan out ±25° from the first free ball.
        const src = this.balls.find((b) => b.held === null);
        if (!src) break;
        for (const turn of [-0.44, 0.44]) {
          const c = Math.cos(turn);
          const s = Math.sin(turn);
          this.balls.push({
            x: src.x,
            y: src.y,
            vx: src.vx * c - src.vy * s,
            vy: src.vx * s + src.vy * c,
            held: null,
          });
        }
        break;
      }
    }
  }
}

function pickKind(level: number, ring: number, i: number, rings: number): Kind {
  // Deterministic layout: power-ups at fixed positions, unbreakable bricks from level 3
  // on the outermost ring.
  if (level >= 3 && ring === rings - 1 && i % 5 === 0) return "passive";
  const h = (i * 7 + ring * 13 + level * 3) % 23;
  if (h === 0) return "triple";
  if (h === 5) return "slow";
  if (h === 11) return "magnet";
  return "regular";
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
  const inside = d <= len && r >= r0 && r <= r1;
  if (inside) {
    // Center inside the brick: push out through the nearer ring edge.
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
