"""Render a close-up of the top-side power switch for visual review.

blender -b assets/console/decrypto-console.blend --python assets/console/preview_switch.py -- /tmp/switch.png
Optionally set the switch to its OFF pose first: ... -- /tmp/switch.png off
"""
import math
import sys

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
out = argv[0] if argv else '/tmp/switch.png'
off = len(argv) > 1 and argv[1] == 'off'

scene = bpy.context.scene
try:
    scene.render.engine = 'BLENDER_EEVEE_NEXT'
except Exception:
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.display.shading.light = 'STUDIO'
    scene.display.shading.color_type = 'MATERIAL'
scene.render.resolution_x = 880
scene.render.resolution_y = 640
scene.render.filepath = out

if off:
    # Runtime glTF -Z rotation is Blender +Y after axis conversion.
    bpy.data.objects['PowerSwitch'].rotation_euler.y = math.radians(bpy.data.objects['PowerSwitch']['throw_degrees'])

if not any(obj.type == 'LIGHT' for obj in bpy.data.objects):
    sun = bpy.data.objects.new('Preview sun', bpy.data.lights.new('Preview sun', 'SUN'))
    sun.data.energy = 4
    sun.rotation_euler = (math.radians(50), 0, math.radians(-30))
    scene.collection.objects.link(sun)

cam = bpy.data.cameras.new('Preview cam')
cam.type = 'ORTHO'
cam.ortho_scale = 3.1
obj = bpy.data.objects.new('Preview cam', cam)
scene.collection.objects.link(obj)
# Console (x, y-up, z-forward) -> Blender (x, -z, y).
position = Vector((4.55, -3.7, 8.6))
target = Vector((5.83, .95, 5.5))
obj.location = position
obj.rotation_euler = (target - position).to_track_quat('-Z', 'Y').to_euler()
scene.camera = obj

top = sorted(((max((obj.matrix_world @ Vector(c)).z for c in obj.bound_box), obj.name)
              for obj in bpy.data.objects if obj.type == 'MESH' and not obj.hide_render), reverse=True)[:6]
print('Highest console surfaces (console y, name):', [(round(z, 2), n) for z, n in top])
bpy.ops.render.render(write_still=True)
print('Wrote', out)
