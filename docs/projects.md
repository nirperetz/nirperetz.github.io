# Adding a project

A project is any folder with a `lab.json`. Once deployed it is served at
`aninir.com/lab/<slug>/`. The platform never reads the project's source, so any
stack works: plain HTML, three.js, Babylon, raw WebGL or WebGPU, a Unity or Godot
web export, Emscripten output, a React app.

## 1. Write lab.json

```json
{
  "$schema": "https://aninir.com/schemas/lab.json",
  "slug": "my-piece",
  "title": "My Piece",
  "visibility": "listed",
  "kind": "3d",
  "description": "One or two sentences for the gallery card.",
  "tags": ["three.js", "glsl"],
  "year": 2026,
  "thumbnail": "thumb.webp",
  "outDir": "dist"
}
```

| Field                         | Default       | Meaning                                                                                                                                              |
| ----------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `slug`                        | required      | URL name, kebab-case, unique.                                                                                                                        |
| `title`                       | required      | Shown in the gallery.                                                                                                                                |
| `visibility`                  | required      | `listed` (in the gallery), `unlisted` (URL only, noindex), `draft` (needs the preview token).                                                        |
| `kind`                        | `interactive` | Free text. Suggested: `3d`, `shader`, `game`, `app`, `interactive`, `archive`. The gallery filters by it.                                            |
| `description`, `tags`, `year` | empty         | Gallery card details.                                                                                                                                |
| `thumbnail`                   | none          | Path inside the output. Without one, the card gets a color swatch.                                                                                   |
| `entry`                       | `index.html`  | The page served at `/lab/<slug>/`.                                                                                                                   |
| `spa`                         | `false`       | Unknown paths without an extension serve `entry`, with a `<base href>` set to the project root. For apps with client-side routing.                   |
| `crossOriginIsolated`         | `false`       | Sends COOP/COEP headers so `SharedArrayBuffer` works. Needed for threaded WASM (Emscripten pthreads, Unity, Godot 4).                                |
| `outDir`                      | `.`           | Folder to upload, relative to lab.json. Build-time only.                                                                                             |
| `exclude`                     | `[]`          | Extra paths to skip: `dir/**`, `*.ext` or an exact path. `node_modules`, dotfiles, `package.json`, lockfiles and `tsconfig.json` are always skipped. |

Editors autocomplete these fields through `$schema`. The schema is generated
from `packages/lab-core/src/manifest.ts` with
`pnpm --filter @aninir/lab-core gen:schema`.

## 2. Build conventions

- **Use relative asset URLs.** In Vite that means `base: "./"`. The same build
  then works at `/lab/<slug>/` and at preview URLs.
- **Link home with `/`.** It is the only absolute URL a project should need.
- **Big shared files** (videos, HDRIs, models used by several projects) can live
  in R2 under `assets/` and are served at `aninir.com/assets/...`.

## 3. Deploy

```bash
pnpm lab validate projects/my-piece
```

```bash
LAB_DEPLOY_TOKEN=… pnpm lab deploy projects/my-piece
```

The deploy prints the live URL and an immutable preview URL,
`/lab/<slug>/_v/<version>/`. Other commands:

```bash
pnpm lab versions my-piece
```

```bash
pnpm lab rollback my-piece
```

To upload a version without making it live, add `--no-live`, check its preview
URL, then point live at it with `pnpm lab rollback my-piece <version>`.

**In this repo**, CI deploys any project whose folder changed on master.
**In another repo**, call the reusable workflow:

```yaml
jobs:
  deploy:
    uses: nirperetz/nirperetz.github.io/.github/workflows/lab-deploy.yml@master
    with:
      build-command: npm ci && npm run build
    secrets:
      LAB_DEPLOY_TOKEN: ${{ secrets.LAB_DEPLOY_TOKEN }}
```

## The examples

| Project               | Shows                                                                                        |
| --------------------- | -------------------------------------------------------------------------------------------- |
| `shader-garden`       | No build step at all: an HTML file, a JS file, raw WebGL2.                                   |
| `particle-field`      | A Vite + TypeScript build with modern three.js, `outDir: "dist"`.                            |
| `let-the-sunshine-in` | A 2019 piece on three.js r104, served as it was. Old and new three.js versions side by side. |
| `orbit-dodge`         | A game, `visibility: "unlisted"`: works by URL, not in the gallery.                          |
| `thread-mandelbrot`   | `crossOriginIsolated: true`: Web Workers sharing one `SharedArrayBuffer`.                    |
| `palette-router`      | `spa: true`: real deep links like `/lab/palette-router/p/ff5e3a`.                            |
| `archive`             | The 2014 site, untouched, unlisted. Old URLs redirect into it.                               |

## The HUJI CG ports

Exercises from the Hebrew University computer graphics course (2012–13, C++, GLUT,
OpenMesh), rebuilt on three.js with Vite and TypeScript. The algorithms are the
course's own (arcball, Catmull-Clark, Phong, the ray tracer), not three.js
built-ins; three.js supplies the WebGL plumbing. Sources: `/Volumes/T7/01_School/HUJI/cg`.

| Project        | From                    | Notes                                                                                                                      |
| -------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `cg-breakout`  | `brick` (2012)          | Circular Breakout, from the handed-in version in `computer graphics/brick` (the `CGEx1` folder is an earlier draft).       |
| `cg-mesh-lab`  | `cge1` + `CGEx3` (2013) | OFF/OBJ viewer: Shoemake arcball, the course shaders in GLSL ES 3.0, two-sided lighting, Catmull-Clark with the morph.     |
| `cg-raytracer` | `CGEx4` (2013)          | The recursive CPU tracer as a progressive GPU path: one stochastic branch per hit, averaged over frames. Both scenes kept. |

From the computer games course (2013, C++, GLFW, Cg): `/Volumes/T7/01_School/HUJI/משחקי מחשב`.
These were shown on the 2014 site as videos (`archive/corridor.html`, `island.html`,
`cubism.html`); now they run.

| Project    | From                           | Notes                                                                                                                                   |
| ---------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `corridor` | `liri`, `postp` (ex2–3)        | Scrolling-texture corridor, flickering spotlight, and the post pass: any 4×4 kernel plus glow, posterize, blink, dizzy, motion blur.    |
| `island`   | `myIsland`                     | Midpoint-displacement terrain on the CPU (was a geometry shader with transform feedback), reflective sea, caustics, GPU-only particles. |
| `cubism`   | `final` (ex6, from Ex6.tar.gz) | Seven objects × nine render targets per frame, shown on jittered billboard tiles, then a canvas-and-sepia painting pass.                |

Not ported: `asaf-cake`, `assaf`, `assafIsland` (Asaf Geva's work), and the course tutorials.

Thumbnails are captured from the running page with headless Chrome over CDP
(`Page.captureScreenshot`, WebP, 640×400).
