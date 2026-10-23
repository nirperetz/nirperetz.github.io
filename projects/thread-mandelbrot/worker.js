// Each worker claims rows from a shared counter (Atomics) and writes pixels straight
// into the shared image buffer. No pixel data is ever copied between threads.

let pixels; // Uint32Array over the SharedArrayBuffer
let rowCounter; // Int32Array: [nextRow, generation]

self.addEventListener("message", ({ data }) => {
  if (data.type === "init") {
    pixels = new Uint32Array(data.pixels);
    rowCounter = new Int32Array(data.control);
    return;
  }
  const { width, height, cx, cy, scale, maxIter, generation } = data;
  for (;;) {
    if (Atomics.load(rowCounter, 1) !== generation) break; // a newer frame started
    const y = Atomics.add(rowCounter, 0, 1);
    if (y >= height) break;
    const ci = cy + (y - height / 2) * scale;
    for (let x = 0; x < width; x++) {
      const cr = cx + (x - width / 2) * scale;
      let zr = 0,
        zi = 0,
        i = 0;
      while (zr * zr + zi * zi < 16 && i < maxIter) {
        const t = zr * zr - zi * zi + cr;
        zi = 2 * zr * zi + ci;
        zr = t;
        i++;
      }
      pixels[y * width + x] = color(i, maxIter, zr, zi);
    }
  }
  postMessage({ done: true, generation });
});

function color(i, maxIter, zr, zi) {
  if (i >= maxIter) return 0xff000000;
  const smooth = i + 1 - Math.log2(Math.log2(zr * zr + zi * zi) / 2);
  const t = smooth * 0.035;
  const r = 255 * (0.5 + 0.5 * Math.cos(6.283 * (t + 0.0)));
  const g = 255 * (0.5 + 0.5 * Math.cos(6.283 * (t + 0.15)));
  const b = 255 * (0.5 + 0.5 * Math.cos(6.283 * (t + 0.35)));
  return 0xff000000 | (b << 16) | (g << 8) | r; // little-endian RGBA
}
