"""Final front layout: lower drive, clean fastenings, two VU knobs, matte launch key.

Run after refine_roster_manual.py. Positions and label surfaces are exported
together; movable assemblies retain their own origins and all rear parts.
"""
import json
import re
import sys
from pathlib import Path

import bpy
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from console_parts import material, box, cylinder

OUT = ROOT / 'web/public/models'
TEX = ROOT / 'assets/console/textures'
surfaces = json.loads((OUT / 'console-surfaces.json').read_text())


def remove(obj):
    bpy.data.objects.remove(obj, do_unlink=True)


def assign(obj, mat):
    obj.data.materials.clear()
    obj.data.materials.append(mat)


def shift_surface(name, dy):
    surfaces[name]['y'] += dy


# Remove complete screw assemblies by name AND front-facing position. This
# includes the older decoder fasteners, whose names never contained "screw".
bpy.context.view_layer.update()
removed = []
# Some older screws are named for their job ("meter mount"), not their
# fastener type. Capture head/slot pairs before removing either half.
slotted_screws = {obj.name[:-5] for obj in bpy.data.objects
                  if obj.name.endswith(' head') and bpy.data.objects.get(obj.name[:-5] + ' slot')}
for obj in list(bpy.data.objects):
    fastening = re.search(r'screw|bolt|rivet|fastener|washer', obj.name, re.I) or obj.name.startswith(
        ('ConsoleDetail_decoder lower left', 'ConsoleDetail_decoder lower right', 'Instrument_filter retainer'))
    fastening = fastening or re.sub(r' (head|slot)$', '', obj.name) in slotted_screws
    if fastening and -obj.matrix_world.translation.y > .3:
        removed.append(obj.name)
        remove(obj)

# The obsolete archive wheel and two legacy toggle assemblies were still
# modeled underneath the newer VU knobs. Keep only MeterAmplitude / MeterRate.
for obj in list(bpy.data.objects):
    if obj.name.startswith(('Archive scroll wheel', 'Wheel knurl',
                            'ConsoleDetail_monitor toggle', 'ConsoleDetail_sync toggle',
                            'ConsoleDetail_sync lamp', 'ConsoleDetail_service plate')):
        remove(obj)
surfaces.pop('wheel', None)

# The small, non-interactive power rocker takes the old drive position.
for name in ['Power socket', 'Power rocker']:
    bpy.data.objects[name].location.x = -6.65
    bpy.data.objects[name].location.z = -1.62
surfaces['power'].update(x=-6.65, y=-1.62)
surfaces['powerLegend'] = dict(x=-6.08, y=-1.62, w=.62, h=.20, z=.568, lit=True)

# A slimmer fixed drive housing fits the bottom rail. The inclined disk still
# has its full thickness and size; only the housing fascia has been repackaged.
for obj in list(bpy.data.objects):
    if obj.name == 'Floppy mount' or obj.name.startswith(('Drive ', 'Eject ')):
        remove(obj)
BLACK = material('Drive charcoal housing', (.026, .033, .032), 0, .56)
NICKEL = bpy.data.materials['Tactile brushed nickel']
RED = bpy.data.materials['Tactile oxblood phenolic']
GREEN = material('Drive subdued green lens', (.15, .27, .14), 0, .36)
x, y = -6.25, -4.59
box('Floppy mount', x, y, .65, 2.12, .70, .25, BLACK, .045)
box('Drive cavity', x, y+.015, .79, 1.82, .29, .035, BLACK, .015)
box('Drive upper fascia', x, y+.23, .91, 1.87, .16, .22, NICKEL, .016)
box('Drive lower fascia', x, y-.245, .91, 1.87, .13, .22, NICKEL, .016)
for side in [-1, 1]:
    box(f'Drive side jamb {side}', x+side*.89, y, .91, .09, .33, .22, NICKEL, .012)
box('Drive upper lip', x, y+.14, .99, 1.64, .032, .09, BLACK, .006)
box('Drive lower lip', x, y-.145, .99, 1.64, .028, .09, BLACK, .006)
box('Eject socket', -5.56, y-.245, 1.034, .30, .13, .028, BLACK, .012)
box('Eject tab', -5.56, y-.245, 1.076, .24, .085, .075, RED, .009)
cylinder('Drive activity bezel', -6.98, y-.245, 1.035, .041, .028, BLACK)
cylinder('Drive activity lens', -6.98, y-.245, 1.055, .024, .02, GREEN)
disk = bpy.data.objects['FloppyTransport']
dy = -2.97 - disk.location.z
disk.location.z = -2.97
disk['layout'] = 'bottom_rail'
shift_surface('disklabel', dy)
surfaces['disk'] = dict(x=-6.25, y=-4.68, w=2.15, h=.92, z=1.48)

# Place the whole launch assembly beneath the receiver panel's lower edge.
lever = bpy.data.objects['TransmitLever']
dy = -4.25 - lever.location.z
lever.location.z = -4.25
for name in ['Tactile_transmit socket', 'Tactile_transmit brushed collar']:
    bpy.data.objects[name].location.z += dy
shift_surface('transmitControl', dy)
surfaces['transmitLabel'].update(y=-4.22, h=.50)

# Dry, finely worn oxide-red resin. Wear is limited to faint edge rub and fine
# grain; roughness carries the material instead of a glossy clear coat.
MATTE = material('Launch worn red resin', (.28, .04, .021), 0, .76)
nodes, links = MATTE.node_tree.nodes, MATTE.node_tree.links
for node in list(nodes):
    if node.type not in ['BSDF_PRINCIPLED', 'OUTPUT_MATERIAL']:
        nodes.remove(node)
bs = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
bs.inputs['Coat Weight'].default_value = 0
rng = np.random.default_rng(1212)
n = 512
yy, xx = np.mgrid[0:n, 0:n] / (n-1)
grain = rng.random((n, n)) - .5
edge = np.clip(1 - np.minimum.reduce([xx, 1-xx, yy, 1-yy]) / .045, 0, 1)
wear = edge * np.clip(grain + .35, 0, 1) * .11
rgb = np.array([.49, .145, .095])[None, None, :] * (1 + grain[:, :, None] * .035)
rgb += wear[:, :, None] * np.array([.48, .30, .16])
roughness = np.clip(.76 + grain * .045 - wear, .65, .82)
gy, gx = np.gradient(grain * .015)
normal = np.stack([-gx, -gy, np.ones_like(gx)], axis=-1)
normal /= np.linalg.norm(normal, axis=-1, keepdims=True)


def texture(suffix, data, color=False):
    name = 'Launch worn red resin-' + suffix
    if old := bpy.data.images.get(name):
        bpy.data.images.remove(old)
    image = bpy.data.images.new(name, width=n, height=n, alpha=False)
    image.colorspace_settings.name = 'sRGB' if color else 'Non-Color'
    rgba = np.ones((n, n, 4), dtype=np.float32)
    rgba[:, :, :3] = data[:, :, None] if data.ndim == 2 else data
    image.pixels.foreach_set(np.clip(rgba, 0, 1).ravel())
    image.filepath_raw = str(TEX / (name + '.png'))
    image.file_format = 'PNG'
    image.save()
    image.pack()
    node = nodes.new('ShaderNodeTexImage')
    node.image = image
    return node


links.new(texture('color', rgb, True).outputs['Color'], bs.inputs['Base Color'])
links.new(texture('roughness', roughness).outputs['Color'], bs.inputs['Roughness'])
normal_node = nodes.new('ShaderNodeNormalMap')
links.new(texture('normal', normal*.5+.5).outputs['Color'], normal_node.inputs['Color'])
links.new(normal_node.outputs['Normal'], bs.inputs['Normal'])
cap = bpy.data.objects['Tactile_transmit red key']
assign(cap, MATTE)
uv = cap.data.uv_layers.active or cap.data.uv_layers.new(name='LaunchUV')
for poly in cap.data.polygons:
    for loop in poly.loop_indices:
        point = cap.data.vertices[cap.data.loops[loop].vertex_index].co
        uv.data[loop].uv = (point.x/2.15+.5, point.z/.76+.5)
GUNMETAL = material('Launch satin gunmetal collar', (.09, .105, .092), .55, .58)
assign(bpy.data.objects['Tactile_transmit brushed collar'], GUNMETAL)

bpy.context.view_layer.update()
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'assets/console/decrypto-console.blend'))
bpy.ops.export_scene.gltf(filepath=str(OUT / 'decrypto-console.glb'), export_format='GLB', export_apply=True,
    export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
    export_draco_position_quantization=16, export_draco_normal_quantization=12,
    export_cameras=False, export_lights=False, export_extras=True)
(OUT / 'console-surfaces.json').write_text(json.dumps(surfaces, indent=2) + '\n')
print(f'Front layout exported; removed {len(removed)} front fastener pieces. Rear fasteners preserved.')
