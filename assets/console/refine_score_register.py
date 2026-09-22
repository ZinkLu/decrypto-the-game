"""Replace the score lamps with four recessed, twin-flag registers.

blender -b -t 1 --factory-startup assets/console/decrypto-console.blend --python assets/console/refine_score_register.py
The eight named pivots remain independent in the GLB for physical score changes.
"""
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from console_parts import box, ring

SPEC = json.loads((ROOT / 'web/src/components/console/scoreRegister.json').read_text())
SURFACE = json.loads((ROOT / 'web/public/models/console-surfaces.json').read_text())['score']
PREFIX = 'ScoreRegister_'
plate = bpy.data.objects['Front_score enamel bed']

# Keep the original editable plate and its earlier modifiers. Only this pass's
# four window cutters and register assemblies are replaced on subsequent runs.
for mod in list(plate.modifiers):
    if mod.name.startswith(PREFIX):
        plate.modifiers.remove(mod)
for obj in list(bpy.data.objects):
    if obj.name.startswith((PREFIX, 'ScoreFlag_', 'ScoreLamp_', 'Interaction_lamp ', 'Interaction_lens diffuser ')):
        bpy.data.objects.remove(obj, do_unlink=True)


def linear_color(value):
    rgb = [int(value[i:i+2], 16) / 255 for i in (1, 3, 5)]
    return tuple(v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in rgb)


def material(name, color, roughness=.65, metalness=0, alpha=1):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.node_tree.nodes.clear()
    bs = mat.node_tree.nodes.new('ShaderNodeBsdfPrincipled')
    out = mat.node_tree.nodes.new('ShaderNodeOutputMaterial')
    mat.node_tree.links.new(bs.outputs['BSDF'], out.inputs['Surface'])
    bs.inputs['Base Color'].default_value = (*linear_color(color), 1)
    bs.inputs['Roughness'].default_value = roughness
    bs.inputs['Metallic'].default_value = metalness
    bs.inputs['Alpha'].default_value = alpha
    bs.inputs['Specular IOR Level'].default_value = .2
    mat.diffuse_color = (*linear_color(color), alpha)
    if alpha < 1:
        mat.surface_render_method = 'DITHERED'
    return mat


mats = {name: material('Score register ' + name, color,
                      .82 if name == 'faceplate' else .52 if name in ['frame', 'axle'] else .69,
                      .35 if name == 'faceplate' else .55 if name in ['frame', 'axle'] else .04)
        for name, color in SPEC['materials'].items()}
mats['edge'] = material('Score register folded edge', '#555d53', .57, .42)
mats['seat'] = material('Score register bearing seat', '#202720', .86, .02)
mats['ivory'].node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value = .59
mats['axle'].node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value = .44
plate.data.materials.clear()
plate.data.materials.append(mats['faceplate'])
glass = material('Score register cover glass', '#dce0d4', .32, 0, .055)
sx, sy = SURFACE['w'] / SPEC['canvas'][0], SURFACE['h'] / SPEC['canvas'][1]
z = SURFACE['z']
ww, wh = SPEC['aperture'][0] * sx, SPEC['aperture'][1] * sy
fw, fh = SPEC['frame'][0] * sx, SPEC['frame'][1] * sy
bw, bh = SPEC['flag'][0] * sx, SPEC['flag'][1] * sy
axis_z, back_z = z - SPEC['pivotInset'], z - SPEC['backInset']
assert axis_z + math.hypot(bh / 2, .014) < z + SPEC['glassOffset'] - .0015
assert axis_z - math.hypot(bh / 2, .014) > back_z


def attach(obj, parent):
    bpy.context.view_layer.update()
    world = obj.matrix_world.copy()
    obj.parent = parent
    obj.matrix_world = world
    return obj


def shaft(name, x, y, radius, length, mat):
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=radius, depth=length,
                                      location=(x, -axis_z, y), rotation=(0, math.pi / 2, 0))
    obj = bpy.context.object
    obj.name = PREFIX + name
    obj.data.materials.append(mat)
    bevel = obj.modifiers.new('Turned collar edges', 'BEVEL')
    bevel.width, bevel.segments = .0012, 2
    for p in obj.data.polygons:
        p.use_smooth = True
    return obj


# Small baked contact pools under the bearing feet work at every render quality,
# without refreshing the entire console's shadow map for each moving flag.
contact = material('Score register mounting occlusion', SPEC['materials']['well'], .9)
bs = contact.node_tree.nodes.get('Principled BSDF')
colors = contact.node_tree.nodes.new('ShaderNodeVertexColor')
colors.layer_name = 'Contact'
contact.node_tree.links.new(colors.outputs['Color'], bs.inputs['Base Color'])


def foot_contact(name, x, y):
    vertices, faces, values = [], [], []
    for radius, shade in [(0, .48), (.45, .52), (.72, .8), (1, 1)]:
        for i in range(24):
            a = i * math.tau / 24
            vertices.append((x + .026 * radius * math.cos(a), -(back_z + .0006),
                             y + .047 * radius * math.sin(a)))
            values.append((*[v * shade for v in linear_color(SPEC['materials']['well'])], 1))
    for row in range(3):
        for i in range(24):
            j = (i + 1) % 24
            faces.append((row * 24 + i, (row + 1) * 24 + i, (row + 1) * 24 + j, row * 24 + j))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    attr = mesh.color_attributes.new(name='Contact', type='FLOAT_COLOR', domain='POINT')
    for entry, value in zip(attr.data, values):
        entry.color = value
    obj = bpy.data.objects.new(PREFIX + 'contact ' + name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(contact)


for row, team in enumerate(['A', 'B']):
    for col, category in enumerate(['intercept', 'failure']):
        name = f'{team}_{category}'
        x = SURFACE['x'] + (SPEC['columns'][col] - SPEC['canvas'][0] / 2) * sx
        y = SURFACE['y'] + (SPEC['canvas'][1] / 2 - SPEC['rows'][row]) * sy
        cutter = box(PREFIX + 'cut ' + name, x, y, z - .08, ww, wh, .5, plate.data.materials[0], .012)
        # Apply the cutter's rounded corners before referencing it in a Boolean.
        bpy.context.view_layer.objects.active = cutter
        for mod in list(cutter.modifiers):
            bpy.ops.object.modifier_apply(modifier=mod.name)
        cut = plate.modifiers.new(PREFIX + 'aperture ' + name, 'BOOLEAN')
        cut.operation, cut.solver, cut.object = 'DIFFERENCE', 'EXACT', cutter
        cutter.hide_render = True
        cutter.hide_set(True)
        cutter.display_type = 'WIRE'

        # A single thin rim encloses both counters. The open well, rather than
        # a black decal, produces the depth behind the faceplate.
        rim = ring(PREFIX + 'rim ' + name, x, y, [
            (fw, fh, .022, z - .006), (fw, fh, .022, z + .012),
            (fw - .018, fh - .018, .018, z + .018),
            (ww + .003, wh + .003, .013, z + .018),
            (ww - .009, wh - .009, .010, z + .004),
            (ww - .009, wh - .009, .010, z - .007),
        ], mats['frame'])
        for polygon in rim.data.polygons:
            polygon.use_smooth = False
        ring(PREFIX + 'well ' + name, x, y, [
            (ww, wh, .011, z + .003), (ww - .011, wh - .011, .009, z + .002),
            (ww - .011, wh - .011, .009, back_z), (ww, wh, .011, back_z),
        ], mats['well'])
        box(PREFIX + 'back ' + name, x, y, back_z - .006, ww, wh, .012, mats['well'], .006)
        # The partition stops behind the blades, so it cannot mask their marks
        # when the user inspects the deep register from an oblique angle.
        divider_front = axis_z - .022
        box(PREFIX + 'divider ' + name, x, y, (divider_front + back_z) / 2, .020, wh - .008,
            divider_front - back_z, mats['well'], .003)
        box(PREFIX + 'glass ' + name, x, y, z + SPEC['glassOffset'], ww - .010, wh - .010,
            .003, glass, .004)

        for k in range(2):
            key = f'{name}_{k}'
            cx = x + (k - .5) * SPEC['pitch'] * sx
            shaft('axle ' + key, cx, y, .007, bw + .047, mats['axle'])
            # The back's cream enamel and printed symbol are actual thin meshes.
            # Rotating the parent 180 degrees exposes them together.
            pivot = bpy.data.objects.new('ScoreFlag_' + key, None)
            bpy.context.collection.objects.link(pivot)
            pivot.location = (cx, -axis_z, y)
            pivot['score_flag'] = key
            pivot['travel_degrees'] = 180
            attach(box(PREFIX + 'blade ' + key, cx, y, axis_z, bw, bh, .020,
                       mats['blade'], .005), pivot)
            # A folded sheet-metal hem wraps both faces. Only the small bevel
            # catches light; the broad charcoal and enamel faces stay matte.
            for face in [-1, 1]:
                hem = ring(PREFIX + f'folded edge {key}_{face}', cx, y, [
                    (bw - .001, bh - .001, .005, axis_z + face * .007),
                    (bw - .003, bh - .003, .0045, axis_z + face * .0102),
                    (bw - .009, bh - .009, .0035, axis_z + face * .0106),
                    (bw - .013, bh - .013, .003, axis_z + face * .0095),
                ], mats['edge'])
                for p in hem.data.polygons:
                    p.use_smooth = False
                attach(hem, pivot)
            attach(box(PREFIX + 'enamel ' + key, cx, y, axis_z - .0112,
                       bw - .012, bh - .012, .0024, mats['ivory'], .005), pivot)
            angles = [0] if category == 'intercept' else [-math.pi / 4, math.pi / 4]
            for i, angle in enumerate(angles):
                mark = box(PREFIX + f'mark {key}_{i}', cx, y, axis_z - .013,
                           .028, bh * .60, .0012, mats[category], .002)
                mark.rotation_euler.y = angle
                attach(mark, pivot)
            # Turned bushings sit in brackets connected to the well's back.
            # Dark seating rings reveal the axle contact without painted grime.
            for side in [-1, 1]:
                bx = cx + side * (bw / 2 + .016)
                foot_contact(f'{key}_{side}', bx, y)
                box(PREFIX + f'mount foot {key}_{side}', bx, y, back_z + .010,
                    .030, .062, .020, mats['blade'], .004)
                box(PREFIX + f'bearing {key}_{side}', bx, y, (axis_z + back_z + .022) / 2,
                    .018, .038, axis_z - back_z - .022, mats['blade'], .004)
                shaft(f'bushing {key}_{side}', bx, y, .017, .014, mats['edge'])
                shaft(f'seat {key}_{side}', bx - side * .008, y, .012, .0025, mats['seat'])
                shaft(f'collar {key}_{side}', bx - side * .010, y, .009, .003, mats['axle'])

plate['score_register'] = 'bistable-twin-flags'
bpy.context.view_layer.update()
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
print('Four recessed twin registers, eight independent flags and forty room-code digits exported.')
