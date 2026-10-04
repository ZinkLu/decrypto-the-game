"""English hardware legends, a top-side bat toggle and a less crowded instrument layout.

Run after refine_front_layout.py against the current editable scene. Existing
parts retain their animation names. Baseline transforms make this pass repeatable;
the vent cutters remain editable in Blender and are excluded from the GLB.
"""
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from console_parts import material, box, ring, cylinder, finish

OUT = ROOT / 'web/public/models'
P = 'PanelRefine_'
scene = bpy.context.scene
manifest = json.loads((OUT / 'console-surfaces.json').read_text())
if 'panel_layout_base_surfaces' not in scene:
    scene['panel_layout_base_surfaces'] = json.dumps(manifest)
surfaces = json.loads(scene['panel_layout_base_surfaces'])


def remove(obj):
    bpy.data.objects.remove(obj, do_unlink=True)


for obj in list(bpy.data.objects):
    for mod in list(obj.modifiers):
        if mod.name.startswith(P):
            obj.modifiers.remove(mod)
    if obj.name.startswith(P):
        remove(obj)
    elif 'panel_layout_base_matrix' in obj:
        values = obj['panel_layout_base_matrix']
        obj.matrix_world = Matrix([values[i:i+4] for i in range(0, 16, 4)])
for collection in list(bpy.data.collections):
    if collection.name.startswith(P):
        bpy.data.collections.remove(collection)
bpy.context.view_layer.update()


def transform(obj, matrix):
    if 'panel_layout_base_matrix' not in obj:
        obj['panel_layout_base_matrix'] = [v for row in obj.matrix_world for v in row]
    obj.matrix_world = matrix @ obj.matrix_world


def move(objects, dx=0, dy=0, dz=0):
    names = {obj.name for obj in objects}
    matrix = Matrix.Translation((dx, -dz, dy))
    for obj in objects:
        if not obj.parent or obj.parent.name not in names:
            transform(obj, matrix)
    bpy.context.view_layer.update()


def matching(*prefixes):
    return [obj for obj in bpy.data.objects if obj.name.startswith(prefixes)]


def surface_shift(names, dx=0, dy=0, dz=0):
    for name in names:
        for key, delta in [('x', dx), ('y', dy), ('z', dz)]:
            surfaces[name][key] += delta


def attach(obj, parent):
    bpy.context.view_layer.update()
    world = obj.matrix_world.copy()
    obj.parent = parent
    obj.matrix_world = world


INK = bpy.data.materials['Instrument legends']
NICKEL = bpy.data.materials['Tactile brushed nickel']
PANEL = bpy.data.materials['Uniform satin body alloy'] if 'Uniform satin body alloy' in bpy.data.materials else bpy.data.objects['Scope panel'].data.materials[0]
BLACK = material('Panel charcoal polymer', (.021, .029, .026), 0, .62)
CREAM = material('Panel ivory legends', (.72, .67, .54), 0, .65)
RED = bpy.data.materials['Launch worn red resin']


def label(name, body, x, y, z, size=.12, mat=INK, top=False):
    bpy.ops.object.text_add(location=(x, -z, y), rotation=(0, 0, 0) if top else (math.pi/2, 0, 0))
    obj = bpy.context.object
    obj.name = name
    obj.data.body = body
    obj.data.align_x = obj.data.align_y = 'CENTER'
    obj.data.size = size
    obj.data.space_character = 1.13
    obj.data.extrude = .0006
    obj.data.materials.append(mat)
    bpy.ops.object.convert(target='MESH')
    return obj


# Room identification gets its own breathing room above the score instrument.
move(matching('Interaction_channel', 'Tactile_copy socket', 'ChannelCopy'), dy=.14)
surface_shift(['channel', 'channelCopy'], dy=.14)
move(matching('Score bezel', 'Front_score', 'ScoreLamp_', 'Interaction_lamp', 'Interaction_lens diffuser'), dy=-.33)
surface_shift(['score'], dy=-.33)

# Bring the complete printer (including the nip, bearing caps, teeth, and paper)
# towards the VU meter; move the live paper surface by precisely the same amount.
move(matching('Printer', 'Paper roller', 'PaperFeed', 'Interaction_paper',
              'Interaction_tear', 'Tactile_paper retaining'), dx=.15, dy=-.60)
surface_shift(['paper'], dx=.15, dy=-.60)
move(matching('Tactile_meter', 'Tactile_Meter', 'ReceiverNeedle', 'MeterAmplitude', 'MeterRate'), dy=.12)
surface_shift(['MeterAmplitudeControl', 'MeterRateControl'], dy=.12)
move(matching('TransmitLever', 'Tactile_transmit socket', 'Tactile_transmit brushed collar'), dy=.18)
surface_shift(['transmitLabel', 'transmitControl'], dy=.18)

# Replace all remaining Chinese modeled legends. Live words and screen textures
# are deliberately independent of these manufactured labels.
for name in ['Tactile_room code label', 'Tactile_printer emboss',
             'Tactile_MeterAmplitude legend', 'Tactile_MeterRate legend']:
    if obj := bpy.data.objects.get(name):
        remove(obj)
label('Tactile_room code label', 'ROOM CODE', 5.56, 4.57, .568, .145)
label('Tactile_printer emboss', 'MESSAGE RECORDER', 5.83, .86, .568, .12)
label('Tactile_MeterAmplitude legend', 'LEVEL', 5.24, -2.73, .568, .11)
label('Tactile_MeterRate legend', 'RATE', 6.42, -2.73, .568, .11)

# A bat toggle reads as a switch at a glance; the old tilted plank read as a
# seesaw. The foil plate and stilted bushing perched on the deck like a toy, so
# the mount now grows out of the casing: a solid plinth half-sunk into the
# deck, a ring nut threaded onto a bushing that runs down into the body, and
# the pivot ball nesting inside the bores. The plinth, nut, bushing and collar
# stay fixed while the ball, bat and red tip swing the same 32-degree throw,
# the bat's stem working inside the open bores.
for name in ['Power socket', 'Power rocker', 'PowerSwitch']:
    if obj := bpy.data.objects.get(name):
        remove(obj)


def vcylinder(name, x, y, z, radius, depth, mat, vertices=40, bevel=.008, smooth=True):
    # Vertical (console-up) cylinder; console_parts.cylinder lies along depth.
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=(x, -z, y))
    obj = finish(bpy.context.object, name, mat, bevel)
    for polygon in obj.data.polygons:
        polygon.use_smooth = smooth and len(polygon.vertices) == 4
    return obj


plate = box(P+'power legend plate', 5.83, 5.40, -.92, 1.30, .13, .66, BLACK, .025)
# The swinging stem passes through a real hole in the plinth, the same way the
# bushing would be mounted through a drilled panel.
plate_bore = vcylinder(P+'power plate bore', 5.83, 5.40, -.92, .18, .18, BLACK, bevel=0, smooth=False)
plate_bore.hide_render, plate_bore.display_type = True, 'WIRE'
plate_bore.hide_set(True)
mod = plate.modifiers.new(P+'plate bore', 'BOOLEAN')
mod.operation, mod.object, mod.solver = 'DIFFERENCE', plate_bore, 'EXACT'
label(P+'power mark I', 'I', 5.43, 5.467, -.92, .16, CREAM, top=True)
label(P+'power mark O', 'O', 6.23, 5.467, -.92, .15, CREAM, top=True)
# The hex nut is a real ring threaded on the bushing, its bore deep enough to
# swallow the pivot ball at rest.
nut = vcylinder(P+'power hex nut', 5.83, 5.455, -.92, .24, .13, NICKEL, vertices=6, bevel=.012, smooth=False)
nut_bore = vcylinder(P+'power nut bore', 5.83, 5.455, -.92, .155, .20, BLACK, bevel=0, smooth=False)
nut_bore.hide_render, nut_bore.display_type = True, 'WIRE'
nut_bore.hide_set(True)
mod = nut.modifiers.new(P+'nut bore', 'BOOLEAN')
mod.operation, mod.object, mod.solver = 'DIFFERENCE', nut_bore, 'EXACT'
# The bushing threads through the nut and disappears into the casing; only a
# short barrel and the collar stand above the nut. Its bore runs well below
# the deck and is closed by a dark base.
bushing = vcylinder('Power socket', 5.83, 5.3925, -.92, .15, .305, NICKEL)
bore = vcylinder(P+'power bore cutter', 5.83, 5.50, -.92, .138, .20, BLACK, bevel=0, smooth=False)
bore.hide_render, bore.display_type = True, 'WIRE'
bore.hide_set(True)
mod = bushing.modifiers.new(P+'power bore', 'BOOLEAN')
mod.operation, mod.object, mod.solver = 'DIFFERENCE', bore, 'EXACT'
vcylinder(P+'power bore base', 5.83, 5.385, -.92, .128, .03, BLACK, bevel=0)
bpy.ops.mesh.primitive_torus_add(major_radius=.155, minor_radius=.022, major_segments=44,
                                 minor_segments=10, location=(5.83, .92, 5.545))
finish(bpy.context.object, P+'power collar', NICKEL)
for polygon in bpy.context.object.data.polygons:
    polygon.use_smooth = True
angle = math.radians(16)
# The bat pivots below the collar rim, nested in the nut and bushing bores,
# and rests tipped 16 degrees towards the I legend: runtime rotation.z=0 is
# ON, and -throw_degrees swings it onto O.
pivot = Vector((5.83, .92, 5.53))
mount = Matrix.Translation(pivot) @ Matrix.Rotation(-angle, 4, 'Y')


def toggle_part(name, up, mat, bevel=0):
    obj = finish(bpy.context.object, name, mat, bevel)
    for polygon in obj.data.polygons:
        polygon.use_smooth = len(polygon.vertices) == 4
    obj.matrix_world = mount @ Matrix.Translation((0, 0, up))
    return obj


bpy.ops.mesh.primitive_uv_sphere_add(segments=40, ring_count=20, radius=.075)
ball = toggle_part(P+'power pivot ball', 0, NICKEL)
# A real bat is stubby: only a short neck shows between the collar and the
# grip. The parts are modeled at their final length: squashing the tilted
# assembly after the fact sheared the red cap off the tip axis.
bpy.ops.mesh.primitive_cone_add(vertices=40, radius1=.060, radius2=.064, depth=.26)
bat = toggle_part(P+'power bat', .10, NICKEL)
bpy.ops.mesh.primitive_cylinder_add(vertices=36, radius=.070, depth=.13)
tip = toggle_part(P+'power tip', .245, RED, .018)
bpy.ops.mesh.primitive_uv_sphere_add(segments=36, ring_count=18, radius=.070)
cap = toggle_part(P+'power tip cap', .31, RED)
switch = bpy.data.objects.new('PowerSwitch', None)
bpy.context.collection.objects.link(switch)
switch.location = pivot
switch['throw_degrees'] = 32
switch['short_bat'] = True
for obj in [ball, bat, tip, cap]:
    attach(obj, switch)
# A fixed hit region covers both positions instead of shrinking to an edge-on plane.
surfaces.pop('power', None)
surfaces['powerControl'] = dict(x=5.83, y=5.80, z=-.92, w=1.50, h=1.30)
assert (mount.to_3x3() @ Vector((0, 0, 1))).z > .9, 'Bat must point upwards'
surfaces.pop('powerLegend', None)
label(P+'power legend', 'POWER', 5.83, 5.372, -.40, .15, CREAM, top=True)

# The roster's backing ends just below its last seat. The monitor backing moves
# upwards too, leaving a deliberate seam between these two removable plates.
for name in ['Receiver column', 'Receiver column seam']:
    obj = bpy.data.objects[name]
    low, high = -1.28, 4.73
    old_height = 6.38
    scale = (high-low)/old_height
    m = Matrix.Translation((0, 0, (high+low)/2)) @ Matrix.Diagonal((1, 1, scale, 1)) @ Matrix.Translation((0, 0, -1.54))
    transform(obj, m)
for name in ['Scope panel', 'Scope panel seam']:
    obj = bpy.data.objects[name]
    m = Matrix.Translation((0, 0, -2.76)) @ Matrix.Diagonal((1, 1, 2.46/1.96, 1)) @ Matrix.Translation((0, 0, 3.14))
    transform(obj, m)

# Shorten the small CRT slightly and raise it; controls now occupy a clear row
# below the tube instead of being trapped between its hood and the main screen.
crt = [bpy.data.objects[name] for name in ['Scope rim', 'Scope gasket', 'Instrument_scope backing', 'Interaction_scope glass']]
m = Matrix.Translation((0, 0, -2.38)) @ Matrix.Diagonal((1, 1, .90, 1)) @ Matrix.Translation((0, 0, 3.08))
for obj in crt:
    transform(obj, m)
surfaces['scope'].update(y=-2.38, h=surfaces['scope']['h']*.90)

control_groups = [
    ('ScopeTuning', ('ScopeDetail_dial', 'ScopeDetail_mode index'), -5.45, -3.05, -6.96, -3.47, .61),
    ('ScopeRate', ('ScopeDetail_rate',), -5.42, -2.46, -6.13, -3.47, .40),
    ('ScopePersistence', ('ScopeDetail_persistence',), -5.16, -3.54, -5.47, -3.47, .40),
]
for name, prefixes, old_x, old_y, x, y, hit in control_groups:
    # Labels get their own clear baseline beneath the dials.
    objects = [obj for obj in matching(name, *prefixes) if not obj.name.endswith('label')]
    move(objects, dx=x-old_x, dy=y-old_y, dz=.08)
    surface = {'ScopeTuning':'scopeKnob', 'ScopeRate':'scopeRateKnob', 'ScopePersistence':'scopePersistenceKnob'}[name]
    surfaces[surface] = dict(x=x, y=y, z=1.08, w=hit, h=hit)

for name in ['ScopeDetail_monitor label', 'ScopeDetail_rate label', 'ScopeDetail_level label',
             'ScopeDetail_persistence label', 'ScopeDetail_input label', 'ScopeDetail_trace label']:
    if obj := bpy.data.objects.get(name):
        remove(obj)
label('ScopeDetail_monitor label', 'VECTOR MONITOR', -6.48, -1.60, .574, .095)
for word, x in [('MODE', -6.96), ('TIME', -6.13), ('PERSIST', -5.47)]:
    label(P+'scope '+word, word, x, -3.88, .574, .075)
move(matching('ScopeDetail_input', 'Instrument_BNC'), dx=.05, dy=1.36)
move(matching('ScopeDetail_trace lamp'), dx=1.96, dy=2.10)
label('ScopeDetail_input label', 'INPUT', -5.38, -2.74, .574, .075)
label('ScopeDetail_trace label', 'RUN', -5.35, -1.66, .574, .065)

# Reroute the coax with a fixed case termination and a loop below the controls.
if obj := bpy.data.objects.get('Instrument_coax lead'):
    remove(obj)
curve = bpy.data.curves.new('Panel coax route', 'CURVE')
curve.dimensions, curve.resolution_u = '3D', 20
curve.bevel_depth, curve.bevel_resolution = .045, 4
spline = curve.splines.new('BEZIER')
points = [(-5.38,-2.42,1.25),(-5.18,-2.77,1.39),(-5.11,-3.58,1.26),
          (-5.42,-4.15,1.28),(-6.51,-4.18,1.31),(-7.44,-4.12,1.16),
          (-8.16,-4.20,.50),(-8.39,-3.80,-.68),(-8.35,-3.13,-1.57),(-8.03,-2.67,-1.65)]
spline.bezier_points.add(len(points)-1)
for point, (x,y,z) in zip(spline.bezier_points, points):
    point.co = (x,-z,y)
    point.handle_left_type = point.handle_right_type = 'AUTO'
obj = bpy.data.objects.new('Instrument_coax lead', curve)
bpy.context.collection.objects.link(obj)
curve.materials.append(BLACK)
bpy.ops.object.select_all(action='DESELECT')
obj.select_set(True)
bpy.context.view_layer.objects.active = obj
bpy.ops.object.convert(target='MESH')

# A quiet graphite key with an ivory legend, without the stacked chrome frames.
manual = bpy.data.objects['ManualKey']
for obj in list(manual.children):
    remove(obj)
if obj := bpy.data.objects.get('Interaction_manual key socket'):
    remove(obj)
ring('Interaction_manual key socket', -6.25, 4.18,
     [(1.99,.75,.065,.555),(1.99,.75,.065,.68),(1.81,.57,.045,.68),(1.81,.57,.045,.57)], BLACK)
attach(box('ManualDetail_charcoal skirt', -6.25, 4.18, .72, 1.80, .56, .20, BLACK, .025), manual)
CAP = material('Manual graphite resin', (.037, .050, .044), 0, .54)
attach(box('ManualDetail_graphite cap', -6.25, 4.18, .864, 1.73, .52, .17, CAP, .045), manual)
surfaces['badge'] = dict(x=-6.25, y=4.18, z=.953, w=1.53, h=.32, lit=True)

# Remove the shallow black rectangles and cut through ALL overlapping skins.
# Rounded cutters reveal actual side walls; the dark plenum sits .5 units back.
for obj in list(bpy.data.objects):
    if obj.name.startswith('Vent slot'):
        remove(obj)
cutters = bpy.data.collections.new(P+'vent cutters')
scene.collection.children.link(cutters)
for i in range(11):
    cutter = box(P+f'vent cutter {i:02}', .16+i*.215, -4.65, .08, .092, .38, 1.45, BLACK, .025)
    for col in list(cutter.users_collection):
        col.objects.unlink(cutter)
    cutters.objects.link(cutter)
    cutter.hide_render = True
    cutter.display_type = 'WIRE'
    cutter.hide_set(True)
for name in ['Power rail', 'Power rail seam', 'Front enamel', 'Chassis']:
    obj = bpy.data.objects[name]
    mod = obj.modifiers.new(P+'machined vent openings', 'BOOLEAN')
    mod.operation, mod.operand_type, mod.collection = 'DIFFERENCE', 'COLLECTION', cutters
    mod.solver = 'EXACT'
    # These remain live modifiers in the source file; glTF exports the result.
    bevel = obj.modifiers.new(P+'cut edge highlight', 'BEVEL')
    bevel.width, bevel.segments = .012, 3
box(P+'vent plenum', 1.235, -4.65, -.64, 2.44, .60, .07, BLACK, .03)

bpy.context.view_layer.update()
# Verify the visible geometry, not just the existence of a Boolean modifier.
# Rays down every aperture must clear the four overlapping face skins for at
# least a full unit of depth, while a ray between slots still meets the face.
depsgraph = bpy.context.evaluated_depsgraph_get()
for name in ['Power rail', 'Power rail seam', 'Front enamel', 'Chassis']:
    obj = bpy.data.objects[name].evaluated_get(depsgraph)
    inverse = obj.matrix_world.inverted()
    direction = (inverse.to_3x3() @ Vector((0, 1, 0))).normalized()
    for i in range(11):
        origin = inverse @ Vector((.16+i*.215, -2, -4.65))
        hit, point, _, _ = obj.ray_cast(origin, direction)
        assert not hit or -(obj.matrix_world @ point).y < -.60, f'{name}: blocked vent {i}'
    hit, point, _, _ = obj.ray_cast(inverse @ Vector((.2675, -2, -4.65)), direction)
    assert hit and -(obj.matrix_world @ point).y > .30, f'{name}: missing metal between slots'
print('Verified 44 clear aperture rays and four solid bridges between openings.')
from validate_power_clearance import validate_power_clearance
validate_power_clearance()
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/console/decrypto-console.blend'))
bpy.ops.export_scene.gltf(filepath=str(OUT/'decrypto-console.glb'), export_format='GLB', export_apply=True,
    use_renderable=True, export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
    export_draco_position_quantization=16, export_draco_normal_quantization=12,
    export_cameras=False, export_lights=False, export_extras=True)
(OUT/'console-surfaces.json').write_text(json.dumps(surfaces, indent=2)+'\n')
print('Panel layout exported: top bat toggle, clear scope controls, real vents, English legends.')
