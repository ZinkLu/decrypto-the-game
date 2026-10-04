"""Install the selected receiver into the current console, preserving other refinements.

blender -b assets/console/decrypto-console.blend --python assets/console/install_receiver.py
Run build_instrument_studies.py first when the receiver geometry has changed.
"""
import json
import re
from pathlib import Path
import bpy

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'web/public/models'
EXPORT = dict(export_format='GLB', export_apply=True, use_renderable=True,
    export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
    export_draco_position_quantization=16, export_draco_normal_quantization=12,
    export_cameras=False, export_lights=False, export_extras=True)

# Keep the former VU available solely to the development comparison bench.
legacy = [o for o in bpy.data.objects if re.match(
    r'^(Tactile_meter|Tactile_Meter|Tactile_pointer|ReceiverNeedle$|MeterAmplitude$|MeterRate$)', o.name)]
if legacy:
    for obj in list(legacy):
        legacy.extend(child for child in obj.children_recursive if child not in legacy)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in legacy:
        obj.hide_set(False)
        obj.hide_render = False
        obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(OUT / 'instrument-vu.glb'), use_selection=True, **EXPORT)
    for obj in legacy:
        bpy.data.objects.remove(obj, do_unlink=True)

# Replace only this assembly so rerunning the pass leaves the rest of the model intact.
old = bpy.data.objects.get('Instrument_signal')
if old:
    for obj in [*old.children_recursive, old]:
        bpy.data.objects.remove(obj, do_unlink=True)
with bpy.data.libraries.load(str(ROOT / 'assets/console/instrument-studies.blend'), link=False) as (source, target):
    target.objects = [name for name in source.objects if name == 'Instrument_signal' or name.startswith('Signal')]
for obj in target.objects:
    bpy.context.scene.collection.objects.link(obj)
    # These are soft knob gaskets, not exposed face fasteners.
    if obj.name.endswith('Washer'):
        obj.name = obj.name.removesuffix('Washer') + 'Gasket'
receiver = bpy.data.objects['Instrument_signal']
receiver.location = (5.83, 0, -1.4)
receiver['console_default_instrument'] = True
for name in ['SignalNeedle', 'SignalTuning', 'SignalGain', 'SignalSweep']:
    assert bpy.data.objects[name] in receiver.children_recursive, name

# Match the default AUTO state in the editable scene; runtime owns subsequent poses.
bpy.data.objects['SignalTuning'].rotation_euler.y = -(2.2 - 14 / 40 * 4.4)
bpy.data.objects['SignalGain'].rotation_euler.y = 0
bpy.data.objects['SignalSweep'].rotation_euler.x = -.5
bpy.data.objects['SignalNeedle'].rotation_euler.y = -(1.08 - .12 * .82 * 2.16)

surfaces_path = OUT / 'console-surfaces.json'
surfaces = json.loads(surfaces_path.read_text())
surfaces['receiverSweepControl'] = dict(x=5.83, y=-2.50, z=.755, w=.42, h=.56)

# Every runtime digit must export; the source intentionally hides all but 5821.
# Keep Boolean cutters excluded, and restore the source's own digit visibility.
digits = [(o, o.hide_render, o.hide_get()) for o in bpy.data.objects if o.name.startswith('Nixie_Digit_')]
assert len(digits) == 40, 'The room-code recorder must retain every digit.'
for obj, _, _ in digits:
    obj.hide_render = False
    obj.hide_set(False)
try:
    bpy.ops.export_scene.gltf(filepath=str(OUT / 'decrypto-console.glb'), **EXPORT)
finally:
    for obj, hidden_render, hidden_view in digits:
        obj.hide_render = hidden_render
        obj.hide_set(hidden_view)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'assets/console/decrypto-console.blend'))
surfaces_path.write_text(json.dumps(surfaces, indent=2) + '\n')
print('Installed SIGNAL receiver into the main console; legacy VU is a development-only asset.')
