"""Replace the rear wordmark with the ENCRYPTO lettering; nothing else is rebuilt.

blender -b -t 1 --factory-startup assets/console/decrypto-console.blend --python assets/console/refine_rear_wordmark.py

remodel_instrument.py writes the same lettering, but it rebuilds every
Instrument_ part and undoes the later passes. This pass sets the one label in
its place, with the material the legends beside it already have. Repeatable.
"""
import math
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]
MODELS = ROOT / 'web/public/models'
FORMER = 'Instrument_rear wordmark'
NAME = 'Instrument_rear ENCRYPTO wordmark'
# As in remodel_instrument.py: back_label(..., 4.2, 4.05, -2.906, .23)
X, Y, Z, SIZE = 4.2, 4.05, -2.906, .23

neighbour = bpy.data.objects['Instrument_rear model']
material = neighbour.data.materials[0]
collections = list(neighbour.users_collection)
for name in (FORMER, NAME):
    if old := bpy.data.objects.get(name):
        bpy.data.objects.remove(old, do_unlink=True)

bpy.ops.object.text_add(location=(X, -Z, Y), rotation=(math.pi / 2, 0, math.pi))
label = bpy.context.object
label.name = NAME
label.data.body = 'E N C R Y P T O'
label.data.align_x = 'CENTER'
label.data.align_y = 'CENTER'
label.data.size = SIZE
label.data.space_character = 1.22
label.data.materials.append(material)
bpy.ops.object.convert(target='MESH')
label.data.name = NAME
for collection in list(label.users_collection):
    collection.objects.unlink(label)
for collection in collections:
    collection.objects.link(label)

# The lettering lies on the service cover, inside the panel, clear of the legends beside it.
bpy.context.view_layer.update()
xs = [(label.matrix_world @ v.co).x for v in label.data.vertices]
depth = [(label.matrix_world @ v.co).y for v in label.data.vertices]
assert 1.0 < max(xs) - min(xs) < 3.2, 'the wordmark has an unexpected width'
assert max(abs(d + Z) for d in depth) < .01, 'the wordmark left the rear face'
assert not bpy.data.objects.get(FORMER)

digits = [(o, o.hide_render, o.hide_get()) for o in bpy.data.objects if o.name.startswith('Nixie_Digit_')]
assert len(digits) == 40
for o, _, _ in digits:
    o.hide_render = False
    o.hide_set(False)
try:
    bpy.ops.export_scene.gltf(filepath=str(MODELS / 'decrypto-console.glb'),
        export_format='GLB', export_apply=True, use_renderable=True,
        export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
        export_draco_position_quantization=16, export_draco_normal_quantization=12,
        export_cameras=False, export_lights=False, export_extras=True)
finally:
    for o, hidden_render, hidden_view in digits:
        o.hide_render = hidden_render
        o.hide_set(hidden_view)
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'assets/console/decrypto-console.blend'))
print('Rear wordmark exported: ENCRYPTO, width %.2f.' % (max(xs) - min(xs)))
