"""Add board-wide instrument details to the current hand-refined console scene.

Run after refine_scope.py. The script only replaces ConsoleDetail_ objects and
does not touch gameplay surfaces or animated assemblies.
"""

from pathlib import Path
import math

import bpy


ROOT = Path(__file__).resolve().parents[2]
BLEND = ROOT / "assets/console/decrypto-console.blend"
GLB = ROOT / "web/public/models/decrypto-console.glb"
PREFIX = "ConsoleDetail_"


for obj in list(bpy.data.objects):
    if obj.name.startswith(PREFIX):
        bpy.data.objects.remove(obj, do_unlink=True)


def material(name, color, metallic=0.0, roughness=0.5, emission=None):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1.0)
    mat.use_nodes = True
    bsdf = next((node for node in mat.node_tree.nodes if node.type == "BSDF_PRINCIPLED"), None)
    if bsdf:
        values = (("Base Color", (*color, 1.0)), ("Metallic", metallic), ("Roughness", roughness))
        for key, value in values:
            if socket := bsdf.inputs.get(key):
                socket.default_value = value
        if emission:
            socket = bsdf.inputs.get("Emission Color") or bsdf.inputs.get("Emission")
            strength = bsdf.inputs.get("Emission Strength")
            if socket:
                socket.default_value = (*emission, 1.0)
            if strength:
                strength.default_value = 1.4
    return mat


NICKEL = bpy.data.materials.get("Satin nickel") or material("Console nickel", (.42, .43, .4), .7, .25)
IVORY = bpy.data.materials.get("Porcelain enamel") or material("Console ivory", (.72, .69, .59), 0, .32)
BLACK = bpy.data.materials.get("Recess rubber") or material("Console black", (.018, .022, .024), .02, .42)
INK = material("Console engraved ink", (.055, .063, .06), 0, .68)
RED = bpy.data.materials.get("Signal red") or material("Console signal red", (.46, .055, .028), .08, .3)
AMBER = material("Console amber lens", (.45, .19, .035), .05, .22, emission=(1.0, .42, .08))


def finish(obj, name, mat, bevel=0.0):
    obj.name = PREFIX + name
    obj.data.materials.append(mat)
    if bevel:
        modifier = obj.modifiers.new("machined edge", "BEVEL")
        modifier.width = bevel
        modifier.segments = 3
    return obj


def box(name, x, y, z, width, depth, height, mat, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(location=(x, y, z))
    obj = bpy.context.object
    obj.scale = (width / 2, depth / 2, height / 2)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, name, mat, bevel)


def cylinder_y(name, x, y, z, radius, depth, mat, vertices=36, bevel=0.0):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth,
                                       location=(x, y, z), rotation=(math.pi / 2, 0, 0))
    return finish(bpy.context.object, name, mat, bevel)


def text_mesh(name, body, x, z, size, mat=INK, y=-0.574):
    bpy.ops.object.text_add(location=(x, y, z), rotation=(math.pi / 2, 0, 0))
    obj = bpy.context.object
    obj.name = PREFIX + name
    obj.data.body = body
    obj.data.align_x = "CENTER"
    obj.data.align_y = "CENTER"
    obj.data.size = size
    obj.data.space_character = 1.12
    obj.data.extrude = .0025
    obj.data.bevel_depth = .001
    obj.data.materials.append(mat)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target="MESH")
    obj.select_set(False)
    return obj


def screw(name, x, z, y=-.89, radius=.055):
    cylinder_y(name + " head", x, y, z, radius, .038, NICKEL, vertices=32, bevel=.007)
    slot = box(name + " slot", x, y - .024, z, radius * 1.15, .008, .012, BLACK, bevel=.003)
    slot.rotation_euler[1] = math.radians(-20)


# Mechanical fasteners anchor the large central bezel instead of leaving it floating.
for index, (x, z) in enumerate(((-4.72, 2.88), (3.82, 2.88), (-4.72, -2.27), (3.82, -2.27))):
    screw(f"main screen fastener {index}", x, z, y=-.86, radius=.064)

# Each red decoder window gets a lower latch and matching lower fasteners.
for index, x in enumerate((-3.83, -1.58, .67, 2.92)):
    box(f"decoder latch base {index}", x, -.875, 3.225, .31, .07, .075, NICKEL, bevel=.014)
    box(f"decoder latch tab {index}", x, -.92, 3.205, .17, .045, .055, BLACK, bevel=.012)
    screw(f"decoder lower left {index}", x - .93, 3.30, y=-.80, radius=.042)
    screw(f"decoder lower right {index}", x + .93, 3.30, y=-.80, radius=.042)

# A true analog receiver meter fills the large blank archive-column area.
box("receiver meter shadow", 5.83, -.60, -1.58, 2.20, .16, .96, BLACK, bevel=.12)
box("receiver meter rim", 5.83, -.70, -1.58, 2.06, .11, .84, NICKEL, bevel=.10)
box("receiver meter face", 5.83, -.775, -1.58, 1.84, .045, .65, IVORY, bevel=.055)

pivot_x, pivot_z = 5.83, -1.83
for index in range(11):
    angle = math.radians(-58 + index * 116 / 10)
    x = pivot_x + math.sin(angle) * .67
    z = pivot_z + math.cos(angle) * .49
    tick = box(f"receiver meter tick {index}", x, -.812, z, .014, .009,
               .085 if index in (0, 5, 10) else .055, INK, bevel=.002)
    tick.rotation_euler[1] = angle

needle_angle = math.radians(-24)
needle_length = .48
needle = box("receiver meter needle",
             pivot_x + math.sin(needle_angle) * needle_length / 2, -.828,
             pivot_z + math.cos(needle_angle) * needle_length / 2,
             .018, .012, needle_length, RED, bevel=.004)
needle.rotation_euler[1] = needle_angle
cylinder_y("receiver meter hub", pivot_x, -.842, pivot_z, .065, .025, BLACK, bevel=.009)
text_mesh("receiver meter label", "SIGNAL   /   RX", 5.83, -1.71, .075, y=-.83)
for index, x in enumerate((4.84, 6.82)):
    screw(f"receiver meter fastener {index}", x, -1.58, y=-.84, radius=.044)


def toggle(name, x, z, active=False):
    cylinder_y(name + " bezel", x, -.62, z, .13, .09, NICKEL, bevel=.012)
    cylinder_y(name + " socket", x, -.70, z, .082, .10, BLACK, bevel=.008)
    stem = box(name + " stem", x + (.045 if active else -.045), -.79, z + .035,
               .055, .12, .22, NICKEL, bevel=.018)
    stem.rotation_euler[1] = math.radians(22 if active else -22)


toggle("monitor toggle", 5.20, -2.35, True)
toggle("sync toggle", 6.15, -2.35, False)
text_mesh("monitor toggle label", "MONITOR", 5.20, -2.62, .052)
text_mesh("sync toggle label", "SYNC", 6.15, -2.62, .052)
cylinder_y("sync lamp bezel", 6.70, -.62, -2.35, .095, .075, NICKEL, bevel=.01)
cylinder_y("sync lamp lens", 6.70, -.685, -2.35, .055, .065, AMBER, bevel=.016)

# A stamped service plate and rivets finish the receiver bank without adding fake UI.
box("service plate", 5.83, -.59, -2.91, 1.92, .055, .32, NICKEL, bevel=.025)
text_mesh("service plate top", "D/ FIELD UNIT", 5.83, -2.86, .061, y=-.625)
text_mesh("service plate serial", "CAL  5821  ·  465-D", 5.83, -2.97, .047, y=-.625)
for index, x in enumerate((4.96, 6.70)):
    screw(f"service plate rivet {index}", x, -2.91, y=-.64, radius=.026)

# Small reference markers around the phase deck make the lower controls feel calibrated.
for index, x in enumerate((2.03, 2.47, 2.91, 3.35, 3.79)):
    box(f"phase calibration {index}", x, -.58, -4.00, .018, .018,
        .065 if index in (0, 4) else .045, INK, bevel=.003)

bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
bpy.ops.export_scene.gltf(filepath=str(GLB), export_format="GLB",
                          export_cameras=False, export_lights=False)
print(f"Board-wide refinement exported: {len([o for o in bpy.data.objects if o.name.startswith(PREFIX)])} detail objects")
