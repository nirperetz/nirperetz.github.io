// The island's height field. The 2013 version ran this on the GPU: a geometry shader
// split each quad into four (edge midpoints and center, each pushed up or down by a
// random amount), streamed the result back with transform feedback, and repeated nine
// times with the random amount halved each pass. The same subdivision on a grid, on the
// CPU, once at load: it is the same surface, and it takes a few milliseconds.

export const SIZE = 30; // world units, centered on the origin
const STEPS = 8; // 2^8 + 1 = 257 vertices per side

/** Deterministic noise in [-1, 1] per grid point, so shared edges get the same push. */
function hash(x: number, z: number, seed: number) {
  let h = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ Math.imul(seed, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (((h ^ (h >>> 16)) >>> 0) / 4294967295) * 2 - 1;
}

export interface Terrain {
  n: number;
  heights: Float32Array;
}

export function generate(seed: number, roughness = 3.2): Terrain {
  const n = (1 << STEPS) + 1;
  const h = new Float32Array(n * n);
  const at = (x: number, z: number) => z * n + x;
  h.fill(-1); // the corners start at -1, as in init_terrain
  let scale = 0.5 * roughness;
  for (let step = n - 1; step > 1; step >>= 1, scale *= 0.5) {
    const half = step >> 1;
    for (let z = 0; z < n - 1; z += step) {
      for (let x = 0; x < n - 1; x += step) {
        const a = h[at(x, z)] as number;
        const b = h[at(x + step, z)] as number;
        const c = h[at(x + step, z + step)] as number;
        const d = h[at(x, z + step)] as number;
        const push = (px: number, pz: number, base: number) => {
          h[at(px, pz)] = base + hash(px, pz, seed) * scale;
        };
        push(x + half, z, (a + b) / 2);
        push(x + step, z + half, (b + c) / 2);
        push(x + half, z + step, (c + d) / 2);
        push(x, z + half, (d + a) / 2);
        push(x + half, z + half, (a + b + c + d) / 4);
      }
    }
  }
  // xform_vp's dome: lift the middle by up to 3 so the noise becomes an island, and pull
  // the rim under the sea. The original pinned the rim at exactly 0; a sloped shelf
  // reads better now that the sea runs to the horizon.
  const r2max = (SIZE / 2) ** 2;
  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      const wx = (x / (n - 1) - 0.5) * SIZE;
      const wz = (z / (n - 1) - 0.5) * SIZE;
      const r2 = (wx * wx + wz * wz) / r2max;
      const i = at(x, z);
      const shelf = Math.min(1, Math.max(0, (Math.sqrt(r2) - 0.75) / 0.25));
      h[i] = ((h[i] as number) + 3 * (1 - r2)) * (1 - shelf) + -2.5 * shelf;
    }
  }
  return { n, heights: h };
}

/** Bilinear height lookup in world coordinates, for keeping the camera above ground. */
export function heightAt(t: Terrain, wx: number, wz: number) {
  const fx = (wx / SIZE + 0.5) * (t.n - 1);
  const fz = (wz / SIZE + 0.5) * (t.n - 1);
  if (fx < 0 || fz < 0 || fx >= t.n - 1 || fz >= t.n - 1) return -2.5;
  const x = Math.floor(fx);
  const z = Math.floor(fz);
  const u = fx - x;
  const v = fz - z;
  const g = (i: number, j: number) => t.heights[j * t.n + i] as number;
  return (
    (g(x, z) * (1 - u) + g(x + 1, z) * u) * (1 - v) +
    (g(x, z + 1) * (1 - u) + g(x + 1, z + 1) * u) * v
  );
}
