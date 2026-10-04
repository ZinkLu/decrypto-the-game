"""Lay out and engrave the vector monitor's controls for its signal chain.
Run on decrypto-console.blend; every other assembly is left untouched.

Generator controls sit on the left and tube controls on the right. The large
vernier dial tunes the CAL OUT oscillator (FREQ); a new WAVE dial, marked with
the five shapes it blends between, sets its function; TIME/DIV keeps the sweep;
X-Y pans the horizontal amplifier from the sweep ramp to the reference sine.
The indicator lamp reports the oscillators' phase lock (LOCK). The pass can be
repeated. Pass `-- --dry <path.glb>` to export a copy for inspection without
saving the scene, the surface table or the shipped model.
"""
import json, math, sys
from pathlib import Path
import bpy
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'web/public/models'
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
dry=Path(args[args.index('--dry')+1]) if '--dry' in args else None
surfaces=json.loads((OUT/'console-surfaces.json').read_text())

def remove(obj):
    if isinstance(obj,str): obj=bpy.data.objects.get(obj)
    if obj: bpy.data.objects.remove(obj,do_unlink=True)

def link(obj):
    bpy.context.scene.collection.objects.link(obj)
    return obj

def label(name,body,x,y,z,size,mat):
    remove(name)
    bpy.ops.object.text_add(location=(x,-z,y),rotation=(math.pi/2,0,0))
    o=bpy.context.object;o.name=name;o.data.body=body;o.data.align_x='CENTER';o.data.align_y='CENTER';o.data.size=size
    o.data.extrude=.0006;o.data.materials.append(mat)
    bpy.ops.object.convert(target='MESH');o.select_set(False)
    return o

INK=bpy.data.materials['Instrument legends']
# The dial row sits low enough for the mark above each dial to clear the CRT
# hood from the operator's eye line, and the legends low enough to clear the
# leaning knobs. Three small dials share the space right of the vernier dial.
ROW,BASELINE=-3.55,-3.915
FREQ,WAVE,RATE,AXIS=-6.96,-6.31,-5.825,-5.34

def slide(assembly,prefixes,legend,surface,x):
    # Children ride with their assembly; fixed escutcheons and marks follow it.
    # Legends follow sideways only and share one baseline.
    root=bpy.data.objects[assembly];dx,dz=x-root.location.x,ROW-root.location.z
    for o in bpy.data.objects:
        if o.parent is None and (o.name==assembly or o.name.startswith(prefixes)):o.location.x+=dx;o.location.z+=dz
    engraving=bpy.data.objects[legend];engraving.location.x+=dx;engraving.location.z=BASELINE
    surfaces[surface].update(x=x,y=ROW)
slide('ScopeTuning',('ScopeDetail_dial','ScopeDetail_mode index'),'PanelRefine_scope MODE','scopeKnob',FREQ)
slide('ScopeRate','ScopeDetail_rate','PanelRefine_scope TIME','scopeRateKnob',RATE)
slide('ScopePersistence','ScopeDetail_persistence','PanelRefine_scope PERSIST','scopePersistenceKnob',AXIS)

# WAVE is a sibling of the five-mark TIME/DIV dial, with its own meshes.
for o in [o for o in bpy.data.objects if o.name=='ScopeWave' or o.name.startswith('ScopeDetail_wave')]:remove(o)
rate=bpy.data.objects['ScopeRate']
wave=link(bpy.data.objects.new('ScopeWave',None))
wave.empty_display_type=rate.empty_display_type;wave.empty_display_size=rate.empty_display_size
wave.location=rate.location;wave.location.x=WAVE
for o in [o for o in bpy.data.objects if o.name.startswith('ScopeDetail_rate')]:
    part=link(o.copy());part.data=o.data.copy();part.name='ScopeDetail_wave'+o.name[len('ScopeDetail_rate'):]
    for key in list(part.keys()):del part[key]
    if o.parent is rate:part.parent=wave;part.matrix_parent_inverse=o.matrix_parent_inverse.copy()
    else:part.location.x+=WAVE-RATE
surfaces['scopeWaveKnob']=dict(surfaces['scopeRateKnob'],x=WAVE)
# The tube is a display again, not a push button.
surfaces.pop('scopeModeControl',None)

def glyph(name,points,x,y,width=.082,height=.034,stroke=.009):
    # A flat engraved stroke in the panel plane, wound to face the operator.
    remove(name)
    path=[(x+u*width,y+v*height) for u,v in points]
    half,depth,verts,faces=stroke/2,-.5745,[],[]
    for (x0,y0),(x1,y1) in zip(path,path[1:]):
        length=math.hypot(x1-x0,y1-y0);nx,ny=-(y1-y0)/length*half,(x1-x0)/length*half
        faces.append(tuple(range(len(verts),len(verts)+4)))
        verts+=[(x0-nx,depth,y0-ny),(x1-nx,depth,y1-ny),(x1+nx,depth,y1+ny),(x0+nx,depth,y0+ny)]
    for px,py in path:
        faces.append(tuple(range(len(verts),len(verts)+8)))
        verts+=[(px+half*math.cos(k*math.pi/4),depth,py+half*math.sin(k*math.pi/4)) for k in range(8)]
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
    assert all(p.normal.y<0 for p in mesh.polygons),f'{name}: strokes must face the operator'
    mesh.materials.append(INK)
    return link(bpy.data.objects.new(name,mesh))

# One cycle of each shape beside its index mark, in dial order.
SHAPES=[
    [(-.5,-.5),(0,.5),(0,-.5),(.5,.5),(.5,-.5)],
    [(-.5,0),(-.25,.5),(.25,-.5),(.5,0)],
    [(n/16-.5,.5*math.sin(n/16*math.tau)) for n in range(17)],
    [(-.5,-.5),(-.5,.5),(0,.5),(0,-.5),(.5,-.5),(.5,.5)],
    [(-.5,-.5),(-.3,-.5),(-.3,.5),(-.08,.5),(-.08,-.5),(.5,-.5)],
]
for n,points in enumerate(SHAPES):
    # The mark under the hood tucks in close; the others stand clear of the knob.
    angle,reach=math.radians(125-62.5*n),.236 if n==2 else .255
    glyph(f'ScopeDetail_wave glyph {n}',points,WAVE-reach*math.sin(angle),ROW+reach*math.cos(angle))

# Object names keep their original suffixes; only the engraving changes. The
# tall vernier dial hides anything centered beneath it from the operator's
# eye line, so FREQ sits on the shared baseline just clear of the dial's skirt.
for suffix,legend,column,size in [('scope MODE','FREQ',-6.60,.068),('scope PERSIST','X-Y',None,.068),('ScopeDetail_trace label','LOCK',None,.065)]:
    matches=[o for o in bpy.data.objects if o.name.endswith(suffix)]
    assert len(matches)==1,f'{suffix}: expected one legend, found {len(matches)}'
    x,z,y=matches[0].location
    label(matches[0].name,legend,x if column is None else column,y,-z,size,INK)
label('PanelRefine_scope WAVE','WAVE',WAVE,BASELINE,.574,.068,INK)

# Export every runtime room-code digit without exposing retained Boolean cutters.
digits=[(o,o.hide_render,o.hide_get()) for o in bpy.data.objects if o.name.startswith('Nixie_Digit_')]
for o,_,_ in digits:o.hide_render=False;o.hide_set(False)
try:
    bpy.ops.export_scene.gltf(filepath=str(dry or OUT/'decrypto-console.glb'),export_format='GLB',export_apply=True,use_renderable=True,
        export_draco_mesh_compression_enable=True,export_draco_mesh_compression_level=6,export_draco_position_quantization=16,
        export_draco_normal_quantization=12,export_cameras=False,export_lights=False,export_extras=True)
finally:
    for o,r,v in digits:o.hide_render=r;o.hide_set(v)
if not dry:
    bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/console/decrypto-console.blend'))
    (OUT/'console-surfaces.json').write_text(json.dumps(surfaces,indent=2)+'\n')
print(f'Laid out FREQ, WAVE, TIME/DIV and X-Y with the LOCK lamp; preserved {len(digits)} room-code digits.'+(' Dry run.' if dry else ''))
