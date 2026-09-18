"""Three interchangeable instruments. Does not modify the approved console.

blender -b --python assets/console/build_instrument_studies.py
Exports all three at the same mounting origin; the .blend presents them side by side.
Axes and finishes follow console_parts: x right, y up, z toward the viewer.
"""
import math
import sys
from pathlib import Path
import bpy
import bmesh
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).parent))
from console_parts import box, cylinder, ring, material, finish

bpy.ops.wm.read_factory_settings(use_empty=True)
INK = material('Study carbon ink', (.025, .034, .028), 0, .72)
BLACK = material('Study molded phenolic', (.028, .036, .030), .08, .32)
RUBBER = material('Study mounting gasket', (.022, .027, .021), 0, .86)
NICKEL = material('Study satin nickel', (.37, .41, .35), .78, .3)
BRASS = material('Study spindle brass', (.40, .28, .10), .74, .36)
IVORY = material('Study warm ivory', (.74, .68, .50), 0, .8)
WHITE = material('Study engraved ivory', (.86, .81, .65), 0, .64)
RED = material('Study oxide red', (.38, .055, .026), 0, .57)
GREEN = material('Study muted green', (.085, .17, .12), 0, .72)
AMBER = material('Study ochre', (.54, .32, .085), 0, .7)
GLASS = material('Study optical glass', (.65, .78, .70), 0, .12)
bsdf = GLASS.node_tree.nodes.get('Principled BSDF')
bsdf.inputs['Alpha'].default_value = .075
bsdf.inputs['Coat Weight'].default_value = .55
GLASS.diffuse_color = (.65, .78, .70, .075)
GLASS.surface_render_method = 'BLENDED'

def group(name, x=0, y=0, z=0):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.location = (x, -z, y)
    return obj

def attach(obj, parent):
    bpy.context.view_layer.update()
    matrix = obj.matrix_world.copy()
    obj.parent = parent
    obj.matrix_world = matrix
    return obj

def label(name, text, x, y, z, size=.10, mat=INK):
    curve = bpy.data.curves.new(name, 'FONT')
    curve.body = text
    curve.align_x = 'CENTER'
    curve.align_y = 'CENTER'
    curve.size = size
    curve.space_character = 1.15
    curve.resolution_u = 4
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    obj.location = (x, -z, y)
    obj.rotation_euler = (math.pi / 2, 0, 0)
    obj.data.materials.append(mat)
    return obj

def line(name, points, mat, width=.005):
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions = '3D'
    curve.bevel_depth = width
    curve.bevel_resolution = 2
    spline = curve.splines.new('POLY')
    spline.points.add(len(points) - 1)
    for p, (x,y,z) in zip(spline.points, points):
        p.co = (x,-z,y,1)
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    return obj

def collar(name, x, y, back, front, radius, bore, sides=48):
    """Open circular/hexagonal collar, with a real bore around the buried pivot."""
    vertices, faces = [], []
    count = 48
    for depth, inside in [(back,False),(front,False),(front,True),(back,True)]:
        for i in range(count):
            angle = i * math.tau / count
            r = bore if inside else radius * math.cos(math.pi/sides) / math.cos(
                (angle + math.pi/sides) % (math.tau/sides) - math.pi/sides)
            vertices.append((x+r*math.cos(angle),-depth,y+r*math.sin(angle)))
    for section in range(4):
        for i in range(count):
            a, b = section*count+i, section*count+(i+1)%count
            c, d = ((section+1)%4)*count+(i+1)%count, ((section+1)%4)*count+i
            faces.append((a,b,c,d))
    mesh=bpy.data.meshes.new(name)
    mesh.from_pydata(vertices,[],faces)
    mesh.update()
    bm=bmesh.new();bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    bm.to_mesh(mesh);bm.free()
    obj=bpy.data.objects.new(name,mesh)
    bpy.context.collection.objects.link(obj)
    return finish(obj,name,NICKEL,.002)

def frame(prefix, w=2.48, h=1.22, dial=True, depth=0):
    box(prefix+'Gasket', 0,0,.591,w+.045,h+.045,.07,RUBBER,.075)
    ring(prefix+'Housing',0,0,[(w,h,.10,.59),(w,h,.10,.88+depth),
        (w-.08,h-.08,.08,.94+depth),(w-.26,h-.26,.045,.94+depth),
        (w-.32,h-.32,.035,.73+depth)],BLACK)
    ring(prefix+'RetainingRim',0,0,[(w-.10,h-.10,.07,.935+depth),
        (w-.10,h-.10,.07,.956+depth),(w-.17,h-.17,.055,.956+depth),
        (w-.17,h-.17,.055,.935+depth)],NICKEL)
    box(prefix+'Back',0,0,.715 if dial else .577,w-.29,h-.29,.025,IVORY if dial else INK,.012)
    box(prefix+'Glass',0,0,.915+depth,w-.25,h-.25,.026,GLASS,.035)

def knob(prefix, x, y, radius=.16, selector=False):
    cylinder(prefix+'Seat',x,y,.639,radius+.050,.12,NICKEL)
    cylinder(prefix+'Gasket',x,y,.705,radius+.017,.038,RUBBER)
    root=group(prefix,x,y,.83)
    attach(cylinder(prefix+'Cap',x,y,.824,radius,.22,BLACK,64),root)
    for i in range(32):
        a=i*math.tau/32
        attach(cylinder(prefix+f'Flute{i}',x+math.sin(a)*radius,y+math.cos(a)*radius,
            .814,.008,.18,BLACK,8),root)
    if selector:
        attach(box(prefix+'Paddle',x,y,.977,.085,radius*1.65,.12,BLACK,.02),root)
    attach(box(prefix+'Index',x,y+radius*.65,.943,.017,radius*.45,.008,WHITE,.002),root)
    return root

def needle(prefix, y=-.36, length=.60):
    root=group(prefix+'Needle',0,y,.81)
    mesh=bpy.data.meshes.new(prefix+'StampedBlade')
    mesh.from_pydata([(-.016,-.007,-.10),(.016,-.007,-.10),(.004,-.007,length),
        (-.004,-.007,length),(-.016,.007,-.10),(.016,.007,-.10),
        (.004,.007,length),(-.004,.007,length)],[],
        [(0,1,2,3),(4,7,6,5),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)])
    mesh.update()
    obj=bpy.data.objects.new(prefix+'Blade',mesh)
    bpy.context.collection.objects.link(obj)
    obj.parent=root
    finish(obj,obj.name,INK,.0015)
    attach(box(prefix+'Tip',0,y+length-.055,.821,.012,.11,.008,RED,.002),root)
    attach(cylinder(prefix+'Counterweight',0,y-.077,.824,.036,.023,NICKEL),root)
    cylinder(prefix+'Bearing',0,y,.825,.062,.07,BRASS)
    cylinder(prefix+'Hub',0,y,.865,.038,.02,BLACK)
    return root

roots=[]
def begin(name):
    return name, set(bpy.data.objects)

def end(name, before):
    children=set(bpy.data.objects)-before
    root=group(name)
    for obj in children:
        if obj.parent not in children:
            attach(obj,root)
    roots.append(root)
    return root

# A / refined receiver: S-meter face + large tuning flywheel + small gain knob.
name,before=begin('Instrument_signal')
frame('Signal')
for i in range(41):
    a=-1.08+i/40*2.16
    r=.61; cy=-.36
    length=.069 if i%5==0 else .032
    tick=box(f'SignalTick{i}',math.sin(a)*r,cy+math.cos(a)*r,.747,
        .011 if i%5==0 else .007,length,.004,RED if i>=30 else INK,.001)
    tick.rotation_euler[1]=a
for a,txt in [(-1.08,'1'),(-.81,'3'),(-.54,'5'),(-.27,'7'),(0,'9'),(.54,'+20'),(1.08,'+40')]:
    label('SignalScale'+txt,txt,math.sin(a)*.70,-.36+math.cos(a)*.70,.752,.078,RED if a>0 else INK)
line('SignalArc',[(math.sin(a)*.566,-.36+math.cos(a)*.566,.75)
    for a in [-1.08+i*2.16/64 for i in range(65)]],INK,.003)
label('SignalUnit','SIGNAL',0,-.055,.751,.102)
label('SignalSub','RECEIVER',0,-.205,.751,.055)
needle('Signal')
knob('SignalTuning',-.59,-.98,.235)
for i in range(21):
    a=-2.2+i*4.4/20
    tick=box(f'SignalTuningTick{i}',-.59+math.sin(a)*.304,-.98+math.cos(a)*.304,
        .568,.012 if i%5==0 else .008,.037 if i%5==0 else .022,.004,INK,.001)
    tick.rotation_euler[1]=a
knob('SignalGain',.59,-.98,.125)
for i in range(5):
    a=-.85+i*.425
    tick=box(f'SignalGainTick{i}',.59+math.sin(a)*.228,-1.0+math.cos(a)*.228,
        .568,.009,.026,.004,INK,.001)
    tick.rotation_euler[1]=a
label('SignalTuningLegend','TUNING',-.59,-1.46,.568,.10)
label('SignalGainLegend','GAIN',.59,-1.46,.568,.10)
# A miniature bat toggle lives between the tuning and gain knobs. Its shaft
# pivots inside a threaded bushing; AUTO is up, MAN is down.
cylinder('SignalSweepGasket',0,-1.10,.560,.122,.018,RUBBER)
collar('SignalSweepBushing',0,-1.10,.545,.620,.080,.057)
collar('SignalSweepNut',0,-1.10,.607,.635,.112,.058,6)
sweep=group('SignalSweep',0,-1.10,.591)
bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=12,radius=.050,
    location=(0,-.591,-1.10))
ball=finish(bpy.context.object,'SignalSweepPivot',NICKEL)
for polygon in ball.data.polygons: polygon.use_smooth=True
attach(ball,sweep)
attach(cylinder('SignalSweepBat',0,-1.10,.658,.019,.142,NICKEL,24),sweep)
attach(cylinder('SignalSweepTip',0,-1.10,.745,.033,.063,WHITE,32),sweep)
label('SignalSweepAuto','AUTO',0,-.80,.568,.082)
label('SignalSweepManual','MAN',0,-1.46,.568,.082)
sweep['throw_radians']=.50
sweep['pivot_depth']=.591
sweep['collar_front']=.635
sweep['max_front']=.780
end(name,before)

# B / tuning discriminator: symmetric zero, calibrating band, flywheel knob.
name,before=begin('Instrument_tuning')
frame('Tuning',2.42,1.22)
box('TuningCenterBand',0,.145,.741,.065,.25,.004,GREEN,.005)
for i in range(25):
    a=-1.0+i/24*2
    tick=box(f'TuningTick{i}',math.sin(a)*.61,-.36+math.cos(a)*.61,.749,
        .012 if i%4==0 else .007,.068 if i%4==0 else .031,.004,INK,.001)
    tick.rotation_euler[1]=a
for a,txt in [(-1,'-3'),(-.67,'-2'),(-.33,'-1'),(0,'0'),(.33,'1'),(.67,'2'),(1,'3')]:
    label('TuningScale'+txt,txt,math.sin(a)*.70,-.36+math.cos(a)*.70,.752,.078)
label('TuningUnit','DISCRIMINATOR',0,-.055,.751,.073)
label('TuningSub','CENTER TUNE',0,-.202,.751,.055)
needle('Tuning')
knob('TuningDial',-.59,-.98,.235)
for i in range(9):
    a=-1.6+i*.4
    tick=box(f'TuningKnobTick{i}',-.59+math.sin(a)*.304,-.98+math.cos(a)*.304,
        .568,.012,.035 if i%2==0 else .021,.004,INK,.001)
    tick.rotation_euler[1]=a
knob('TuningFine',.59,-.98,.112)
label('TuningDialLegend','TUNING',-.59,-1.34,.568,.10)
label('TuningFineLegend','FINE',.59,-1.34,.568,.10)
end(name,before)

# C / status drum: a genuinely rotating triangular drum behind an open bezel.
# The axle is horizontal. Three flat faces and their lettering rotate together.
name,before=begin('Instrument_status')
frame('Status',2.48,1.13,False,.30)
# The drum extends behind the aperture; upper/lower shrouds hide the next face.
box('StatusTopShroud',0,.354,1.15,2.19,.215,.075,BLACK,.014)
box('StatusLowerShroud',0,-.354,1.15,2.19,.215,.075,BLACK,.014)
drum=group('StatusDrum',0,0,.89)
for i,(word,mat) in enumerate([('READY',GREEN),('SEND',RED),('WAIT',AMBER)]):
    face=group('StatusFace'+str(i),0,0,.89)
    attach(box('StatusPanel'+str(i),0,0,1.035,1.72,.502,.018,mat,.008),face)
    attach(label('StatusWord'+str(i),word,0,.03,1.047,.25,WHITE),face)
    attach(label('StatusNumber'+str(i),f'0{i+1}  /  LINE STATE',0,-.16,1.047,.05,WHITE),face)
    attach(face,drum)
    face.rotation_euler.x = i * math.tau/3
for side in [-1,1]:
    axle=cylinder('StatusAxle'+str(side),side*.98,0,.89,.052,.23,NICKEL,32)
    axle.rotation_euler=(0,math.pi/2,0)
    box('StatusBearingBlock'+str(side),side*1.02,0,.89,.12,.30,.23,BLACK,.025)
    line('StatusRetainer'+str(side),[(side*.94,-.20,1.12),(side*.94,.20,1.12)],NICKEL,.012)
knob('StatusStep',-.59,-.98,.13,True)
knob('StatusSpeed',.59,-.98,.112)
label('StatusStepLegend','STEP',-.59,-1.34,.568,.10)
label('StatusSpeedLegend','DWELL',.59,-1.34,.568,.10)
label('StatusTitle','LINE SEQUENCER',0,.683,.568,.096)
end(name,before)

# Convert printed type and curves to real geometry. No runtime bitmap labels.
for obj in list(bpy.data.objects):
    if obj.type in {'FONT','CURVE'}:
        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True)
        bpy.context.view_layer.objects.active=obj
        bpy.ops.object.convert(target='MESH')

# Every root shares a mounting origin in glTF. Runtime supplies (5.83,-1.4,0).
bpy.context.view_layer.update()
for root in roots:
    meshes=[o for o in root.children_recursive if o.type=='MESH']
    assert meshes and all(len(o.data.vertices)>0 for o in meshes)
    assert all(abs((o.matrix_world@Vector(c)).x)<1.3 for o in meshes for c in o.bound_box)
    print(root.name, len(meshes), 'meshes')
# Verify the entire drum's circular sweep fits ahead of the console skin and
# behind the glass. Includes the lettering, which turns with its panel.
drum=bpy.data.objects['StatusDrum']
inverse=drum.matrix_world.inverted()
radius=max(math.hypot((inverse@o.matrix_world@Vector(c)).y,
                      (inverse@o.matrix_world@Vector(c)).z)
    for o in drum.children_recursive if o.type=='MESH' for c in o.bound_box)
assert .89-radius > .59, f'Drum intersects the mounting floor: {radius}'
assert .89+radius < 1.202, f'Drum intersects the glass: {radius}'
print('Drum swept clearances:',round(.89-radius-.59,4),round(1.202-.89-radius,4))
# The switch pivot is below its collar; its complete swept envelope is less
# than half the original .521-unit projection above the .55-unit console face.
switch=bpy.data.objects['SignalSweep']
fronts=[]
for i in range(65):
    switch.rotation_euler.x=-.50+i/64
    bpy.context.view_layer.update()
    fronts.extend(-(o.matrix_world@Vector(c)).y
        for o in switch.children_recursive if o.type=='MESH' for c in o.bound_box)
switch.rotation_euler.x=0
assert max(fronts)<.780,f'Switch still projects too far: {max(fronts)}'
assert switch['collar_front']-switch['pivot_depth']>.04
assert (.635-.591)*math.tan(.50)+.019/math.cos(.50)<.058-.008,'Stem hits the bore at full throw'
print('Low switch max front:',round(max(fronts),4),'pivot buried by',round(.635-.591,4))
OUT=ROOT/'web/public/models/instrument-studies.glb'
bpy.ops.export_scene.gltf(filepath=str(OUT),export_format='GLB',export_apply=True,
    export_draco_mesh_compression_enable=True,export_draco_mesh_compression_level=6,
    export_draco_position_quantization=16,export_draco_normal_quantization=12,
    export_cameras=False,export_lights=False,export_extras=True)

# A separate, editable studies file; the approved console source is untouched.
for i,root in enumerate(roots):
    root.location.x=(i-1)*3.1
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/console/instrument-studies.blend'))
print('Exported three interchangeable instrument studies:',OUT)
