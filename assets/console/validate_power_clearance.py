"""Check evaluated switch geometry at both endpoints and throughout its throw."""
import math

import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree


def validate_power_clearance():
    bpy.context.view_layer.update()
    graph = bpy.context.evaluated_depsgraph_get()
    switch = bpy.data.objects['PowerSwitch']
    pivot = switch.matrix_world.translation.copy()
    moving = list(switch.children)

    def geometry(obj):
        evaluated = obj.evaluated_get(graph)
        mesh = evaluated.to_mesh()
        vertices = [evaluated.matrix_world @ vertex.co for vertex in mesh.vertices]
        polygons = [tuple(polygon.vertices) for polygon in mesh.polygons]
        evaluated.to_mesh_clear()
        return vertices, polygons

    fixed = {}
    for obj in bpy.data.objects:
        if obj.type != 'MESH' or obj.hide_render or obj in moving:
            continue
        bounds = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
        if any(max(p[i] for p in bounds) < pivot[i] - radius or
               min(p[i] for p in bounds) > pivot[i] + radius
               for i, radius in enumerate((.9, .6, .7))):
            continue
        fixed[obj.name] = BVHTree.FromPolygons(*geometry(obj))

    assert 'Chassis' in fixed and 'Power socket' in fixed

    def inside(point, obstacle):
        # Nearest-face normals alone are ambiguous at triangulated lettering
        # edges. Ray parity checks containment without relying on that normal.
        votes = 0
        for vector in ((.311, .527, .791), (-.719, .431, .547), (.617, -.733, .287)):
            direction = Vector(vector).normalized()
            origin = point.copy()
            crossings = 0
            for _ in range(128):
                hit, _, _, _ = obstacle.ray_cast(origin, direction)
                if hit is None:
                    break
                crossings += 1
                origin = hit + direction * 1e-5
            votes += crossings % 2
        return votes >= 2

    clearance = math.inf
    for obj in moving:
        vertices, polygons = geometry(obj)
        for step in range(65):
            degrees = switch['throw_degrees'] * step / 64
            # Runtime glTF -Z rotation is Blender +Y after axis conversion.
            turn = (Matrix.Translation(pivot) @
                    Matrix.Rotation(math.radians(degrees), 4, 'Y') @
                    Matrix.Translation(-pivot))
            positions = [turn @ point for point in vertices]
            swept = BVHTree.FromPolygons(positions, polygons)
            for name, obstacle in fixed.items():
                assert not swept.overlap(obstacle), f'{obj.name} intersects {name} at {degrees} degrees'
                for point in positions:
                    nearest, normal, _, distance = obstacle.find_nearest(point)
                    assert nearest is not None
                    if (point - nearest).dot(normal) < -1e-5:
                        assert not inside(point, obstacle), f'{obj.name} is inside {name} at {degrees} degrees'
                    clearance = min(clearance, distance)
                    assert distance >= .045, f'{obj.name} has only {distance:.4f} clearance to {name} at {degrees} degrees'
    print(f'Power toggle: 65 poses, no intersections or contained vertices; sampled clearance {clearance:.4f}.')


if __name__ == '__main__':
    validate_power_clearance()
