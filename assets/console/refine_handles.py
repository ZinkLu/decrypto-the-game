"""Side handles rebuilt as single bent straps, screwed to the back panel.

Each handle was previously a floating assembly of two mount blocks, a rail and a
rubber grip glued onto the front face edge. Now every side is ONE mesh object:
a continuous nickel strap whose two feet wrap around the rear side edge and are
bolted to the back panel (screws visible from behind), running forward along the
side cheeks and bending into the rubber-sleeved grip.

The strap is formed like bent tube stock: straight runs joined by constant
radius bends, each bend lying in one plane. (Auto Bezier handles through a
bow-out point made the tube wander in an S, and a half-FREE handle pair left a
kink where the bend met the grip.) Bend radii stay well above the tube radius,
so the bevel never pinches.

Run after refine_panel_layout.py:
blender -b assets/console/decrypto-console.blend --python assets/console/refine_handles.py
Repeatable: existing Guard* and Handle* objects are removed first.
"""
import math
import sys
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from console_parts import material, box, cylinder

OUT = ROOT / 'web/public/models'

for obj in list(bpy.data.objects):
    if obj.name.startswith(('Guard', 'Handle')):
        bpy.data.objects.remove(obj, do_unlink=True)

NICKEL = bpy.data.materials.get('Tactile brushed nickel') \
    or material('Tactile brushed nickel', (.38, .40, .40), .8, .3)
RUBBER = bpy.data.materials.get('Tactile molded rubber') \
    or material('Tactile molded rubber', (.03, .03, .03), 0, .75)
BLACK = bpy.data.materials.get('Recess rubber') or RUBBER

BACK_Z = -2.69      # rear casing face
COVER_Z = -2.88     # rear service cover, the visible back panel
PLATE_Z = -2.925    # anchor plates sit proud of the service cover
SIDE_X = 8.02       # side cheek plane
GRIP_X = 8.58       # legs and grip share one plane, clear of the louvres
LEG_Y = 2.2         # anchor rows
FRONT_Z = 0.55      # grip plane, pushed out towards the front panel edge
ANCHOR_X = 7.15     # anchor plates sit well inside the rear cover outline
TUBE = .13          # strap radius
REAR_BEND = .33     # around the rear side edge
FRONT_BEND = .50    # from the leg into the grip; the grip runs to LEG_Y - FRONT_BEND


def tube_path(s):
    """Straights and planar arcs, sampled densely enough to read as round."""
    points = [(s * ANCHOR_X, LEG_Y, PLATE_Z)]            # buried in the anchor plate
    # Rear bend in the x-z plane: outward along the back, then forward.
    cx, cz = s * (GRIP_X - REAR_BEND), PLATE_Z + REAR_BEND
    for i in range(13):
        a = math.radians(-90 + 90 * i / 12)
        points.append((cx + s * REAR_BEND * math.cos(a), LEG_Y, cz + REAR_BEND * math.sin(a)))
    # Forward along the cheek, then one bend in the y-z plane into the grip.
    cy, cz = LEG_Y - FRONT_BEND, FRONT_Z - FRONT_BEND
    for i in range(17):
        a = math.radians(90 * i / 16)
        points.append((s * GRIP_X, cy + FRONT_BEND * math.cos(a), cz + FRONT_BEND * math.sin(a)))
    lower = [(x, -y, z) for x, y, z in reversed(points)]
    return points + lower


def strap(name, points, radius, mat):
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions = '3D'
    curve.bevel_depth, curve.bevel_resolution = radius, 5
    spline = curve.splines.new('POLY')
    spline.points.add(len(points) - 1)
    for point, (x, y, z) in zip(spline.points, points):
        point.co = (x, -z, y, 1)
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    curve.materials.append(mat)
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.convert(target='MESH')
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return obj


def screw(x, y, z):
    cylinder('Handle screw', x, y, z, .06, .05, NICKEL, 24)
    box('Handle screw slot', x, y, z - .026, .06, .012, .006, BLACK, .002)


def rod(name, x, y0, y1, z, radius, mat):
    """Straight vertical (console-y) bar; guaranteed coaxial for the sleeve."""
    bpy.ops.mesh.primitive_cylinder_add(vertices=40, radius=radius, depth=y1 - y0,
                                        location=(x, -z, (y0 + y1) / 2))
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    bevel = obj.modifiers.new('Rod ends', 'BEVEL')
    bevel.width, bevel.segments = .02, 2
    return obj


for side, label in [(-1, 'L'), (1, 'R')]:
    s = side
    # One continuous bent strap: anchor, rear bend, leg, front bend, grip, and back.
    tube = strap('Handle tube', tube_path(s), TUBE, NICKEL)
    parts = [tube, rod('Handle grip', s * GRIP_X, -1.15, 1.15, FRONT_Z, .18, RUBBER)]
    for y0 in [LEG_Y, -LEG_Y]:
        parts.append(box('Handle anchor', s * ANCHOR_X, y0, PLATE_Z,
                         .85, 1.1, .09, NICKEL, .03))
        for dy in [-.32, .32]:
            screw(s * ANCHOR_X, y0 + dy, PLATE_Z - .05)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in parts:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    parts[0].name = f'Handle {label}'

    # Brushed grain uses the tactile pass's box projection (world axes / 6).
    handle = parts[0]
    uv = handle.data.uv_layers.active or handle.data.uv_layers.new(name='ManufacturingUV')
    world = handle.matrix_world
    for poly in handle.data.polygons:
        normal = world.to_3x3() @ poly.normal
        axis = max(range(3), key=lambda i: abs(normal[i]))
        axes = (0, 2) if axis == 1 else (0, 1) if axis == 2 else (1, 2)
        for loop in poly.loop_indices:
            p = world @ handle.data.vertices[handle.data.loops[loop].vertex_index].co
            uv.data[loop].uv = (p[axes[0]] / 6, p[axes[1]] / 6)

# All forty room-code digits must survive export; restore their editable visibility.
digits = [(o, o.hide_render, o.hide_get()) for o in bpy.data.objects if o.name.startswith('Nixie_Digit_')]
assert len(digits) == 40
for o, _, _ in digits:
    o.hide_render = False
    o.hide_set(False)
try:
    bpy.ops.export_scene.gltf(filepath=str(OUT / 'decrypto-console.glb'), export_format='GLB',
        export_apply=True, use_renderable=True, export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=6, export_draco_position_quantization=16,
        export_draco_normal_quantization=12, export_cameras=False, export_lights=False,
        export_extras=True)
finally:
    for o, hidden_render, hidden_view in digits:
        o.hide_render = hidden_render
        o.hide_set(hidden_view)
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'assets/console/decrypto-console.blend'))
print('Handles rebuilt: one formed strap per side, bolted to the back panel.')
