// A single-page app with real paths. The lab host serves index.html for unknown paths
// (spa: true) and injects <base href="/lab/palette-router/">, so document.baseURI is the
// app root wherever the visitor lands, including preview URLs.

const root = new URL(document.baseURI).pathname; // e.g. /lab/palette-router/
const app = document.getElementById("app");

const SEEDS = ["ff5e3a", "ffb627", "2ec4b6", "3a86ff", "8338ec", "ff006e", "06d6a0", "1b263b"];

const routes = [
  { match: /^$/, view: home },
  { match: /^p\/([0-9a-f]{6})$/, view: palette },
];

function render() {
  const rel = decodeURIComponent(location.pathname.slice(root.length)).replace(/\/$/, "");
  for (const r of routes) {
    const m = r.match.exec(rel);
    if (m) return r.view(...m.slice(1));
  }
  notFound(rel);
}

function home() {
  document.title = "Palette Router";
  app.innerHTML = `
    <p>Each swatch has its own URL. Open one, then reload or share the link.</p>
    <div class="grid">
      ${SEEDS.map((hex) => `<a class="swatch" data-link href="p/${hex}" style="${swatchStyle(hex)}">#${hex}</a>`).join("")}
    </div>`;
}

function palette(hex) {
  document.title = `#${hex} · Palette Router`;
  const [h, s, l] = toHsl(hex);
  const shades = Array.from({ length: 9 }, (_, i) => fromHsl(h, s, 0.1 + i * 0.1));
  app.innerHTML = `
    <section class="detail">
      <div class="hero" style="${swatchStyle(hex)}">#${hex}</div>
      <div class="shades">
        ${shades.map((x) => `<a data-link href="p/${x}" title="#${x}" style="background:#${x}"></a>`).join("")}
      </div>
      <p>hsl(${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%) · this page's path:
        <code>${location.pathname}</code></p>
      <p><a data-link href="./">All swatches</a></p>
    </section>`;
}

function notFound(rel) {
  app.innerHTML = `<p>No route for <code>/${rel}</code>. <a data-link href="./">Home</a></p>`;
}

// Intercept in-app links so navigation never reloads the page.
document.addEventListener("click", (e) => {
  const a = e.target.closest("a[data-link]");
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
  e.preventDefault();
  history.pushState(null, "", a.href);
  render();
  scrollTo(0, 0);
});
addEventListener("popstate", render);
render();

function swatchStyle(hex) {
  const [, , l] = toHsl(hex);
  return `background:#${hex};color:${l > 0.6 ? "#111" : "#fff"}`;
}

function toHsl(hex) {
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

function fromHsl(h, s, l) {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0), f(8), f(4)]
    .map((v) =>
      Math.round(v * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("");
}
