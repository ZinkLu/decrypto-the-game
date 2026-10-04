"""Refine the existing console's coax patch lead and manual floppy mechanism.
Run on decrypto-console.blend; preserves all other assemblies and editable cutters.
"""
import json, math, sys
from pathlib import Path
import bpy
from mathutils import Matrix, Vector
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(Path(__file__).resolve().parent))
from console_parts import material, box, cylinder, ring
OUT=ROOT/'web/public/models'
surfaces=json.loads((OUT/'console-surfaces.json').read_text())
P='DriveDetail_'

def remove(obj):
    if isinstance(obj,str): obj=bpy.data.objects.get(obj)
    if obj: bpy.data.objects.remove(obj,do_unlink=True)

def attach(obj,parent):
    bpy.context.view_layer.update(); world=obj.matrix_world.copy();obj.parent=parent;obj.matrix_world=world
    return obj

def label(name,body,x,y,z,size,mat):
    remove(name)
    bpy.ops.object.text_add(location=(x,-z,y),rotation=(math.pi/2,0,0))
    o=bpy.context.object;o.name=name;o.data.body=body;o.data.align_x='CENTER';o.data.align_y='CENTER';o.data.size=size
    o.data.extrude=.0006;o.data.materials.append(mat)
    bpy.ops.object.convert(target='MESH');o.select_set(False)
    return o

def bore(obj,cut):
    # Apply only the new cut, leaving the object's original bevel editable.
    bpy.context.view_layer.objects.active=obj
    m=obj.modifiers.new('Thumb access scallop','BOOLEAN');m.object=cut;m.operation='DIFFERENCE';m.solver='EXACT'
    bpy.ops.object.modifier_move_up(modifier=m.name)
    bpy.ops.object.modifier_move_up(modifier=m.name)
    bpy.ops.object.modifier_apply(modifier=m.name)

BLACK=bpy.data.materials['Drive charcoal housing']
NICKEL=bpy.data.materials['Tactile brushed nickel']
INK=bpy.data.materials['Instrument legends']
RUBBER=material('Drive guide rubber',(.016,.023,.021),0,.72)
SHELL=material('Disk textured charcoal',(.027,.044,.041),0,.57)
SHUTTER=material('Disk satin stainless shutter',(.38,.41,.39),.82,.31)
PAPER=bpy.data.materials.get('Tactile cotton paper') or material('Disk label paper',(.75,.71,.58),0,.86)
for o in list(bpy.data.objects):
    if o.name.startswith((P,'ScopePatch_')):remove(o)

# Route the coax as a visible local calibration patch, in the unused side gutter.
# Both endpoints terminate in modeled BNCs; nothing crosses the CRT or knobs.
for o in bpy.data.objects:
    if o.name.startswith(('ScopeDetail_input','Instrument_BNC')) and o.name!='ScopeDetail_input label':
        o.location.z = -2.20  # INPUT at y=-2.20
label('ScopeDetail_input label','INPUT',-5.38,-2.00,.574,.065,INK)
for suffix,y in [('output',-2.94)]:
    cylinder('ScopePatch_'+suffix+' socket flange',-5.38,y,.619,.125,.09,NICKEL)
    cylinder('ScopePatch_'+suffix+' insulator',-5.38,y,.694,.090,.065,RUBBER)
    cylinder('ScopePatch_'+suffix+' connector',-5.38,y,.902,.073,.34,NICKEL)
    for i in range(5):cylinder('ScopePatch_'+suffix+f' grip {i}',-5.38,y,.795+i*.047,.083,.016,NICKEL)
    cylinder('ScopePatch_'+suffix+' boot',-5.38,y,1.139,.065,.17,RUBBER)
label('ScopePatch_output legend','CAL OUT',-5.38,-2.66,.574,.065,INK)
remove('Instrument_coax lead')
curve=bpy.data.curves.new('Scope calibration patch route','CURVE');curve.dimensions='3D';curve.resolution_u=24;curve.bevel_depth=.032;curve.bevel_resolution=4
spline=curve.splines.new('BEZIER')
points=[(-5.38,-2.20,1.245),(-5.18,-2.19,1.43),(-4.96,-2.37,1.48),(-4.97,-2.79,1.46),(-5.18,-2.97,1.40),(-5.38,-2.94,1.224)]
spline.bezier_points.add(len(points)-1)
for p,(x,y,z) in zip(spline.bezier_points,points):p.co=(x,-z,y);p.handle_left_type=p.handle_right_type='AUTO'
o=bpy.data.objects.new('Instrument_coax lead',curve);bpy.context.collection.objects.link(o);curve.materials.append(RUBBER)
for old,new in [('PanelDetail_scope MODE','TRIGGER'),('PanelDetail_scope TIME','TIME/DIV'),('PanelDetail_scope PERSIST','INTENSITY')]:
    # Existing pass uses PanelLayout_ prefix; locate by suffix as well.
    for o in list(bpy.data.objects):
        if o.name.endswith('scope '+old.split()[-1]):
            x,z,y=o.location;name=o.name;label(name,new,x,y,-z,.065 if new=='INTENSITY' else .068,INK)

# A concave central thumb relief cut into the real fascia and both slot lips.
# Preserve the fixed fascia and the central finger recess.
for name,cy,radius in [('Drive lower fascia',-4.70,.17),('Drive lower lip',-4.70,.17),('Drive upper fascia',-4.52,.13),('Drive upper lip',-4.52,.13)]:
    o=bpy.data.objects[name]
    if not o.get('thumb_relief'):
        cut=cylinder(P+'temporary thumb cutter',-6.25,cy,.98,radius,.8,RUBBER,64)
        bore(o,cut);remove(cut);o['thumb_relief']=True
# Deep slot floor, slim guide rails and the inner dust flap live behind the fascia.
box(P+'recessed slot floor',-6.25,-4.58,.812,1.70,.46,.018,RUBBER,.008)
for side in [-1,1]:
    box(P+f'insertion guide {side}',-6.25+side*.70,-4.59,.90,.055,.15,.21,SHUTTER,.008)
    box(P+f'fascia return seam {side}',-6.25+side*.97,-4.59,.790,.012,.48,.013,RUBBER,.003)
box(P+'dust shutter edge',-6.25,-4.46,.87,1.36,.045,.025,SHELL,.004)
label(P+'fixed legend','3.5  /  DOUBLE SIDED',-6.25,-4.365,1.023,.044,INK)
# Separate eject assembly: its travel is driven before the spring releases the disk.
eject=bpy.data.objects.get('FloppyEject')
if not eject:
    eject=bpy.data.objects.new('FloppyEject',None);bpy.context.collection.objects.link(eject);eject.location=(-5.56,-1.075,-4.835)
    attach(bpy.data.objects['Eject tab'],eject)
for i in range(4): attach(box(P+f'eject grip {i}',-5.625+i*.043,-4.835,1.117,.012,.055,.007,RUBBER,.002),eject)
surfaces['diskEjectControl']=dict(x=-5.56,y=-4.835,z=1.13,w=.40,h=.25)
surfaces['scopeModeControl']={**surfaces['scope'],'lit':False}

# Refine the existing disk as two molded shells, an open metal shutter and label.
disk=bpy.data.objects['FloppyTransport'];angle=math.pi/2
if not disk.get('centered_drive'):
    disk.location.x+=.11;surfaces['disklabel']['x']+=.11;disk['centered_drive']=True
bpy.context.view_layer.update()
if not disk.get('normal_insertion'):
    # The original disk was tilted 25 degrees down from the slot's depth axis.
    # Rotate every original shell/label detail about the disk center as a rigid
    # assembly, then center it vertically on the drive guides at y=-4.59.
    old_center=Vector((-6.36,-1.13,-1.67))
    new_center=Vector((-6.36,-1.13,-1.62))
    straighten=Matrix.Translation(new_center) @ Matrix.Rotation(math.radians(-25),4,'X') @ Matrix.Translation(-old_center)
    for obj in list(disk.children):
        obj.matrix_world=disk.matrix_world @ straighten @ obj.matrix_local
    # The canvas overlay uses console coordinates, not Blender coordinates.
    ink=surfaces['disklabel'];dy=ink['y']-(-4.64);dz=ink['z']-1.13
    a=math.radians(-25)
    ink.update(y=-4.59+math.cos(a)*dy-math.sin(a)*dz,
               z=1.13+math.sin(a)*dy+math.cos(a)*dz,rotationX=-math.pi/2)
    disk['normal_insertion']=True
# Export an explicit console-space travel direction, shared by all disk parts.
disk['travel_axis']=[0.0,0.0,1.0]
# New local additions share the original assembly's coordinate frame.
def part(name,u,v,n,w,h,d,mat,bevel=.005):
    x,y,z=(-6.36+u,-1.62+v*math.cos(angle)+n*math.sin(angle),1.13-v*math.sin(angle)+n*math.cos(angle))
    o=box(P+name,x,y,z,w,h,d,mat,bevel);o.rotation_euler.x=-angle
    o.parent=disk # local coordinates intentionally follow original transport
    return o
for name in ['Floppy disk','Floppy shell lower']:
    o=bpy.data.objects[name];o.data.materials.clear();o.data.materials.append(SHELL)
for name in ['Floppy shutter','Floppy shutter aperture']:
    remove(name)
# The aperture is a real opening in a folded U-shaped metal slider.
part('shutter left',-.17,.43,.051,.42,.43,.014,SHUTTER)
part('shutter right',.34,.43,.051,.08,.43,.014,SHUTTER)
part('shutter upper bridge',.15,.617,.051,.34,.056,.014,SHUTTER)
part('shutter lower bridge',.15,.243,.051,.34,.056,.014,SHUTTER)
part('exposed media',.15,.43,.041,.23,.30,.006,RUBBER)
part('shutter return',0,.648,0,.76,.018,.11,SHUTTER)
for side in [-1,1]:
    part(f'shell seam {side}',side*.637,0,0,.006,1.22,.008,RUBBER,.001)
    for i in range(5):part(f'thumb rib {side} {i}',side*.54,-.38-i*.040,.049,.073,.010,.010,RUBBER,.002)
    part(f'corner inset {side}',side*.535,.52,.043,.092,.15,.004,RUBBER)
part('write protect recess',.535,-.55,.047,.105,.105,.008,RUBBER)
part('write protect slider',.535,-.574,.053,.078,.04,.009,SHUTTER)
part('label lower edge',0,-.537,.054,.98,.012,.006,PAPER)
# Add restrained material micrograin to the plastic; no new external assets.
bs=next(n for n in SHELL.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
if not SHELL.node_tree.nodes.get('Mold micrograin'):
    noise=SHELL.node_tree.nodes.new('ShaderNodeTexNoise');noise.name='Mold micrograin';noise.inputs['Scale'].default_value=210;noise.inputs['Detail'].default_value=2
    bump=SHELL.node_tree.nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.13;bump.inputs['Distance'].default_value=.007
    SHELL.node_tree.links.new(noise.outputs['Fac'],bump.inputs['Height']);SHELL.node_tree.links.new(bump.outputs['Normal'],bs.inputs['Normal'])

# Export every runtime room-code digit without exposing retained Boolean cutters.
digits=[(o,o.hide_render,o.hide_get()) for o in bpy.data.objects if o.name.startswith('Nixie_Digit_')]
for o,_,_ in digits:o.hide_render=False;o.hide_set(False)
try:
    bpy.ops.export_scene.gltf(filepath=str(OUT/'decrypto-console.glb'),export_format='GLB',export_apply=True,use_renderable=True,
        export_draco_mesh_compression_enable=True,export_draco_mesh_compression_level=6,export_draco_position_quantization=16,
        export_draco_normal_quantization=12,export_cameras=False,export_lights=False,export_extras=True)
finally:
    for o,r,v in digits:o.hide_render=r;o.hide_set(v)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/console/decrypto-console.blend'))
(OUT/'console-surfaces.json').write_text(json.dumps(surfaces,indent=2)+'\n')
print('Refined scope calibration patch and manual disk drive; preserved 40 room-code digits.')
