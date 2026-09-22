"""Two independent, textured rear audio slides; preserve the rest of the console.

blender -b -t 1 assets/console/decrypto-console.blend --python assets/console/refine_rear_audio.py
"""
import json
import math
import sys
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from console_parts import box, ring, material

PREFIX = 'RearAudio_'
for obj in list(bpy.data.objects):
    if obj.name.startswith(PREFIX) or obj.name in [
        'RearSoundSwitch', 'RearMusicSwitch', 'Instrument_sound switch socket', 'Instrument_sound switch legend',
    ]:
        bpy.data.objects.remove(obj, do_unlink=True)

nickel = bpy.data.materials['Tactile brushed nickel']
rubber = bpy.data.materials['Tactile molded rubber']
resin = bpy.data.materials['Tactile mottled phenolic']
ivory = bpy.data.materials['Tactile cream lettering']
on_ink = material('Rear audio olive enamel', (.22, .30, .15), .08, .46)


def label(name, text, x, y, z, size, mat=ivory):
    bpy.ops.object.text_add(location=(x, -z, y), rotation=(math.pi / 2, 0, math.pi))
    obj = bpy.context.object
    obj.name = PREFIX + name
    obj.data.body = text
    obj.data.align_x = obj.data.align_y = 'CENTER'
    obj.data.size = size
    obj.data.space_character = 1.12
    obj.data.materials.append(mat)
    bpy.ops.object.convert(target='MESH')
    return obj


def attach(obj, parent):
    bpy.context.view_layer.update()
    world = obj.matrix_world.copy()
    obj.parent = parent
    obj.matrix_world = world


surfaces_path = ROOT / 'web/public/models/console-surfaces.json'
surfaces = json.loads(surfaces_path.read_text())
for name, legend, x, surface in [('RearMusicSwitch', 'MUSIC', 5.30, 'musicControl'),
                                  ('RearSoundSwitch', 'SFX', 2.90, 'soundControl')]:
    y = -1.32
    # A rolled metal rim surrounds a deep rubber seat; the resin cap rides above it.
    box(PREFIX + legend + ' gasket', x, y, -2.965, 1.18, .50, .12, rubber, .065)
    ring(PREFIX + legend + ' rolled bezel', x, y,
         [(1.12, .46, .065, -2.99), (1.12, .46, .065, -3.055),
          (1.03, .37, .045, -3.073), (.98, .32, .038, -3.041)], nickel)
    box(PREFIX + legend + ' recessed track', x, y, -3.015, 1.00, .34, .035, rubber, .03)
    # Mechanical indicator strips are revealed by the slider at each detent.
    box(PREFIX + legend + ' on detent', x + .34, y, -3.044, .17, .20, .018, on_ink, .025)
    box(PREFIX + legend + ' off detent', x - .34, y, -3.044, .17, .20, .018, rubber, .025)
    label(legend + ' off mark', 'O', x - .34, y, -3.056, .105)
    label(legend + ' on mark', 'I', x + .34, y, -3.056, .105)
    # Start at the ON detent. The named assembly alone translates at runtime.
    pivot = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(pivot)
    pivot.location = (x - .22, 3.065, y)
    pivot['centerX'] = x
    pivot['travel'] = .44
    attach(box(PREFIX + legend + ' cap skirt', x - .22, y, -3.065, .51, .33, .10, rubber, .04), pivot)
    attach(box(PREFIX + legend + ' phenolic cap', x - .22, y, -3.13, .46, .30, .13, resin, .047), pivot)
    for i in range(5):
        attach(box(PREFIX + legend + f' grip rib {i}', x - .22 + (i - 2) * .062, y,
                   -3.198, .018, .21, .018, resin, .007), pivot)
    attach(box(PREFIX + legend + ' ivory index', x - .22, y + .12, -3.198,
               .12, .023, .012, ivory, .005), pivot)
    label(legend + ' label', legend, x - 1.10, y + .045, -2.917, .145)
    label(legend + ' caption', 'ON / OFF', x - 1.10, y - .135, -2.917, .075)
    surfaces[surface] = dict(x=x - .38, y=y, z=-3.24, w=2.05, h=.64, rotationY=math.pi)

# Reuse the packed material maps with manufacturing-scale UVs on the new meshes.
bpy.context.view_layer.update()
for obj in bpy.data.objects:
    if obj.type != 'MESH' or not obj.name.startswith(PREFIX):
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

# All forty runtime digits must survive export; Boolean cutters remain excluded.
digits = [(o, o.hide_render, o.hide_get()) for o in bpy.data.objects if o.name.startswith('Nixie_Digit_')]
assert len(digits) == 40
for obj, _, _ in digits:
    obj.hide_render = False
    obj.hide_set(False)
try:
    bpy.ops.export_scene.gltf(filepath=str(ROOT / 'web/public/models/decrypto-console.glb'),
        export_format='GLB', export_apply=True, use_renderable=True,
        export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
        export_draco_position_quantization=16, export_draco_normal_quantization=12,
        export_cameras=False, export_lights=False, export_extras=True)
finally:
    for obj, hidden_render, hidden_view in digits:
        obj.hide_render = hidden_render
        obj.hide_set(hidden_view)
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'assets/console/decrypto-console.blend'))
surfaces_path.write_text(json.dumps(surfaces, indent=2) + '\n')
print('Independent MUSIC / SFX slides exported with textured caps, grip ribs and two detents.')
