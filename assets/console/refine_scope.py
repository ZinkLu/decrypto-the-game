"""Incrementally refine the oscilloscope in the current editable console scene.

Run from the repository root:
    blender -b assets/console/decrypto-console.blend --python assets/console/refine_scope.py

Unlike build_console.py, this script preserves all manually modelled assemblies.
It is idempotent: objects prefixed with ScopeDetail_ are replaced on every run.
"""

from pathlib import Path
import math

import bpy


ROOT = Path(__file__).resolve().parents[2]
BLEND = ROOT / "assets/console/decrypto-console.blend"
GLB = ROOT / "web/public/models/decrypto-console.glb"
PREFIX = "ScopeDetail_"


def clean_previous():
    for name in ("ScopeRate", "ScopePersistence"):
        obj = bpy.data.objects.get(name)
        if obj:
            bpy.data.objects.remove(obj, do_unlink=True)
    for obj in list(bpy.data.objects):
        if obj.name.startswith(PREFIX) or obj.name.startswith("Scope dial index"):
            bpy.data.objects.remove(obj, do_unlink=True)


def material(name, color, metallic=0.0, roughness=0.5, emission=None):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1.0)
    mat.use_nodes = True
    bsdf = next((node for node in mat.node_tree.nodes if node.type == "BSDF_PRINCIPLED"), None)
    if bsdf:
        for key, value in (("Base Color", (*color, 1.0)), ("Metallic", metallic), ("Roughness", roughness)):
            socket = bsdf.inputs.get(key)
            if socket:
                socket.default_value = value
        if emission:
            socket = bsdf.inputs.get("Emission Color") or bsdf.inputs.get("Emission")
            strength = bsdf.inputs.get("Emission Strength")
            if socket:
                socket.default_value = (*emission, 1.0)
            if strength:
                strength.default_value = 1.8
    return mat


CAST = material("Scope cast alloy", (0.42, 0.43, 0.40), metallic=0.72, roughness=0.25)
BAKELITE = material("Scope black bakelite", (0.018, 0.023, 0.024), metallic=0.04, roughness=0.3)
INK = material("Scope engraved ink", (0.055, 0.065, 0.064), roughness=0.72)
PHOSPHOR = material("Scope indicator glass", (0.12, 0.42, 0.25), metallic=0.0, roughness=0.2,
                    emission=(0.18, 0.95, 0.48))
IVORY = bpy.data.materials.get("Porcelain enamel") or material(
    "Scope warm ivory", (0.72, 0.69, 0.59), roughness=0.34
)
NICKEL = bpy.data.materials.get("Satin nickel") or CAST


def finish(obj, name, mat, bevel=0.0):
    obj.name = PREFIX + name
    if getattr(obj.data, "materials", None) is not None:
        obj.data.materials.append(mat)
    if bevel:
        modifier = obj.modifiers.new("machined edge", "BEVEL")
        modifier.width = bevel
        modifier.segments = 3
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        bpy.ops.object.shade_smooth_by_angle()
        obj.select_set(False)
    return obj


def box(name, x, y, z, width, depth, height, mat, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(location=(x, y, z))
    obj = bpy.context.object
    obj.scale = (width / 2, depth / 2, height / 2)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, name, mat, bevel)


def cylinder_y(name, x, y, z, radius, depth, mat, vertices=40, bevel=0.0):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth,
                                       location=(x, y, z), rotation=(math.pi / 2, 0, 0))
    return finish(bpy.context.object, name, mat, bevel)


def torus_y(name, x, y, z, major, minor, mat):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor,
                                    major_segments=48, minor_segments=10,
                                    location=(x, y, z), rotation=(math.pi / 2, 0, 0))
    return finish(bpy.context.object, name, mat)


def parent_keep_world(obj, parent):
    matrix = obj.matrix_world.copy()
    obj.parent = parent
    obj.matrix_world = matrix


def pivot(name, x, y, z):
    obj = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = (x, y, z)
    return obj


def screw(name, x, z):
    cylinder_y(name + " head", x, -0.905, z, 0.062, 0.045, NICKEL, vertices=32, bevel=0.008)
    slot = box(name + " slot", x, -0.932, z, 0.075, 0.009, 0.014, INK, bevel=0.004)
    slot.rotation_euler[1] = math.radians(-18)


def text_mesh(name, body, x, z, size, mat=INK):
    bpy.ops.object.text_add(location=(x, -0.574, z), rotation=(math.pi / 2, 0, 0))
    obj = bpy.context.object
    obj.name = PREFIX + name
    obj.data.body = body
    obj.data.align_x = "CENTER"
    obj.data.align_y = "CENTER"
    obj.data.size = size
    obj.data.space_character = 1.15
    obj.data.extrude = 0.003
    obj.data.bevel_depth = 0.0015
    obj.data.materials.append(mat)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target="MESH")
    obj.select_set(False)
    return obj


clean_previous()

# A stepped, cast-metal CRT surround. The live CanvasTexture remains unobstructed.
box("bezel top", -6.48, -0.885, -2.405, 1.54, 0.075, 0.105, CAST, 0.025)
box("bezel bottom", -6.48, -0.885, -3.755, 1.54, 0.075, 0.105, CAST, 0.025)
box("bezel left", -7.205, -0.885, -3.08, 0.09, 0.075, 1.26, CAST, 0.025)
box("bezel right", -5.755, -0.885, -3.08, 0.09, 0.075, 1.26, CAST, 0.025)

# A thin black inner mask makes the CRT look seated inside a real tube cavity.
box("mask top", -6.48, -0.91, -2.472, 1.41, 0.025, 0.035, BAKELITE, 0.009)
box("mask bottom", -6.48, -0.91, -3.688, 1.41, 0.025, 0.035, BAKELITE, 0.009)
box("mask left", -7.19, -0.91, -3.08, 0.035, 0.025, 1.18, BAKELITE, 0.009)
box("mask right", -5.77, -0.91, -3.08, 0.035, 0.025, 1.18, BAKELITE, 0.009)

for index, (x, z) in enumerate(((-7.245, -2.365), (-5.715, -2.365),
                                (-7.245, -3.795), (-5.715, -3.795))):
    screw(f"bezel fastener {index}", x, z)

# Rebuild the tuning control as a layered, knurled Bakelite instrument dial.
tuning = bpy.data.objects.get("ScopeTuning")
if tuning is None:
    raise RuntimeError("ScopeTuning assembly is missing; refusing to export a broken model")
cylinder_y("dial escutcheon", -5.45, -0.568, -3.05, 0.335, 0.026, CAST, bevel=0.014)
torus_y("dial shadow ring", -5.45, -0.604, -3.05, 0.267, 0.028, BAKELITE)
skirt = cylinder_y("dial rubber skirt", -5.45, -0.71, -3.05, 0.247, 0.14, BAKELITE,
                   vertices=48, bevel=0.016)
parent_keep_world(skirt, tuning)
torus = torus_y("dial knurled rim", -5.45, -0.86, -3.05, 0.205, 0.038, BAKELITE)
parent_keep_world(torus, tuning)
cap = cylinder_y("dial ivory cap", -5.45, -0.914, -3.05, 0.142, 0.025, IVORY,
                 vertices=48, bevel=0.012)
parent_keep_world(cap, tuning)
hub = cylinder_y("dial hub", -5.45, -0.936, -3.05, 0.035, 0.022, NICKEL,
                 vertices=32, bevel=0.006)
parent_keep_world(hub, tuning)

for i in range(20):
    angle = i * math.tau / 20
    x = -5.45 + math.sin(angle) * 0.225
    z = -3.05 + math.cos(angle) * 0.225
    ridge = box(f"dial knurl {i:02}", x, -0.914, z, 0.027, 0.018, 0.072,
                CAST if i % 5 == 0 else INK, bevel=0.004)
    ridge.rotation_euler[1] = angle
    parent_keep_world(ridge, tuning)

for i in range(8):
    angle = math.radians(-135 + i * 270 / 7)
    x = -5.45 + math.sin(angle) * .31
    z = -3.05 + math.cos(angle) * .31
    tick = box(f"mode index {i}", x, -0.584, z, .018, .014, .055 if i in (0, 7) else .04,
               INK, bevel=.003)
    tick.rotation_euler[1] = angle


def mini_dial(name, label, x, z, radius, tick_count):
    control = pivot(name, x, -0.73, z)
    cylinder_y(f"{label} escutcheon", x, -0.57, z, radius * 1.34, .026, CAST, bevel=.01)
    for i in range(tick_count):
        angle = math.radians(-125 + i * 250 / max(1, tick_count - 1))
        tx = x + math.sin(angle) * radius * 1.45
        tz = z + math.cos(angle) * radius * 1.45
        tick = box(f"{label} index {i}", tx, -0.588, tz, .012, .012,
                   .033 if i in (0, tick_count - 1) else .024, INK, bevel=.002)
        tick.rotation_euler[1] = angle
    body = cylinder_y(f"{label} knob body", x, -0.72, z, radius, .19, BAKELITE,
                      vertices=36, bevel=.012)
    cap = cylinder_y(f"{label} knob cap", x, -0.825, z, radius * .66, .035, IVORY,
                     vertices=36, bevel=.008)
    pointer = box(f"{label} pointer", x, -0.85, z + radius * .42, .016, .014,
                  radius * .62, INK, bevel=.003)
    for obj in (body, cap, pointer):
        parent_keep_world(obj, control)
    for i in range(12):
        angle = i * math.tau / 12
        ridge = box(f"{label} knurl {i:02}", x + math.sin(angle) * radius * .93, -0.825,
                    z + math.cos(angle) * radius * .93, .014, .016, radius * .24,
                    CAST, bevel=.002)
        ridge.rotation_euler[1] = angle
        parent_keep_world(ridge, control)
    return control


mini_dial("ScopeRate", "rate", -5.42, -2.46, .125, 5)
mini_dial("ScopePersistence", "persistence", -5.16, -3.54, .118, 4)

# Dedicated signal input and status jewel borrow the visual grammar of a lab scope.
cylinder_y("input bezel", -5.43, -0.602, -3.78, 0.14, 0.075, NICKEL, bevel=0.012)
cylinder_y("input insulator", -5.43, -0.672, -3.78, 0.098, 0.075, BAKELITE, bevel=0.008)
torus_y("input locking ring", -5.43, -0.735, -3.78, 0.068, 0.018, NICKEL)
cylinder_y("input socket", -5.43, -0.76, -3.78, 0.038, 0.06, BAKELITE, bevel=0.005)
cylinder_y("trace lamp bezel", -7.31, -0.605, -3.98, 0.085, 0.07, NICKEL, bevel=0.01)
cylinder_y("trace lamp lens", -7.31, -0.674, -3.98, 0.05, 0.065, PHOSPHOR,
           vertices=40, bevel=0.02)

text_mesh("monitor label", "VECTOR  MONITOR", -6.48, -2.21, 0.085)
text_mesh("rate label", "TIME", -5.42, -2.22, 0.054)
text_mesh("level label", "MODE", -5.45, -2.72, 0.058)
text_mesh("persistence label", "PERSIST", -5.16, -3.30, 0.046)
text_mesh("input label", "INPUT", -5.43, -4.015, 0.064)
text_mesh("trace label", "RUN", -7.16, -3.98, 0.045)

# Give the existing cast pieces more plausible light response without changing color.
for material_name, roughness in (("Satin nickel", 0.24), ("Porcelain enamel", 0.3),
                                 ("Warm enamel edge", 0.36), ("Recess rubber", 0.48)):
    mat = bpy.data.materials.get(material_name)
    if not mat or not mat.use_nodes:
        continue
    bsdf = next((node for node in mat.node_tree.nodes if node.type == "BSDF_PRINCIPLED"), None)
    if bsdf and bsdf.inputs.get("Roughness"):
        bsdf.inputs["Roughness"].default_value = roughness

bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
bpy.ops.export_scene.gltf(filepath=str(GLB), export_format="GLB",
                          export_cameras=False, export_lights=False)
print(f"Refined oscilloscope exported: {len([o for o in bpy.data.objects if o.name.startswith(PREFIX)])} detail objects")
