"""Rebuild the approved console: blender -b --python assets/console/build_console.py.

Design coordinates are X horizontal, Y up, Z toward the player (metres are arbitrary).
Blender's glTF exporter maps our (x, -z, y) back to these Three.js coordinates.
All moving parts retain stable names; screen/print textures are supplied at runtime.
"""
import bpy
import math
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "web/public/models"
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

def material(name, color, metallic=0, roughness=.45):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    bs = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if bs is None:
        bs = m.node_tree.nodes.new('ShaderNodeBsdfPrincipled')
        output = m.node_tree.nodes.new('ShaderNodeOutputMaterial')
        m.node_tree.links.new(bs.outputs['BSDF'], output.inputs['Surface'])
    bs.inputs['Base Color'].default_value = (*color, 1)
    bs.inputs['Metallic'].default_value = metallic
    bs.inputs['Roughness'].default_value = roughness
    return m

ivory = material('Porcelain enamel', (.78, .72, .60), .08)
edge = material('Warm enamel edge', (.54, .49, .39), .15)
navy = material('Midnight blue chassis', (.008, .018, .035), .15)
black = material('Recess rubber', (.008, .014, .019), 0, .6)
silver = material('Satin nickel', (.40, .43, .43), .78, .3)
red = material('Vermilion bakelite', (.48, .035, .018), .18, .3)
glass = material('Decoder glass', (.11, .008, .004), .16, .25)
paper = material('Archive stock', (.86, .80, .66), 0, .8)
green = material('Link lens', (.08, .25, .12), .15, .25)

def box(name, x, y, z, w, h, d, mat, bevel=.06):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x, -z, y))
    o = bpy.context.object
    o.name = name
    o.dimensions = (w, d, h)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.data.materials.append(mat)
    if bevel:
        mod = o.modifiers.new('Soft machined edges', 'BEVEL')
        mod.width = bevel
        mod.segments = 4
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.modifier_apply(modifier=mod.name)
        mod = o.modifiers.new('Weighted corner normals', 'WEIGHTED_NORMAL')
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return o

def cylinder(name, x, y, z, radius, depth, mat, axis='z'):
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=radius, depth=depth,
        location=(x, -z, y))
    o = bpy.context.object
    o.name = name
    o.rotation_euler = (math.pi / 2, 0, 0) if axis == 'z' else (0, math.pi / 2, 0)
    o.data.materials.append(mat)
    mod = o.modifiers.new('Rim bevel', 'BEVEL'); mod.width=.035; mod.segments=3
    bpy.context.view_layer.objects.active=o
    bpy.ops.object.modifier_apply(modifier=mod.name)
    for p in o.data.polygons: p.use_smooth = True
    return o

def screw(x, y, z=.64):
    cylinder('Fastener', x, y, z, .055, .028, silver)
    box('Screw slot', x, y, z+.02, .055, .009, .005, black, .002)

def panel(name, x,y,w,h):
    box(name+' seam',x,y,.43,w+.035,h+.035,.08,edge,.12)
    box(name,x,y,.49,w,h,.12,ivory,.11)

box('Chassis',0,0,-.30,16,10.7,1.1,navy,.35)
box('Front enamel',0,0,.35,15.65,10.32,.26,ivory,.26)
panel('Decoder rack',-.45,3.9,9.05,1.72)
panel('Receiver column',-6.25,1.54,2.45,6.38)
panel('Control deck',-.45,-3.49,9.05,1.24)
panel('Archive column',5.83,.7,3.35,8.05)
panel('Scope panel',-6.25,-3.14,2.45,1.96)
panel('Power rail',-1.67,-4.65,11.65,.72)

surfaces = {}
def surface(name,x,y,w,h,z=.72):
    surfaces[name] = dict(x=x,y=y,w=w,h=h,z=z)

# The screen is recessed inside a continuous cast bezel, with no browser frame.
box('Screen outer frame',-.45,.3,.61,9.05,5.62,.24,edge,.43)
box('Screen nickel lip',-.45,.3,.72,8.79,5.36,.18,silver,.39)
box('Screen gasket',-.45,.3,.80,8.66,5.23,.19,black,.38)
surface('screen',-.45,.3,8.37,4.96,.909)

for i in range(4):
    x=-3.83+i*2.25
    box('Optical bezel '+str(i),x,3.9,.64,2.12,1.43,.20,silver,.12)
    box('Optical gasket '+str(i),x,3.9,.76,1.96,1.28,.12,black,.13)
    box('Ruby lens '+str(i),x,3.9,.82,1.81,1.10,.075,glass,.14)
    surface('word'+str(i),x,3.9,1.78,1.05,.863)
    for dx in [-.94,.94]: screw(x+dx,4.50,.77)

surface('roster',-6.25,1.14,2.14,4.36,.56)
surface('badge',-6.25,4.05,1.65,.87,.56)
for row in range(3):
    for col in range(11):
        cylinder('Speaker perforation',-7.12+col*.17,3.70-row*.12,.565,.024,.009,black)

# An actual open drive mouth: the fascia surrounds the disk rather than
# intersecting it with a solid silver plate. The inclined transport exposes
# the outer end of a square disk; its shutter is at the inserted end.
box('Floppy mount',-6.25,-1.63,.65,2.12,1.1,.25,navy,.09)
box('Drive cavity',-6.25,-1.57,.795,1.78,.72,.035,black,.035)
box('Drive upper fascia',-6.25,-1.33,.91,1.80,.28,.22,silver,.035)
box('Drive lower fascia',-6.25,-1.87,.91,1.80,.28,.22,silver,.035)
for x in [-7.105,-5.395]:
    box('Drive side jamb',x,-1.60,.91,.09,.29,.22,silver,.018)
box('Drive upper lip',-6.25,-1.48,.99,1.62,.045,.09,black,.01)
box('Drive lower lip',-6.25,-1.71,.99,1.62,.035,.09,black,.008)

disk_angle = math.radians(65)
def disk_point(u,v,n):
    return (-6.36+u, -1.67+v*math.cos(disk_angle)+n*math.sin(disk_angle),
            1.13-v*math.sin(disk_angle)+n*math.cos(disk_angle))

def disk_part(name,u,v,n,w,h,d,mat,bevel=.01):
    o=box(name,*disk_point(u,v,n),w,h,d,mat,bevel)
    o.rotation_euler.x=-disk_angle
    return o

disk_part('Floppy shell lower',0,0,-.021,1.28,1.32,.038,black,.025)
disk_part('Floppy disk',0,0,.021,1.28,1.32,.038,navy,.025)
disk_part('Floppy shutter',0,.43,.048,.76,.43,.018,silver)
disk_part('Floppy shutter aperture',.20,.43,.059,.16,.30,.004,black,.004)
disk_part('Floppy label recess',0,-.28,.043,1.05,.56,.009,black)
disk_part('Floppy paper label',0,-.28,.050,.99,.50,.009,paper)
disk_part('Floppy label stripe',0,-.075,.056,.99,.07,.004,red,.002)
for u in [-.55,.55]:
    disk_part('Floppy grip',u,-.42,.044,.025,.24,.008,black,.003)
label_x,label_y,label_z=disk_point(0,-.31,.058)
surface('disklabel',label_x,label_y,.87,.30,label_z)
surfaces['disklabel']['rotationX']=-disk_angle
box('Eject socket',-5.57,-1.85,1.034,.30,.16,.028,black,.02)
box('Eject tab',-5.57,-1.85,1.076,.24,.11,.075,red,.016)
cylinder('Drive activity bezel',-6.98,-1.89,1.035,.049,.028,black)
cylinder('Drive activity lens',-6.98,-1.89,1.055,.028,.02,green)
for x in [-7.19,-5.31]: screw(x,-1.19,.79)

box('Scope rim',-6.48,-3.08,.65,1.72,1.52,.20,silver,.18)
box('Scope gasket',-6.48,-3.08,.79,1.57,1.38,.15,black,.19)
surface('scope',-6.48,-3.08,1.4,1.18,.88)
cylinder('Scope knob',-5.45,-3.05,.78,.19,.27,silver)
box('Knob pointer',-5.45,-2.99,.926,.023,.16,.01,black,.004)

surface('brand',5.83,4.1,2.95,.88,.57)
box('Score bezel',5.83,2.73,.63,2.92,1.80,.14,silver,.13)
surface('score',5.83,2.73,2.79,1.66,.714)
surface('archiveLabel',5.83,1.51,2.7,.3,.56)
box('Printer frame',5.68,1.02,.64,2.74,.52,.19,silver,.08)
box('Printer opening',5.68,1.03,.78,2.53,.30,.13,black,.045)
cylinder('Paper roller',5.68,1.04,.86,.095,2.30,black,axis='x')
box('Paper back',5.66,-.58,.70,2.32,3.0,.035,paper,.02)
surface('paper',5.66,-.58,2.27,2.97,.725)
cylinder('Paper curl',5.66,-2.07,.745,.054,2.3,paper,axis='x')
cylinder('Archive scroll wheel',7.04,-.68,.69,.20,.36,silver)
surface('wheel',7.04,-.68,.50,.70,.93)
for i in range(12):
    a=i*math.pi/6
    box('Wheel knurl',7.04+math.sin(a)*.177,-.68+math.cos(a)*.177,.88,.019,.032,.012,black,.002)
surface('archiveControls',5.83,-2.35,2.9,.27,.57)

# A pivot object allows the entire transmitting lever to rotate, not just its tip.
lever=bpy.data.objects.new('TransmitLever',None)
bpy.context.collection.objects.link(lever)
lever.location=(6.90,-.73,-3.31)
cylinder('Transmit drum',5.77,-3.28,.75,.25,1.65,red,axis='x')
for x in [4.87,6.67]:
    box('Drum bracket',x,-3.28,.68,.13,.72,.26,silver,.05)
box('Lever socket',6.9,-3.34,.63,.28,.83,.13,black,.10)
shaft=box('Lever shaft',6.9,-3.16,.88,.09,.65,.09,silver,.025)
bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=12,radius=.17,location=(6.9,-.91,-2.80))
ball=bpy.context.object; ball.name='Lever knob'; ball.data.materials.append(red)
for o in [shaft,ball]:
    matrix=o.matrix_world.copy(); o.parent=lever; o.matrix_world=matrix
surface('transmitLabel',5.8,-3.94,2.83,.35,.56)

box('Clock frame',-3.81,-3.48,.64,1.64,.78,.18,silver,.07)
surface('clock',-3.81,-3.48,1.47,.62,.743)
for i in range(5):
    x=-2.15+i*.86
    box('Key socket '+str(i),x,-3.48,.60,.78,.91,.10,black,.08)
    box('Key_'+str(i),x,-3.48,.76,.68,.80,.24,navy,.08)
    surface('key'+str(i),x,-3.48,.58,.64,.888)
surface('phase',2.92,-3.48,1.93,.75,.65)
box('Phase backing',2.92,-3.48,.57,2.10,.91,.13,navy,.07)

box('Power socket',-6.83,-4.65,.62,.44,.51,.13,black,.03)
box('Power rocker',-6.83,-4.65,.73,.32,.41,.14,red,.03)
surface('power',-6.83,-4.65,.25,.32,.808)
cylinder('Connection bezel',-4.92,-4.65,.65,.14,.08,silver)
cylinder('Connection lens',-4.92,-4.65,.73,.105,.08,green)
surface('footer',-3.63,-4.65,5.95,.29,.57)
for i in range(13): box('Vent slot',.21+i*.17,-4.65,.56,.058,.30,.017,black,.026)
for x,y in [(-7.36,4.8),(7.37,4.8),(-7.36,-4.9),(3.83,-4.9),(-4.73,-4.04),(3.84,-4.04)]: screw(x,y)

# Source scene lighting/camera for convenient Blender inspection (excluded from GLB).
bpy.ops.object.camera_add(location=(0,-26,7))
cam=bpy.context.object; cam.name='Inspection camera'
from mathutils import Vector
cam.rotation_euler=(Vector((0,0,0))-cam.location).to_track_quat('-Z','Y').to_euler()
cam.data.type='ORTHO';cam.data.ortho_scale=18.0;bpy.context.scene.camera=cam
for pos,energy,size in [((-6,-9,12),1600,9),((9,-5,4),800,8)]:
    bpy.ops.object.light_add(type='AREA',location=pos)
    o=bpy.context.object;o.data.energy=energy;o.data.shape='DISK';o.data.size=size
    o.rotation_euler=(Vector((0,0,0))-o.location).to_track_quat('-Z','Y').to_euler()
bpy.context.scene.world.color=(.3,.3,.3)
bpy.context.scene.render.engine='CYCLES'
bpy.context.scene.cycles.samples=32
bpy.context.scene.render.resolution_x=1600;bpy.context.scene.render.resolution_y=1100
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/console/decrypto-console.blend'))
bpy.ops.export_scene.gltf(filepath=str(OUT/'decrypto-console.glb'),export_format='GLB',export_cameras=False,export_lights=False)
(OUT/'console-surfaces.json').write_text(json.dumps(surfaces,indent=2))
print('Console exported:',len(bpy.data.objects),'objects;',len(surfaces),'runtime surfaces')
