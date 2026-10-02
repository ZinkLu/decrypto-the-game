"""The intercom: a line selector, a TALK key and three lamps beside the speaker vents.

blender -b -t 1 --factory-startup assets/console/decrypto-console.blend --python assets/console/refine_intercom.py

The vents on the power rail are the loudspeaker's grille. To their right sit:
the RX lamp, lit by what this seat hears; the selector, OFF / ALL / TEAM,
which puts the seat on the line and chooses whom it talks to, with a lamp at
ALL and at TEAM that shows where its voice actually goes; and the TALK key,
whose red jewel lights while the voice goes out. Only the selector and the key
move: the runtime turns `IntercomSelector` about its own axis by
`detent_degrees` per detent and presses `IntercomTalk` along its own axis by
up to `travel`. Everything else is fixed. The pass can be repeated.
"""
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from console_parts import box, cylinder, ring

PREFIX = 'Intercom_'
NAMED = ['IntercomSelector', 'IntercomTalk', 'IntercomRX', 'IntercomAll', 'IntercomTeam', 'IntercomTX']
for obj in list(bpy.data.objects):
    if obj.name.startswith(PREFIX) or obj.name in NAMED:
        bpy.data.objects.remove(obj, do_unlink=True)

NICKEL = bpy.data.materials['Tactile brushed nickel']
PHENOLIC = bpy.data.materials['Tactile mottled phenolic']
CREAM = bpy.data.materials['Tactile cream lettering']
INK = bpy.data.materials['Instrument legends']
CHARCOAL = bpy.data.materials['Panel charcoal polymer']
GRAPHITE = bpy.data.materials['Manual graphite resin']


def lens(name, color):
    """A jewel like the NETWORK lamp's, in its own colour; the runtime lights it."""
    mat = bpy.data.materials.get(name)
    if mat is None:
        mat = bpy.data.materials['Link lens'].copy()
        mat.name = name
    bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    mat.diffuse_color = (*color, 1)
    return mat


GREEN = lens('Intercom receive lens', (.12, .42, .25))
RED = lens('Intercom transmit lens', (.46, .07, .045))
AMBER = lens('Intercom route lens', (.52, .32, .07))


def label(name, text, x, y, z, size, mat=INK):
    bpy.ops.object.text_add(location=(x, -z, y), rotation=(math.pi / 2, 0, 0))
    obj = bpy.context.object
    obj.name = PREFIX + name
    obj.data.body = text
    obj.data.align_x = obj.data.align_y = 'CENTER'
    obj.data.size = size
    obj.data.space_character = 1.12
    obj.data.extrude = .0006
    obj.data.materials.append(mat)
    bpy.ops.object.convert(target='MESH')
    obj.select_set(False)
    return obj


def attach(obj, parent):
    bpy.context.view_layer.update()
    world = obj.matrix_world.copy()
    obj.parent = parent
    obj.matrix_world = world
    return obj


def pivot(name, x, y, z, **props):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.empty_display_type = 'ARROWS'
    obj.empty_display_size = .12
    obj.location = (x, -z, y)
    for key, value in props.items():
        obj[key] = value
    return obj


FACE = .55  # the power rail's face
RAIL = dict(left=2.40, right=4.155, bottom=-5.05, top=-4.22)

# RX: what this seat hears, beside the grille it comes out of.
RX = (2.585, -4.62)
cylinder(PREFIX + 'receive bezel', *RX, FACE + .025, .088, .05, NICKEL)
lamp = cylinder('IntercomRX', *RX, FACE + .062, .054, .05, GREEN)
label('receive legend', 'RX', RX[0], -4.40, FACE + .001, .062)

# The selector: OFF at the left, ALL straight up, TEAM at the right.
SX, SY, DETENT = 3.10, -4.66, 55
cylinder(PREFIX + 'selector escutcheon', SX, SY, FACE + .014, .235, .028, NICKEL)
for name, angle in [('off', DETENT), ('all', 0), ('team', -DETENT)]:
    a = math.radians(angle)
    # Positive angles turn anticlockwise as the operator sees the panel.
    dx, dy = -math.sin(a), math.cos(a)
    if name == 'off':
        tick = box(PREFIX + 'off detent mark', SX + dx * .268, SY + dy * .268, FACE + .004, .016, .05, .008, INK, .002)
        tick.rotation_euler[1] = -a
    else:
        cylinder(PREFIX + name + ' lamp bezel', SX + dx * .268, SY + dy * .268, FACE + .012, .046, .024, NICKEL)
        cylinder('IntercomAll' if name == 'all' else 'IntercomTeam',
                 SX + dx * .268, SY + dy * .268, FACE + .03, .03, .03, AMBER)
    # ALL sits close under the rail's edge; the slanted legends clear their lamps.
    reach = .372 if name == 'all' else .40
    label(name + ' legend', name.upper(), SX + dx * reach, SY + dy * reach, FACE + .001, .054)
selector = pivot('IntercomSelector', SX, SY, FACE, detent_degrees=DETENT)
for part in [
    cylinder(PREFIX + 'selector skirt', SX, SY, FACE + .045, .185, .05, PHENOLIC),
    cylinder(PREFIX + 'selector body', SX, SY, FACE + .125, .165, .15, PHENOLIC),
    cylinder(PREFIX + 'selector cap', SX, SY, FACE + .208, .108, .03, CREAM),
    box(PREFIX + 'selector pointer', SX, SY + .062, FACE + .225, .022, .09, .008, INK, .002),
]:
    attach(part, selector)
for i in range(12):
    a = i * math.tau / 12
    ridge = box(PREFIX + f'selector knurl {i:02}', SX + math.sin(a) * .158, SY + math.cos(a) * .158,
                FACE + .125, .016, .03, .14, PHENOLIC, .003)
    ridge.rotation_euler[1] = a
    attach(ridge, selector)
label('selector legend', 'INTERCOM', SX, -4.975, FACE + .001, .05)

# TALK: a graphite key in a charcoal socket, its jewel in the cap.
TX, TY = 3.83, -4.62
ring(PREFIX + 'talk socket', TX, TY,
     [(.52, .52, .06, FACE - .005), (.52, .52, .06, FACE + .06), (.44, .44, .045, FACE + .06), (.44, .44, .045, FACE + .01)],
     CHARCOAL)
talk = pivot('IntercomTalk', TX, TY, FACE, travel=.055)
for part in [
    box(PREFIX + 'talk skirt', TX, TY, FACE + .11, .42, .42, .10, CHARCOAL, .02),
    box(PREFIX + 'talk cap', TX, TY, FACE + .19, .38, .38, .13, GRAPHITE, .04),
    cylinder(PREFIX + 'talk jewel bezel', TX, TY + .07, FACE + .262, .07, .02, NICKEL),
    cylinder('IntercomTX', TX, TY + .07, FACE + .272, .05, .03, RED),
    label('talk legend', 'TALK', TX, TY - .095, FACE + .2555, .068, CREAM),
]:
    attach(part, talk)

# Every piece stays on the rail, clear of the vents and of the ACTION socket.
bpy.context.view_layer.update()
for obj in bpy.data.objects:
    if obj.type != 'MESH' or not (obj.name.startswith(PREFIX) or obj.name in NAMED):
        continue
    corners = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    xs, ys = [c.x for c in corners], [c.z for c in corners]
    assert RAIL['left'] < min(xs) and max(xs) < RAIL['right'] - .05, f'{obj.name} leaves the rail sideways'
    assert RAIL['bottom'] + .03 < min(ys) and max(ys) < RAIL['top'] - .03, f'{obj.name} leaves the rail vertically'
# The pressed key still clears the floor of its socket.
skirt = bpy.data.objects[PREFIX + 'talk skirt']
lowest = min(-(skirt.matrix_world @ Vector(c)).y for c in skirt.bound_box)
assert lowest - talk['travel'] > FACE - .005 + .004, 'the pressed TALK key reaches the socket floor'

surfaces_path = ROOT / 'web/public/models/console-surfaces.json'
surfaces = json.loads(surfaces_path.read_text())
surfaces['intercomSelector'] = dict(x=SX, y=SY, z=round(FACE + .26, 3), w=.52, h=.52)
surfaces['intercomTalk'] = dict(x=TX, y=TY, z=round(FACE + .31, 3), w=.5, h=.5)

# Reuse the packed material maps with manufacturing-scale UVs on the new meshes.
for obj in bpy.data.objects:
    if obj.type != 'MESH' or not (obj.name.startswith(PREFIX) or obj.name in NAMED):
        continue
    uv = obj.data.uv_layers.active or obj.data.uv_layers.new(name='ManufacturingUV')
    world = obj.matrix_world
    for poly in obj.data.polygons:
        normal = world.to_3x3() @ poly.normal
        axis = max(range(3), key=lambda i: abs(normal[i]))
        axes = (0, 2) if axis == 1 else (0, 1) if axis == 2 else (1, 2)
        for loop in poly.loop_indices:
            point = world @ obj.data.vertices[obj.data.loops[loop].vertex_index].co
            uv.data[loop].uv = (point[axes[0]] / 2, point[axes[1]] / 2)

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
dry = Path(args[args.index('--dry') + 1]) if '--dry' in args else None
# All forty runtime digits must survive export; Boolean cutters remain excluded.
digits = [(o, o.hide_render, o.hide_get()) for o in bpy.data.objects if o.name.startswith('Nixie_Digit_')]
assert len(digits) == 40
for obj, _, _ in digits:
    obj.hide_render = False
    obj.hide_set(False)
try:
    bpy.ops.export_scene.gltf(filepath=str(dry or ROOT / 'web/public/models/decrypto-console.glb'),
        export_format='GLB', export_apply=True, use_renderable=True,
        export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
        export_draco_position_quantization=16, export_draco_normal_quantization=12,
        export_cameras=False, export_lights=False, export_extras=True)
finally:
    for obj, hidden_render, hidden_view in digits:
        obj.hide_render = hidden_render
        obj.hide_set(hidden_view)
if not dry:
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'assets/console/decrypto-console.blend'))
    surfaces_path.write_text(json.dumps(surfaces, indent=2) + '\n')
print('Intercom exported: RX lamp, OFF / ALL / TEAM selector with two route lamps, TALK key with its jewel.')
