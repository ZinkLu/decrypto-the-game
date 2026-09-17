"""Fixed, open-top card retainers and a solid resin manual key.

Run last, after refine_score_roster.py, on the current editable scene. The
geometry leaves room to lift a card .045 before pulling it .16 forward; both
distances are verified against rosterPose by the exported-model tests.
"""
import json
import sys
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from console_parts import material, box

OUT = ROOT / 'web/public/models'
surfaces = json.loads((OUT / 'console-surfaces.json').read_text())


def remove(obj):
    bpy.data.objects.remove(obj, do_unlink=True)


def attach(obj, parent):
    bpy.context.view_layer.update()
    world = obj.matrix_world.copy()
    obj.parent = parent
    obj.matrix_world = world


for obj in list(bpy.data.objects):
    if obj.name.startswith(('Speaker perforation', 'Front_roster spring seat',
                            'Front_roster spring return', 'Tactile_card clip',
                            'Front_roster channel', 'RosterGuide_')):
        remove(obj)

NICKEL = bpy.data.materials['Tactile brushed nickel']
BRASS = material('Roster satin brass retainers', (.31, .22, .085), .74, .42)
for team in ['A', 'B']:
    for i in range(4):
        s = surfaces[f'roster{team}{i}']
        x, y, w, h = s['x'], s['y'], s['w'], s['h']
        # L-shaped channel: a shelf under the stock and a lip in front of it.
        # Neither solid intersects the seated card. The .069 row gap allows
        # the .045 release lift before the next row's hardware is reached.
        box(f'RosterGuide_floor {team}{i}', x, y-h/2-.018, 1.081,
            w+.060, .024, .15, NICKEL, .003)
        box(f'Front_roster channel {team}{i+1}', x, y-h/2+.006, 1.142,
            w+.060, .044, .027, NICKEL, .004)
        for side in [-1, 1]:
            box(f'Tactile_card clip {team}{i} {side}', x+side*(w/2-.040),
                y-h/2+.008, 1.149, .075, .044, .026, BRASS, .004)
        card = bpy.data.objects[f'RosterCard_{team}{i}']
        card['mechanism'] = 'lift_clear_withdraw'
        card['release_lift'] = .045
        card['front_clearance'] = .16

# A non-emissive molded key: ivory resin face, a charcoal skirt and a crisp
# beveled edge. No decorative bulbs or ambiguous illuminated glass layers.
manual = bpy.data.objects['ManualKey']
for child in list(manual.children):
    remove(child)
RESIN = material('Manual warm ivory resin', (.63, .57, .44), 0, .43)
bs = next(n for n in RESIN.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
bs.inputs['Emission Strength'].default_value = 0
bs.inputs['Coat Weight'].default_value = 0
SKIRT = material('Manual charcoal resin skirt', (.025, .027, .022), 0, .58)
attach(box('ManualDetail_charcoal skirt', -6.25, 4.18, .875,
           1.64, .55, .20, SKIRT, .04), manual)
attach(box('ManualDetail_ivory resin cap', -6.25, 4.18, 1.004,
           1.47, .43, .108, RESIN, .032), manual)
surfaces['badge'] = dict(x=-6.25, y=4.18, w=1.16, h=.245, z=1.061, lit=True)

bpy.context.view_layer.update()
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'assets/console/decrypto-console.blend'))
bpy.ops.export_scene.gltf(filepath=str(OUT / 'decrypto-console.glb'), export_format='GLB', export_apply=True,
    export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
    export_draco_position_quantization=16, export_draco_normal_quantization=12,
    export_cameras=False, export_lights=False, export_extras=True)
(OUT / 'console-surfaces.json').write_text(json.dumps(surfaces, indent=2) + '\n')
print('Fixed low retainers and solid ivory manual key exported; duplicate front perforations removed.')
