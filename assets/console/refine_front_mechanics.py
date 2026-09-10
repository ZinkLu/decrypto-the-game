"""Material and interaction pass. Run last on the current editable console.

Fixed lettering, push caps, diffused lamps, a fed paper strip and one coherent
transmit handle each have a distinct construction. No main chassis changes.
"""
import json
import math
import sys
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from console_parts import material, finish, box, cylinder, ring

OUT = ROOT/'web/public/models'
surfaces = json.loads((OUT/'console-surfaces.json').read_text())
P = 'Interaction_'


def remove(name):
    if obj := bpy.data.objects.get(name):
        bpy.data.objects.remove(obj, do_unlink=True)


for obj in list(bpy.data.objects):
    if obj.name.startswith(P) or obj.name.startswith('ScoreLamp_') or obj.name in ['PaperFeed','ReceiverNeedle','ManualKey','ChannelCopy']:
        bpy.data.objects.remove(obj, do_unlink=True)
for key in list(surfaces):
    if key.startswith('scoreToken'):
        del surfaces[key]

BAKELITE = material('Warm black phenolic', (.023,.018,.014), .02, .34)
STEEL = material('Satin darkened steel', (.13,.15,.14), .68, .43)
NICKEL = material('Aged nickel hardware', (.31,.32,.27), .76, .38)
IVORY = material('Ivory engraved inserts', (.62,.565,.43), 0, .64)
PAPER = material('Uncoated warm paper', (.74,.70,.59), 0, .95)
BLACK = bpy.data.materials['Recess rubber']
INK = bpy.data.materials['Instrument legends']
RED = material('Red phenolic grip', (.29,.031,.017), .02, .28)
TEAL = material('Dark instrument green', (.021,.033,.029), .12, .56)


def assign(obj, mat):
    obj.data.materials.clear(); obj.data.materials.append(mat)


def group(name, x, y, z):
    obj = bpy.data.objects.new(name,None); bpy.context.collection.objects.link(obj)
    obj.location = (x,-z,y)
    return obj


def parent(obj, assembly):
    bpy.context.view_layer.update()
    matrix = obj.matrix_world.copy(); obj.parent=assembly; obj.matrix_world=matrix
    return obj


def surface(name,x,y,w,h,z,lit=True):
    surfaces[name] = dict(x=x,y=y,w=w,h=h,z=z,lit=lit)


def screw(name,x,y,z,r=.034):
    cylinder(P+name+' head',x,y,z,r,.025,NICKEL,24)
    box(P+name+' slot',x,y,z+.015,r*1.30,.009,.005,INK,.002)


def glass_material(name, color, alpha=.13):
    mat = material(name,color,0,.13)
    bs = next(n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    bs.inputs['Alpha'].default_value=alpha
    bs.inputs['Coat Weight'].default_value=.75
    bs.inputs['Coat Roughness'].default_value=.09
    mat.surface_render_method='DITHERED'
    return mat


# The roster is a quiet phenolic cassette; bright metal is restricted to edges.
for obj in bpy.data.objects:
    if obj.name in ['Front_roster cast carrier','Front_roster enamel bed','Front_roster cassette A','Front_roster cassette B']:
        assign(obj,BAKELITE)
    elif obj.name.startswith(('Front_roster channel','Front_roster spring return','Front_roster cassette divider')):
        assign(obj,STEEL)
    elif obj.name.startswith('Front_roster card ') and not obj.name.startswith('Front_roster card edge'):
        assign(obj,IVORY)
    elif obj.name.startswith(('Front_roster spring seat','Front_roster carrier bolt','Front_roster plaque rivet')) and obj.type=='MESH':
        if not obj.name.endswith('slot'): assign(obj,NICKEL)
ring(P+'roster fine edge',-6.25,1.14,
     [(2.33,4.43,.07,1.02),(2.33,4.43,.07,1.044),(2.305,4.405,.062,1.044),(2.305,4.405,.062,1.02)],NICKEL)

# The top-left control is a spring-loaded cap, with a separate inset legend.
for obj in list(bpy.data.objects):
    if obj.name.startswith('Front_bureau plate'): remove(obj.name)
ring(P+'manual key socket',-6.25,4.18,
     [(1.96,.79,.09,.56),(1.96,.79,.09,.82),(1.71,.59,.07,.82),(1.71,.59,.07,.59)],STEEL)
manual = group('ManualKey',-6.25,4.18,.85)
parent(box(P+'manual key cap',-6.25,4.18,.881,1.66,.55,.22,BAKELITE,.08),manual)
parent(box(P+'manual key insert',-6.25,4.18,.997,1.31,.32,.013,IVORY,.025),manual)
surface('badge',-6.25,4.18,1.27,.28,1.008)

# The logo is fixed chassis lettering. The channel has a protected readout and
# an independent small copy key, so a nameplate no longer pretends to be a button.
for obj in list(bpy.data.objects):
    if obj.name.startswith('Front_brand plaque'): remove(obj.name)
surface('brand',5.83,4.46,2.84,.29,.563)
ring(P+'channel bezel',5.56,3.98,
     [(2.27,.61,.055,.56),(2.27,.61,.055,.86),(2.12,.47,.035,.88),(2.09,.44,.03,.67)],STEEL)
box(P+'channel well',5.56,3.98,.719,2.13,.48,.12,BAKELITE,.025)
surface('channel',5.56,3.98,2.06,.40,.783,False)
for x in [5.045,5.56,6.075]:
    box(P+'channel divider '+str(x),x,3.98,.808,.018,.38,.040,STEEL,.004)
ring(P+'copy key socket',7.04,3.98,
     [(.41,.51,.055,.57),(.41,.51,.055,.87),(.30,.39,.035,.87),(.30,.39,.035,.62)],STEEL)
copy = group('ChannelCopy',7.04,3.98,.88)
parent(box(P+'copy key cap',7.04,3.98,.907,.28,.36,.16,BAKELITE,.035),copy)
surface('channelCopy',7.04,3.98,.24,.29,.991)

# APEM-like diffused lenses: a dark socket, retained lens, and recessed diffuser.
# The lenses use independent runtime materials; there are no painted round tokens.
for obj in list(bpy.data.objects):
    if obj.name.startswith(('Front_score socket','Front_score rim','Front_score indicator','Front_score index')):
        remove(obj.name)
assign(bpy.data.objects['Score bezel'],BAKELITE)
assign(bpy.data.objects['Front_score enamel bed'],TEAL)
for i,team in enumerate(['A','B']):
    for j,category in enumerate(['intercept','failure']):
        for k in range(2):
            x=5.83+((187+j*227+k*76)/600-.5)*2.79
            y=2.73+(.5-(153+i*103)/357)*1.66
            name=f'{team}_{category}_{k}'
            cylinder(P+'lamp socket '+name,x,y,.963,.151,.098,BLACK)
            cylinder(P+'lamp retaining collar '+name,x,y,1.007,.132,.043,NICKEL)
            lens_mat=material('Lens '+name,(.15,.034,.012) if j else (.17,.095,.015),0,.25)
            bs=next(n for n in lens_mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
            bs.inputs['Coat Weight'].default_value=.65
            bs.inputs['Emission Color'].default_value=(1,.13,.028,1) if j else (1,.52,.085,1)
            bs.inputs['Emission Strength'].default_value=.02
            bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=12,radius=1,location=(x,-1.033,y))
            lens=bpy.context.object; lens.scale=(.108,.064,.108)
            bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
            finish(lens,'ScoreLamp_'+name,lens_mat)
            for poly in lens.data.polygons: poly.use_smooth=True
            # A fluted diffuser fills the seat beneath the domed face.
            for n in [-2,-1,0,1,2]:
                dy=n*.028; half=math.sqrt(max(0,.091**2-dy**2))
                box(P+'lens diffuser '+name+str(n),x,y+dy,1.029,half*2,.006,.008,lens_mat,.002)

# Replace the offset rigid paper card with one continuous strip at the nip.
for name in ['Paper back','Paper curl','PaperFeed']: remove(name)
for obj in list(bpy.data.objects):
    if obj.name.startswith(('Front_printer feed tray','Front_printer guide cheek','Front_printer folded guide','Front_printer tear bar','Front_tear tooth')):
        remove(obj.name)
feed = group('PaperFeed',5.68,.875,1.027)
verts=[]; faces=[]; length=1.30; width=2.24
for row in range(41):
    t=row/40; d=t*length; bend=max(0,(d-(length-.18))/.18)
    z=.035*bend*bend
    for x,back in [(-width/2,0),(width/2,0),(-width/2,-.009),(width/2,-.009)]:
        verts.append((x,-z-back,-d))
for row in range(40):
    a=row*4;b=a+4
    faces.extend([(a,b,b+1,a+1),(a+2,a+3,b+3,b+2),(a,a+2,b+2,b),(a+1,b+1,b+3,a+3)])
faces.extend([(0,1,3,2),(160,162,163,161)])
mesh=bpy.data.meshes.new('Continuous paper strip');mesh.from_pydata(verts,[],faces);mesh.update()
paper=bpy.data.objects.new('Paper back',mesh);bpy.context.collection.objects.link(paper);paper.parent=feed
finish(paper,paper.name,PAPER)
for polygon in mesh.polygons: polygon.use_smooth=True
surface('paper',5.68,.66,2.24,.43,1.036)
surface('archiveControls',5.68,.23,2.6,.25,.57)
# Paper exits between a matched pair of guides and the existing feed roller.
for side in [-1,1]:
    box(P+f'paper nip guide {side}',5.68+side*1.16,.85,1.035,.074,.20,.13,STEEL,.017)
box(P+'paper tear edge',5.68,.906,1.07,2.28,.035,.035,STEEL,.005)
for i in range(35):
    tooth=box(P+f'tear edge tooth {i}',4.574+i*.065,.888,1.08,.025,.030,.018,STEEL,.002)
    tooth.rotation_euler[1]=math.pi/4

# Sifam-inspired light box: buff translucent scale, moving pointer, acrylic cover.
for obj in list(bpy.data.objects):
    if obj.name.startswith('ConsoleDetail_receiver meter'): remove(obj.name)
ring(P+'receiver ABS bezel',5.83,-1.58,
     [(2.22,1.08,.10,.56),(2.22,1.08,.10,1.00),(2.13,.99,.085,1.08),
      (1.88,.74,.060,1.08),(1.84,.70,.05,.77)],BAKELITE)
backlight=material('Receiver opal light box',(.57,.43,.22),0,.72)
bs=next(n for n in backlight.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
bs.inputs['Emission Color'].default_value=(1,.59,.24,1);bs.inputs['Emission Strength'].default_value=.30
box(P+'receiver diffuser',5.83,-1.58,.799,1.88,.74,.04,backlight,.04)
surface('receiverDial',5.83,-1.58,1.82,.68,.825,False)
needle=group('ReceiverNeedle',5.83,-1.81,.875)
parent(box(P+'receiver pointer',5.83,-1.58,.887,.018,.48,.018,INK,.004),needle)
cylinder(P+'receiver hub',5.83,-1.81,.923,.060,.060,STEEL)
box(P+'receiver acrylic',5.83,-1.58,1.010,1.87,.73,.055,glass_material('Receiver clear acrylic',(.63,.61,.49),.09),.05)
screw('receiver zero adjust',5.83,-2.016,1.049,.032)
for side in [-1,1]: screw(f'receiver mounting {side}',5.83+side*1.045,-1.58,1.04)

# A dark, curved cover over the phosphor display provides reflected highlights.
box(P+'scope glass',-6.48,-3.08,.932,1.385,1.165,.032,
    glass_material('Scope smoked glass',(.19,.26,.17),.055),.095)

# One spring-return U handle replaces the unrelated drum and separate stick.
lever=bpy.data.objects.get('TransmitLever')
if lever:
    for obj in list(lever.children): remove(obj.name)
    remove('TransmitLever')
for obj in list(bpy.data.objects):
    if obj.name.startswith('ConsoleDetail_service plate'): remove(obj.name)
for name in ['Transmit drum','Lever socket','Drum bracket','Drum bracket.001']:
    remove(name)
ring(P+'transmit plinth',5.83,-3.50,
     [(2.53,1.18,.11,.55),(2.53,1.18,.11,.82),(2.41,1.06,.08,.88),
      (2.18,.83,.06,.88),(2.15,.80,.05,.62)],BAKELITE)
box(P+'transmit bed',5.83,-3.50,.708,2.21,.86,.13,STEEL,.06)
lever=group('TransmitLever',5.83,-3.80,.91)
for side in [-1,1]:
    x=5.83+side*.68
    box(P+f'transmit pivot mount {side}',x,-3.76,.90,.20,.27,.26,BAKELITE,.04)
    screw(f'transmit pivot {side}',x,-3.76,1.048,.054)
    arm=box(P+f'transmit arm {side}',x,-3.48,1.022,.105,.60,.105,NICKEL,.026)
    arm.rotation_euler[0]=-.34
    parent(arm,lever)
parent(box(P+'transmit grip',5.83,-3.18,1.144,1.60,.25,.28,RED,.095),lever)
surface('transmitLabel',5.83,-3.18,1.39,.19,1.288)
surface('transmitControl',5.83,-3.46,2.36,1.03,1.06)
surface('transmitGuide',5.83,-4.21,2.55,.23,.568)

bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/console/decrypto-console.blend'))
bpy.ops.export_scene.gltf(filepath=str(OUT/'decrypto-console.glb'),export_format='GLB',export_apply=True,
    export_draco_mesh_compression_enable=True,export_draco_mesh_compression_level=6,
    export_draco_position_quantization=16,export_draco_normal_quantization=12,
    export_cameras=False,export_lights=False)
(OUT/'console-surfaces.json').write_text(json.dumps(surfaces,indent=2)+'\n')
print('Front materials and mechanisms exported.')
