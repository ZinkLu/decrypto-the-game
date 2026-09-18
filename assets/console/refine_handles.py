"""Side handles rebuilt as single bent straps, screwed to the back panel.

Each handle was previously a floating assembly of two mount blocks, a rail and a
rubber grip glued onto the front face edge. Now every side is ONE mesh object:
a continuous nickel strap whose two feet wrap around the rear side edge and are
bolted to the back panel (screws visible from behind), running forward along the
side cheeks and bending out at the front corner into the rubber-sleeved grip.

Run after refine_panel_layout.py:
blender -b assets/console/decrypto-console.blend --python assets/console/refine_handles.py
Repeatable: existing Guard* and Handle* objects are removed first.
"""
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
LEG_X = 8.45        # strap legs stand off the cheeks, clearing the louvres
APEX_X = 8.78       # the legs bow out this far at the front corner
GRIP_X = 8.58       # then tuck back in: the grip stands closer to the cheek
LEG_Y = 2.2         # anchor rows
GRIP_Y = 1.70       # grip half length
FRONT_Z = 0.55      # grip plane, pushed out towards the front panel edge
ANCHOR_X = 7.15     # anchor plates sit well inside the rear cover outline


def strap(name, points, radius, mat, vertical_grip=False):
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions, curve.resolution_u = '3D', 16
    curve.bevel_depth, curve.bevel_resolution = radius, 4
    curve.resolution_u = 16
    spline = curve.splines.new('BEZIER')
    spline.bezier_points.add(len(points) - 1)
    for point, (x, y, z) in zip(spline.bezier_points, points):
        point.co = (x, -z, y)
        point.handle_left_type = point.handle_right_type = 'AUTO'
    if vertical_grip:
        # Force the handles facing the grip section to point exactly along the
        # grip axis: a bezier segment with both end handles collinear is a
        # straight line, so the tube stays coaxial with the rubber sleeve
        # while the rest of the strap keeps its smooth auto bends.
        top, mid, bot = (spline.bezier_points[i] for i in vertical_grip)
        top.handle_right_type = 'FREE'
        top.handle_right = (top.co.x, top.co.y, top.co.z - .5)
        bot.handle_left_type = 'FREE'
        bot.handle_left = (bot.co.x, bot.co.y, bot.co.z + .5)
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
    # One continuous bent strap. It bows out to APEX_X at the front corner and
    # tucks back in to GRIP_X; the middle section is forced dead straight by
    # the vertical handles above, so the sleeve sits coaxially on the tube.
    path = [
        (s * ANCHOR_X, LEG_Y, PLATE_Z),                 # buried in anchor plate
        (s * 8.25, LEG_Y, PLATE_Z),                     # to the rear side edge
        (s * LEG_X, LEG_Y, BACK_Z + .27),               # folded around the corner
        (s * LEG_X, LEG_Y, FRONT_Z - .7),               # forward along the cheek
        (s * APEX_X, GRIP_Y + .25, FRONT_Z - .07),      # bowing out
        (s * GRIP_X, GRIP_Y, FRONT_Z),                  # tucking in: grip start
        (s * GRIP_X, 0, FRONT_Z),                       # straight grip middle
        (s * GRIP_X, -GRIP_Y, FRONT_Z),                 # grip end
        (s * APEX_X, -GRIP_Y - .25, FRONT_Z - .07),
        (s * LEG_X, -LEG_Y, FRONT_Z - .7),
        (s * LEG_X, -LEG_Y, BACK_Z + .27),
        (s * 8.25, -LEG_Y, PLATE_Z),
        (s * ANCHOR_X, -LEG_Y, PLATE_Z),
    ]
    tube = strap('Handle tube', path, .13, NICKEL, vertical_grip=(5, 6, 7))
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

bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'assets/console/decrypto-console.blend'))
bpy.ops.export_scene.gltf(filepath=str(OUT / 'decrypto-console.glb'), export_format='GLB',
    export_apply=True, use_renderable=True, export_draco_mesh_compression_enable=True,
    export_draco_mesh_compression_level=6, export_draco_position_quantization=16,
    export_draco_normal_quantization=12, export_cameras=False, export_lights=False,
    export_extras=True)
print('Handles rebuilt: one bent strap per side, bolted to the back panel.')
