import { BufferAttribute, BufferGeometry } from "three";
import { faceCount, type PolyMesh, vertexCount } from "./polymesh.ts";

/**
 * GPU buffers for one mesh state. Triangles are unindexed so each corner can carry both
 * a face normal (flat) and a vertex normal (smooth); the shader picks one. `from` holds
 * the pre-subdivision positions the vertex shader morphs out of.
 */
export function buildGeometry(mesh: PolyMesh, from?: Float32Array) {
  const P = mesh.positions;
  const { indices: I, faceStart: FS } = mesh;
  const nf = faceCount(mesh);
  const nv = vertexCount(mesh);
  const src = from ?? P;

  // Face normals by Newell's method (exact for planar polygons, robust for warped quads),
  // vertex normals as the normalized sum of adjacent face normals, as OpenMesh did.
  const fn = new Float32Array(nf * 3);
  const vn = new Float32Array(nv * 3);
  let tris = 0;
  for (let f = 0; f < nf; f++) {
    const s = FS[f] as number;
    const e = FS[f + 1] as number;
    tris += e - s - 2;
    let x = 0;
    let y = 0;
    let z = 0;
    for (let j = s; j < e; j++) {
      const a = (I[j] as number) * 3;
      const b = (I[j + 1 < e ? j + 1 : s] as number) * 3;
      const [ax, ay, az] = [P[a] as number, P[a + 1] as number, P[a + 2] as number];
      const [bx, by, bz] = [P[b] as number, P[b + 1] as number, P[b + 2] as number];
      x += (ay - by) * (az + bz);
      y += (az - bz) * (ax + bx);
      z += (ax - bx) * (ay + by);
    }
    const len = Math.hypot(x, y, z) || 1;
    fn.set([x / len, y / len, z / len], f * 3);
    for (let j = s; j < e; j++) {
      const v = (I[j] as number) * 3;
      vn[v] = (vn[v] as number) + x / len;
      vn[v + 1] = (vn[v + 1] as number) + y / len;
      vn[v + 2] = (vn[v + 2] as number) + z / len;
    }
  }
  for (let v = 0; v < nv * 3; v += 3) {
    const len = Math.hypot(vn[v] as number, vn[v + 1] as number, vn[v + 2] as number) || 1;
    vn[v] = (vn[v] as number) / len;
    vn[v + 1] = (vn[v + 1] as number) / len;
    vn[v + 2] = (vn[v + 2] as number) / len;
  }

  // Fan-triangulate each polygon.
  const pos = new Float32Array(tris * 9);
  const prev = new Float32Array(tris * 9);
  const smooth = new Float32Array(tris * 9);
  const flat = new Float32Array(tris * 9);
  let o = 0;
  const put = (v: number, f: number) => {
    for (let k = 0; k < 3; k++) {
      pos[o + k] = P[v * 3 + k] as number;
      prev[o + k] = src[v * 3 + k] as number;
      smooth[o + k] = vn[v * 3 + k] as number;
      flat[o + k] = fn[f * 3 + k] as number;
    }
    o += 3;
  };
  for (let f = 0; f < nf; f++) {
    const s = FS[f] as number;
    const e = FS[f + 1] as number;
    for (let j = s + 1; j < e - 1; j++) {
      put(I[s] as number, f);
      put(I[j] as number, f);
      put(I[j + 1] as number, f);
    }
  }
  const surface = new BufferGeometry();
  surface.setAttribute("position", new BufferAttribute(pos, 3));
  surface.setAttribute("prev", new BufferAttribute(prev, 3));
  surface.setAttribute("normal", new BufferAttribute(smooth, 3));
  surface.setAttribute("flatNormal", new BufferAttribute(flat, 3));
  surface.computeBoundingSphere();

  // Polygon edges, each once: the wireframe shows the real faces, not the triangulation.
  const seen = new Set<number>();
  const lines: number[] = [];
  const linesPrev: number[] = [];
  for (let f = 0; f < nf; f++) {
    const s = FS[f] as number;
    const e = FS[f + 1] as number;
    for (let j = s; j < e; j++) {
      const a = I[j] as number;
      const b = I[j + 1 < e ? j + 1 : s] as number;
      const key = a < b ? a * nv + b : b * nv + a;
      if (seen.has(key)) continue;
      seen.add(key);
      for (const v of [a, b]) {
        for (let k = 0; k < 3; k++) {
          lines.push(P[v * 3 + k] as number);
          linesPrev.push(src[v * 3 + k] as number);
        }
      }
    }
  }
  const wire = new BufferGeometry();
  wire.setAttribute("position", new BufferAttribute(new Float32Array(lines), 3));
  wire.setAttribute("prev", new BufferAttribute(new Float32Array(linesPrev), 3));
  wire.computeBoundingSphere();

  return { surface, wire, triangles: tris, edges: seen.size };
}
