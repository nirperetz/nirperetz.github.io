// Pure game state and rules. No DOM here, so the simulation is deterministic per seed.

export const RING = 0.32; // orbit radius, in units of the shorter screen side
const SHIP_R = 0.018;
const ROCK_R = 0.022;
const SPARK_R = 0.016;
const ORBIT_SPEED = 2.4; // radians per second

export interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface Game {
  phase: "ready" | "playing" | "over";
  time: number;
  score: number;
  angle: number;
  dir: 1 | -1;
  rocks: Body[];
  sparks: Body[];
  spawnIn: number;
  sparkIn: number;
  rand: () => number;
}

export function newGame(seed = Date.now()): Game {
  return {
    phase: "ready",
    time: 0,
    score: 0,
    angle: -Math.PI / 2,
    dir: 1,
    rocks: [],
    sparks: [],
    spawnIn: 1,
    sparkIn: 2,
    rand: mulberry32(seed),
  };
}

/** The one button: start, flip orbit direction, or restart. */
export function press(g: Game): Game {
  if (g.phase === "ready") return { ...g, phase: "playing" };
  if (g.phase === "over") return { ...newGame(), phase: "playing" };
  g.dir = g.dir === 1 ? -1 : 1;
  return g;
}

export function shipPosition(g: Game): { x: number; y: number } {
  return { x: Math.cos(g.angle) * RING, y: Math.sin(g.angle) * RING };
}

/** Advance the simulation by a fixed step. Mutates for speed; returns the same game. */
export function step(g: Game, dt: number): Game {
  if (g.phase !== "playing") return g;
  g.time += dt;
  g.angle += g.dir * ORBIT_SPEED * dt;

  // Difficulty ramps with time: rocks come faster and more often.
  const pace = 1 + g.time / 30;
  g.spawnIn -= dt;
  if (g.spawnIn <= 0) {
    g.rocks.push(spawnFromEdge(g.rand, 0.35 * pace));
    g.spawnIn = Math.max(0.25, 1.1 / pace) * (0.6 + g.rand() * 0.8);
  }
  g.sparkIn -= dt;
  if (g.sparkIn <= 0) {
    const a = g.rand() * Math.PI * 2;
    g.sparks.push({ x: Math.cos(a) * RING, y: Math.sin(a) * RING, vx: 0, vy: 0 });
    g.sparkIn = 2 + g.rand() * 2;
  }

  for (const r of g.rocks) {
    r.x += r.vx * dt;
    r.y += r.vy * dt;
  }
  g.rocks = g.rocks.filter((r) => Math.hypot(r.x, r.y) < 1.2);

  const ship = shipPosition(g);
  if (g.rocks.some((r) => Math.hypot(r.x - ship.x, r.y - ship.y) < SHIP_R + ROCK_R)) {
    g.phase = "over";
    return g;
  }
  const before = g.sparks.length;
  g.sparks = g.sparks.filter((s) => Math.hypot(s.x - ship.x, s.y - ship.y) > SHIP_R + SPARK_R);
  g.score += (before - g.sparks.length) * 10 + dt * 1;
  return g;
}

/** A rock enters from a random edge, aimed near (not exactly at) the center. */
function spawnFromEdge(rand: () => number, speed: number): Body {
  const a = rand() * Math.PI * 2;
  const x = Math.cos(a) * 1.1;
  const y = Math.sin(a) * 1.1;
  const aim = (rand() - 0.5) * 0.5;
  const tx = Math.cos(a + Math.PI + aim) * 0.05;
  const ty = Math.sin(a + Math.PI + aim) * 0.05;
  const len = Math.hypot(tx - x, ty - y);
  return { x, y, vx: ((tx - x) / len) * speed, vy: ((ty - y) / len) * speed };
}

export const sizes = { SHIP_R, ROCK_R, SPARK_R };

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
