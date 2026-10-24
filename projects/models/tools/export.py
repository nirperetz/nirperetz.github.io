# blender -b --factory-startup -P export.py -- '<json config>' OUT.glb
# Opens or imports one source, makes it web-sized, writes a Draco-compressed GLB and
# prints a JSON report.
import bpy, json, sys

cfg = json.loads(sys.argv[sys.argv.index("--") + 1])
out = sys.argv[sys.argv.index("--") + 2]
src = cfg["src"]
ext = src.lower().rsplit(".", 1)[-1]

if ext == "blend":
    bpy.ops.wm.open_mainfile(filepath=src, load_ui=False)
else:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if ext == "abc":
        bpy.ops.wm.alembic_import(filepath=src)
    elif ext == "obj":
        bpy.ops.wm.obj_import(filepath=src)
    elif ext == "stl":
        bpy.ops.wm.stl_import(filepath=src)

scene = bpy.context.scene
if "frames" in cfg:
    scene.frame_start, scene.frame_end = cfg["frames"]

def visible_meshes():
    return [o for o in scene.objects if o.type == "MESH" and o.visible_get()]

# Relink images whose paths pointed at an old account ("relink": {name: path}).
for name, path in cfg.get("relink", {}).items():
    img = bpy.data.images.get(name)
    if img:
        img.filepath = path
        img.reload()

# Show anything named in "unhide" (pieces hidden in the saved scene).
for name in cfg.get("unhide", []):
    o = scene.objects.get(name)
    if o:
        o.hide_set(False)
        o.hide_viewport = False
        o.hide_render = False

# Hide anything named in "hide".
for name in cfg.get("hide", []):
    o = scene.objects.get(name)
    if o:
        o.hide_set(True)
        o.hide_render = True

# Alembic transforms come in as constraints; bake them to keyframes so glTF sees them.
if cfg.get("bake") == "transforms":
    objs = [o for o in scene.objects if any(c.type == "TRANSFORM_CACHE" for c in o.constraints)]
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.hide_set(False)
        o.select_set(True)
    if objs:
        bpy.context.view_layer.objects.active = objs[0]
        bpy.ops.nla.bake(
            frame_start=scene.frame_start,
            frame_end=scene.frame_end,
            step=cfg.get("step", 1),
            only_selected=True,
            visual_keying=True,
            clear_constraints=True,
            bake_types={"OBJECT"},
        )

# Mesh caches (Alembic vertex animation) become shape keys keyed one per sampled frame.
if cfg.get("bake") == "meshcache":
    step = cfg.get("step", 2)
    for o in visible_meshes():
        mods = [m for m in o.modifiers if m.type == "MESH_SEQUENCE_CACHE"]
        if not mods:
            continue
        frames = list(range(scene.frame_start, scene.frame_end + 1, step))
        keys = []
        for f in frames:
            scene.frame_set(f)
            dg = bpy.context.evaluated_depsgraph_get()
            m = o.evaluated_get(dg).to_mesh()
            keys.append([v.co.copy() for v in m.vertices])
            o.evaluated_get(dg).to_mesh_clear()
        for m in mods:
            o.modifiers.remove(m)
        if not o.data.shape_keys:
            o.shape_key_add(name="Basis")
        for i, co in enumerate(keys):
            sk = o.shape_key_add(name=f"f{frames[i]}")
            for v, c in zip(sk.data, co):
                v.co = c
        kb = o.data.shape_keys.key_blocks
        for i, f in enumerate(frames):
            for j in range(len(frames)):
                k = kb[j + 1]
                k.value = 1.0 if j == i else 0.0
                k.keyframe_insert("value", frame=f)
        act = o.data.shape_keys.animation_data.action
        for fc in act.fcurves:
            for p in fc.keyframe_points:
                p.interpolation = "LINEAR"

# Geometry Nodes that scatter instances (the donut's sprinkles) export in the wrong place
# as glTF instances; realizing them as plain meshes first keeps them where they render.
if cfg.get("realize"):
    bpy.ops.object.select_all(action="DESELECT")
    gn = [o for o in visible_meshes() if any(m.type == "NODES" for m in o.modifiers)]
    for o in gn:
        o.select_set(True)
    if gn:
        bpy.context.view_layer.objects.active = gn[0]
        bpy.ops.object.convert(target="MESH")

# Decimate: bring the visible meshes down to about cfg["tris"] triangles in total.
target = cfg.get("tris")
if target:
    dg = bpy.context.evaluated_depsgraph_get()
    counts = {}
    for o in visible_meshes():
        m = o.evaluated_get(dg).to_mesh()
        counts[o.name] = sum(len(p.vertices) - 2 for p in m.polygons)
        o.evaluated_get(dg).to_mesh_clear()
    total = sum(counts.values())
    if total > target:
        ratio = target / total
        for o in visible_meshes():
            if counts.get(o.name, 0) < 2000 or (o.data.shape_keys and len(o.data.shape_keys.key_blocks) > 1):
                continue
            d = o.modifiers.new("web_decimate", "DECIMATE")
            d.ratio = max(0.002, ratio)

# "clay": sources with no usable material (raw OBJ/Alembic exports) get one neutral one.
if cfg.get("clay"):
    mat = bpy.data.materials.new("clay")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (0.78, 0.74, 0.69, 1)
    bsdf.inputs["Roughness"].default_value = 0.7
    for o in visible_meshes():
        o.data.materials.clear()
        o.data.materials.append(mat)

# Textures: cap at 1024 px; the exporter re-encodes them as WebP.
for img in bpy.data.images:
    if img.source == "FILE" and img.size[0] > 1024:
        s = 1024 / max(img.size[0], img.size[1])
        try:
            img.scale(int(img.size[0] * s), int(img.size[1] * s))
        except Exception:
            pass

bpy.ops.export_scene.gltf(
    filepath=out,
    export_format="GLB",
    use_visible=True,
    export_apply=True,
    export_cameras=False,
    export_lights=False,
    export_animations=cfg.get("anim", True),
    export_animation_mode=cfg.get("animMode", "ACTIONS"),
    export_morph=True,
    export_skins=True,
    export_gn_mesh=True,
    export_image_format="WEBP",
    export_image_quality=80,
    export_draco_mesh_compression_enable=cfg.get("draco", True),
    export_draco_mesh_compression_level=6,
    export_draco_position_quantization=14,
    export_draco_normal_quantization=10,
    export_draco_texcoord_quantization=12,
    export_yup=True,
)

dg = bpy.context.evaluated_depsgraph_get()
tris = 0
for o in visible_meshes():
    m = o.evaluated_get(dg).to_mesh()
    tris += sum(len(p.vertices) - 2 for p in m.polygons)
    o.evaluated_get(dg).to_mesh_clear()
print("REPORT:" + json.dumps({"id": cfg["id"], "tris": tris, "actions": len(bpy.data.actions)}))
