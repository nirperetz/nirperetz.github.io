import { describe, expect, it } from "vitest";
import { catmullClark, faceCount, parseOFF, vertexCount } from "./polymesh.ts";

const quadCube = parseOFF(`OFF
8 6 0
-1 -1 1  1 -1 1  1 1 1  -1 1 1  -1 -1 -1  1 -1 -1  1 1 -1  -1 1 -1
4 0 1 2 3  4 1 5 6 2  4 5 4 7 6  4 4 0 3 7  4 3 2 6 7  4 4 5 1 0
`);

const radii = (p: Float32Array) =>
  Array.from({ length: p.length / 3 }, (_, i) =>
    Math.hypot(p[i * 3] ?? 0, p[i * 3 + 1] ?? 0, p[i * 3 + 2] ?? 0),
  );

describe("catmullClark", () => {
  it("keeps a closed surface closed (V - E + F = 2) and makes only quads", () => {
    let m = quadCube;
    for (let level = 1; level <= 3; level++) {
      m = catmullClark(m).mesh;
      const f = faceCount(m);
      expect(f).toBe(6 * 4 ** level);
      expect(m.indices.length).toBe(f * 4);
      // Every face contributes 4 half-edges, each edge has 2: E = 2F.
      expect(vertexCount(m) - 2 * f + f).toBe(2);
    }
  });

  it("matches the known first-step positions on a cube", () => {
    const { mesh } = catmullClark(quadCube);
    const r = radii(mesh.positions);
    // Face points stay at the face centers, edge points move to (3/4)·√2 from the
    // center, corners to 5/9 of the way along the diagonal: r = √3 · 5/9.
    expect(r.slice(0, 6).every((x) => Math.abs(x - 1) < 1e-6)).toBe(true);
    expect(r.slice(6, 18).every((x) => Math.abs(x - 0.75 * Math.SQRT2) < 1e-6)).toBe(true);
    expect(r.slice(18).every((x) => Math.abs(x - (Math.sqrt(3) * 5) / 9) < 1e-6)).toBe(true);
  });

  it("starts the morph on the old surface", () => {
    const { from } = catmullClark(quadCube);
    const r = radii(from);
    expect(r.slice(6, 18).every((x) => Math.abs(x - Math.SQRT2) < 1e-6)).toBe(true); // midpoints
    expect(r.slice(18).every((x) => Math.abs(x - Math.sqrt(3)) < 1e-6)).toBe(true); // corners
  });
});
