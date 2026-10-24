// A polygon mesh (faces of any valence), its loaders, and Catmull-Clark subdivision.
// The 2013 exercise used OpenMesh's half-edge structure; a flat face list plus an edge
// map is all this needs, and it keeps subdivision allocation-light at 100k+ faces.

export interface PolyMesh {
  /** xyz per vertex. */
  positions: Float32Array;
  /** Vertex indices, faces concatenated. */
  indices: Uint32Array;
  /** Offset of each face into `indices`, plus a final entry equal to indices.length. */
  faceStart: Uint32Array;
}

export const faceCount = (m: PolyMesh) => m.faceStart.length - 1;
export const vertexCount = (m: PolyMesh) => m.positions.length / 3;

function build(positions: number[], faces: number[][]): PolyMesh {
  const faceStart = new Uint32Array(faces.length + 1);
  let n = 0;
  faces.forEach((f, i) => {
    faceStart[i] = n;
    n += f.length;
  });
  faceStart[faces.length] = n;
  return {
    positions: new Float32Array(positions),
    indices: new Uint32Array(faces.flat()),
    faceStart,
  };
}

/** OFF, as used by the course's model set. Comments and blank lines are skipped. */
export function parseOFF(text: string): PolyMesh {
  const tokens = text
    .split("\n")
    .map((l) => l.replace(/#.*/, "").trim())
    .filter(Boolean)
    .join(" ")
    .split(/\s+/);
  let i = 0;
  if (tokens[0]?.toUpperCase().endsWith("OFF")) i++;
  const nv = Number(tokens[i++]);
  const nf = Number(tokens[i++]);
  i++; // edge count, unused
  const positions: number[] = [];
  for (let v = 0; v < nv * 3; v++) positions.push(Number(tokens[i++]));
  const faces: number[][] = [];
  for (let f = 0; f < nf; f++) {
    const k = Number(tokens[i++]);
    const face: number[] = [];
    for (let j = 0; j < k; j++) face.push(Number(tokens[i++]));
    faces.push(face);
  }
  return build(positions, faces);
}

/** Positions and faces of a Wavefront OBJ; texture coordinates and normals are ignored. */
export function parseOBJ(text: string): PolyMesh {
  const positions: number[] = [];
  const faces: number[][] = [];
  for (const line of text.split("\n")) {
    const parts = line.trim().split(/\s+/);
    if (parts[0] === "v") positions.push(Number(parts[1]), Number(parts[2]), Number(parts[3]));
    else if (parts[0] === "f") {
      const nv = positions.length / 3;
      faces.push(
        parts.slice(1).map((p) => {
          const idx = Number.parseInt(p, 10);
          return idx < 0 ? nv + idx : idx - 1;
        }),
      );
    }
  }
  return build(positions, faces);
}

/**
 * Center on the vertex average and scale the bounding-box diagonal to 2, as the original
 * `mashPosition` did, so every model fits the arcball.
 */
export function normalize(m: PolyMesh): PolyMesh {
  const p = m.positions;
  const n = p.length / 3;
  const c = [0, 0, 0];
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 3; k++) {
      const v = p[i * 3 + k] as number;
      c[k] = (c[k] as number) + v / n;
      lo[k] = Math.min(lo[k] as number, v);
      hi[k] = Math.max(hi[k] as number, v);
    }
  }
  const diag = Math.hypot(...hi.map((h, k) => h - (lo[k] as number))) || 1;
  const s = 2 / diag;
  const out = new Float32Array(p.length);
  for (let i = 0; i < p.length; i++) out[i] = ((p[i] as number) - (c[i % 3] as number)) * s;
  return { ...m, positions: out };
}

/** Undirected edge key. Safe while vertexCount² < 2^53. */
const edgeKey = (a: number, b: number, nv: number) => (a < b ? a * nv + b : b * nv + a);

export interface Subdivided {
  mesh: PolyMesh;
  /**
   * Where each new vertex sits on the old surface: face points on the face centroid,
   * edge points on the edge midpoint, vertex points on the old vertex. Morphing from
   * these to the final positions is the original's "s" animation.
   */
  from: Float32Array;
}

/**
 * One Catmull-Clark step. New vertices are laid out [face points | edge points | vertex
 * points]; every k-gon becomes k quads.
 */
export function catmullClark(m: PolyMesh): Subdivided {
  const P = m.positions;
  const nv = vertexCount(m);
  const nf = faceCount(m);
  const { indices: I, faceStart: FS } = m;

  // Edges: index per undirected edge, its endpoints and up to two adjacent faces.
  const edgeOf = new Map<number, number>();
  const ev: number[] = [];
  const ef: number[] = [];
  for (let f = 0; f < nf; f++) {
    const s = FS[f] as number;
    const e = FS[f + 1] as number;
    for (let j = s; j < e; j++) {
      const a = I[j] as number;
      const b = I[j + 1 < e ? j + 1 : s] as number;
      const key = edgeKey(a, b, nv);
      const idx = edgeOf.get(key);
      if (idx === undefined) {
        edgeOf.set(key, ev.length / 2);
        ev.push(a, b);
        ef.push(f, -1);
      } else ef[idx * 2 + 1] = f;
    }
  }
  const ne = ev.length / 2;
  const total = nf + ne + nv;
  const out = new Float32Array(total * 3);
  const from = new Float32Array(total * 3);

  // Face points: centroids.
  for (let f = 0; f < nf; f++) {
    const s = FS[f] as number;
    const e = FS[f + 1] as number;
    for (let k = 0; k < 3; k++) {
      let sum = 0;
      for (let j = s; j < e; j++) sum += P[(I[j] as number) * 3 + k] as number;
      out[f * 3 + k] = sum / (e - s);
    }
  }
  from.set(out.subarray(0, nf * 3));

  // Edge points: average of the endpoints and the two face points; midpoints on borders.
  // Also accumulate, per vertex, edge midpoints, face points, valence and border flags.
  const midSum = new Float64Array(nv * 3);
  const valence = new Uint32Array(nv);
  const border = new Uint8Array(nv);
  const borderNb = new Float64Array(nv * 3);
  for (let e = 0; e < ne; e++) {
    const a = ev[e * 2] as number;
    const b = ev[e * 2 + 1] as number;
    const f0 = ef[e * 2] as number;
    const f1 = ef[e * 2 + 1] as number;
    const o = (nf + e) * 3;
    for (let k = 0; k < 3; k++) {
      const mid = ((P[a * 3 + k] as number) + (P[b * 3 + k] as number)) / 2;
      from[o + k] = mid;
      out[o + k] =
        f1 < 0 ? mid : (mid * 2 + (out[f0 * 3 + k] as number) + (out[f1 * 3 + k] as number)) / 4;
      midSum[a * 3 + k] = (midSum[a * 3 + k] as number) + mid;
      midSum[b * 3 + k] = (midSum[b * 3 + k] as number) + mid;
    }
    valence[a] = (valence[a] as number) + 1;
    valence[b] = (valence[b] as number) + 1;
    if (f1 < 0) {
      border[a] = 1;
      border[b] = 1;
      for (let k = 0; k < 3; k++) {
        borderNb[a * 3 + k] = (borderNb[a * 3 + k] as number) + (P[b * 3 + k] as number);
        borderNb[b * 3 + k] = (borderNb[b * 3 + k] as number) + (P[a * 3 + k] as number);
      }
    }
  }
  const faceSum = new Float64Array(nv * 3);
  const faceN = new Uint32Array(nv);
  for (let f = 0; f < nf; f++) {
    for (let j = FS[f] as number; j < (FS[f + 1] as number); j++) {
      const v = I[j] as number;
      faceN[v] = (faceN[v] as number) + 1;
      for (let k = 0; k < 3; k++)
        faceSum[v * 3 + k] = (faceSum[v * 3 + k] as number) + (out[f * 3 + k] as number);
    }
  }

  // Vertex points: (F + 2R + (n-3)P) / n inside; the cubic B-spline rule (6P + a + b) / 8
  // on borders, so open meshes like the hemisphere keep a clean rim.
  for (let v = 0; v < nv; v++) {
    const o = (nf + ne + v) * 3;
    const n = valence[v] as number;
    for (let k = 0; k < 3; k++) {
      const p = P[v * 3 + k] as number;
      from[o + k] = p;
      if (border[v]) out[o + k] = (6 * p + (borderNb[v * 3 + k] as number)) / 8;
      else if (n < 3) out[o + k] = p;
      else {
        const F = (faceSum[v * 3 + k] as number) / (faceN[v] as number);
        const R = (midSum[v * 3 + k] as number) / n;
        out[o + k] = (F + 2 * R + (n - 3) * p) / n;
      }
    }
  }

  // Faces: corner j of face f becomes the quad (vertex, next edge, face, previous edge),
  // which keeps the original winding.
  const quads = new Uint32Array(I.length * 4);
  const faceStart = new Uint32Array(I.length + 1);
  let q = 0;
  for (let f = 0; f < nf; f++) {
    const s = FS[f] as number;
    const e = FS[f + 1] as number;
    for (let j = s; j < e; j++) {
      const v = I[j] as number;
      const next = I[j + 1 < e ? j + 1 : s] as number;
      const prev = I[j > s ? j - 1 : e - 1] as number;
      faceStart[q / 4] = q;
      quads[q++] = nf + ne + v;
      quads[q++] = nf + (edgeOf.get(edgeKey(v, next, nv)) as number);
      quads[q++] = f;
      quads[q++] = nf + (edgeOf.get(edgeKey(prev, v, nv)) as number);
    }
  }
  faceStart[I.length] = q;
  return { mesh: { positions: out, indices: quads, faceStart }, from };
}
