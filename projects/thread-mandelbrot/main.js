// SharedArrayBuffer only exists when the page is cross-origin isolated (COOP + COEP headers).
// The lab host sends those because lab.json says "crossOriginIsolated": true.

const canvas = document.getElementById("view");
const stats = document.getElementById("stats");

if (!crossOriginIsolated) {
  stats.className = "warn";
  stats.textContent = "not cross-origin isolated: SharedArrayBuffer is unavailable";
  throw new Error("needs crossOriginIsolated");
}

const THREADS = Math.max(2, Math.min(navigator.hardwareConcurrency || 4, 16));
const ctx = canvas.getContext("2d");
const control = new SharedArrayBuffer(8); // [nextRow, generation]
const counter = new Int32Array(control);
const workers = Array.from({ length: THREADS }, () => new Worker("worker.js"));

let width = 0;
let height = 0;
let pixels;
const view = { cx: -0.6, cy: 0, scale: 0 };

function allocate() {
  const dpr = Math.min(devicePixelRatio, 2);
  width = Math.floor(innerWidth * dpr);
  height = Math.floor(innerHeight * dpr);
  canvas.width = width;
  canvas.height = height;
  pixels = new SharedArrayBuffer(width * height * 4);
  for (const w of workers) w.postMessage({ type: "init", pixels, control });
  if (!view.scale) view.scale = 3.2 / width;
}

function render() {
  const generation = Atomics.add(counter, 1, 1) + 1;
  Atomics.store(counter, 0, 0);
  const maxIter = Math.min(4000, Math.round(120 + 60 * Math.log2(3.2 / width / view.scale + 1)));
  const started = performance.now();
  let pending = THREADS;
  for (const w of workers) {
    w.onmessage = ({ data }) => {
      if (data.generation !== generation || --pending > 0) return;
      // Copy out of shared memory once, at the end; canvas can't read a shared buffer directly.
      const image = new ImageData(
        new Uint8ClampedArray(new Uint8Array(pixels).slice()),
        width,
        height,
      );
      ctx.putImageData(image, 0, 0);
      const ms = Math.round(performance.now() - started);
      stats.textContent = `${THREADS} threads · ${width}×${height} · ${maxIter} iterations · ${ms} ms`;
    };
    w.postMessage({ width, height, ...view, maxIter, generation });
  }
}

canvas.addEventListener("click", (e) => {
  const dpr = width / innerWidth;
  view.cx += (e.clientX * dpr - width / 2) * view.scale;
  view.cy += (e.clientY * dpr - height / 2) * view.scale;
  view.scale *= e.shiftKey ? 2.5 : 0.4;
  render();
});

let resizeTimer;
addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    allocate();
    render();
  }, 150);
});

allocate();
render();
