"""Re-engrave the vector monitor's dial legends for its signal chain.
Run on decrypto-console.blend; every other assembly is left untouched.

The large vernier dial tunes the CAL OUT oscillator (FREQ), the middle dial
keeps TIME/DIV, and the right dial pans the horizontal amplifier from the
sweep ramp to the reference sine (X-Y). The indicator lamp now reports the
oscillators' phase lock (LOCK). Pass `-- --dry <path.glb>` to export
a copy for inspection without saving the scene or replacing the shipped model.
"""
import math, sys
from pathlib import Path
import bpy
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'web/public/models'
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
dry=Path(args[args.index('--dry')+1]) if '--dry' in args else None

def remove(obj):
    if isinstance(obj,str): obj=bpy.data.objects.get(obj)
    if obj: bpy.data.objects.remove(obj,do_unlink=True)

def label(name,body,x,y,z,size,mat):
    remove(name)
    bpy.ops.object.text_add(location=(x,-z,y),rotation=(math.pi/2,0,0))
    o=bpy.context.object;o.name=name;o.data.body=body;o.data.align_x='CENTER';o.data.align_y='CENTER';o.data.size=size
    o.data.extrude=.0006;o.data.materials.append(mat)
    bpy.ops.object.convert(target='MESH');o.select_set(False)
    return o

INK=bpy.data.materials['Instrument legends']
# Object names keep their original suffixes; only the engraving changes. The
# tall vernier dial hides anything centered beneath it from the operator's
# eye line, so FREQ sits on the shared baseline just clear of the dial's skirt.
for suffix,legend,column,size in [('scope MODE','FREQ',-6.60,.068),('scope PERSIST','X-Y',None,.068),('ScopeDetail_trace label','LOCK',None,.065)]:
    matches=[o for o in bpy.data.objects if o.name.endswith(suffix)]
    assert len(matches)==1,f'{suffix}: expected one legend, found {len(matches)}'
    x,z,y=matches[0].location
    label(matches[0].name,legend,x if column is None else column,y,-z,size,INK)

# Export every runtime room-code digit without exposing retained Boolean cutters.
digits=[(o,o.hide_render,o.hide_get()) for o in bpy.data.objects if o.name.startswith('Nixie_Digit_')]
for o,_,_ in digits:o.hide_render=False;o.hide_set(False)
try:
    bpy.ops.export_scene.gltf(filepath=str(dry or OUT/'decrypto-console.glb'),export_format='GLB',export_apply=True,use_renderable=True,
        export_draco_mesh_compression_enable=True,export_draco_mesh_compression_level=6,export_draco_position_quantization=16,
        export_draco_normal_quantization=12,export_cameras=False,export_lights=False,export_extras=True)
finally:
    for o,r,v in digits:o.hide_render=r;o.hide_set(v)
if not dry: bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/console/decrypto-console.blend'))
print(f'Engraved FREQ, X-Y and LOCK legends; preserved {len(digits)} room-code digits.'+(' Dry run.' if dry else ''))
