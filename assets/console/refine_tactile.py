"""Tactile material / removable hardware pass, applied to the current .blend.

Run after refine_front_mechanics.py. PBR image textures are packed into the
editable source and exported GLB; no Blender-only procedural shader dependency.
Coordinates used by primitives: x right, y up, z toward the operating face.
"""
import json
import math
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from console_parts import material, box, cylinder, ring, finish

OUT = ROOT / 'web/public/models'
TEX = ROOT / 'assets/console/textures'
TEX.mkdir(exist_ok=True)
SURFACES = json.loads((OUT / 'console-surfaces.json').read_text())
P = 'Tactile_'


def remove(name):
    if obj := bpy.data.objects.get(name):
        bpy.data.objects.remove(obj, do_unlink=True)


def remove_prefix(*prefixes):
    for obj in list(bpy.data.objects):
        if obj.name.startswith(prefixes):
            remove(obj.name)


remove_prefix(P, 'BatteryCell_', 'CablePlug_', 'MeterAmplitude', 'MeterRate')


def assign(obj, mat):
    obj.data.materials.clear()
    obj.data.materials.append(mat)


def group(name, x, y, z):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.location = (x, -z, y)
    return obj


def attach(obj, assembly):
    bpy.context.view_layer.update()
    matrix = obj.matrix_world.copy()
    obj.parent = assembly
    obj.matrix_world = matrix
    return obj


def surface(name, x, y, w, h, z, **extra):
    SURFACES[name] = dict(x=x, y=y, w=w, h=h, z=z, lit=True, **extra)


def image_map(name, pixels, color=False):
    old = bpy.data.images.get(name)
    if old:
        bpy.data.images.remove(old)
    h, w = pixels.shape[:2]
    image = bpy.data.images.new(name, width=w, height=h, alpha=False)
    image.colorspace_settings.name = 'sRGB' if color else 'Non-Color'
    rgba = np.ones((h, w, 4), dtype=np.float32)
    rgba[:, :, :3] = pixels[:, :, None] if pixels.ndim == 2 else pixels
    image.pixels.foreach_set(np.clip(rgba, 0, 1).ravel())
    image.filepath_raw = str(TEX / (name + '.png'))
    image.file_format = 'PNG'
    image.save()
    image.pack()
    return image


def textured(name, color, metal, roughness, kind, strength=.25):
    mat = material(name, color, metal, roughness)
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    for n in list(nodes):
        if n.type not in ['BSDF_PRINCIPLED', 'OUTPUT_MATERIAL']:
            nodes.remove(n)
    bs = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
    rng = np.random.default_rng(391)
    n = 512
    yy, xx = np.mgrid[0:n, 0:n] / n
    noise = rng.random((n, n)).astype(np.float32) - .5
    cloud = (np.sin(xx*31 + np.sin(yy*19))*np.sin(yy*29+xx*9) + np.sin(xx*103+yy*67)*.16)
    if kind == 'metal':
        stripes = np.repeat(rng.normal(0, .055, (n, 1)), n, axis=1)
        height = stripes*.10 + noise*.006
        variance = stripes*.055 + noise*.005 + cloud*.006
        rough = roughness + stripes*.17 + noise*.014 + cloud*.014
    elif kind == 'paper':
        fibers = np.sin(xx*1510+yy*41)*np.sin(yy*1377+xx*23)
        height = noise*.23 + fibers*.045
        variance = noise*.035 + fibers*.009 + cloud*.025
        rough = roughness + noise*.04
    elif kind == 'phenolic':
        height = noise*.09 + cloud*.025
        variance = cloud*.055 + noise*.018
        rough = roughness + cloud*.045 + noise*.04
    else:
        height = noise*.13
        variance = noise*.02 + cloud*.009
        rough = roughness + noise*.05
    rgb = np.clip(np.array(color)[None, None, :]*(1 + variance[:, :, None]), 0, 1)
    # Tangent-space normals survive glTF export, unlike a procedural Bump node.
    dx, dy = np.gradient(height)
    normals = np.stack((-dy*strength, -dx*strength, np.ones_like(dx)), axis=-1)
    normals /= np.linalg.norm(normals, axis=-1, keepdims=True)
    for label, data, socket, is_color in [('color', rgb, 'Base Color', True), ('roughness', np.clip(rough, .08, 1), 'Roughness', False)]:
        node = nodes.new('ShaderNodeTexImage')
        node.image = image_map(name + '-' + label, data, is_color)
        links.new(node.outputs['Color'], bs.inputs[socket])
    node = nodes.new('ShaderNodeTexImage')
    node.image = image_map(name + '-normal', normals*.5+.5)
    normal = nodes.new('ShaderNodeNormalMap')
    links.new(node.outputs['Color'], normal.inputs['Color'])
    links.new(normal.outputs['Normal'], bs.inputs['Normal'])
    return mat


ALLOY = textured('Tactile brushed aluminium', (.70,.72,.69), .94, .34, 'metal', .85)
NICKEL = textured('Tactile brushed nickel', (.54,.55,.50), .94, .27, 'metal', .65)
PHENOLIC = textured('Tactile mottled phenolic', (.063,.041,.026), .02, .29, 'phenolic', .6)
PAPER = textured('Tactile cotton paper', (.80,.737,.594), 0, .95, 'paper', .8)
ENAMEL = textured('Tactile enamel porcelain', (.68,.635,.527), .08, .29, 'enamel', .45)
RUBBER = textured('Tactile molded rubber', (.028,.033,.031), 0, .73, 'rubber', 1)
INK = material('Tactile printed carbon', (.019,.024,.019), 0, .79)
RED = material('Tactile oxblood phenolic', (.30,.025,.011), .04, .24)
GOLD = material('Tactile phosphor bronze contacts', (.46,.25,.074), .88, .25)
CREAM = material('Tactile cream lettering', (.80,.75,.60), 0, .65)

replacement = {
    'Instrument anodized face': ALLOY,
    'Scope cast alloy': ALLOY,
    'Satin nickel': NICKEL,
    'Aged nickel hardware': NICKEL,
    'Satin darkened steel': NICKEL,
    'Warm black phenolic': PHENOLIC,
    'Scope black bakelite': PHENOLIC,
    'Ivory engraved inserts': PAPER,
    'Uncoated warm paper': PAPER,
    'Archive stock': PAPER,
    'Porcelain enamel': ENAMEL,
    'Recess rubber': RUBBER,
}
for obj in bpy.data.objects:
    if obj.type == 'MESH':
        for slot in obj.material_slots:
            if slot.material and slot.material.name in replacement:
                slot.material = replacement[slot.material.name]

# The score panel keeps a smooth satin face; the mottled phenolic replacement
# reads as grime behind the eight lamp lenses.
SCORESATIN = material('Score bezel satin black', (.05,.045,.04), .05, .35)
if bezel := bpy.data.objects.get('Score bezel'):
    assign(bezel, SCORESATIN)

FONT = bpy.data.fonts.load('/System/Library/Fonts/STHeiti Medium.ttc')


def label(name, text, x, y, z, size=.12, mat=INK, rear=False, parent=None):
    bpy.ops.object.text_add(location=(x,-z,y), rotation=(math.pi/2,0,math.pi if rear else 0))
    obj = bpy.context.object
    obj.name = P+name
    obj.data.body = text
    obj.data.font = FONT
    obj.data.align_x = obj.data.align_y = 'CENTER'
    obj.data.size = size
    obj.data.extrude = .0006
    obj.data.materials.append(mat)
    bpy.ops.object.convert(target='MESH')
    if parent:
        attach(obj, parent)
    return obj


def screw(name, x, y, z, r=.034, rear=False, parent=None):
    head = cylinder(P+name+' head', x,y,z,r,.03,NICKEL,24)
    slot = box(P+name+' slot',x,y,z+(-.017 if rear else .017),r*1.28,.009,.003,INK,.001)
    slot.rotation_euler[1] = .33
    if parent:
        attach(head,parent); attach(slot,parent)


def cable(name, points, radius, mat, parent=None, poly=False):
    curve = bpy.data.curves.new(P+name,'CURVE')
    curve.dimensions='3D'; curve.resolution_u=14
    curve.bevel_depth=radius; curve.bevel_resolution=3
    spline=curve.splines.new('POLY' if poly else 'BEZIER')
    if poly:
        spline.points.add(len(points)-1)
        for point,(x,y,z) in zip(spline.points,points): point.co=(x,-z,y,1)
    else:
        spline.bezier_points.add(len(points)-1)
        for point,(x,y,z) in zip(spline.bezier_points,points):
            point.co=(x,-z,y)
            point.handle_left_type=point.handle_right_type='AUTO'
    obj=bpy.data.objects.new(P+name,curve)
    bpy.context.collection.objects.link(obj); curve.materials.append(mat)
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True); bpy.context.view_layer.objects.active=obj
    bpy.ops.object.convert(target='MESH')
    if parent: attach(obj,parent)
    return obj


# The manual remains in its original place. A deep amber cap, beveled clear
# cover and two recessed lamp wells make it read as an illuminated pushbutton.
manual=bpy.data.objects['ManualKey']
for child in list(manual.children): remove(child.name)
AMBER=material('Tactile amber opal key',(.66,.28,.045),0,.26)
bs=next(n for n in AMBER.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
bs.inputs['Emission Color'].default_value=(1,.39,.07,1)
bs.inputs['Emission Strength'].default_value=.65
bs.inputs['Coat Weight'].default_value=.75
attach(box(P+'manual black skirt',-6.25,4.18,.879,1.65,.56,.22,PHENOLIC,.055),manual)
attach(box(P+'manual illuminated cap',-6.25,4.18,1.002,1.43,.41,.080,AMBER,.045),manual)
for x in [-6.84,-5.66]:
    attach(cylinder(P+'manual lamp '+str(x),x,4.18,1.046,.048,.008,CREAM,24),manual)
surface('badge',-6.25,4.18,1.16,.245,1.050)

# Delete fixed branding. Give the room code and its copy key plain labels.
SURFACES.pop('brand',None)
label('room code label','房间码',5.30,4.47,.567,.20,INK)
remove_prefix('Interaction_copy key')
copy=bpy.data.objects['ChannelCopy']
for child in list(copy.children): remove(child.name)
ring(P+'copy socket',6.96,3.98,[(.66,.58,.06,.57),(.66,.58,.06,.88),(.55,.46,.04,.88),(.55,.46,.04,.64)],PHENOLIC)
attach(box(P+'copy ivory cap',6.96,3.98,.93,.51,.42,.19,ENAMEL,.037),copy)
surface('channelCopy',6.96,3.98,.46,.31,1.032)

# Aged card stock, actual brass spring clips and exposed dark cut edges.
# The outer rail and lower lip are differentiated from the brown carrier.
for obj in bpy.data.objects:
    if obj.name.startswith('Front_roster channel'): assign(obj,NICKEL)
    if obj.name.startswith(('Front_roster spring seat','Front_roster spring return')): assign(obj,GOLD)
for team in ['A','B']:
    for i in range(4):
        s=SURFACES[f'roster{team}{i}']
        x,y,w,h=s['x'],s['y'],s['w'],s['h']
        for side in [-1,1]:
            clip=box(P+f'card clip {team}{i} {side}',x+side*(w/2-.065),y+.015,1.103,.065,h*.66,.032,GOLD,.012)
        # A shallow thumb scallop exposes the stock rather than a painted border.
        box(P+f'card edge shadow {team}{i}',x,y-h/2-.016,1.095,w-.17,.018,.020,INK,.003)

# Name cards are removable assemblies: the paper card and its exposed cut edge
# slide straight out of the seat well toward the player. Clips, channels, wells
# and edge shadows stay on the rack; an empty seat reveals the stamped well floor,
# so each well floor gets its own print surface behind the card face (1.087).
for team in ['A','B']:
    for i in range(4):
        card=bpy.data.objects.get(f'RosterCard_{team}{i}') or group(f'RosterCard_{team}{i}',0,0,0)
        card['removal_axis']='front';card['travel']=.55
        for part in [f'Front_roster card edge {team}{i+1}',f'Front_roster card {team}{i+1}']:
            attach(bpy.data.objects[part],card)
        s=SURFACES[f'roster{team}{i}']
        surface(f'rosterWell{team}{i}',s['x'],s['y'],s['w'],s['h'],1.032)

# The paper stock and its leader share physical fiber scale. The printed legend
# belongs to the strip at the roller nip, not to the metal some distance below.
SURFACES.pop('archiveControls',None)
surface('paper',5.68,.66,2.24,.43,1.039)
for side in [-1,1]:
    box(P+f'paper retaining cheek {side}',5.68+side*1.205,.80,.98,.16,.40,.25,PHENOLIC,.035)
label('printer emboss','ARCHIVE / 连续记录',5.68,1.46,.563,.12)
SURFACES.pop('archiveLabel',None)

# Replace the meter with a deeper, broader glass-front instrument. The moving
# needle is a tapered stamped blade with a counterweight and a separate hub.
remove_prefix('Interaction_receiver','Instrument_meter chrome','ConsoleDetail_receiver')
needle=bpy.data.objects.get('ReceiverNeedle')
if needle:
    for child in list(needle.children): remove(child.name)
    remove(needle.name)
ring(P+'meter cast bezel',5.83,-1.52,[(2.53,1.34,.12,.57),(2.53,1.34,.12,.96),(2.43,1.24,.10,1.07),(2.18,1.00,.06,1.07),(2.12,.94,.05,.79)],PHENOLIC)
ring(P+'meter bright reveal',5.83,-1.52,[(2.44,1.25,.10,1.068),(2.44,1.25,.10,1.088),(2.39,1.20,.09,1.088),(2.39,1.20,.09,1.068)],NICKEL)
DIAL=material('Tactile warm meter dial',(.59,.46,.25),0,.84)
bs=next(n for n in DIAL.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
bs.inputs['Emission Color'].default_value=(1,.59,.22,1)
bs.inputs['Emission Strength'].default_value=.28
box(P+'meter scale',5.83,-1.52,.804,2.13,.95,.045,DIAL,.04)
SURFACES.pop('receiverDial',None)
cx,cy=5.83,-1.87
for i in range(31):
    a=-.94+i/30*1.88
    radius=.67; long=i%10==0
    xx=cx+math.sin(a)*radius; yy=cy+math.cos(a)*radius
    mark=box(P+f'meter index {i}',xx,yy,.838,.014 if long else .008,.084 if long else .035,.006,RED if i<=3 else INK,.001)
    mark.rotation_euler[1]=a
    if long:
        label('meter numeral '+str(i),str(i//10),cx+math.sin(a)*.82,cy+math.cos(a)*.82,.840,.15,RED if i==0 else INK)
label('meter VU','V U',5.83,-1.53,.840,.165)
label('meter arbitrary scale','LEVEL',5.83,-1.73,.840,.066)
needle=group('ReceiverNeedle',cx,cy,.88)
mesh=bpy.data.meshes.new('Tapered stamped pointer')
mesh.from_pydata([(-.025,-.015,-.13),(.025,-.015,-.13),(.005,-.015,.70),(-.005,-.015,.70),(-.025,.008,-.13),(.025,.008,-.13),(.005,.008,.70),(-.005,.008,.70)],[],[(0,1,2,3),(4,7,6,5),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)])
mesh.update()
pointer=bpy.data.objects.new(P+'meter steel pointer',mesh);bpy.context.collection.objects.link(pointer)
pointer.parent=needle;finish(pointer,pointer.name,INK,.002)
attach(box(P+'pointer red tip',cx,cy+.653,.899,.012,.077,.009,RED,.003),needle)
attach(cylinder(P+'pointer counterweight',cx,cy-.105,.891,.045,.025,NICKEL),needle)
cylinder(P+'meter brass hub',cx,cy,.935,.070,.065,GOLD)
cylinder(P+'meter black spindle',cx,cy,.974,.043,.025,PHENOLIC)
GLASS=material('Tactile optical glass',(.72,.79,.73),0,.075)
bs=next(n for n in GLASS.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
bs.inputs['Alpha'].default_value=.17
bs.inputs['Coat Weight'].default_value=1
bs.inputs['Coat Roughness'].default_value=.045
GLASS.surface_render_method='DITHERED'
box(P+'meter bevel glass',5.83,-1.52,1.008,2.16,.98,.050,GLASS,.060)
for side in [-1,1]: screw('meter mount '+str(side),5.83+side*1.185,-1.52,1.075)

# Two independently named knurled knobs are strictly local toys: level and rate.
remove_prefix('ConsoleDetail_receiver knob','ConsoleDetail_receiver label')
for name,x,legend in [('MeterAmplitude',5.24,'幅度'),('MeterRate',6.42,'频率')]:
    cylinder(P+name+' seat',x,-2.50,.71,.195,.16,NICKEL)
    knob=group(name,x,-2.50,.90)
    attach(cylinder(P+name+' grip',x,-2.50,.913,.148,.24,PHENOLIC),knob)
    for i in range(24):
        a=i/24*math.tau
        attach(cylinder(P+name+' knurl '+str(i),x+math.cos(a)*.146,-2.50+math.sin(a)*.146,.915,.012,.22,PHENOLIC,12),knob)
    attach(box(P+name+' index',x,-2.41,1.040,.018,.065,.008,CREAM,.004),knob)
    label(name+' legend',legend,x,-2.85,.568,.105)
    surface(name+'Control',x,-2.50,.49,.49,1.06)

# A large spring-loaded concave red cap replaces the long hinged handle.
lever=bpy.data.objects.get('TransmitLever')
if lever:
    for child in list(lever.children): remove(child.name)
    remove(lever.name)
remove_prefix('Interaction_transmit')
ring(P+'transmit socket',5.83,-3.63,[(2.59,1.19,.14,.56),(2.59,1.19,.14,.86),(2.43,1.03,.11,.90),(2.28,.88,.08,.72)],PHENOLIC)
ring(P+'transmit brushed collar',5.83,-3.63,[(2.48,1.08,.11,.87),(2.48,1.08,.11,.94),(2.33,.93,.09,.96),(2.29,.89,.08,.78)],NICKEL)
lever=group('TransmitLever',5.83,-3.63,.91)
lever['mechanism']='linear_push';lever['travel']=.12
attach(box(P+'transmit key skirt',5.83,-3.63,.97,2.22,.83,.30,PHENOLIC,.085),lever)
attach(box(P+'transmit red key',5.83,-3.63,1.135,2.15,.76,.21,RED,.10),lever)
surface('transmitLabel',5.83,-3.59,1.86,.40,1.245)
surface('transmitControl',5.83,-3.63,2.26,.88,1.25)
SURFACES.pop('transmitGuide',None)

# Alternating D cells: each jacket, flat negative end and raised positive nipple
# belongs to one removable assembly. Tray springs and leaf contacts remain fixed.
remove_prefix('Instrument_battery cell','Instrument_battery terminal','Instrument_battery contact','Instrument_battery label','Instrument_battery polarity','Instrument_battery jacket','Instrument_contact spring')
JACKET=material('Tactile battery olive paper jacket',(.29,.30,.17),.08,.54)
for i,x in enumerate([-5.29,-4.03,-2.77,-1.51]):
    cell=group(f'BatteryCell_{i}',x,.62,-3.03)
    cell['positive_end']='top' if i%2==0 else 'bottom'
    cell['removal_axis']='rear';cell['travel']=1.2
    sign=1 if i%2==0 else -1
    body=cylinder(P+f'cell jacket {i}',x,.62,-3.03,.422,2.57,JACKET)
    body.rotation_euler=(0,0,0);attach(body,cell)
    for end in [-1,1]:
        y=.62+end*1.31
        terminal=cylinder(P+f'cell end {i} {end}',x,y,-3.03,.415,.052,NICKEL)
        terminal.rotation_euler=(0,0,0);attach(terminal,cell)
        band=cylinder(P+f'cell crimp {i} {end}',x,y-end*.045,-3.03,.43,.045,PHENOLIC)
        band.rotation_euler=(0,0,0);attach(band,cell)
    terminal=cylinder(P+f'positive nipple {i}',x,.62+sign*1.385,-3.03,.135,.10,NICKEL)
    terminal.rotation_euler=(0,0,0);attach(terminal,cell)
    label(f'cell type {i}','1.5 V',x,.74,-3.458,.125,INK,True,cell)
    label(f'cell spec {i}','D CELL',x,.40,-3.458,.088,INK,True,cell)
    for polarity,yy in [('+',.62+sign*1.06),('−',.62-sign*1.06)]:
        label(f'cell mark {i} {polarity}',polarity,x,yy,-3.464,.22,INK,True,cell)
    # Compression spring meets the flat negative end, on alternating ends.
    points=[]
    for j in range(101):
        t=j/100;a=t*math.tau*4.5
        points.append((x+math.cos(a)*.16,.62-sign*(1.345+t*.30),-3.03+math.sin(a)*.16))
    cable(f'cell negative spring {i}',points,.018,GOLD,poly=True)
    box(P+f'cell positive leaf {i}',x,.62+sign*1.49,-3.03,.30,.043,.42,GOLD,.02)
    label(f'tray polarity {i}', '+' if sign==1 else '−',x,2.47,-3.28,.17,CREAM,True)
    # Retaining cradle ends stop the cells rolling when the lid is open.
    for yy in [-.37,1.61]:
        for side in [-1,1]: box(P+f'cell saddle {i} {yy} {side}',x+side*.46,yy,-3.07,.10,.23,.25,RUBBER,.025)
    surface(f'batteryCell{i}Control',x,.62,.92,2.88,-3.49,rotationY=math.pi)

# Complete removable plugs with pin structures, retention details and molded
# boots. Each assembly translates along the rear-facing socket axis; its lead
# cable is a separate anchored mesh that bends via an 'unplugged' shape key.
for name,x,y in [('RJ45',5.23,-2.77),('Serial',3.16,-2.74),('DC',1.45,-2.75)]:
    plug=group('CablePlug_'+name,x,y,-3.35)
    plug['removal_axis']='rear';plug['travel']=.85
    if name=='RJ45':
        attach(box(P+'RJ45 transparent nose',x,y,-3.39,.92,.71,.58,GLASS,.035),plug)
        for i in range(8): attach(box(P+'RJ45 plug pin '+str(i),x+(i-3.5)*.10,y+.18,-3.17,.044,.06,.32,GOLD,.006),plug)
        attach(box(P+'RJ45 shield case',x,y,-3.74,1.00,.79,.39,NICKEL,.035),plug)
        attach(box(P+'RJ45 spring latch',x,y-.40,-3.57,.26,.055,.52,PHENOLIC,.02),plug)
        attach(box(P+'RJ45 boot',x,y,-4.09,.83,.68,.36,RUBBER,.09),plug)
    elif name=='Serial':
        attach(box(P+'serial plug shield',x,y,-3.49,1.17,.43,.36,NICKEL,.085),plug)
        attach(box(P+'serial plug hood',x,y,-3.95,1.63,.83,.70,PHENOLIC,.12),plug)
        for side in [-1,1]:
            attach(cylinder(P+'serial thumbscrew '+str(side),x+side*.85,y,-3.87,.10,.57,NICKEL,24),plug)
        for row in range(2):
            for i in range(5-row): attach(cylinder(P+f'serial plug contact {row} {i}',x+(i-2+row*.5)*.21,y+.10-row*.21,-3.29,.032,.12,GOLD,16),plug)
        label('serial hood legend','AUX',x,y,-4.31,.10,CREAM,True,plug)
    else:
        attach(cylinder(P+'DC barrel sleeve',x,y,-3.47,.178,.43,NICKEL),plug)
        attach(cylinder(P+'DC molded boot',x,y,-3.95,.24,.61,RUBBER),plug)
        for i in range(4): attach(cylinder(P+'DC grip '+str(i),x,y,-3.76-i*.11,.251,.036,PHENOLIC,32),plug)
    for i in range(5):
        attach(cylinder(P+name+' strain relief '+str(i),x,y,-4.29-i*.085,.16-i*.016,.085,RUBBER,24),plug)
    # The lead is deliberately not parented to the plug: its far end drops below
    # the console silhouette and stays anchored there. The 'unplugged' shape key
    # moves only the boot-end region with the plug's travel, so the cable sags
    # and bends instead of translating rigidly with the assembly.
    shift={'RJ45':.9,'Serial':.15,'DC':-.6}[name]
    points=[(x,y,-4.55),(x+shift*.2,y-.45,-4.72),(x+shift*.55,y-1.15,-4.68),
            (x+shift*.8,y-2.05,-4.56),(x+shift,y-3.30,-4.62),(x+shift*.9,y-5.20,-4.72)]
    lead=cable(name+' flexible lead',points,.058 if name=='DC' else .077,RUBBER)
    lead.shape_key_add(name='Basis')
    unplugged=lead.shape_key_add(name='unplugged')
    boot=Vector((x,4.55,y))  # script (x, y, -4.55) in Blender axes
    pull=Vector((0,.85,-.22))  # plug travel: .85 rearward and .22 down
    for vert in unplugged.data:
        weight=min(1,max(0,(3.0-(vert.co-boot).length)/2.2))
        vert.co+=pull*(weight*weight*(3-2*weight))
    surface(name+'PlugControl',x,y,1.15 if name!='Serial' else 1.90,.90,-4.37,rotationY=math.pi)

# Consistent physical-scale box UVs across the assembled instrument. Front faces
# use X horizontally and Z vertically, so the metal grain follows the panel.
for obj in bpy.data.objects:
    if obj.type!='MESH' or not any(s.material and s.material.name.startswith('Tactile ') and any(n.type=='TEX_IMAGE' for n in s.material.node_tree.nodes) for s in obj.material_slots):
        continue
    uv=obj.data.uv_layers.active or obj.data.uv_layers.new(name='ManufacturingUV')
    world=obj.matrix_world
    for poly in obj.data.polygons:
        normal=world.to_3x3() @ poly.normal
        axis=max(range(3),key=lambda i:abs(normal[i]))
        axes=(0,2) if axis==1 else (0,1) if axis==2 else (1,2)
        for loop in poly.loop_indices:
            p=world @ obj.data.vertices[obj.data.loops[loop].vertex_index].co
            uv.data[loop].uv=(p[axes[0]]/6,p[axes[1]]/6)

# Model-only demonstration actions: articulation lives in independent groups;
# gameplay state has no dependency on battery presence, plug state or VU level.
bpy.context.view_layer.update()
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/console/decrypto-console.blend'))
bpy.ops.export_scene.gltf(filepath=str(OUT/'decrypto-console.glb'),export_format='GLB',export_apply=True,
    export_draco_mesh_compression_enable=True,export_draco_mesh_compression_level=6,
    export_draco_position_quantization=16,export_draco_normal_quantization=12,
    export_cameras=False,export_lights=False,export_extras=True)
(OUT/'console-surfaces.json').write_text(json.dumps(SURFACES,indent=2)+'\n')
print('Tactile materials, illuminated keys, analog meter, alternating cells and removable cable assemblies exported.')
