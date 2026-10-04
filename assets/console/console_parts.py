"""Shared Blender primitives in x-right, y-up, z-forward console coordinates."""
import math
import bmesh
import bpy

def material(name, color, metal=0, roughness=.5):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    for key, value in [('Base Color', (*color, 1)), ('Metallic', metal), ('Roughness', roughness)]:
        bsdf.inputs[key].default_value = value
    return mat

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
