"""Visual polish (2026-09-23): warm-neutral finishes, layout margins and geometry fixes.

Run after refine_handles.py against the current editable scene:

    blender -b -t 1 --factory-startup assets/console/decrypto-console.blend --python assets/console/refine_visual_polish.py

The pass is repeatable. Moved parts keep their original transform in a custom
property and are placed relative to it; reshaped meshes are marked and skipped
once edited; regenerated images replace the packed ones by name.

- Neutrals share one warm undertone: every "black", graphite, nickel, alloy and
  enamel keeps its lightness but moves to a warm hue (~70-82 deg OKLCH) with low
  chroma. Lamps, glass, displays, paper, brass and the red parts are untouched.
- The rear speaker grille samples each square cell at its corners (the former
  12-point outline chopped a diamond hole into every junction).
- Legends, the COPY key, the word-window row, the phase panel, the roster frame,
  the bottom rail and the scope panel get even margins; see README.
"""
import json
import math
import sys
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[2]
MODELS = ROOT / 'web/public/models'
TEX = ROOT / 'assets/console/textures'
surfaces_path = MODELS / 'console-surfaces.json'
surfaces = json.loads(surfaces_path.read_text())


def obj(name):
    found = bpy.data.objects.get(name)
    if found is None:
        raise KeyError(f'missing object {name!r}')
    return found


# Console coordinates are x right, y up, z toward the operator: Blender (x, -z, y).
def place(o, dx=0., dy=0., dz=0.):
    """Offset an object from its original location, repeatably."""
    if 'polish_location' not in o:
        o['polish_location'] = list(o.location)
    base = Vector(o['polish_location'])
    o.location = base + Vector((dx, -dz, dy))


def place_centre_x(o, target_x):
    """Move an object so its mesh centre lands on target_x, whatever its origin."""
    if 'polish_centre_x' not in o:
        world = o.matrix_world
        xs = [(world @ v.co).x for v in o.data.vertices]
        o['polish_centre_x'] = (min(xs) + max(xs)) / 2
    place(o, dx=target_x - o['polish_centre_x'])


def once(o, key):
    """True the first time a mesh edit runs; later runs leave the mesh as edited."""
    if o.data.get(key):
        return False
    o.data[key] = True
    return True


def edit_world_vertices(o, fn):
    world = o.matrix_world
    inverse = world.inverted()
    for v in o.data.vertices:
        p = world @ v.co
        x, y, z = fn(p.x, p.z, -p.y)
        v.co = inverse @ Vector((x, -z, y))
    o.data.update()


def assign(o, material_name):
    material = bpy.data.materials[material_name]
    o.data.materials.clear()
    o.data.materials.append(material)


# --- Colour science --------------------------------------------------------------

def srgb_to_linear(c):
    return c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4


def linear_to_srgb(c):
    c = max(0., min(1., c))
    return c * 12.92 if c <= .0031308 else 1.055 * c ** (1 / 2.4) - .055


def linear_to_oklab(r, g, b):
    l = (.4122214708 * r + .5363325363 * g + .0514459929 * b) ** (1 / 3)
    m = (.2119034982 * r + .6806995451 * g + .1073969566 * b) ** (1 / 3)
    s = (.0883024619 * r + .2817188376 * g + .6299787005 * b) ** (1 / 3)
    return (.2104542553 * l + .7936177850 * m - .0040720468 * s,
            1.9779984951 * l - 2.4285922050 * m + .4505937099 * s,
            .0259040371 * l + .7827717662 * m - .8086757660 * s)


def oklab_to_linear(L, a, b):
    l = (L + .3963377774 * a + .2158037573 * b) ** 3
    m = (L - .1055613458 * a - .0638541728 * b) ** 3
    s = (L - .0894841775 * a - 1.2914855480 * b) ** 3
    return (4.0767416621 * l - 3.3077115913 * m + .2309699292 * s,
            -1.2684380046 * l + 2.6097574011 * m - .3413193965 * s,
            -.0041960863 * l - .7034186147 * m + 1.7076147010 * s)


def warm(linear, chroma, hue, lightness=None):
    """Same perceived lightness, warm undertone, restrained chroma."""
    L, _, _ = linear_to_oklab(*linear)
    if lightness is not None:
        L = lightness
    h = math.radians(hue)
    return tuple(max(0., min(1., c)) for c in oklab_to_linear(L, chroma * math.cos(h), chroma * math.sin(h)))


def set_base(material_name, linear):
    material = bpy.data.materials[material_name]
    material.diffuse_color = (*linear, 1)
    bsdf = next(n for n in material.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (*linear, 1)
    material['polish_base'] = list(linear)


def base_of(material_name):
    material = bpy.data.materials[material_name]
    if 'polish_original' not in material:
        bsdf = next(n for n in material.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
        material['polish_original'] = list(bsdf.inputs['Base Color'].default_value)[:3]
    return tuple(material['polish_original'])


# Flat materials: (chroma, hue[, lightness override]). Hue ~70-82 deg reads as a
# warm neutral beside the ivory enamel (h 88); chroma stays at grey levels.
DARK, INKY, METAL = (.006, 70), (.005, 68), (.012, 82)
flat = {
    'Console engraved ink': INKY,
    'Drive charcoal housing': DARK,
    'Drive guide rubber': DARK,
    'Instrument legends': INKY,
    'Instrument powdercoat': (.010, 70),        # shell: warm charcoal
    'Instrument rear enamel': (.010, 72),       # service panel: warm grey
    'Launch satin gunmetal collar': (.008, 75),
    'Manual graphite resin': DARK,
    'Nixie hood gasket': DARK,
    'Nixie hood satin edge': (.010, 80),
    'Nixie pocket graphite': DARK,
    'Nixie pocket sidewalls': (.008, 72),
    'Panel charcoal polymer': DARK,
    'Scope engraved ink': INKY,
    'Score register axle': METAL,
    'Score register bearing seat': DARK,
    'Score register blade': (.006, 70),
    'Score register cover glass': (.004, 80),
    'Score register faceplate': (.012, 82),
    'Score register folded edge': (.010, 80),
    'Score register frame': (.012, 80),
    'Score register mounting occlusion': DARK,
    'Score register well': DARK,
    'Study carbon ink.001': INKY,
    'Study molded phenolic.001': (.008, 60),    # the receiver joins the warm phenolic family
    'Study mounting gasket.001': DARK,
    'Study satin nickel.001': METAL,
    'Tactile printed carbon': INKY,
    'Front uniform satin alloy': (.010, 82),
    'Disk satin stainless shutter': (.006, 80),
    'Tactile optical glass': (.006, 82),
    'Study optical glass.001': (.006, 82),
}
for name, spec in flat.items():
    chroma, hue, *lightness = spec
    set_base(name, warm(base_of(name), chroma, hue, lightness[0] if lightness else None))

# Specific roles rather than a hue shift.
set_base('Midnight blue chassis', warm(base_of('Midnight blue chassis'), .008, 70, .33))   # graphite keys
set_base('Score bezel satin black', warm(base_of('Score bezel satin black'), .004, 70, .235))
set_base('Score register intercept', warm(base_of('Score register intercept'), .005, 70, .27))  # ink tally
set_base('Score register failure', (.30, .045, .022))                                        # vermilion cross
set_base('Rear audio olive enamel', (.30, .035, .018))                                       # ON detent in red
set_base('Tactile battery olive paper jacket', warm(base_of('Tactile battery olive paper jacket'), .035, 82, .72))
# The key disk reads as a separate object against the dark drive.
set_base('Disk textured charcoal', warm(base_of('Disk textured charcoal'), .010, 72, .56))


# --- Packed PBR images --------------------------------------------------------

def replace_image(name, pixels, color):
    """Swap a packed image for new pixels, keeping every material link."""
    old = bpy.data.images[name]
    old.name = name + '.previous'
    h, w = pixels.shape[:2]
    image = bpy.data.images.new(name, width=w, height=h, alpha=False)
    image.colorspace_settings.name = 'sRGB' if color else 'Non-Color'
    rgba = np.ones((h, w, 4), dtype=np.float32)
    rgba[:, :, :3] = pixels[:, :, None] if pixels.ndim == 2 else pixels
    image.pixels.foreach_set(np.clip(rgba, 0, 1).ravel())
    image.filepath_raw = str(TEX / (name + '.png'))
    image.file_format = 'PNG'
    image.save()
    image.pack()
    old.user_remap(image)
    bpy.data.images.remove(old)
    return image


def image_rgb(name):
    image = bpy.data.images[name]
    w, h = image.size
    data = np.empty(w * h * 4, dtype=np.float32)
    image.pixels.foreach_get(data)
    return data.reshape(h, w, 4)[:, :, :3]


def retint(material_name, original_srgb, chroma, hue):
    """Colour maps are base colour x (1 + variance); swap only the base colour.

    The map's own mean says whether it is already retinted, so re-running
    refine_tactile.py (which regenerates the maps) and then this pass works.
    """
    material = bpy.data.materials[material_name]
    pixels = image_rgb(material_name + '-color')
    mean = pixels.reshape(-1, 3).mean(axis=0)
    if 'polish_mean' in material and np.allclose(mean, np.array(material['polish_mean']), atol=2e-4):
        return
    linear = tuple(srgb_to_linear(c) for c in original_srgb)
    target = np.array([linear_to_srgb(c) for c in warm(linear, chroma, hue)])
    pixels = pixels * (target / np.array(original_srgb))[None, None, :]
    replace_image(material_name + '-color', pixels, True)
    material['polish_mean'] = [float(c) for c in image_rgb(material_name + '-color').reshape(-1, 3).mean(axis=0)]


# Generator values from refine_tactile.py (sRGB tuples written straight to the maps).
retint('Tactile brushed nickel', (.54, .55, .50), .014, 82)
retint('Tactile brushed aluminium', (.70, .72, .69), .010, 80)
retint('Tactile molded rubber', (.028, .033, .031), .004, 70)


def phenolic_maps(noise_height, noise_colour, noise_rough):
    """refine_tactile.textured(kind='phenolic') with adjustable per-texel noise."""
    rng = np.random.default_rng(391)
    n = 512
    yy, xx = np.mgrid[0:n, 0:n] / n
    noise = rng.random((n, n)).astype(np.float32) - .5
    cloud = (np.sin(xx * 31 + np.sin(yy * 19)) * np.sin(yy * 29 + xx * 9) + np.sin(xx * 103 + yy * 67) * .16)
    colour, roughness, strength = np.array((.063, .041, .026)), .29, .6
    height = noise * noise_height + cloud * .025
    variance = cloud * .055 + noise * noise_colour
    rough = roughness + cloud * .045 + noise * noise_rough
    rgb = np.clip(colour[None, None, :] * (1 + variance[:, :, None]), 0, 1)
    dx, dy = np.gradient(height)
    normals = np.stack((-dy * strength, -dx * strength, np.ones_like(dx)), axis=-1)
    normals /= np.linalg.norm(normals, axis=-1, keepdims=True)
    return rgb, np.clip(rough, .08, 1), normals * .5 + .5


# The per-texel noise read as speckled granite on the recorder caps and as
# crumpled leather on the roster; the slow mottling stays.
packed = image_rgb('Tactile mottled phenolic-normal')
quiet = phenolic_maps(.03, .008, .02)
if float(np.abs(packed - quiet[2]).max()) > 3 / 255:
    drift = float(np.abs(packed - phenolic_maps(.09, .018, .04)[2]).max())
    assert drift < 3 / 255, f'phenolic generator no longer matches the packed map ({drift:.4f})'
    replace_image('Tactile mottled phenolic-color', quiet[0], True)
    replace_image('Tactile mottled phenolic-roughness', quiet[1], False)
    replace_image('Tactile mottled phenolic-normal', quiet[2], False)


# --- Rear speaker grille ------------------------------------------------------
# Square cells tile the plate; sample every cell at 16 angles so each square
# includes its four corners. Twelve 30-degree samples missed the corners and left
# a diamond-shaped hole at every junction.
def grille_mesh():
    vertices, faces, segments = [], [], 16
    for row in range(13):
        for col in range(17):
            x, y = 4.22 + (col - 8) * .252, 1.35 + (row - 6) * .252
            base = len(vertices)
            for depth, hole in [(-3.041, False), (-3.041, True), (-2.99, True)]:
                for i in range(segments):
                    a = i * math.tau / segments
                    r = .075 if hole else .126 / max(abs(math.cos(a)), abs(math.sin(a)))
                    vertices.append((x + r * math.cos(a), -depth, y + r * math.sin(a)))
            for i in range(segments):
                n = (i + 1) % segments
                faces.append((base + i, base + n, base + segments + n, base + segments + i))
                faces.append((base + segments + i, base + segments + n, base + 2 * segments + n, base + 2 * segments + i))
    mesh = bpy.data.meshes.new('Perforated speaker grille')
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()
    return mesh


def manufacturing_uv(o):
    """The tactile pass's box projection: world axes / 6, grain along the panel."""
    uv = o.data.uv_layers.active or o.data.uv_layers.new(name='ManufacturingUV')
    world = o.matrix_world
    for poly in o.data.polygons:
        normal = world.to_3x3() @ poly.normal
        axis = max(range(3), key=lambda i: abs(normal[i]))
        axes = (0, 2) if axis == 1 else (0, 1) if axis == 2 else (1, 2)
        for loop in poly.loop_indices:
            p = world @ o.data.vertices[o.data.loops[loop].vertex_index].co
            uv.data[loop].uv = (p[axes[0]] / 6, p[axes[1]] / 6)


grille = obj('Instrument_perforated speaker grille')
if not grille.data.get('polish_corners'):
    previous = grille.data
    grille.data = grille_mesh()
    grille.data.materials.append(bpy.data.materials['Tactile brushed aluminium'])
    manufacturing_uv(grille)
    grille.data['polish_corners'] = True
    bpy.data.meshes.remove(previous)


# --- Vector monitor panel -----------------------------------------------------
# The panel grows .08 up and .06 down so its title and legend row get margins.
for name in ['Scope panel', 'Scope panel seam']:
    o = obj(name)
    if once(o, 'polish_margins'):
        edit_world_vertices(o, lambda x, y, z: (x, y + .08 if y > -2.7 else y - .06, z))

place(obj('ScopeDetail_monitor label'), dy=.04)
# Legends sit centred under their dials, .04 lower now the panel is taller.
place(obj('PanelRefine_scope MODE'), dx=-6.96 - (-6.60), dy=-.04)     # the FREQ legend
for name in ['PanelRefine_scope WAVE', 'PanelRefine_scope TIME', 'PanelRefine_scope PERSIST']:
    place(obj(name), dy=-.04)

# LOCK heads its column like the monitor title; each label sits just above
# the part it names, so INPUT no longer reads as the lamp's caption.
place(obj('ScopeDetail_trace label'), dy=.112)
place(obj('ScopeDetail_trace lamp bezel'), dy=.167)
place(obj('ScopeDetail_trace lamp lens'), dy=.167)
place(obj('ScopePatch_output legend'), dy=-.095)

# WAVE shape glyphs hug their own dial instead of TIME/DIV's scale.
wave_centre = Vector((-6.31, -3.55))
for i in range(5):
    glyph = obj(f'ScopeDetail_wave glyph {i}')
    if 'polish_matrix' not in glyph:
        glyph['polish_matrix'] = [c for row in glyph.matrix_world for c in row]
    flat_matrix = list(glyph['polish_matrix'])
    original = Matrix([flat_matrix[0:4], flat_matrix[4:8], flat_matrix[8:12], flat_matrix[12:16]])
    points = [original @ v.co for v in glyph.data.vertices]
    centre = Vector(((min(p.x for p in points) + max(p.x for p in points)) / 2,
                     (min(p.z for p in points) + max(p.z for p in points)) / 2))
    radial = (centre - wave_centre).normalized()
    target = wave_centre + radial * .215
    moved = Vector((target.x, 0, target.y))
    around = Vector((centre.x, 0, centre.y))
    glyph.matrix_world = (Matrix.Translation(moved) @ Matrix.Diagonal((.9, 1, .9, 1))
                          @ Matrix.Translation(-around) @ original)

# Knurl ribs are moulded into the knob instead of bright metal teeth.
for o in bpy.data.objects:
    if o.type == 'MESH' and o.name.startswith(('ScopeDetail_dial knurl ', 'ScopeDetail_wave knurl ',
                                               'ScopeDetail_rate knurl ', 'ScopeDetail_persistence knurl ')):
        assign(o, 'Tactile mottled phenolic')


# --- Rear legends clear the cable leads ----------------------------------------
note = obj('Instrument_connector note')
place(note, dy=1.769)                     # header band above LINK / AUX / DC labels
place(obj('Instrument_rear edition'), dx=-.75)   # clear of the DC lead


# --- Control deck ---------------------------------------------------------------
# Clock | keypad | phase: the keypad stays centred under the CRT, the phase
# panel takes the clock's width and is centred in the remaining space.
PHASE_SHRINK, PHASE_SHIFT, PHASE_CENTRE = .245, .0175, 2.92
bezel = obj('Front_phase cast bezel')
if once(bezel, 'polish_width'):
    edit_world_vertices(bezel, lambda x, y, z: (x - PHASE_SHRINK if x > PHASE_CENTRE else x + PHASE_SHRINK, y, z))
place(bezel, dx=PHASE_SHIFT)
backing = obj('Phase backing')
if once(backing, 'polish_width'):
    for v in backing.data.vertices:
        v.co.x += -PHASE_SHRINK if v.co.x > 0 else PHASE_SHRINK
    backing.data.update()
place(backing, dx=PHASE_SHIFT)
# Divisions and ticks follow the relaid 411-pixel phase print (see paint.ts).
phase_left, phase_scale = 2.9375 - .72, 1.44 / 411
for name, canvas_x in [('Front_phase separator 2.56', 129), ('Front_phase separator 3.18', 261)]:
    place_centre_x(obj(name), phase_left + canvas_x * phase_scale)
for i, canvas_x in enumerate([16.0, 109.7, 203.3, 297.0, 390.7]):
    place_centre_x(obj(f'ConsoleDetail_phase calibration {i}'), phase_left + canvas_x * phase_scale)
surfaces['phase'].update(x=2.9375, w=1.44)


# --- Keyword windows ------------------------------------------------------------
# Lift the row .06 so the bezels clear the CRT hood; the latches become visible.
for i in range(4):
    for name in [f'Optical bezel {i}', f'Optical gasket {i}', f'Ruby lens {i}',
                 f'ConsoleDetail_decoder latch base {i}', f'ConsoleDetail_decoder latch tab {i}']:
        place(obj(name), dy=.06)
    surfaces[f'word{i}']['y'] = 3.96
    # The LED module prints its own index; the old filter numbers repeated it.
    if (label := bpy.data.objects.get(f'Instrument_filter id {i}')):
        bpy.data.objects.remove(label, do_unlink=True)


# --- Room code header -------------------------------------------------------------
# COPY centred in the header band, the title flush with the tube bay.
place(obj('ChannelCopy'), dy=-.035)
place(obj('Tactile_copy socket'), dy=-.035)
surfaces['channelCopy']['y'] = 4.485
place(obj('Tactile_room code label'), dx=-.29, dy=-.04)


# --- Roster frame -----------------------------------------------------------------
# The frame compresses toward the cassettes (inner opening fixed at 1.025 from the
# centre line), leaving margins to the column and a gap to the CRT hood.
ROSTER_X, INNER, OUTER_FROM, OUTER_TO = -6.25, 1.025, 1.19, 1.13


def compress(x, y, z):
    offset = abs(x - ROSTER_X)
    if offset <= INNER:
        return x, y, z
    side = 1 if x > ROSTER_X else -1
    return ROSTER_X + side * (INNER + (offset - INNER) * (OUTER_TO - INNER) / (OUTER_FROM - INNER)), y, z


for name in ['Front_roster isolation gasket', 'Front_roster cast carrier', 'Interaction_roster fine edge']:
    o = obj(name)
    if once(o, 'polish_compressed'):
        edit_world_vertices(o, compress)
bed = obj('Front_roster enamel bed')
if once(bed, 'polish_compressed'):
    edit_world_vertices(bed, compress)


# --- Bottom rail and drive --------------------------------------------------------
# The rail grows .07 up and .04 down so the drive sits inside it with margins,
# also in perspective. The vent cutters are a live Boolean and stay where they are.
for name in ['Power rail', 'Power rail seam']:
    o = obj(name)
    if once(o, 'polish_margins'):
        edit_world_vertices(o, lambda x, y, z: (x, y + .07 if y > -4.65 else y - .04, z))
assign(obj('DriveDetail_fixed legend'), 'Panel ivory legends')   # 3.5 / DOUBLE SIDED readable on the fascia
assign(obj('DriveDetail_dust shutter edge'), 'Drive charcoal housing')


# --- Export -----------------------------------------------------------------------
bpy.context.view_layer.update()
digits = [(o, o.hide_render, o.hide_get()) for o in bpy.data.objects if o.name.startswith('Nixie_Digit_')]
assert len(digits) == 40
for o, _, _ in digits:
    o.hide_render = False
    o.hide_set(False)
try:
    bpy.ops.export_scene.gltf(filepath=str(MODELS / 'decrypto-console.glb'),
        export_format='GLB', export_apply=True, use_renderable=True,
        export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
        export_draco_position_quantization=16, export_draco_normal_quantization=12,
        export_cameras=False, export_lights=False, export_extras=True)
finally:
    for o, hidden_render, hidden_view in digits:
        o.hide_render = hidden_render
        o.hide_set(hidden_view)
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'assets/console/decrypto-console.blend'))
surfaces_path.write_text(json.dumps(surfaces, indent=2) + '\n')
print('Visual polish exported: warm neutrals, corner-true grille, even margins and relaid panels.')
