"""Recess the complete tube bank and seat a single clear acrylic hood on the console.

Run after refine_nixie_recorder.py. Absolute saved baselines make this repeatable.
The original housing remains solid except for the actual machined display pocket.
"""
import json, math, sys
from pathlib import Path
import bpy
from mathutils import Matrix, Vector
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(Path(__file__).parent))
from console_parts import material, box, ring, cylinder
OUT=ROOT/'web/public/models'
P='NixieCover_'
scene=bpy.context.scene
surfaces=json.loads((OUT/'console-surfaces.json').read_text())

# Preserve all previous refinements, including the bottom through-vents.
for obj in list(bpy.data.objects):
    for mod in list(obj.modifiers):
        if mod.name.startswith(P):obj.modifiers.remove(mod)
    if obj.name.startswith(P):bpy.data.objects.remove(obj,do_unlink=True)
for collection in list(bpy.data.collections):
    if collection.name.startswith(P):bpy.data.collections.remove(collection)

def transform(obj,matrix):
    if 'nixie_cover_base_matrix' not in obj:
        obj['nixie_cover_base_matrix']=[v for row in obj.matrix_world for v in row]
    v=obj['nixie_cover_base_matrix'];base=Matrix([v[i:i+4] for i in range(0,16,4)])
    obj.matrix_world=matrix@base

RETREAT=.64
BANK_X,BANK_Y=5.83,3.70
TUBE_HEIGHT=.85
pivot=Vector((5.56,-.89,4.04))
shift=Matrix.Translation((BANK_X-5.56,RETREAT,BANK_Y-4.04))@Matrix.Translation(pivot)@\
    Matrix.Diagonal((1,1,TUBE_HEIGHT,1))@Matrix.Translation(-pivot)
for obj in list(bpy.data.objects):
    if obj.name.startswith('Nixie_') and obj.name!='Nixie_mounting plate':
        transform(obj,shift)
# The old projecting block becomes a pocket floor behind the tube envelopes.
back=bpy.data.objects['Nixie_mounting plate']
transform(back,Matrix.Translation((BANK_X-5.56,.845,BANK_Y-4.04))@Matrix.Translation(pivot)@\
    Matrix.Diagonal((1,1,TUBE_HEIGHT,1))@Matrix.Translation(-pivot))
# A separate, low header row leaves the viewing window unobstructed.
copy_parts=[o for o in bpy.data.objects if o.name.startswith(('ChannelCopy','Tactile_copy socket'))]
copy_pivot=Vector((6.96,-.55,4.12))
copy_shift=Matrix.Translation((-.01,0,.40))@Matrix.Translation(copy_pivot)@\
    Matrix.Diagonal((.72,.60,.60,1))@Matrix.Translation(-copy_pivot)
for obj in copy_parts:
    if obj.parent not in copy_parts:transform(obj,copy_shift)
surfaces['channel'].update(x=BANK_X,y=BANK_Y,z=1.15-RETREAT,h=.86*TUBE_HEIGHT,digitScale=TUBE_HEIGHT)
surfaces['channelCopy'].update(x=6.95,y=4.52,w=.46*.72,h=.31*.60,z=.55+(1.032-.55)*.60)
legend=bpy.data.objects['Tactile_room code label']
pivot=Vector((5.56,-.568,4.57))
transform(legend,Matrix.Translation((-.32,0,-.05))@Matrix.Translation(pivot)@
          Matrix.Diagonal((.95,.95,.95,1))@Matrix.Translation(-pivot))
# Compact the entire score instrument uniformly so the lenses remain circular.
score_pivot=Vector((5.83,-.56,2.4))
score_shift=Matrix.Translation((0,0,-.30))@Matrix.Translation(score_pivot)@\
    Matrix.Diagonal((.84,.84,.84,1))@Matrix.Translation(-score_pivot)
score_parts=[o for o in bpy.data.objects if o.name.startswith(('Score bezel','Front_score',
    'ScoreLamp_','Interaction_lamp','Interaction_lens diffuser'))]
for obj in score_parts:
    if obj.parent not in score_parts:transform(obj,score_shift)
surfaces['score'].update(x=5.83,y=2.10,w=2.79*.84,h=1.66*.84,z=.56+(.933-.56)*.84)


DARK=material('Nixie pocket graphite',(.012,.017,.015),.05,.70)
LINER=material('Nixie pocket sidewalls',(.055,.073,.067),.25,.42)
RUBBER=material('Nixie hood gasket',(.023,.027,.023),0,.77)
NICKEL=material('Nixie hood satin edge',(.12,.16,.145),.60,.34)
ENAMEL=bpy.data.objects['Archive column'].data.materials[0]
CLEAR=material('Nixie clear acrylic hood',(.77,.87,.83),.02,.07)
EDGE=material('Nixie polished acrylic edge',(.52,.72,.64),.08,.10)
for mat,alpha in [(CLEAR,.065),(EDGE,.22)]:
    bsdf=next(n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    bsdf.inputs['Alpha'].default_value=alpha
    bsdf.inputs['IOR'].default_value=1.49
    bsdf.inputs['Coat Weight'].default_value=.65
    mat.diffuse_color=(*mat.diffuse_color[:3],alpha)
    mat.surface_render_method='BLENDED'

# Cut through every face skin and well into the chassis. Even the foremost point
# of each tube is behind the .55-unit console face; .70-unit sidewalls show depth.
cutters=bpy.data.collections.new(P+'cutters');scene.collection.children.link(cutters)
cutter=box(P+'pocket cutter',BANK_X,BANK_Y,.45,2.62,1.09,1.50,DARK,.06)
for col in list(cutter.users_collection):col.objects.unlink(cutter)
cutters.objects.link(cutter);cutter.hide_render=True;cutter.hide_set(True)
for name in ['Archive column','Archive column seam','Front enamel','Chassis']:
    obj=bpy.data.objects[name]
    mod=obj.modifiers.new(P+'machined recess','BOOLEAN')
    mod.operation='DIFFERENCE';mod.operand_type='COLLECTION';mod.collection=cutters;mod.solver='EXACT'
    edge=obj.modifiers.new(P+'pocket edge','BEVEL');edge.width=.006;edge.segments=3
# Tapered inner walls join the pocket floor to the front face.
ring(P+'recess liner',BANK_X,BANK_Y,[(2.62,1.09,.065,.53),(2.37,.99,.05,-.16),
    (2.31,.93,.04,-.16),(2.56,1.03,.05,.53)],LINER,12)
box(P+'pocket floor',BANK_X,BANK_Y,-.20,2.60,1.08,.08,DARK,.02)
back.data.materials.clear();back.data.materials.append(DARK)
# The opening is a formed return of the console enamel, with its outer edge
# flush to the column, instead of another raised instrument box sitting on top.
ring(P+'mounting rim',BANK_X,BANK_Y,[(2.82,1.16,.075,.525),(2.82,1.16,.075,.552),
    (2.64,1.08,.055,.552),(2.58,1.02,.045,.505)],ENAMEL,12)
ring(P+'compression gasket',BANK_X,BANK_Y,[(2.65,1.09,.058,.538),(2.65,1.09,.058,.561),
    (2.59,1.03,.045,.561),(2.59,1.03,.045,.538)],RUBBER,12)
# The acrylic is seated inside the return, only .054 proud of the enamel.
ring(P+'acrylic walls',BANK_X,BANK_Y,[(2.63,1.07,.055,.549),(2.63,1.07,.055,.584),
    (2.582,1.022,.04,.584),(2.582,1.022,.04,.549)],CLEAR,16)
box(P+'acrylic face',BANK_X,BANK_Y,.586,2.63,1.07,.036,CLEAR,.012)
ring(P+'polished front bevel',BANK_X,BANK_Y,[(2.646,1.086,.057,.578),(2.63,1.07,.055,.604),
    (2.606,1.046,.043,.604),(2.622,1.062,.047,.578)],EDGE,16)

# A continuous horizontal carrier runs into both sidewalls. Sockets pass through
# machined bores and sit in retaining collars; they no longer stand loose in front
# of a vertical backplate. Everything is constructed in the console's own axes.
rail_top=3.31
rail=box(P+'socket carrier',BANK_X,rail_top-.055,.17,2.59,.11,.70,LINER,.012)
bores=bpy.data.collections.new(P+'socket bores');scene.collection.children.link(bores)
for slot in range(4):
    x=BANK_X+(slot-1.5)*.52
    bore=cylinder(P+f'socket bore {slot}',x,rail_top,.89-RETREAT,.235,.40,DARK,64)
    bore.rotation_euler=(0,0,0)
    for col in list(bore.users_collection):col.objects.unlink(bore)
    bores.objects.link(bore);bore.hide_render=True;bore.hide_set(True)
    bpy.ops.mesh.primitive_torus_add(major_radius=.237,minor_radius=.012,major_segments=64,minor_segments=12,
        location=(x,-(.89-RETREAT),rail_top+.002))
    collar=bpy.context.object;collar.name=P+f'socket retaining collar {slot}'
    collar.data.materials.append(NICKEL)
    for polygon in collar.data.polygons:polygon.use_smooth=True
mod=rail.modifiers.new(P+'carrier bores','BOOLEAN')
mod.operation='DIFFERENCE';mod.operand_type='COLLECTION';mod.collection=bores;mod.solver='EXACT'
for side in [-1,1]:
    box(P+f'carrier side tongue {side}',BANK_X+side*1.225,3.37,.13,.10,.23,.61,LINER,.012)

# A testable optical ordering contract for the runtime's transparent surfaces.
face=bpy.data.objects[P+'acrylic face']
face['hood_front_z']=.604
face['tube_retreat']=RETREAT
face['wall_thickness']=.024
face['front_thickness']=.036
face['hood_inner_front_z']=.568
face['clearance']=.568-(.89-RETREAT+.233)
assert face['clearance']>.05
bpy.context.view_layer.update()
# Center and corner rays must pass the original face skins down to the pocket.
depsgraph=bpy.context.evaluated_depsgraph_get()
fronts=[]
for obj in bpy.data.objects:
    if obj.name.startswith('Nixie_'):
        evaluated=obj.evaluated_get(depsgraph)
        fronts.extend(-(evaluated.matrix_world@Vector(c)).y for c in evaluated.bound_box)
assert max(fronts)<.55,f'Tube bank still protrudes beyond the face: {max(fronts)}'
for slot in range(4):
    socket=bpy.data.objects[f'Nixie_{slot} socket']
    ys=[(socket.matrix_world@Vector(c)).z for c in socket.bound_box]
    assert min(ys)<rail_top<max(ys),f'Socket {slot} is not seated through the carrier'
score_top=max((obj.matrix_world@Vector(c)).z for obj in score_parts for c in obj.bound_box)
assert BANK_Y-.58-score_top>.20,'Insufficient separation between room code and score'
for name in ['Archive column','Archive column seam','Front enamel','Chassis']:
    obj=bpy.data.objects[name].evaluated_get(depsgraph);inverse=obj.matrix_world.inverted()
    direction=(inverse.to_3x3()@Vector((0,1,0))).normalized()
    for x,y in [(BANK_X,BANK_Y),(BANK_X-1.05,BANK_Y-.38),(BANK_X+1.05,BANK_Y+.38)]:
        hit,point,_,_=obj.ray_cast(inverse@Vector((x,-1.2,y)),direction)
        assert not hit or -(obj.matrix_world@point).y<-.26,f'{name}: pocket blocked at {x},{y}'
print('Verified 12 unobstructed pocket rays; tube front',round(max(fronts),4),
    'behind .55 face; cover clearance',round(face['clearance'],4),'score gap',round(BANK_Y-.58-score_top,4))

# Export every digit variant, then leave a legible 5821 in the editable source.
for obj in bpy.data.objects:
    if obj.name.startswith('Nixie_Digit_'):obj.hide_render=False;obj.hide_set(False)
bpy.ops.export_scene.gltf(filepath=str(OUT/'decrypto-console.glb'),export_format='GLB',export_apply=True,use_renderable=True,
 export_draco_mesh_compression_enable=True,export_draco_mesh_compression_level=6,export_draco_position_quantization=16,
 export_draco_normal_quantization=12,export_cameras=False,export_lights=False,export_extras=True)
for obj in bpy.data.objects:
    if obj.name.startswith('Nixie_Digit_'):
        active=str(obj['digit'])=='5821'[obj['slot']];obj.hide_render=not active;obj.hide_set(not active)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/console/decrypto-console.blend'))
(OUT/'console-surfaces.json').write_text(json.dumps(surfaces,indent=2)+'\n')
print('Exported: recessed tube bank with a single fitted clear acrylic hood.')
