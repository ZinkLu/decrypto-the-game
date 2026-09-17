"""Detailed original Nixie tubes, a registered receipt feed, and a shorter power bat.
Run against the current editable scene, after refine_panel_layout.py.
"""
import json, math, sys
from pathlib import Path
import bpy
from mathutils import Matrix, Vector
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).parent))
from console_parts import material, box, cylinder, finish
OUT = ROOT/'web/public/models'
P = 'Nixie_'
scene = bpy.context.scene
surfaces = json.loads((OUT/'console-surfaces.json').read_text())

def remove(obj): bpy.data.objects.remove(obj, do_unlink=True)
for obj in list(bpy.data.objects):
    if obj.name.startswith(P) or obj.name.startswith('Interaction_channel'):
        remove(obj)

METAL = material('Nixie oxidized nickel', (.15,.135,.10), .78, .38)
MICA = material('Nixie mica insulator', (.29,.27,.20), .12, .7)
BASE = material('Nixie black ceramic', (.024,.019,.012), .15, .28)
WIRE = material('Nixie dormant cathodes', (.085,.061,.033), .68, .48)
LIT = material('Nixie neon cathode', (.75,.16,.018), .15, .30)
bsdf = next(n for n in LIT.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
bsdf.inputs['Emission Color'].default_value = (1,.16,.015,1)
bsdf.inputs['Emission Strength'].default_value = 3.0
GLASS = material('Nixie borosilicate envelope', (.53,.67,.61), .16, .12)
bsdf = next(n for n in GLASS.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
bsdf.inputs['Alpha'].default_value = .105
bsdf.inputs['Coat Weight'].default_value = .8
GLASS.diffuse_color = (.53,.67,.61,.105)
GLASS.surface_render_method = 'BLENDED'

# Single-stroke, curved numeral cathodes. Coordinates are normalized to a 100x160 die.
# M/L/C commands are also retained in GLB extras for the live corona texture.
paths = [
'M 50 8 C 12 8 15 48 15 80 C 15 122 16 151 50 151 C 84 151 85 122 85 80 C 85 42 87 8 50 8',
'M 28 35 L 51 10 L 51 150 M 29 150 L 75 150',
'M 16 39 C 16 0 83 -1 84 39 C 87 68 52 85 30 111 L 14 150 L 87 150',
'M 17 19 C 43 -4 87 9 84 43 C 83 65 65 77 44 78 C 73 74 89 91 85 119 C 80 155 41 161 14 140',
'M 72 151 L 72 10 L 13 105 L 93 105',
'M 84 10 L 22 10 L 18 77 C 47 53 86 70 85 110 C 86 157 38 163 14 139',
'M 81 17 C 37 -14 14 34 14 91 C 12 164 88 169 88 114 C 88 65 21 63 15 109',
'M 12 10 L 89 10 C 65 44 43 105 38 151',
'M 50 78 C 7 63 10 9 49 9 C 92 9 94 59 50 78 C 1 98 5 152 50 152 C 95 152 99 98 50 78',
'M 84 59 C 80 104 14 102 14 48 C 14 -7 91 -7 86 66 C 86 124 63 171 21 144'
]

def sample(path):
    tokens = path.split(); i = 0; current = (0,0); strips=[]; strip=[]
    while i<len(tokens):
        command=tokens[i]; i+=1
        if command in ['M','L']:
            p=tuple(float(v) for v in tokens[i:i+2]); i+=2
            if command=='M':
                if strip: strips.append(strip)
                strip=[p]
            else: strip.append(p)
            current=p
        else:
            p1=tuple(float(v) for v in tokens[i:i+2]);p2=tuple(float(v) for v in tokens[i+2:i+4]);p3=tuple(float(v) for v in tokens[i+4:i+6]);i+=6
            for j in range(1,17):
                t=j/16;v=1-t
                strip.append(tuple(v**3*current[k]+3*v*v*t*p1[k]+3*v*t*t*p2[k]+t**3*p3[k] for k in range(2)))
            current=p3
    if strip: strips.append(strip)
    return strips

def wires(name, strips, radius, mat):
    data=bpy.data.curves.new(name,'CURVE');data.dimensions='3D';data.bevel_depth=radius;data.bevel_resolution=2
    for points in strips:
        spline=data.splines.new('POLY');spline.points.add(len(points)-1)
        for p, (x,y,z) in zip(spline.points,points): p.co=(x,-z,y,1)
    obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);data.materials.append(mat)
    bpy.context.view_layer.objects.active=obj;obj.select_set(True)
    bpy.ops.object.convert(target='MESH');obj.select_set(False)
    return obj

# A shallow mounting plate; each glass envelope remains an actual curved volume.
box(P+'mounting plate',5.56,4.02,.645,2.24,1.04,.16,BASE,.045)
for slot in range(4):
    x=4.78+slot*.52; cy=3.59; cz=.89
    # Upright ceramic socket with concentric machined rims.
    for suffix,y,r,d,mat in [('socket',3.57,.233,.11,BASE),('rim',3.64,.222,.035,METAL),('mica',3.68,.173,.024,MICA)]:
        obj=cylinder(P+f'{slot} {suffix}',x,y,cz,r,d,mat,64)
        obj.rotation_euler=(0,0,0)
    for pin in range(12):
        a=pin*math.tau/12
        obj=cylinder(P+f'{slot} pin {pin}',x+math.cos(a)*.154,3.60,cz+math.sin(a)*.154,.009,.14,METAL,10)
        obj.rotation_euler=(0,0,0)
    # Revolved, domed glass with the sealed exhaust tip.
    profile=[(.168,3.65),(.207,3.69),(.221,3.75),(.223,3.84),(.223,4.25),(.219,4.33),(.202,4.39),(.159,4.445),(.09,4.474),(.022,4.48),(.016,4.505),(0,4.51)]
    verts=[]; faces=[]; n=64
    for radius,y in profile:
        for k in range(n):
            a=k*math.tau/n;verts.append((x+radius*math.cos(a),-(cz+radius*math.sin(a)),y))
    for row in range(len(profile)-1):
        for k in range(n):
            a=row*n+k;b=row*n+(k+1)%n;faces.append((a,b,b+n,a+n))
    mesh=bpy.data.meshes.new(P+f'{slot} glass');mesh.from_pydata(verts,[],faces);mesh.update()
    obj=bpy.data.objects.new(P+f'{slot} glass',mesh);scene.collection.objects.link(obj);finish(obj,obj.name,GLASS)
    for poly in mesh.polygons: poly.use_smooth=True
    # Hairline specular strips follow the curved glass, with a tapered rounded shoulder.
    SHINE = material('Nixie glass edge reflection', (.78,.84,.75), .15, .18)
    sn = next(n for n in SHINE.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    sn.inputs['Alpha'].default_value = .24
    SHINE.surface_render_method='BLENDED'
    glints=[]
    for side in [-1,1]:
        glints.append([(x+side*r*.84,y,cz+r*.543) for r,y in profile[1:8]])
    wires(P+f'{slot} glass glints',glints,.002,SHINE)
    # Mesh anode, support rods and ten separately spaced inactive digit wires.
    strips=[]
    for sx in [-.164,.164]: strips.append([(x+sx,3.73,.92),(x+sx,4.34,.92)])
    strips += [[(x-.164,yy,.92),(x+.164,yy,.92)] for yy in [3.74,4.33]]
    wires(P+f'{slot} support cage',strips,.006,METAL)
    lattice=[]
    for k in range(17):
        xx=x-.16+k*.02;lattice.append([(xx,3.77,1.046),(xx,4.31,1.046)])
    for k in range(25):
        yy=3.78+k*.022;lattice.append([(x-.16,yy,1.046),(x+.16,yy,1.046)])
    wires(P+f'{slot} anode mesh',lattice,.00085,METAL)
    dormant=[]
    for digit,path in enumerate(paths):
        z=1.026-digit*.0085
        segments=[[(x+(u-50)*.0030,4.30-v*.00325,z) for u,v in strip] for strip in sample(path)]
        dormant.extend(segments)
        obj=wires(P+f'Digit_{slot}_{digit}',segments,.0055,LIT)
        obj['slot']=slot;obj['digit']=digit;obj['cathode_path']=path
    wires(P+f'{slot} cathode stack',dormant,.0018,WIRE)
    wires(P+f'{slot} lower leads', [[(x+dx,3.67,.91),(x+dx,3.76,1.0)] for dx in [-.12,-.08,-.04,0,.04,.08,.12]],.003,METAL)
surfaces['channel'].update(x=5.56,y=4.04,w=2.16,h=.86,z=1.15)

# Keep the original editable printer, but register roller tangent and paper nip.
# Saved matrices make reruns absolute, never incremental.
printer_prefixes=('Printer','Paper roller','PaperFeed','Interaction_paper','Interaction_tear','Tactile_paper retaining','Tactile_printer emboss')
objects=[o for o in bpy.data.objects if o.name.startswith(printer_prefixes)]
names={o.name for o in objects}
for obj in objects:
    if obj.parent and obj.parent.name in names: continue
    if 'receipt_base_matrix' not in obj: obj['receipt_base_matrix']=[v for row in obj.matrix_world for v in row]
    v=obj['receipt_base_matrix'];base=Matrix([v[i:i+4] for i in range(0,16,4)])
    obj.matrix_world=Matrix.Translation((0,-.115,.20))@base
bpy.context.view_layer.update()
feed=bpy.data.objects['PaperFeed'];feed['paper_length']=1.05
old=bpy.data.objects['Paper back'];remove(old)
verts=[];faces=[];length=1.05;width=2.24;cols=32;rows=40
for row in range(rows+1):
    d=row/rows*length;curl=max(0,(d-(length-.18))/.18)
    for col in range(cols+1):
        x=(col/cols-.5)*width
        # Small teeth belong to the paper itself, independent of the metal cutter.
        tooth=.008*(col%2) if row==0 or row==rows else 0
        verts.append((x,-.035*curl*curl,-d-tooth))
for row in range(rows):
    for col in range(cols):
        a=row*(cols+1)+col;b=a+cols+1;faces.append((a,b,b+1,a+1))
mesh=bpy.data.meshes.new('Receipt stock with tear subdivisions');mesh.from_pydata(verts,[],faces);mesh.update()
uv=mesh.uv_layers.new(name='Receipt print')
for poly in mesh.polygons:
    poly.use_smooth=True
    for loop in poly.loop_indices:
        co=mesh.vertices[mesh.loops[loop].vertex_index].co
        uv.data[loop].uv=(co.x/width+.5,1+co.z/length)
obj=bpy.data.objects.new('Paper back',mesh);scene.collection.objects.link(obj);obj.parent=feed
finish(obj,obj.name,material('Receipt uncoated stock',(.80,.75,.64),0,.94))
obj['paper_length']=length
solid=obj.modifiers.new('Paper cut edge','SOLIDIFY');solid.thickness=.007
surfaces['paper'].update(x=5.83,y=feed.location.z-.80/2,w=width,h=.80,z=-feed.location.y+.012)

# Shorten the visible stem and grip as a single pivoted assembly. Keep the bushing.
# Newer panel-layout passes model the bat at its final short length and mark it
# with 'short_bat'; squashing the tilted assembly again sheared the cap off the
# tip axis, so only legacy long bats are scaled here.
switch=bpy.data.objects['PowerSwitch']
if not switch.get('short_bat'):
    for obj in switch.children:
        if 'short_bat_base_matrix' not in obj:obj['short_bat_base_matrix']=[v for row in obj.matrix_basis for v in row]
        v=obj['short_bat_base_matrix'];base=Matrix([v[i:i+4] for i in range(0,16,4)])
        obj.matrix_basis=Matrix.Diagonal((1,1,.64,1))@base
surfaces['powerControl'].update(y=5.72,h=1.15)
scene['nixie_reference']='Original geometry, IN-14 construction; BlendSwap 10631 studied as reference, no imported third-party mesh.'
bpy.context.view_layer.update()
bpy.ops.export_scene.gltf(filepath=str(OUT/'decrypto-console.glb'),export_format='GLB',export_apply=True,use_renderable=True,
 export_draco_mesh_compression_enable=True,export_draco_mesh_compression_level=6,export_draco_position_quantization=16,
 export_draco_normal_quantization=12,export_cameras=False,export_lights=False,export_extras=True)
# The editable source opens on the same readable demo number as the browser.
# All forty variants were exported so the runtime can select any room code.
for obj in bpy.data.objects:
    if obj.name.startswith('Nixie_Digit_'):
        active = str(obj['digit']) == '5821'[obj['slot']]
        obj.hide_render = not active
        obj.hide_set(not active)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/console/decrypto-console.blend'))
(OUT/'console-surfaces.json').write_text(json.dumps(surfaces,indent=2)+'\n')
print('Exported: four detailed glass tubes, forty live cathodes, shorter power bat, registered receipt.')
