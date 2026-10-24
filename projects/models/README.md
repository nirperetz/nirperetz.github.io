# Models

A viewer for 3D work from 2016 on. Each model is a single Draco-compressed GLB in
`public/models/`, listed in `src/catalog.ts`.

## Converting a model

The sources stay on the T7 drive; only the GLBs are in the repo. Conversion is headless
Blender (4.5), one process per model:

```bash
/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup -P export.py -- '<config json>' out.glb
```

`export.py` opens a `.blend` (or imports `.obj`, `.stl`, `.abc`), then:
- **Alembic transforms** (Maya animation exported as `.abc`) arrive as constraints; they
  are baked to keyframes (`"bake": "transforms"`) so glTF can carry them.
- **Alembic mesh caches** (vertex animation, like Yona's face) become one shape key per
  sampled frame, keyed so exactly one is on at a time (`"bake": "meshcache"`). glTF plays
  them as morph-target animation.
- **Heavy meshes** get a Decimate modifier so the visible total lands near `"tris"`.
- **Textures** are capped at 1024 px and written as WebP.
- Modifiers and Geometry Nodes are applied, cameras and lights dropped, and meshes are
  Draco-compressed (14-bit positions, 10-bit normals).

Maya isn't installed, so `.mb` scenes come in through the Blender, OBJ and Alembic exports
made in 2021–2024. The script and the per-model configs are in `tools/`
(`export.py`, `items.json`); `python3 tools/run_export.py [id …]` re-exports into
`tools/glb/`.

## Viewer

three.js with `GLTFLoader` + `DRACOLoader` (decoder files in `public/draco/`, copied from
`three/examples/jsm/libs/draco/gltf`). Lighting is three's procedural `RoomEnvironment`
through PMREM plus one shadow-casting key light, so there is no HDR to download. Every model
is stood on the floor and framed from its bounding sphere; animations play through one
`AnimationMixer`. Deep links: `/lab/models/#<id>`.
