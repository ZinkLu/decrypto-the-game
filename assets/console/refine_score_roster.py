"""Local front-face finish and top-loading roster pass; leave the rear intact.

Run after refine_tactile.py, or rerun on the current editable .blend. The body
uses a uniform satin finish. Fine horizontal brushing belongs to the inset
score plate around the eight retained lenses, inside its original dark bezel.
"""
import sys
from pathlib import Path

import bpy
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from console_parts import material

OUT = ROOT / 'web/public/models'
TEX = ROOT / 'assets/console/textures'


def assign(name, mat):
    obj = bpy.data.objects[name]
    obj.data.materials.clear()
    obj.data.materials.append(mat)


BODY = material('Front uniform satin alloy', (.46, .475, .435), .22, .52)
for name in ['Archive column', 'Control deck', 'Power rail', 'Receiver column', 'Scope panel']:
    assign(name, BODY)

PLATE = material('Score fine brushed nickel', (.62, .65, .61), .88, .39)
nodes, links = PLATE.node_tree.nodes, PLATE.node_tree.links
for node in list(nodes):
    if node.type not in ['BSDF_PRINCIPLED', 'OUTPUT_MATERIAL']:
        nodes.remove(node)
bs = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
rng = np.random.default_rng(921)
size = 512
# Long, fine strokes only: no broad bands, clouds or distressed blotches.
grain = np.repeat(rng.normal(0, 1, (size, 1)), size, axis=1)
grain += rng.normal(0, .12, (size, size))
color = np.array([.62, .65, .61])[None, None, :] * (1 + grain[:, :, None] * .015)
roughness = np.clip(.39 + grain * .028, .28, .50)
dy, dx = np.gradient(grain * .012)
normal = np.stack((-dx, -dy, np.ones_like(dx)), axis=-1)
normal /= np.linalg.norm(normal, axis=-1, keepdims=True)


def texture(suffix, pixels, color_space='Non-Color'):
    name = 'Score fine brushed nickel-' + suffix
    if image := bpy.data.images.get(name):
        bpy.data.images.remove(image)
    image = bpy.data.images.new(name, width=size, height=size, alpha=False)
    image.colorspace_settings.name = color_space
    rgba = np.ones((size, size, 4), dtype=np.float32)
    rgba[:, :, :3] = pixels[:, :, None] if pixels.ndim == 2 else pixels
    image.pixels.foreach_set(np.clip(rgba, 0, 1).ravel())
    image.filepath_raw = str(TEX / (name + '.png'))
    image.file_format = 'PNG'
    image.save()
    image.pack()
    node = nodes.new('ShaderNodeTexImage')
    node.image = image
    return node


links.new(texture('color', color, 'sRGB').outputs['Color'], bs.inputs['Base Color'])
links.new(texture('roughness', roughness).outputs['Color'], bs.inputs['Roughness'])
normal_node = nodes.new('ShaderNodeNormalMap')
links.new(texture('normal', normal * .5 + .5).outputs['Color'], normal_node.inputs['Color'])
links.new(normal_node.outputs['Normal'], bs.inputs['Normal'])
assign('Front_score enamel bed', PLATE)

plate = bpy.data.objects['Front_score enamel bed']
uv = plate.data.uv_layers.active or plate.data.uv_layers.new(name='ScorePlateUV')
for poly in plate.data.polygons:
    for loop in poly.loop_indices:
        point = plate.matrix_world @ plate.data.vertices[plate.data.loops[loop].vertex_index].co
        uv.data[loop].uv = ((point.x - 4.42) / 2.82, (point.z - 1.875) / 1.71)

# The open top is the insertion axis. The runtime first releases the clips in
# depth, then lifts the card by its height plus the gap, keeping every rail fixed.
for team in ['A', 'B']:
    for i in range(4):
        card = bpy.data.objects[f'RosterCard_{team}{i}']
        card['removal_axis'] = 'up'
        card['travel'] = .58

bpy.context.view_layer.update()
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'assets/console/decrypto-console.blend'))
bpy.ops.export_scene.gltf(filepath=str(OUT / 'decrypto-console.glb'), export_format='GLB', export_apply=True,
    export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
    export_draco_position_quantization=16, export_draco_normal_quantization=12,
    export_cameras=False, export_lights=False, export_extras=True)
print('Front satin panels, brushed score plate and top-loading roster exported; rear untouched.')
