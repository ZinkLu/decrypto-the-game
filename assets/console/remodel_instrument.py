"""Structural pass on the editable scene; never rebuild the hand-made assemblies.

Run last, after refine_scope.py and refine_console.py. Idempotent. Coordinates
are the frontend convention: x right, y up, z towards the viewer.
"""
import math
from pathlib import Path

import bmesh
import bpy

ROOT = Path(__file__).resolve().parents[2]
PREFIX = "Instrument_"


def remove(name):
    if obj := bpy.data.objects.get(name):
        bpy.data.objects.remove(obj, do_unlink=True)


for obj in list(bpy.data.objects):
    if obj.name.startswith(PREFIX):
        bpy.data.objects.remove(obj, do_unlink=True)


def material(name, color, metal=0, roughness=.45):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    for key, value in [('Base Color', (*color, 1)), ('Metallic', metal), ('Roughness', roughness)]:
        bsdf.inputs[key].default_value = value
    return mat


IVORY = material('Porcelain enamel', (.61, .565, .455), .12, .37)
EDGE = material('Warm enamel edge', (.37, .345, .28), .18, .43)
SHELL = material('Instrument powdercoat', (.055, .085, .09), .28, .58)
PANEL = material('Instrument anodized face', (.47, .485, .43), .38, .42)
NICKEL = material('Satin nickel', (.47, .49, .46), .82, .29)
BLACK = material('Recess rubber', (.012, .018, .018), 0, .64)
RED = material('Vermilion bakelite', (.36, .029, .015), .07, .29)
INK = material('Instrument legends', (.028, .039, .035), 0, .72)
CREAM = material('Instrument dial marks', (.75, .69, .55), .04, .44)


def finish(obj, name, mat, bevel=0):
    obj.name = name
    obj.data.materials.append(mat)
    if bevel:
        mod = obj.modifiers.new('Manufactured edge radius', 'BEVEL')
        mod.width = bevel
        mod.segments = 4
        mod = obj.modifiers.new('Face-weighted normals', 'WEIGHTED_NORMAL')
        mod.keep_sharp = True
    return obj


def box(name, x, y, z, w, h, d, mat, bevel=.025):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x, -z, y))
    obj = bpy.context.object
    obj.dimensions = (w, d, h)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, name, mat, bevel)


def cylinder(name, x, y, z, radius, depth, mat, vertices=48):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth,
                                      location=(x, -z, y), rotation=(math.pi / 2, 0, 0))
    return finish(bpy.context.object, name, mat, min(.012, depth / 5))


def ring(name, x, y, profiles, mat, segments=12):
    """A watertight cast surround, not four intersecting bars or a solid slab.

    Successive rounded-rectangle profiles (w, h, radius, z) trace the section
    from outer rear to outer lip, across the chamfer and down the inner wall.
    """
    vertices, faces = [], []
    for w, h, radius, z in profiles:
        for cx, cy, start in [(w/2-radius, h/2-radius, 0),
                              (-w/2+radius, h/2-radius, 90),
                              (-w/2+radius, -h/2+radius, 180),
                              (w/2-radius, -h/2+radius, 270)]:
            for i in range(segments + 1):
                a = math.radians(start + i * 90 / segments)
                vertices.append((x + cx + radius * math.cos(a), -z,
                                 y + cy + radius * math.sin(a)))
    count = 4 * (segments + 1)
    for j in range(len(profiles)):
        for i in range(count):
            n, k = (i + 1) % count, (j + 1) % len(profiles)
            faces.append((j*count+i, j*count+n, k*count+n, k*count+i))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    for p in mesh.polygons:
        p.use_smooth = True
    return finish(obj, name, mat)


def screw(name, x, y, z, radius=.055):
    cylinder(PREFIX + name + ' washer', x, y, z-.016, radius*1.32, .015, EDGE)
    cylinder(PREFIX + name + ' head', x, y, z+.004, radius, .036, NICKEL)
    slot = box(PREFIX + name + ' slot', x, y, z+.024, radius*1.4, .013, .006, INK, .002)
    slot.rotation_euler[1] = -.34


def label(name, body, x, y, z, size=.07, mat=INK):
    bpy.ops.object.text_add(location=(x, -z, y), rotation=(math.pi/2, 0, 0))
    obj = bpy.context.object
    obj.name = PREFIX + name
    obj.data.body = body
    obj.data.align_x = 'CENTER'
    obj.data.align_y = 'CENTER'
    obj.data.size = size
    obj.data.space_character = 1.22
    obj.data.materials.append(mat)
    bpy.ops.object.convert(target='MESH')
    return obj


# The old 1.1-deep slab becomes a folded sleeve with a rear cover and a removable
# front casting. The top and sides are exposed by the runtime inspection angle.
remove('Chassis')
box('Chassis', 0, 0, -1.17, 16.04, 10.74, 3.05, SHELL, .29)
ring(PREFIX+'rear cover seam', 0, 0,
     [(16.09,10.79,.30,-2.55), (16.09,10.79,.30,-2.47),
      (15.97,10.67,.26,-2.47), (15.97,10.67,.26,-2.55)], BLACK)
ring(PREFIX+'front perimeter seal', 0, 0,
     [(16.06,10.76,.30,.28), (16.06,10.76,.30,.43),
      (15.51,10.21,.22,.43), (15.51,10.21,.22,.28)], BLACK)
ring(PREFIX+'rolled perimeter casting', 0, 0,
     [(15.90,10.61,.29,.37), (15.88,10.59,.29,.53),
      (15.67,10.38,.25,.60), (15.53,10.24,.23,.49)], NICKEL)

# The surrounding instrument banks are anodized alloy; the CRT and decoder
# carrier are warm cast enamel. Different materials now describe different jobs.
for name in ['Receiver column', 'Archive column', 'Scope panel', 'Power rail']:
    obj = bpy.data.objects.get(name)
    obj.data.materials.clear()
    obj.data.materials.append(PANEL)

# Louvres have a dark inset and a raised folded metal hood, not painted stripes.
for i in range(23):
    x = -5.7 + i * .32
    box(PREFIX+f'top vent well {i}', x, 5.367, -1.36, .14, .018, 1.42, BLACK, .009)
    box(PREFIX+f'top louvre {i}', x+.035, 5.386, -1.36, .08, .04, 1.43, SHELL, .013)
for side in [-1, 1]:
    for i in range(12):
        y = -2.60 + i * .45
        box(PREFIX+f'side vent well {side} {i}', side*8.018, y, -1.45,
            .018, .19, 1.38, BLACK, .009)
        box(PREFIX+f'side louvre {side} {i}', side*8.033, y+.043, -1.45,
            .04, .10, 1.40, SHELL, .012)
    for y in [-4.73, 4.73]:
        box(PREFIX+f'corner shoe {side} {y}', side*7.85, y, -2.53,
            .63, .95, .56, BLACK, .13)
    box(PREFIX+f'lower foot {side}', side*6.35, -5.45, -1.48, 1.45, .29, 1.30, BLACK, .10)

# A continuous hood slopes inward to the display. The live screen stays at .909;
# the front lip is .4 units proud of it, so its interior catches real shadows.
for name in ['Screen outer frame', 'Screen nickel lip', 'Screen gasket']:
    remove(name)
ring('Screen outer frame', -.45, .3,
     [(9.10,5.69,.28,.53), (9.10,5.69,.28,1.18),
      (9.02,5.61,.27,1.29), (8.81,5.40,.24,1.31),
      (8.48,5.07,.22,1.03), (8.45,5.04,.20,.86)], IVORY)
ring('Screen nickel lip', -.45, .3,
     [(9.115,5.705,.29,.59), (9.115,5.705,.29,.66),
      (9.085,5.675,.28,.67), (9.085,5.675,.28,.59)], NICKEL)
ring('Screen gasket', -.45, .3,
     [(8.50,5.09,.22,1.015), (8.45,5.04,.20,.96),
      (8.31,4.90,.18,.914), (8.31,4.90,.18,.87)], BLACK)
box(PREFIX+'CRT backing', -.45, .3, .88, 8.42, 5.01, .04, BLACK, .16)
for i, (x, y) in enumerate([(-4.79,2.97),(3.89,2.97),(-4.79,-2.37),(3.89,-2.37)]):
    remove(f'ConsoleDetail_main screen fastener {i} head')
    remove(f'ConsoleDetail_main screen fastener {i} slot')
    screw('CRT captive bolt '+str(i), x, y, 1.275, .048)

# Ruby filter cartridges: thick dark phenolic carriers with a slender bright
# metal retainer. Preserve word-plane coordinates and their conceal/reveal UI.
for i, x in enumerate([-3.83, -1.58, .67, 2.92]):
    remove('Optical bezel '+str(i))
    remove('Optical gasket '+str(i))
    ring('Optical bezel '+str(i), x, 3.9,
         [(2.14,1.48,.12,.55),(2.14,1.48,.12,1.04),
          (2.06,1.40,.10,1.105),(1.87,1.17,.09,.96),
          (1.84,1.14,.085,.82)], BLACK, 8)
    ring('Optical gasket '+str(i), x, 3.9,
         [(2.10,1.44,.11,1.07),(2.09,1.43,.10,1.10),
          (2.04,1.38,.10,1.10),(2.04,1.38,.10,1.07)], NICKEL, 8)
    for side in [-1,1]:
        screw(f'filter retainer {i} {side}', x+side*.963, 4.51, 1.082, .032)
    label(f'filter id {i}', f'0{i+1}', x, 3.255, 1.112, .072, CREAM)

# Recess the small CRT with the same manufacturing language as the main hood.
for name in ['Scope rim','Scope gasket']:
    remove(name)
for name in ['bezel top','bezel bottom','bezel left','bezel right',
             'mask top','mask bottom','mask left','mask right']:
    remove('ScopeDetail_'+name)
ring('Scope rim', -6.48, -3.08,
     [(1.76,1.56,.16,.58),(1.76,1.56,.16,1.04),
      (1.69,1.49,.14,1.12),(1.45,1.23,.10,.97),
      (1.43,1.21,.09,.84)], IVORY)
ring('Scope gasket', -6.48, -3.08,
     [(1.46,1.24,.10,.96),(1.41,1.19,.09,.89),
      (1.37,1.15,.085,.884),(1.37,1.15,.085,.84)], BLACK)
box(PREFIX+'scope backing', -6.48, -3.08, .847, 1.43,1.21,.04,BLACK,.10)

# The concentric dial gains a red fine-adjust hub, like a physical lab instrument.
cap = bpy.data.objects.get('ScopeDetail_dial ivory cap')
cap.data.materials.clear()
cap.data.materials.append(RED)
pointer = bpy.data.objects.get('Knob pointer')
pointer.data.materials.clear()
pointer.data.materials.append(CREAM)

# Replace the flat meter frame with a recessed Bakelite housing around its face.
remove('ConsoleDetail_receiver meter shadow')
remove('ConsoleDetail_receiver meter rim')
ring('ConsoleDetail_receiver meter rim', 5.83, -1.58,
     [(2.24,1.01,.12,.57),(2.24,1.01,.12,.91),
      (2.16,.93,.10,.965),(1.91,.71,.055,.89),
      (1.89,.69,.05,.755)], BLACK, 10)
ring(PREFIX+'meter chrome reveal', 5.83, -1.58,
     [(2.20,.97,.11,.94),(2.20,.97,.11,.958),
      (2.16,.93,.10,.958),(2.16,.93,.10,.94)], NICKEL, 10)

# Lower keyboard is a single removable dark switch tray, with separate keys.
remove('Control deck')
box('Control deck', -.45, -3.49, .49,9.05,1.24,.12,PANEL,.10)
ring(PREFIX+'keyboard surround', -.43, -3.48,
     [(4.46,1.025,.11,.55),(4.46,1.025,.11,.71),
      (4.32,.91,.07,.755),(4.29,.90,.065,.57)], BLACK, 8)
for i in range(5):
    obj = bpy.data.objects.get('Key_'+str(i))
    obj.data.materials.clear()
    obj.data.materials.append(RED if i == 4 else bpy.data.materials['Midnight blue chassis'])
    for j in range(3):
        # The fine horizontal grip ridges belong to each moving key.
        ridge = box(PREFIX+f'key grip {i} {j}', -2.15+i*.86, -3.75+j*.036,
                    .885, .34,.008,.008,BLACK,.002)
        bpy.context.view_layer.update()
        matrix = ridge.matrix_world.copy()
        ridge.parent = obj
        ridge.matrix_world = matrix

# Coax connector and a restrained physical cable loop. The front panel has
# one real termination; the other end exits the case through a lower gland.
cylinder(PREFIX+'BNC barrel', -5.43,-3.78,.94,.077,.32,NICKEL)
cylinder(PREFIX+'BNC strain relief', -5.43,-3.78,1.16,.066,.17,BLACK)
for i in range(5):
    cylinder(PREFIX+f'BNC grip ring {i}',-5.43,-3.78,.845+i*.036,.085,.016,NICKEL)
curve = bpy.data.curves.new(PREFIX+'coax path', 'CURVE')
curve.dimensions = '3D'
curve.resolution_u = 20
curve.bevel_depth = .048
curve.bevel_resolution = 4
spline = curve.splines.new('BEZIER')
points = [(-5.43,-3.78,1.25),(-5.41,-4.05,1.43),(-5.60,-4.30,1.51),
          (-6.22,-4.30,1.51),(-7.07,-4.28,1.53),(-7.61,-4.42,1.18),
          (-8.16,-4.50,.50),(-8.39,-4.10,-.68),(-8.35,-3.13,-1.57),
          (-8.03,-2.67,-1.65)]
spline.bezier_points.add(len(points)-1)
for point, (x,y,z) in zip(spline.bezier_points, points):
    point.co = (x,-z,y)
    point.handle_left_type = point.handle_right_type = 'AUTO'
obj = bpy.data.objects.new(PREFIX+'coax lead', curve)
bpy.context.collection.objects.link(obj)
curve.materials.append(BLACK)
bpy.ops.object.select_all(action='DESELECT')
obj.select_set(True)
bpy.context.view_layer.objects.active = obj
bpy.ops.object.convert(target='MESH')

# Rear service panel. Back-facing parts use negative z; lettering is turned to
# face the back. The sleeve stays intact, with recessed modules mounted on it.
for name in ['BatteryDoor', 'RearSoundSwitch', 'RearTestLamp']:
    remove(name)


def back_label(name, body, x, y, z, size=.10, mat=CREAM):
    obj = label(name, body, x, y, z, size, mat)
    obj.rotation_euler = (math.pi/2, 0, math.pi)
    return obj


def attach(obj, parent):
    bpy.context.view_layer.update()
    matrix = obj.matrix_world.copy()
    obj.parent = parent
    obj.matrix_world = matrix


def back_screw(name, x, y, z=-2.95):
    cylinder(PREFIX+name+' head', x,y,z,.074,.048,NICKEL)
    slot = box(PREFIX+name+' slot',x,y,z-.027,.091,.016,.008,INK,.002)
    slot.rotation_euler[1] = .28


REAR = material('Instrument rear enamel', (.115,.145,.139), .22, .48)
GOLD = material('Instrument contact brass', (.47,.30,.10), .8,.26)
CELL = material('Instrument battery jacket', (.42,.37,.22), .27,.36)
GREEN = material('Instrument test lens', (.11,.38,.19), .05,.26)
ring(PREFIX+'rear panel gasket',0,0,
     [(15.56,10.24,.27,-2.69),(15.56,10.24,.27,-2.87),
      (15.15,9.83,.22,-2.87),(15.15,9.83,.22,-2.69)], BLACK)
box(PREFIX+'rear service cover',0,0,-2.79,15.22,9.90,.18,REAR,.16)
for i,(x,y) in enumerate([(-7.23,4.65),(7.23,4.65),(-7.23,-4.65),(7.23,-4.65),
                         (0,4.65),(0,-4.65),(-7.23,0),(7.23,0)]):
    back_screw('rear captive screw '+str(i),x,y)
back_label('rear wordmark','D E C R Y P T O',4.2,4.05,-2.906,.23)
back_label('rear model','465-D   /   FIELD COMMUNICATION TERMINAL',3.48,3.60,-2.906,.10)
back_label('rear serial','SERIAL  05821  /  TYPE B     •     SERVICE PANEL',-3.65,4.05,-2.906,.10)

# A real perforated grille: each square cell has a circular open bore with
# inside walls. Dark speaker material behind the holes supplies depth.
ring(PREFIX+'speaker frame',4.22,1.35,
     [(4.7,3.73,.20,-2.88),(4.7,3.73,.20,-3.02),
      (4.46,3.49,.15,-3.08),(4.43,3.46,.14,-2.89)],NICKEL)
box(PREFIX+'speaker cloth',4.22,1.35,-2.922,4.43,3.46,.035,BLACK,.10)
vertices, faces = [], []
for row in range(13):
    for col in range(17):
        x, y = 4.22+(col-8)*.252, 1.35+(row-6)*.252
        base = len(vertices)
        for depth, hole in [(-3.041,False),(-3.041,True),(-2.99,True)]:
            for i in range(12):
                a = i*math.tau/12
                r = .075 if hole else .126 / max(abs(math.cos(a)),abs(math.sin(a)))
                vertices.append((x+r*math.cos(a), -depth, y+r*math.sin(a)))
        for i in range(12):
            n=(i+1)%12
            faces.append((base+i,base+n,base+12+n,base+12+i))
            faces.append((base+12+i,base+12+n,base+24+n,base+24+i))
mesh = bpy.data.meshes.new('Perforated speaker grille')
mesh.from_pydata(vertices,[],faces)
mesh.update()
bm=bmesh.new(); bm.from_mesh(mesh)
bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(mesh);bm.free()
obj=bpy.data.objects.new(PREFIX+'perforated speaker grille',mesh)
bpy.context.collection.objects.link(obj);obj.data.materials.append(PANEL)
for i,(x,y) in enumerate([(2.0,3.0),(6.44,3.0),(2.0,-.30),(6.44,-.30)]):
    back_screw('speaker screw '+str(i),x,y,-3.08)
back_label('speaker legend','MONITOR SPEAKER    /    8 Ω',4.22,-.92,-2.906,.12)

# Door hinges at its right edge as seen from behind; four cells remain seated.
ring(PREFIX+'battery well',-3.4,.62,
     [(5.85,4.43,.18,-2.89),(5.85,4.43,.18,-3.24),
      (5.51,4.09,.12,-3.27),(5.49,4.07,.12,-2.91)],BLACK)
box(PREFIX+'battery tray',-3.4,.62,-2.91,5.49,4.07,.045,BLACK,.10)
for i,x in enumerate([-5.29,-4.03,-2.77,-1.51]):
    cell=cylinder(PREFIX+f'battery cell {i}',x,.62,-3.03,.43,2.80,CELL)
    cell.rotation_euler=(0,0,0)
    for end,y in enumerate([-.78,2.02]):
        terminal=cylinder(PREFIX+f'battery terminal {i} {end}',x,y,-3.03,.40,.095,NICKEL)
        terminal.rotation_euler=(0,0,0)
        contact=box(PREFIX+f'battery contact {i} {end}',x,y+(-.11 if end==0 else .11),-2.99,
                    .29,.08,.35,GOLD,.025)
    back_label(f'battery label {i}','D / 1.5 V',x,.62,-3.469,.09,INK)
    back_label(f'battery polarity {i}','+' if i%2==0 else '−',x,1.63,-3.469,.18,INK)
    for j,y in enumerate([-.57,1.82]):
        band=cylinder(PREFIX+f'battery jacket band {i} {j}',x,y,-3.03,.434,.11,BLACK)
        band.rotation_euler=(0,0,0)
    # Individual coil contacts are visible in the lower tray clearance.
    coil=bpy.data.curves.new(PREFIX+f'contact spring {i}','CURVE')
    coil.dimensions='3D';coil.bevel_depth=.018;coil.bevel_resolution=3
    points=coil.splines.new('POLY');points.points.add(80)
    for j,point in enumerate(points.points):
        a=j/80*math.tau*4
        point.co=(x+math.cos(a)*.18,3.035+math.sin(a)*.18,-.90-j/80*.32,1)
    spring=bpy.data.objects.new(PREFIX+f'contact spring {i}',coil)
    bpy.context.collection.objects.link(spring);coil.materials.append(GOLD)
    bpy.ops.object.select_all(action='DESELECT');spring.select_set(True)
    bpy.context.view_layer.objects.active=spring;bpy.ops.object.convert(target='MESH')
    # Raised guides and alternating contacts show how the cartridge is assembled.
    box(PREFIX+f'battery divider {i}',x-.53,.62,-3.10,.045,3.30,.22,REAR,.014)
door=bpy.data.objects.new('BatteryDoor',None)
bpy.context.collection.objects.link(door)
door.location=(-6.25,3.50,.62)
attach(box(PREFIX+'battery door',-3.4,.62,-3.53,5.64,4.23,.15,REAR,.10),door)
attach(ring(PREFIX+'battery door seal',-3.4,.62,
            [(5.48,4.07,.10,-3.45),(5.48,4.07,.10,-3.42),
             (5.22,3.81,.08,-3.42),(5.22,3.81,.08,-3.45)],BLACK),door)
for i in range(6):
    attach(box(PREFIX+f'battery door grip {i}',-.96,-.37+i*.11,-3.624,.30,.033,.025,BLACK,.01),door)
attach(back_label('battery door title','PORTABLE POWER',-3.4,1.29,-3.616,.19),door)
attach(back_label('battery door subtitle','4 × 1.5 V  /  D CELL',-3.4,.85,-3.616,.12),door)
attach(back_label('battery door caution','OBSERVE POLARITY  •  DO NOT MIX CELLS',-3.4,-.53,-3.616,.079),door)
for j,y in enumerate([-1.10,2.34]):
    attach(box(PREFIX+f'door inner stiffener {j}',-3.4,y,-3.39,4.95,.065,.16,REAR,.018),door)
attach(label('inside door legend','6 V   /   MATCH POLARITY',-3.4,.62,-3.441,.12,CREAM),door)
attach(box(PREFIX+'battery latch',-.85,.61,-3.66,.30,.57,.12,NICKEL,.035),door)
for i,y in enumerate([-.73,1.97]):
    hinge=cylinder(PREFIX+f'battery hinge {i}',-6.25,y,-3.50,.11,.53,NICKEL)
    hinge.rotation_euler=(0,0,0)
back_label('battery spec','BATTERY COMPARTMENT',-3.4,-1.89,-2.906,.12)

# Connectors live on a separate machined plate, with an open RJ45 mouth,
# eight contacts, a keyed serial connector, and a recessed DC jack.
box(PREFIX+'connector panel',3.48,-2.75,-2.96,6.12,2.13,.18,PANEL,.12)
for i,x in enumerate([.64,6.32]):
    back_screw('connector mounting '+str(i),x,-2.75,-3.09)
back_label('network legend','LINK / RJ45',5.23,-2.05,-3.065,.10,INK)
ring(PREFIX+'RJ45 shield',5.23,-2.77,
     [(1.24,1.08,.08,-3.055),(1.24,1.08,.08,-3.35),
      (1.08,.92,.04,-3.38),(1.08,.92,.04,-3.07)],NICKEL,6)
box(PREFIX+'RJ45 cavity',5.23,-2.77,-3.065,1.09,.93,.05,BLACK,.025)
box(PREFIX+'RJ45 keyway',5.23,-3.18,-3.20,.46,.20,.12,BLACK,.015)
for i in range(8):
    pin=box(PREFIX+f'RJ45 contact {i}',5.23+(i-3.5)*.10,-2.54,-3.18,.035,.30,.035,GOLD,.007)
    pin.rotation_euler.x=-.25
for i,x in enumerate([4.72,5.74]):
    box(PREFIX+f'RJ45 lamp {i}',x,-3.33,-3.30,.14,.075,.07,GREEN if i==0 else GOLD,.018)
back_label('serial legend','AUX / SERIAL',3.16,-2.05,-3.065,.10,INK)
ring(PREFIX+'serial shield',3.16,-2.74,
     [(1.52,.72,.14,-3.08),(1.52,.72,.14,-3.29),
      (1.27,.48,.10,-3.32),(1.27,.48,.10,-3.10)],NICKEL,6)
box(PREFIX+'serial insulator',3.16,-2.74,-3.11,1.27,.48,.05,BLACK,.09)
for row in range(2):
    for i in range(5-row):
        cylinder(PREFIX+f'serial pin {row} {i}',3.16+(i-2+row*.5)*.21,-2.64-row*.21,
                 -3.25,.031,.20,GOLD,16)
back_label('DC legend','DC 6 V',1.45,-2.05,-3.065,.10,INK)
cylinder(PREFIX+'DC bezel',1.45,-2.75,-3.18,.31,.22,NICKEL)
cylinder(PREFIX+'DC recess',1.45,-2.75,-3.305,.235,.038,BLACK)
cylinder(PREFIX+'DC contact',1.45,-2.75,-3.34,.058,.09,GOLD)
back_label('connector note','LOCAL INSTRUMENT / PORTS ARE FOR PLAY',3.48,-3.62,-3.065,.075,INK)

# Two functional rear controls: monitored sound and a local lamp self-test.
box(PREFIX+'sound switch socket',4.92,-1.40,-3.00,.64,.34,.16,BLACK,.05)
box('RearSoundSwitch',5.05,-1.40,-3.13,.28,.25,.16,RED,.04)
back_label('sound switch legend','OFF   /   AUDIO',3.90,-1.39,-2.906,.09)
cylinder(PREFIX+'test button rim',-.05,-2.76,-3.05,.22,.16,NICKEL)
cylinder(PREFIX+'test button',-.05,-2.76,-3.16,.155,.14,RED)
back_label('test button legend','LAMP TEST',-.05,-3.24,-2.906,.085)
cylinder('RearTestLamp',-.05,-2.20,-3.03,.075,.12,GREEN)
back_label('rear warning','KEEP VENTS CLEAR  /  NO USER SERVICE REQUIRED',-3.75,-3.48,-2.906,.087)
back_label('rear edition','BUREAU OF SIGNALS   •   EXPERIMENTAL SERIES  /  05821',-.2,-4.37,-2.906,.095)

# Apply manufacturing modifiers at export (earlier detail exports omitted them).
# Keep the source modifiers editable in Blender and all animated nodes separate.
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/console/decrypto-console.blend'))
bpy.ops.export_scene.gltf(filepath=str(ROOT/'web/public/models/decrypto-console.glb'),
                          export_format='GLB', export_apply=True,
                          export_draco_mesh_compression_enable=True,
                          export_draco_mesh_compression_level=6,
                          export_draco_position_quantization=16,
                          export_draco_normal_quantization=12,
                          export_cameras=False, export_lights=False)
print('Structural instrument remodel exported; moving assemblies and surface manifest preserved.')
