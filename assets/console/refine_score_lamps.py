"""Install shallow Fresnel score lenses and machined nickel retaining rings.

blender -b -t 1 --factory-startup assets/console/decrypto-console.blend --python assets/console/refine_score_lamps.py
Only the eight lamp assemblies and obsolete diffuser bars are changed.
The frontend shares scoreLamps.json and uses the exported geometry and maps.
"""
import json
import math
from pathlib import Path
import struct
import zlib

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[2]
SPEC = json.loads((ROOT / 'web/src/components/console/scoreLamps.json').read_text())
TEX = ROOT / 'assets/console/textures'
OUT = ROOT / 'web/public/models/decrypto-console.glb'
RADIUS = SPEC['radius']
SEGMENTS = SPEC['segments']


def linear_color(hex_color):
    rgb = [int(hex_color[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in rgb)


def image(name, values, srgb=True):
    """Write exact texture bytes; Blender then loads and packs the same PNG."""
    pixels = np.clip(values, 0, 255).astype(np.uint8)
    height, width = pixels.shape[:2]
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))
    scanlines = b''.join(b'\0' + pixels[y].tobytes() for y in range(height))
    path = TEX / (name + '.png')
    path.write_bytes(b'\x89PNG\r\n\x1a\n' +
                    chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)) +
                    chunk(b'IDAT', zlib.compress(scanlines, 9)) + chunk(b'IEND', b''))
    if old := bpy.data.images.get(name):
        bpy.data.images.remove(old)
    result = bpy.data.images.load(str(path), check_existing=False)
    result.name = name
    result.colorspace_settings.name = 'sRGB' if srgb else 'Non-Color'
    result.pack()
    return result


def smooth(a, b, values):
    t = np.clip((values - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


# Concentric optical steps are real geometry. Fine radial tooling and a subtle
# stipple break up the glass reflections without painting a checkerboard on it.
size = 256
y, x = np.mgrid[0:size, 0:size]
u, v = (x + .5) / size * 2 - 1, (y + .5) / size * 2 - 1
r = np.hypot(u, v)
face = 1 - smooth(.78, .87, r)
angle = np.arctan2(v, u)
prism = np.cos(angle * 48) * smooth(.20, .70, r)
rings = sum(np.exp(-((r - radius) / .012) ** 2) for radius in [.21, .37, .53, .69])
rng = np.random.default_rng(922)
grain = rng.normal(0, 1, (size, size))
relief = face * prism * .07 + grain * .012
pigment = 225 - smooth(.76, 1, r) * 96 - rings * 15 + face * prism * 3 + grain * .8
emission = (1 - smooth(.74, .97, r)) * (92 + 133 * np.exp(-r * r * 4.4) - rings * 34 + prism * 7)
dx = relief[:, np.minimum(np.arange(size) + 1, size - 1)] - relief[:, np.maximum(np.arange(size) - 1, 0)]
dy = relief[np.minimum(np.arange(size) + 1, size - 1), :] - relief[np.maximum(np.arange(size) - 1, 0), :]
length = np.sqrt((dx * 1.8) ** 2 + (dy * 1.8) ** 2 + 1)
normal = np.stack(((1 - dx * 1.8 / length) * 127.5,
                   (1 - dy * 1.8 / length) * 127.5, (1 + 1 / length) * 127.5), axis=-1)


def rgba(values):
    rgb = np.repeat(values[..., None], 3, axis=-1) if values.ndim == 2 else values
    return np.concatenate((rgb, np.full((size, size, 1), 255)), axis=-1)


pigment_image = image('Score pressed glass-color', rgba(pigment))
normal_image = image('Score pressed glass-normal', rgba(normal), False)
emission_image = image('Score pressed glass-emission', rgba(emission))


def material(name, color, roughness, metalness=0):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    nodes.clear()
    bs = nodes.new('ShaderNodeBsdfPrincipled')
    output = nodes.new('ShaderNodeOutputMaterial')
    links.new(bs.outputs['BSDF'], output.inputs['Surface'])
    bs.inputs['Base Color'].default_value = (*linear_color(color), 1)
    bs.inputs['Roughness'].default_value = roughness
    bs.inputs['Metallic'].default_value = metalness
    mat.diffuse_color = (*linear_color(color), 1)
    return mat, bs


def tinted_texture(mat, image_data, color, socket):
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    tex = nodes.new('ShaderNodeTexImage')
    tex.image = image_data
    mix = nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    mix.blend_type = 'MULTIPLY'
    mix.inputs[0].default_value = 1
    mix.inputs[7].default_value = (*linear_color(color), 1)
    links.new(tex.outputs['Color'], mix.inputs[6])
    links.new(mix.outputs[2], socket)


collar_mat, _ = material('Score satin nickel collar', SPEC['collar']['color'],
                         SPEC['collar']['roughness'], SPEC['collar']['metalness'])
socket_mat, _ = material('Score graphite gasket', '#242822', .74)


def revolved_mesh(name, profile, machined=False):
    # Local Blender space is x-right, z-up, -y-forward. Keep the lens node's
    # existing transform, including the complete instrument's .84 scale.
    vertices, faces = [], []
    for radius, height in profile:
        for i in range(SEGMENTS):
            angle = i * 2 * math.pi / SEGMENTS
            # Small grip flutes on the vertical skirt, clear of the face bevel.
            rim = radius
            if machined and radius >= 1.245:
                rim -= .009 * (1 + math.cos(angle * 64))
            vertices.append((RADIUS * rim * math.sin(angle), -RADIUS * height,
                             -RADIUS * rim * math.cos(angle)))
    for j in range(len(profile) - 1):
        for i in range(SEGMENTS):
            a, b = j * SEGMENTS + i, j * SEGMENTS + (i + 1) % SEGMENTS
            faces.append((a, b, b + SEGMENTS, a + SEGMENTS))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=.0000001)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    if machined:
        # Keep the planar land, V-groove and turned bevels distinct. Smoothing
        # all these edges makes a metal retaining ring look like a rubber torus.
        edges = [edge for edge in bm.edges if edge.is_manifold and edge.calc_face_angle() > .6]
        bmesh.ops.split_edges(bm, edges=edges)
    bm.to_mesh(mesh)
    bm.free()
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    # Uniform planar UVs preserve the flutes through the center of the cap.
    uv = mesh.uv_layers.new(name='ScoreLensUV')
    for loop in mesh.loops:
        p = mesh.vertices[loop.vertex_index].co
        uv.data[loop.index].uv = (p.x / (2 * RADIUS) + .5, p.z / (2 * RADIUS) + .5)
    mesh.update()
    return mesh


def replace_mesh(obj, mesh, mat):
    previous = obj.data
    obj.modifiers.clear()
    obj.data = mesh
    obj.data.materials.append(mat)
    if previous.users == 0:
        bpy.data.meshes.remove(previous)


plate = bpy.data.objects['Front_score enamel bed']
panel_front = min((plate.matrix_world @ Vector(corner)).y for corner in plate.bound_box)
for team in ['A', 'B']:
    for category in ['intercept', 'failure']:
        colors = SPEC[category]
        for k in range(2):
            name = f'{team}_{category}_{k}'
            lens = bpy.data.objects['ScoreLamp_' + name]
            # Seat against the actual plate, not the previous cap position, so
            # this pass remains repeatable after another console layout pass.
            previous_frame = lens.matrix_world.copy()
            seated_frame = previous_frame.copy()
            seated_frame.translation.y = panel_front - RADIUS * SPEC['seatHeight'] * previous_frame.to_scale().y
            for baseline in ['panel_layout_base_matrix', 'nixie_cover_base_matrix']:
                if baseline in lens:
                    values = lens[baseline]
                    base = Matrix([values[i:i+4] for i in range(0, 16, 4)])
                    layout = previous_frame @ base.inverted()
                    lens[baseline] = [v for row in layout.inverted() @ seated_frame for v in row]
            lens.matrix_world = seated_frame
            lens_mat, bs = material('Score matte glass ' + name, colors['off'], SPEC['glass']['roughness'])
            bs.inputs['IOR'].default_value = SPEC['glass']['ior']
            bs.inputs['Coat Weight'].default_value = SPEC['glass']['clearcoat']
            bs.inputs['Coat Roughness'].default_value = SPEC['glass']['clearcoatRoughness']
            tinted_texture(lens_mat, pigment_image, colors['off'], bs.inputs['Base Color'])
            tinted_texture(lens_mat, emission_image, colors['emissive'], bs.inputs['Emission Color'])
            bs.inputs['Emission Strength'].default_value = 0
            tex = lens_mat.node_tree.nodes.new('ShaderNodeTexImage')
            tex.image = normal_image
            normal_node = lens_mat.node_tree.nodes.new('ShaderNodeNormalMap')
            normal_node.inputs['Strength'].default_value = SPEC['glass']['normalScale']
            lens_mat.node_tree.links.new(tex.outputs['Color'], normal_node.inputs['Color'])
            lens_mat.node_tree.links.new(normal_node.outputs['Normal'], bs.inputs['Normal'])
            replace_mesh(lens, revolved_mesh(lens.name, SPEC['lensProfile']), lens_mat)
            lens['score_lamp_finish'] = 'shallow-fresnel-glass'
            collar = bpy.data.objects['Interaction_lamp retaining collar ' + name]
            collar.matrix_world = lens.matrix_world.copy()
            # Later layout passes must use the cap's coordinate frame, too.
            for baseline in ['panel_layout_base_matrix', 'nixie_cover_base_matrix']:
                if baseline in lens:
                    collar[baseline] = list(lens[baseline])
            replace_mesh(collar, revolved_mesh(collar.name, SPEC['collarProfile'], machined=True), collar_mat)
            socket = bpy.data.objects['Interaction_lamp socket ' + name]
            socket.matrix_world = lens.matrix_world.copy()
            for baseline in ['panel_layout_base_matrix', 'nixie_cover_base_matrix']:
                if baseline in lens:
                    socket[baseline] = list(lens[baseline])
            replace_mesh(socket, revolved_mesh(socket.name, SPEC['socketProfile']), socket_mat)

for obj in list(bpy.data.objects):
    if obj.name.startswith('Interaction_lens diffuser '):
        old_mesh = obj.data
        bpy.data.objects.remove(obj, do_unlink=True)
        if old_mesh.users == 0:
            bpy.data.meshes.remove(old_mesh)

# Preserve the editable scene's poses/visibility, but export all runtime digits.
digits = [(o, o.hide_render, o.hide_get()) for o in bpy.data.objects if o.name.startswith('Nixie_Digit_')]
assert len(digits) == 40
for obj, _, _ in digits:
    obj.hide_render = False
    obj.hide_set(False)
try:
    bpy.ops.export_scene.gltf(filepath=str(OUT), export_format='GLB', export_apply=True, use_renderable=True,
        export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
        export_draco_position_quantization=16, export_draco_normal_quantization=12,
        export_cameras=False, export_lights=False, export_extras=True)
finally:
    for obj, hidden_render, hidden_view in digits:
        obj.hide_render = hidden_render
        obj.hide_set(hidden_view)
# Do not overwrite the user's existing .blend1 backup when running this pass.
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'assets/console/decrypto-console.blend'))
print('Eight recessed Fresnel lamp assemblies exported; all other assemblies preserved.')
