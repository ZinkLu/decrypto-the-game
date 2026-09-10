"""Build the front as separate manufactured assemblies, after remodel_instrument.py.

Idempotent; preserves the existing chassis and every moving mechanism. X is
right, Y is up and Z points towards the player. Runtime print is registered to
individual card/indicator faces; it does not supply their structure or shadows.
"""
import json
import math
from pathlib import Path

import bmesh
import bpy

ROOT = Path(__file__).resolve().parents[2]
PREFIX = 'Front_'
OUT = ROOT / 'web/public/models'
surfaces = json.loads((OUT / 'console-surfaces.json').read_text())
for obj in list(bpy.data.objects):
    if obj.name.startswith(PREFIX):
        bpy.data.objects.remove(obj, do_unlink=True)
for key in list(surfaces):
    if key.startswith(('rosterA', 'rosterB', 'scoreToken')):
        del surfaces[key]


def remove(name):
    if obj := bpy.data.objects.get(name):
        bpy.data.objects.remove(obj, do_unlink=True)


def material(name, color, metal=0, roughness=.5):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    for key, value in [('Base Color', (*color, 1)), ('Metallic', metal), ('Roughness', roughness)]:
        bsdf.inputs[key].default_value = value
    return mat


NICKEL = bpy.data.materials['Satin nickel']
BLACK = bpy.data.materials['Recess rubber']
PANEL = bpy.data.materials['Instrument anodized face']
INK = bpy.data.materials['Instrument legends']
PAPER = material('Credential rag stock', (.69, .62, .46), 0, .93)
FIBER = material('Credential cut edges', (.43, .36, .23), 0, .98)
GREEN = material('Roster baked enamel', (.032, .064, .049), .12, .5)
BLUE = material('Team A enamel', (.035, .103, .13), .17, .36)
RED = material('Team B enamel', (.27, .051, .029), .17, .36)
BRASS = material('Roster retaining brass', (.34, .25, .12), .77, .35)
SCORE = material('Score instrument face', (.021, .043, .046), .12, .45)


def finish(obj, name, mat, bevel=0):
    obj.name = name
    obj.data.materials.append(mat)
    if bevel:
        mod = obj.modifiers.new('Rolled and machined edges', 'BEVEL')
        mod.width, mod.segments = bevel, 3
        mod = obj.modifiers.new('Manufactured face normals', 'WEIGHTED_NORMAL')
        mod.keep_sharp = True
    return obj


def box(name, x, y, z, w, h, d, mat, bevel=.012):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x, -z, y))
    obj = bpy.context.object
    obj.dimensions = (w, d, h)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, name, mat, bevel)


def cylinder(name, x, y, z, radius, depth, mat, vertices=40):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth,
                                      location=(x, -z, y), rotation=(math.pi/2, 0, 0))
    obj = finish(bpy.context.object, name, mat, min(.01, depth / 5))
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return obj


def ring(name, x, y, profiles, mat, segments=8):
    vertices, faces = [], []
    for w, h, radius, z in profiles:
        for cx, cy, start in [(w/2-radius,h/2-radius,0),(-w/2+radius,h/2-radius,90),
                              (-w/2+radius,-h/2+radius,180),(w/2-radius,-h/2+radius,270)]:
            for i in range(segments+1):
                angle = math.radians(start+i*90/segments)
                vertices.append((x+cx+radius*math.cos(angle), -z, y+cy+radius*math.sin(angle)))
    count = 4*(segments+1)
    for j in range(len(profiles)):
        for i in range(count):
            n, k = (i+1)%count, (j+1)%len(profiles)
            faces.append((j*count+i,j*count+n,k*count+n,k*count+i))
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
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    return finish(obj, name, mat)


def screw(name, x, y, z, radius=.035):
    cylinder(PREFIX+name+' washer', x,y,z-.013,radius*1.36,.022,BLACK,24)
    cylinder(PREFIX+name+' head', x,y,z+.012,radius,.037,NICKEL,24)
    slot = box(PREFIX+name+' slot',x,y,z+.032,radius*1.35,.012,.008,INK,.002)
    slot.rotation_euler[1] = -.35


def surface(name, x, y, w, h, z, lit=True):
    surfaces[name] = dict(x=x,y=y,w=w,h=h,z=z,lit=lit)


def roster_rect(x, y, w, h):
    return (-6.25 + ((x+w/2)/400-.5)*2.14,
            1.14 + (.5-(y+h/2)/815)*4.36, w/400*2.14, h/815*4.36)


# The personnel rack is a casting with two removable four-seat cassettes.
# Its open profiles reveal the depth of the channels at the inspection angle.
ring(PREFIX+'roster isolation gasket',-6.25,1.14,
     [(2.43,4.53,.08,.55),(2.43,4.53,.08,.65),(2.22,4.32,.05,.65),(2.22,4.32,.05,.55)],BLACK)
ring(PREFIX+'roster cast carrier',-6.25,1.14,
     [(2.38,4.48,.08,.61),(2.38,4.48,.08,.95),(2.30,4.40,.06,1.035),
      (2.15,4.25,.04,1.035),(2.12,4.22,.035,.82)],NICKEL)
box(PREFIX+'roster enamel bed',-6.25,1.14,.85,2.19,4.32,.13,GREEN,.025)
surface('roster',-6.25,1.14,2.14,4.36,1.045)
for side in [-1,1]:
    for y in [3.27,-.99]:
        screw(f'roster carrier bolt {side} {y}',-6.25+side*1.12,y,1.018,.027)

for k, team in enumerate(['A','B']):
    y = 71+k*365
    cx, cy, w, h = roster_rect(18,y,364,348)
    box(PREFIX+f'roster cassette {team}',cx,cy,.945,w,h,.13,BLACK,.018)
    tx, ty, tw, th = roster_rect(18,y,364,48)
    box(PREFIX+f'roster team plaque {team}',tx,ty,1.022,tw,th,.07,BLUE if k == 0 else RED,.025)
    surface(f'roster{team}',tx,ty,tw,th,1.060)
    for side in [-1,1]:
        screw(f'roster plaque rivet {team} {side}',tx+side*(tw/2-.041),ty,1.055,.016)
    for i in range(4):
        yy = y+59+i*72
        cx,cy,w,h = roster_rect(23,yy+2,354,59)
        box(PREFIX+f'roster seat well {team}{i+1}',cx,cy,1.004,w+.055,h+.044,.05,BLACK,.01)
        # Cardstock thickness and the darker cut edge remain real geometry.
        box(PREFIX+f'roster card edge {team}{i+1}',cx,cy,1.045,w+.016,h+.008,.049,FIBER,.008)
        box(PREFIX+f'roster card {team}{i+1}',cx,cy,1.072,w,h,.023,PAPER,.007)
        surface(f'roster{team}{i}',cx,cy,w,h,1.087)
        box(PREFIX+f'roster channel {team}{i+1}',cx,cy-h/2-.010,1.095,w+.060,.030,.113,NICKEL,.007)
        for side in [-1,1]:
            x = cx+side*(w/2-.018)
            box(PREFIX+f'roster spring seat {team}{i+1} {side}',x,cy,1.031,.036,h*.84,.085,BRASS,.006)
            tab = box(PREFIX+f'roster spring return {team}{i+1} {side}',x,cy+h*.28,1.105,.059,h*.26,.034,NICKEL,.007)
            tab.rotation_euler[1] = side*.08
    # A folded metal divider and thumb notch separate the team cartridges.
    if k == 0:
        box(PREFIX+'roster cassette divider',-6.25,1.038,1.021,2.04,.026,.16,NICKEL,.009)

# Raised engraved identification plates, with a readable gap above the vents.
box(PREFIX+'bureau plate gasket',-6.25,4.18,.603,1.99,.80,.10,BLACK,.04)
box(PREFIX+'bureau plate',-6.25,4.18,.712,1.92,.75,.13,PANEL,.04)
surface('badge',-6.25,4.18,1.65,.70,.781)
for side in [-1,1]:
    screw(f'bureau plate rivet {side}',-6.25+side*.84,4.18,.786,.027)
box(PREFIX+'brand plaque gasket',5.83,4.13,.592,3.04,.98,.08,BLACK,.05)
box(PREFIX+'brand plaque',5.83,4.13,.698,2.99,.91,.16,PANEL,.04)
surface('brand',5.83,4.13,2.80,.82,.784)
for side in [-1,1]:
    for y in [3.79,4.47]:
        screw(f'brand plaque screw {side} {y}',5.83+side*1.40,y,.779,.024)

# Each score position is a recessed, retained physical indicator. Its ink and
# color follow the live score on an independently registered circular face.
remove('Score bezel')
ring('Score bezel',5.83,2.73,
     [(3.02,1.91,.11,.56),(3.02,1.91,.11,.98),(2.94,1.83,.09,1.07),
      (2.79,1.68,.06,1.07),(2.76,1.65,.055,.88)],NICKEL)
box(PREFIX+'score enamel bed',5.83,2.73,.878,2.82,1.71,.10,SCORE,.055)
surface('score',5.83,2.73,2.79,1.66,.933)
for i, team in enumerate(['A','B']):
    for j, category in enumerate(['intercept','failure']):
        for k in range(2):
            px,py = 187+j*227+k*76,153+i*103
            x,y = 5.83+(px/600-.5)*2.79,2.73+(.5-py/357)*1.66
            name = f'{team}_{category}_{k}'
            cylinder(PREFIX+'score socket '+name,x,y,.946,.141,.083,BLACK)
            cylinder(PREFIX+'score rim '+name,x,y,.993,.126,.047,NICKEL)
            cylinder(PREFIX+'score indicator '+name,x,y,1.026,.108,.060,SCORE)
            surface('scoreToken'+name,x,y,.192,.192,1.059)
            for side in [-1,1]:
                box(PREFIX+'score index '+name+str(side),x+side*.137,y,.986,.012,.025,.011,BRASS,.002)
for side in [-1,1]:
    screw(f'score captive screw {side}',5.83+side*1.46,2.73,1.045,.031)

# A hollow printer mouth, feed cheeks and serrated lip give the paper a source.
remove('Printer frame')
ring('Printer frame',5.68,1.09,
     [(2.86,.50,.075,.55),(2.86,.50,.075,.96),(2.77,.43,.060,1.02),
      (2.55,.30,.04,1.02),(2.51,.27,.035,.83)],NICKEL)
box(PREFIX+'printer feed tray',5.66,.47,.795,2.48,1.03,.09,BLACK,.025)
for side in [-1,1]:
    box(PREFIX+f'printer guide cheek {side}',5.66+side*1.195,.48,.891,.08,.95,.17,NICKEL,.015)
    box(PREFIX+f'printer folded guide {side}',5.66+side*1.145,.80,.984,.12,.18,.03,NICKEL,.012)
box(PREFIX+'printer tear bar',5.68,.851,1.027,2.38,.040,.050,NICKEL,.008)
for i in range(37):
    # Triangular teeth are geometry, not a raster zig-zag.
    x = 4.51+i*.064
    verts = [(x,-1.044,.848),(x+.045,-1.044,.848),(x+.0225,-1.044,.811),
             (x,-1.015,.848),(x+.045,-1.015,.848),(x+.0225,-1.015,.811)]
    mesh = bpy.data.meshes.new(PREFIX+f'tear tooth {i}')
    mesh.from_pydata(verts,[],[(0,2,1),(3,4,5),(0,1,4,3),(1,2,5,4),(2,0,3,5)])
    mesh.update()
    obj = bpy.data.objects.new(mesh.name,mesh)
    bpy.context.collection.objects.link(obj)
    finish(obj,obj.name,NICKEL)
bpy.data.objects['Paper back'].location.y = -.925
bpy.data.objects['Paper curl'].location.y = -.968
surfaces['paper']['z'] = .947
surfaces['paper']['lit'] = True

# The time and phase readouts get their own deep, removable instrument housings.
remove('Clock frame')
ring('Clock frame',-3.81,-3.48,
     [(1.68,.83,.07,.57),(1.68,.83,.07,.96),(1.60,.75,.055,1.025),
      (1.48,.63,.045,1.025),(1.46,.61,.04,.87)],NICKEL)
box(PREFIX+'clock recess',-3.81,-3.48,.876,1.49,.65,.058,BLACK,.025)
surfaces['clock']['z'] = .910
remove('Phase backing')
box('Phase backing',2.92,-3.48,.833,2.11,.91,.15,BLACK,.05)
ring(PREFIX+'phase cast bezel',2.92,-3.48,
     [(2.17,.97,.06,.62),(2.17,.97,.06,.99),(2.07,.87,.045,1.03),
      (1.96,.76,.025,1.03),(1.93,.73,.02,.88)],NICKEL)
surfaces['phase']['z'] = .916
for x in [2.56,3.18]:
    box(PREFIX+'phase separator '+str(x),x,-3.37,.959,.022,.44,.08,NICKEL,.006)

# Keep editable manufacturing modifiers in the source; apply only in the GLB.
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/console/decrypto-console.blend'))
bpy.ops.export_scene.gltf(filepath=str(OUT/'decrypto-console.glb'),export_format='GLB',
                          export_apply=True,export_draco_mesh_compression_enable=True,
                          export_draco_mesh_compression_level=6,
                          export_draco_position_quantization=16,export_draco_normal_quantization=12,
                          export_cameras=False,export_lights=False)
(OUT/'console-surfaces.json').write_text(json.dumps(surfaces,indent=2)+'\n')
print(f'Front remodel exported: {sum(o.name.startswith(PREFIX) for o in bpy.data.objects)} parts, {len(surfaces)} print surfaces')
