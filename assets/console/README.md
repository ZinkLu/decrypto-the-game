# Decrypto console

Approved visual: `reference.png`. Editable model: `decrypto-console.blend`.
The running interface uses actual Blender-exported geometry, not the reference bitmap.

## Device details — 2026-09-20

Fixed chassis ink is English and independent of gameplay: the connection lens is
NETWORK, the red key is ACTION / PRESS TO CONFIRM, and the scoreboard keeps its English legends. The session's 中文 / EN
selector persists locally. Main and word CRTs, roster inserts,
phase indicators, receipts and accessible controls change language together.
Names and submitted clues retain their original text; bilingual word-bank entries
use their supplied translation. Authored preview clues have both languages. Keyword windows share a 60 px base size; long phrases wrap and measured overflow shrinks without ellipses. Translations live in `i18n.ts`.

The vector monitor is simulated from the tube outward (`scope.ts`): two
oscillators steer one beam, and a floating-point phosphor keeps what it wrote.
Brightness is dwell time, so sine crests burn brighter than zero crossings and
square-wave risers stay faint. The afterglow is deliberately short (a departed
trace is below a tenth of its brightness within about 80 ms), so drifting and
tumbling figures stay crisp instead of smearing. Each frame shows the glow
averaged over its own interval, as a shutter would, which removes the beat
between a 48 Hz beam and a 60 Hz display that a short afterglow would otherwise
expose as shimmer. It rests on a locked 2:1 sine in Y/T.

- **FREQ**, the large vernier dial, tunes the CAL OUT oscillator from 1:1 to 5:1
  of the sweep reference. Its eight engraved marks are calibrated to 1:1, 4:3,
  3:2, 2:1, 5:2, 3:1, 4:1 and 5:1, with finer travel around each mark. The
  oscillators pull on each other (Adler's equation): inside a p:q tongue the
  figure locks and fine tuning tilts its phase; just outside, it slips with a
  hesitation each turn; far away it runs free as a woven mesh.
- **WAVE** blends steplessly through the generator's five engraved shapes, and
  each stretch of the dial is one circuit parameter: integrator symmetry
  (sawtooth to triangle), the diode shaper (triangle to sine, the resting
  mark at the top), amplifier overdrive (sine to square) and comparator duty
  (square to pulse). A sudden turn still melts while the blend settles.
- **TIME/DIV** spans 200 to 1.25 ms/div and slows both oscillators together, so
  a figure keeps its shape while the line resolves into a moving spot with a
  fading trail. Beam current and persistence track the sweep, keeping standing
  figures equally bright.
- **X-Y** pans the horizontal amplifier from the sweep ramp to the reference
  sine. A sine wave and its Lissajous figure are the side and end views of one
  space curve; this quarter turn rolls one into the other.

The LOCK lamp is a phase detector behind a slow filament: it beats while the
oscillators slip, steadies as they lock and is brightest dead in tune. The tube
itself is only a display. Generator dials (FREQ, WAVE) sit left of the tube
dials (TIME/DIV, X-Y); the row and its legends are placed so the mark above each
dial clears the CRT hood and the leaning knobs clear the legends. Knobs have end
stops. Drag,
scroll or use arrow keys; Shift gives fine adjustment, Home/End go to the limits,
and FREQ's arrow steps are quarter-marks so keys land on every calibrated ratio.
Reduced motion shows each standing figure as one long exposure. Analog input
reuses game-screen and receipt canvases. Lay out and engrave the controls with:

```sh
blender -b -t 1 --factory-startup assets/console/decrypto-console.blend --python assets/console/refine_scope_controls.py
```

References: [Tektronix systems and controls](https://www.tek.com/fr/documents/primer/oscilloscope-systems-and-controls);
R. Adler, "A Study of Locking Phenomena in Oscillators", Proc. IRE 34 (1946).

The coax is a local INPUT–CAL OUT patch beside the scope, clear of all controls.
The drive has curved thumb reliefs cut into its actual fascia, inset guides,
a dust flap, an independently moving eject button, and a disk with shell seams,
grip ribs, a write-protect slider and a folded metal shutter aperture.
The disk lies flat in the guides at y=−4.59 and travels only along the
front-panel normal (z), with no pitch or vertical drift. Its shell, shutter and
printed label share that plane. Insertion first reaches the fascia at travel
−0.77, pauses 160 ms for the
fingertip to reach the scallop, then presses to −0.93. The tail ends 0.16 units
behind the fascia; latch compression is only 0.012 units. Ejection first depresses the button and
releases the latch, then springs the disk out to a supported grip position.
Reduced motion settles both mechanisms immediately. Inspect with
`/preview?preview=encrypting&detail=disk` or `&detail=scope`; `&motion=slow` slows travel.

Regenerate only these details against the current editable scene:

```sh
blender -b -t 1 --factory-startup assets/console/decrypto-console.blend --python assets/console/refine_scope_drive.py
```

This pass preserves other refinements and all 40 room-code digit variants.

The main console now ships the selected SIGNAL receiver in both the editable
`.blend` and the production GLB. It starts in AUTO with the low, recessed toggle;
only the needle moves, with softened attack/release and irregular 0.45–1.1-second
phrases (0.8–1.5-second quiet rests). The physical toggle selects MAN, and the
tuning/gain controls work throughout the normal game. No study query is needed.
To install a regenerated receiver into the current console without rebuilding
the housing or other refined assemblies:

```sh
blender -b assets/console/decrypto-console.blend --python assets/console/install_receiver.py
```

This repeatable pass archives the old VU in `instrument-vu.glb` for the development
comparison, replaces only the receiver assembly, and registers its switch surface.
It exports all 40 room-code digit variants while preserving the editable scene's
digit visibility and excluding Boolean cutters.

## Interchangeable instrument studies

Development comparison: `/preview?preview=encrypting&instruments=signal`.
The bottom review bench switches between `signal` (tunable receiver), `tuning`
(center-zero discriminator), `status` (three-sided mechanical state drum), and
`original` (the former VU). Add `&detail=meter` for the close-up, or use the
bench's whole-machine / detail buttons. All alternatives share the same console,
camera and lighting. The physical knobs accept clicks, drags, wheel and arrow keys.
The optional motion demo is local and does not report real radio/network quality
or change a game. Reduced motion disables automatic sweeps and drum cycling.

The refined `signal` study combines the S-meter face with a larger tuning knob
and smaller gain knob. Tuning has a continuous 0–40 range with end stops; three fixed local stations produce peaks with quiet gaps between them.
Gain independently scales the received envelope. The needle has inertial settling
and restrained signal flutter; reduced motion retains tuning without flutter.
The miniature bat toggle between the knobs selects AUTO (up) / MAN (down).
Its independent `SignalSweep` assembly has a pivot at z=.591, buried .044 units
below a genuinely bored hex collar. The gasket is almost flush to the face;
the shortened stem and ivory tip stay behind z=.780 through the entire throw,
roughly halving the previous projection. The script validates all 65 sampled
poses and the shaft clearance at both ends of the throw.
AUTO animates only the needle with irregular VU-like peaks, short phrases and
occasional quieter rests. Tuning and gain knobs remain at their manual settings,
and the toggle stays in its selected position. Returning to MAN restores the
manual frequency without moving its knob. Touching tuning selects MAN; gain
remains adjustable in AUTO. Power off and reduced motion pause the random signal
without advancing its clock. Signal attack is quicker than release.
The signal study uses this physical control in place of the review bench's demo
button. These controls do not use game progress,
private clues, connection latency, microphone input, or a real radio source.

`instrument-studies.blend` is an independent, editable source presenting the
three assemblies side by side. `build_instrument_studies.py` generates that file
and `web/public/models/instrument-studies.glb` without opening or changing the
approved console source. Regenerate using:

```sh
blender -b --python assets/console/build_instrument_studies.py
```

The GLB exports all variants at one local mounting origin; the runtime places
it at `(5.83, -1.4, 0)`. Needles, knob assemblies, and the complete triangular
drum retain independent origins. Scale marks and legends are Blender geometry;
the drum's three labels rotate with its faces. Its housing accommodates the
entire swept volume between the mounting floor and front glass, validated by
the build script. The production console embeds only the selected receiver;
the studies and archived VU load only for the development comparison bench.
Selecting a study updates the development URL, so a
particular option and viewing distance can be shared or reloaded directly.

## Editable model and base geometry

The `.blend` is the current geometry source. On 2026-09-06 it was refined directly
in Blender using the UI: four nickel guard mounts, two guard rails with separate
rubber grips, and two printer roller bearing caps were added. The updated GLB was
exported from that scene with cameras and lights disabled. Existing interactive
part names and surface positions were preserved.

Blender MCP was used to add seven dial indices and the named `FloppyTransport` and
`ScopeTuning` assemblies. The fixed `Floppy mount` is outside the transport.
These assembly names are required by the frontend animation engine.

The command below regenerates the **base model only** and overwrites the current
`.blend` and GLB, discarding these manual refinements. For subsequent edits, open
`decrypto-console.blend`, save it, and export glTF Binary to
`web/public/models/decrypto-console.glb` with cameras and lights disabled.

The oscilloscope refinement is reproducible and safe to rerun against the current
editable scene. It preserves the manual guard rails, archive and drive assemblies:

```sh
blender -b assets/console/decrypto-console.blend --python assets/console/refine_scope.py
blender -b assets/console/decrypto-console.blend --python assets/console/refine_console.py
blender -b assets/console/decrypto-console.blend --python assets/console/remodel_instrument.py
blender -b assets/console/decrypto-console.blend --python assets/console/remodel_front.py
blender -b assets/console/decrypto-console.blend --python assets/console/refine_front_mechanics.py
blender -b assets/console/decrypto-console.blend --python assets/console/refine_tactile.py
blender -b assets/console/decrypto-console.blend --python assets/console/refine_score_roster.py
blender -b assets/console/decrypto-console.blend --python assets/console/refine_roster_manual.py
blender -b assets/console/decrypto-console.blend --python assets/console/refine_front_layout.py
blender -b assets/console/decrypto-console.blend --python assets/console/refine_panel_layout.py
blender -b assets/console/decrypto-console.blend --python assets/console/refine_nixie_recorder.py
blender -b assets/console/decrypto-console.blend --python assets/console/refine_nixie_cover.py
```

Run `remodel_instrument.py` before `remodel_front.py`. The instrument pass replaces the slab
surrounds with hollow profiled castings, deepens the folded sleeve, adds louvres,
recessed ruby cartridges and a coax lead, and builds the reverse service panel.
It preserves the hand-made guard rails, floppy transport, keys, and all live
surface positions. The source keeps its bevel modifiers editable; export applies
them and uses Draco mesh compression. The decoder ships locally with the web
bundle—no external decoder/CDN dependency. With the front assemblies included,
the current compressed GLB, including embedded PBR maps, is about 9.6 MB.

`remodel_front.py` builds the roster carrier, eight inserts, score bank and
printer frame. `refine_front_mechanics.py` establishes the first moving assemblies,
then run `refine_tactile.py`, `refine_score_roster.py`, `refine_roster_manual.py`,
then `refine_front_layout.py` and `refine_panel_layout.py`. These final passes change the front
finishes, card retainers, manual key and component spacing, preserving the rear
contacts, plugs and cable morphs. The layout passes remove all front screw
assemblies while retaining rear fasteners. The drive occupies the bottom-left
rail; the power bat toggle sits on the top side of the sleeve above the
room code. Its nickel bat with a red resin tip rests tipped 16 degrees toward
the I mark, pivoting below the collar rim of a threaded bushing that runs down
into the casing. A ring hex nut clamps the bushing to a solid legend plinth
half-sunk into the deck, the pivot ball nesting inside the bores. Disk animation
uses the exported assembly's resting position, including after relocation.
The base interaction pass uses
`console_parts.py` and updates the editable scene, GLB and surface manifest together:

- Warm black phenolic cassettes, ivory name inserts and restrained satin metal edges.
- `ManualKey` has a solid matte graphite cap, an ivory FIELD GUIDE legend and
  a charcoal spring-loaded skirt with a single low socket. It has no emission or decorative lamp dots. The 33 duplicate speaker
  perforations beneath it are removed; the lower and rear grilles remain.
  The front DECRYPTO wordmark is removed; the four-cell room code has a clearly labeled ivory copy key.
- Eight independent `ScoreLamp_*` domed lenses with dark sockets and retaining collars.
  Runtime materials follow real team scores; flat token textures are removed.
  The inset plate around the lenses uses fine horizontal brushed nickel with
  dark printed legends. `Score bezel` keeps its smooth satin black finish.
  The five large body panels use uniform satin alloy without grain maps.
- A continuous, subdivided `Paper back` under `PaperFeed`, anchored at the roller nip.
  The resting leader is 0.36 units long. Each new pull extends to 0.98–7.06 units
  based on the archived record count (0.38 extra per completed round, up to 16 rounds).
  Its free edge curls and the roller turns with actual feed travel. Ink moves
  down with the stock at a fixed physical letter size. At runtime the mesh is the
  tearing simulation's particle grid, so the cut opens wherever fibers actually fail. Later rounds
  hang in front of the signal gauge and launch key, with a three-degree forward feed
  angle keeping the stock clear of the raised key; the longer paper prints every archived record
  at the original letter size. Thirty-five
  tear teeth and two guides register to the same centerline.
- A warm SIGNAL scale, tapered `SignalNeedle`, counterweight, brass hub and
  beveled glass. `SignalTuning`, `SignalGain` and the low `SignalSweep` AUTO/MAN
  toggle are independent assemblies; the pointer is a local toy, unrelated to game progress.
  The obsolete archive wheel and legacy monitor/sync toggles are removed. Only
  the paper leader opens the archive; no extra knob is painted over the model.
- `TransmitLever` keeps its compatibility name but is now a large red pushbutton
  beneath the receiver panel, with linear travel, a black skirt and a satin
  gunmetal collar. Its oxide-red resin cap has fine grain, subtle edge wear and
  no clear coat. The fixed ACTION legend sits above a smaller
  PRESS TO CONFIRM label; both move with the cap.
- The amber clock uses seven individually drawn segments per digit, faint unlit
  bars and a restrained glow. It displays MM:SS during a timed turn and dim
  dashes while idle.
- Four `BatteryCell_0` through `BatteryCell_3` groups have alternating raised
  positive terminals and flat negative ends. Matching coil springs and copper
  leaf contacts belong to the tray. Each complete cell can be removed and replaced.
- Eight `RosterCard_A0`–`RosterCard_B3` assemblies each hold one paper card and its
  exposed cut edge. A departing card first lifts .045 above its fixed low
  retainers, moves .16 forward to clear the rack, then lifts away; an arriving
  card aligns with the slot before lowering behind the retainers. The L-shaped
  shelf and front lip never intersect the stock. Exported-model tests sample
  the complete path against both the current and preceding row. Solid stock
  writes depth throughout travel; only its fully withdrawn end fades using
  alpha coverage. Printed ink retains normal antialiasing. Clips, channels and
  wells stay on the rack. Each well floor
  has a `rosterWell{team}{i}` print surface for stamped join instructions, covered
  whenever a card is inserted.
- `CablePlug_RJ45`, `CablePlug_Serial` and `CablePlug_DC` include contact structures,
  molded boots and strain reliefs, independently of the fixed sockets. Each flexible
  lead is a separate mesh anchored below the console, not parented to its plug; an
  `unplugged` morph target bends the cable as the plug travels out.

The tactile pass generates deterministic 512-pixel color, roughness and tangent-space
normal textures for aluminum, nickel, phenolic, paper, enamel and rubber. PNGs are
saved under `assets/console/textures/` and packed into both the editable source and
GLB. Manufacturing UVs preserve grain direction and material scale. The browser
batcher must preserve UV attributes. The script uses the macOS STHeiti font for
modeled Chinese legends; those glyphs are exported as geometry.

Construction references: [Sifam Presentor AL](https://www.sifam.com/meterCategory.asp?cat=Presentor+-+AL)
for the acrylic front, buff dial and light box; [APEM panel indicators](https://www.apem.com/en-us/led-indicators/professional-grade-panel-mount-led-indicators)
for retained diffused lenses; [Epson EU-T300](https://epson.com/For-Work/Printers/POS/EU-T300-Kiosk-Printer-Series/p/C41D383001)
for the feed mechanism. These guide original geometry and materials, with no copied artwork.

The rear has an actually perforated speaker grille, a hinged `BatteryDoor`, four
separately modeled cells with coil contacts, a keyed RJ45 socket with eight pins,
a serial connector, and a DC jack. `RearSoundSwitch` and `RearTestLamp` must remain
independent animated/material-controlled parts. The battery cells do **not**
belong to the moving door. The model is complete on both sides, not two images.

From the repository root:

```sh
blender -b --python assets/console/build_console.py
```

This saves the editable `.blend`, `web/public/models/decrypto-console.glb`, and
`web/public/models/console-surfaces.json`. The script defines the base geometry
positions and the exported surface manifest. Meshes for the lever,
number keys, floppy, paper roller and scroll wheel remain separately editable.
The `.blend` contains the physical chassis; live lettering is supplied by Three.js.

## Runtime

- `web/src/components/console/engine.ts`: GLB loading, lighting, canvas textures,
  mechanical animation and projection of accessible interaction targets.
- `paint.ts`: console text/controls are drawn into Three.js textures, including
  home, room setup, clues, guesses, waiting, results and instrument scales.
- `ArchiveSheet.tsx` / `notebook.ts`: torn receipt rising into the center from its projected feed position, private notes,
  keyboard focus, responsive layout and local persistence.
- `Console.tsx`: store integration, Chinese IME/native input support, transparent
  keyboard-accessible targets and WebGL failure fallback.
- `model.ts`: action eligibility, archive visibility and development fixtures.
- `rosterMotion.ts`: identity-aware insertion/retraction, retaining outgoing ink
  until the card is hidden; rapid changes resolve to the latest occupant.
- `quality.ts`: the graphics quality levels, the switches each one owns, Auto's
  step-down rule and the saved choice. See "Graphics quality" below.

Geometry and surface URLs share the revision in `ConsoleEngine.load()`; bump it
when exporting a new model to prevent old geometry and new labels being mixed
in a cached production page.

The final `refine_panel_layout.py` pass moves the small CRT and its backing up,
places MODE / TIME / PERSIST in a clear row below it, and reroutes the coax around
the controls. Room-code and score instruments have separate margins; the recorder
is centered on the VU column, and its paper animation reads the exported feed nip
instead of a fixed coordinate. Fixed panel legends are English; Chinese gameplay
screens, secret words, player data, and archive contents retain their language.
Eleven bottom vents are Boolean cuts through the overlapping skins, with actual
inner walls and a recessed plenum. Their editable cutters are hidden from renders
and excluded from glTF. The export pass verifies 44 aperture rays plus the metal
bridges between slots. Saved baseline transforms make this pass safe to repeat.

Run the existing Go server and the frontend dev server (`cd web && npm run dev`).
If the local pnpm wrapper attempts to reinstall dependencies, `npm run build` and
`npm test` use the same installed tools without changing the lockfile.

The public `/preview` route supports orbit, wheel zoom, and handle-driven turnover.
The live `/` route locks the camera head-on. Both expose quality and language in
Settings. Development-only visual fixtures (no WebSocket connection and no backend writes):

- `/preview?preview=encrypting`
- `/preview?preview=intercept`
- `/preview?preview=decrypt`
- `/preview?preview=waiting`
- `/preview?preview=room`
- `/preview?preview=room-empty` and `/preview?preview=room-partial` (empty seats and a long nickname)
- `/preview?preview=roster-motion` (buttons for human/AI entry, removal and replacement)
  Add `&motion=slow` to inspect the roster travel at one fifth speed. These
  controls are development-only and never connect to the multiplayer server.
- `/preview?preview=round_result`
- `/preview?preview=game_over`

Add `&quality=high|medium|low|auto` to pin a level for a still or a benchmark
without touching the saved choice.

## Graphics quality

Quality is session UI beside the language selector, outside the console and its
fixed legends: 自动 / 高 / 中 / 低 (Auto / High / Med / Low). The choice is kept in
`localStorage`. Hovering a level lists exactly what it switches, generated from
the same `qualityProfiles` table the engine applies, so the hint cannot drift
from the behaviour. Every switch changes live; nothing reloads. The phone layout
replaces the 3D stage, so the selector is hidden there and a stage without a
size renders nothing at all.

| Switch | High | Medium | Low | Alone saves (GPU / software raster) |
| --- | --- | --- | --- | --- |
| `pixelRatio` cap | 2 | 1.5 | 1 | 34% at 1.5, 51% at 1 |
| `areaLights` (softbox and rim `RectAreaLight`) | on | off | off | 46% / 28% |
| `shadows` (PCF, 1024 map) | on | on | off | 20% / 13%, plus each map refresh (189 calls, 492k triangles) |
| `screenGlass` (physical glass on six CRTs) | on | on | off | 22% / 10% |
| `nixieCover` (clearcoat acrylic, tube glass) | on | on | off | 15% / 8% |
| `crtOptics` | full | full | lite | up to 15% / 12% |
| `ambientFps` | 60 | 30 | 30 | halves the steady load |
| `backdropBlur` behind the archive sheet | on | on | off | not measured |

Savings were measured one switch at a time on the late-game console at 2880x1800
(Apple M4 Max, 5.9 ms per synchronised frame) and, for ratios only, on a software
rasteriser at 1440x900. They overlap, so they do not add up. Whole levels on the
same machine: high 5.2 ms, medium 2.6 ms, low 1.8 ms. Environment reflections
stay on at every level: removing them costs the metals their look and saved
nothing further once the other low switches were off. MSAA also stays, because
it is fixed when the context is created. The 645k triangles are not the bottleneck.

- With the area lights off, the key, fill and sky rise by 1.26 to the same mean
  exposure; the visible change is a slightly firmer cast shadow.
- `lite` optics print the picture on the faceplate: no ray through the glass, no
  halation taps and no colour fringing; raster rows, roll, flicker and grain stay.
  `bounds()` passes the same choice to `crtDisplayUv`, because the DOM inputs
  must invert whichever optical path the shader draws.
- Only ambient frames are paced: frames in which nothing but the raster, the
  beam and the needle moved. Anything the player changes renders at once, and
  the scope runs its beam for all the time since the phosphor was last shown.
  Quality never shortens or removes an interaction animation, and it is
  independent of `prefers-reduced-motion`.
- Auto measures instead of guessing from hardware names. After the first frames
  it renders back to back for a quarter second, reading one pixel back per frame
  so the GPU's share counts; the burst is needed because an idle GPU clocks down
  and would otherwise report stretched frames. A level is kept when a frame fits
  13 ms. Auto only steps down (straight to low when even medium could not fit),
  remembers the result for the next visit, and measures afresh from high when
  Auto is chosen again.

## Controls

The top-side power toggle flips with a click, Enter or Space. `PowerSwitch`
swings the pivot ball, nickel bat and red tip together through a 32-degree
throw; its hex nut, threaded bushing, legend plate and generous click region
stay fixed. Turning it off lets the CRTs and word windows die as tubes (see the
theme paragraph below), blanks the electronic readouts, extinguishes the lamps
and parks the VU needle. Front entry and submission stop until it is switched back on. Connection,
room membership and prepared clues/guesses remain intact; a running game continues
to count down. Reduced motion switches positions immediately.

The bat pivots at the bushing mouth, its stem working inside the open bore
above a dark base, with the collar ring clearing the swing in both positions.
`refine_panel_layout.py` runs
`validate_power_clearance.py` before saving/exporting: 65 poses check the evaluated
meshes against the chassis, bushing and legend plate for intersections,
contained vertices and a minimum sampled gap of .045 console units.
`preview_switch.py` renders a close-up of the switch (optionally in its OFF
pose) for visual review.

The front roster uses separately modeled ivory name inserts with human/AI lettering, seat numbers,
owner/self marks, and phase-aware public progress. The inserts are physical cards:
a joining player's card slides into its channel, a departing one lifts out, and an
empty seat reveals join instructions stamped into the well floor. Joining takes
540 ms and leaving takes 420 ms. Replacement withdraws the old named card before
inserting the new one, even when both players have the same nickname. Updating
the same person's status does not replay insertion. Reduced motion settles
immediately. The rack is a passive display, with no click target or central-screen
roster view. The printed paper leader is the handle for the public archive. Per-player
connectivity is not inferred, and ambiguous nickname progress is not attributed.

Settings offers Classic, Amber, Violet and Rose palettes, remembered locally. Each
palette has one color for the player's team and another for the opponent, shared
by the active CRT, phase lamps, roster and compact mobile view. The fixed scoreboard
uses green interception lamps and red decryption-error lamps in every palette;
its A/B letters use the same neutral ink as SCORE, independent of team and theme,
and print directly on the metal with no colored background blocks.
Bulbs and diffuser strips share the same runtime
material so the exported amber lens cannot obscure the new color.

Team plaques are colored enamel on the modeled plate, with transparent silk-screen
lettering rather than an opaque color rectangle covering the geometry. Runtime
PBR pigment, normal and roughness maps provide fine orange-peel relief and satin
clearcoat; the beveled return receives the same team color. The score plate uses
directional nickel brushing, with ink following the surface relief. Sparse lip
scuffs and print pinholes stay deterministic across updates and theme changes.
`finishes.ts` creates these small maps once per console; they do not require extra
GLB downloads. DEV `?detail=roster` and `?detail=score` expose the two close-ups.

The six picture tubes (main display, four ruby word windows, vector monitor) switch
on and off as tubes, not as pictures being scaled. `CrtTube` in `crtMotion.ts` is a
small electrical simulation in fixed 2 ms substeps: supply rail, cathode heat
(Richardson emission), anode voltage held by the tube's own capacitance, vertical
and horizontal deflection, focus, the screen-grid reservoir, beam limiter, sync
lock and degauss thermistor. No timeline is authored; `crtTuning` holds the
constants. What follows from them:

- Off: the video amplifier dies first, so the unblanked gun floods a raster that
  is already collapsing. Vertical deflection goes within about 130 ms, the line
  shortens to a spot by about 380 ms, and the spot fades through decades until
  about 900 ms as the grid reservoir drains. The same light in less area is
  brighter (`crtDensity` integrates to one for every extent), phosphor
  saturates toward white, and the faceplate scatters a bloom and halo around it.
  The last full picture stays where it stood as decaying afterglow; it is never
  squeezed along with the raster. Edges of a raster in flight are blurred over
  one 24 ms exposure, so nothing reads as a hard-edged card.
- Cold start: deflection and anode are up long before the cathode emits, so
  nothing unfolds. The picture fades in from about 250 ms, soft and up to 3%
  over-sized, shimmering under the degauss field, and is usable after about 1 s.
- Warm restart: a cathode that is still hot brings the picture back in about
  0.4 s, with the vertical hold slipping once before it locks.

A theme change is such an off/on cycle of the main tube. `CrtMotion` keeps the
outgoing texture until the old picture is past recognising (about 350 ms),
exchanges it in the dark and applies only the latest requested palette. A blank
power-off frame waits until the last afterglow has gone. Normal game updates do
not reboot the display. Projected input controls hide until the raster is
steady, keeping DOM text off a moving picture. Word windows and the vector
monitor are smaller, quicker tubes with seeded tolerances: they come up and die
at slightly different moments, each with its own roll. New content on a lit word
window (new words, conceal/reveal) costs it its vertical hold for about 150 ms.
The fragment stage lives in `crtShader.ts`; a resting tube takes the old
single-sample path, so steady frames cost what they did before.
Reduced motion applies the final state immediately. The two roster team plaques
still lift out and reseat using `RosterMotion`; the scoreboard stays fixed.
`&motion=slow` slows both effects for inspection. Colors are applied to runtime
materials and canvas textures; no alternative GLB models are loaded.

Click clue lines to type with the system IME. In guessing phases, choose an answer
slot and use the 1–4 physical keys or the keyboard; Backspace removes a digit.
The large red transmit button is the single confirmation action. Ctrl/Cmd+Enter is
its keyboard shortcut. Complete guesses must contain three distinct numbers.

Click a red word window to conceal/reveal the team's words. Click or pull the short paper
leader down to extend it to 2.7–19.6 times its resting length over 420 ms as records accumulate. The centered
DOM reader slides up from below the viewport at its full reading size, starting at
the same time and using the same duration, including in slow-motion inspection.
The entire paper has its natural content height and scrolls through the viewport,
including the header and footer; there is no separately scrolling body. A stationary
clipped track keeps scroll extents constant during entry, with balanced scrollbar
gutters and a persistent compositor layer for the moving paper. It moves
down and fades from the current reading position on dismissal. The physical sheet
remains extended and attached while reading.
Escape, the close button, or a backdrop click dismisses the reader and starts the
800 ms tear/disposal and reader exit at the same time. The physical tear is a
position-based sheet simulation (`tearing.ts`): the mesh is its particle grid,
two columns per tear tooth and rows crowding toward the tooth line. Paper
stiffness comes from three-point bending stencils at one, two and four grid
spacings, which resist even gentle curvature so the stock stays flat and
card-like, and three in-plane sweeps per substep keep it inextensible. The
sheet is plastic rather than elastic: past a small yield deflection a stencil's
rest bend follows the current bend (paper takes a set), a stencil folded past
three tenths of its span becomes a limp permanent crease, and heavy air damping
removes any springy after-motion. Every tooth holds the stock with a fiber
whose strength varies in small bundles. A kinematic hand pinches a rounded pad
on the right side a short way below the teeth, first swings it on an arc just
inside its material distance so the stock bends over the teeth without slack,
then drags it down, left and outward. Nothing scripts the cut: fibers part only
where the in-plane pull across the teeth (shear along the tooth line, plus a
quarter of the tension along the stock; pressure from bending over the teeth
never counts) exceeds their strength above the standing load of the hanging
stock, so the crack starts under the pinch at about 125 ms, hesitates at
strong bundles, and accelerates leftward as the shrinking ligament carries more
load, finishing between roughly 190 and 225 ms for every sheet length (a guard
parts any survivors at 270 ms). Long-range attachments to each column's fiber
and, once detached, to the pinch bound the stretch; the fold over the teeth
and the diagonal tension crease are the sheet's own response, and the settled
sheet swings from the hand after the last fiber parts. The simulation is
deterministic, runs at 480 substeps per second (about 5 ms per frame), and
completes immediately under reduced motion.
The stub above the tear line (`Receipt clamped head`) is built at runtime from
`receiptHeadPath` against the exported `Paper roller` and `Printer opening`:
paper leaves the opening behind the platen, comes over the top of the roller
and down its front, then drops behind the tear bar to the teeth, so the sheet
visibly comes out of the roller. (A nip under the roller would be hidden behind
the tear bar from the console's viewpoint.) The stub shares the sheet's print
texture and shows the roll beyond the sheet's top: the paper canvas is taller
than the longest sheet by `paperHeadReserve`, and the start of the next sheet
(the same leader that emerges after tearing) is copied above the current
header, so print scrolls continuously off the roller during feeding and refill.
The detached sheet moves
1.2 units toward the viewer at its existing length; both faces stay opaque for
the first fifth of that travel, then fade together;
a fresh opaque edge emerges from the nip and feeds to the short resting length over
520 ms. The roller follows the stock without rewinding at detachment. Reopening during
disposal waits for that fresh leader. Each pull captures the latest completed-round
count; incoming records never resize the sheet being read or torn. Closing during
entry tears the partially fed sheet at its current length without jumping to full extension.
Focus returns to the paper after dismissal or cancellation. The raised
manual key toggles the action manual and visibly depresses while selected.

Click the exposed floppy to push it in; the drive/eject key depresses the eject
button before releasing the disk. LEVEL, FREQ and PERSIST are continuous analog
controls. Click the scope display to choose vector, sine, dual-trace, square,
triangle, pulse, sweep or noise. These local controls send no game messages.
Reduced motion disables spatial transitions while retaining state changes.

The bottom-right **翻到背面** control rotates the entire console around its body
center, with a small lift to clear the table. **回到操作面** or Escape returns;
clues/guesses are preserved and an open battery lid closes automatically. Hidden
face controls are removed from keyboard/pointer routing, including submit
shortcuts. Game state continues to update while inspecting the back, with a
persistent round/turn reminder. Reduced motion switches faces/door immediately.

Rear interactions are local only:

- Click the battery compartment to open/close its hinged lid. With the lid open,
  click any cell to remove it, then click it below the compartment to reinstall it.
- Click each rear plug to unplug/reinsert it. The anchored cable lead bends with
  the travel instead of translating rigidly. These actions
  never power off the front display, disconnect the socket or change a game message.
- The red audio switch enables optional, quiet Web Audio detents and a speaker
  test tone. Sound is off by default and starts only after a user gesture.
- LAMP TEST briefly pulses the rear green indicator. Neither this test nor the
  modeled ports disconnects WebSocket or changes multiplayer state.

At runtime, static opaque meshes are batched by material; each moving assembly
is also batched internally without changing its pivot. Meshes with morph targets
(the three cable leads) always stay independent so the bend animation survives. Shadows update when
mechanical parts move, including the independent VU needle. The earlier untextured
4.32 MB model measured about 60 fps and 154 draw calls; that measurement does not
describe the present textured model. DEV canvas data attributes expose current
frame rate, draw calls, triangles, and face for checks.

## Current limits

This is the first playable modeled version, with simplified geometry/materials.
Portrait phones retain a readable console width and allow horizontal panning.
They do not yet have a separate compact machine layout.
Countdowns are approximate because the server sends phase changes but no deadline.
The unchanged server does not restore seats after disconnect: the terminal returns
to the connection screen and explains the loss of the previous seat.
The server sends completed history with the following round, so the final round's
full answer is not currently available in the archive. Never synthesize it from a
player's private state.


## Nixie and receipt refinement (2026-09-13)

`refine_nixie_recorder.py` precedes the cover pass, preserving the existing panel layout and
using saved baseline transforms for repeatable changes. It exports all digit
variants, then saves the editable Blender scene with only the demo code 5821 lit.
The room-code readout has four original IN-14-inspired glass envelopes, rounded
shoulders and exhaust tips, twelve pins per tube, ceramic sockets, mica discs,
support rods, a fine modeled anode mesh and ten individually spaced wire cathodes.
Forty `Nixie_Digit_{slot}_{digit}` meshes retain digit/slot and curved-path metadata.
The browser selects one per tube from the actual room code; a matching soft
corona surrounds the emitting geometry. Power off extinguishes all cathodes.
The source was informed by the [CC0 BlendSwap reference](https://blendswap.com/blend/10631);
its download was unavailable, so no third-party geometry was imported.

The three CRT surfaces (main display, ruby word windows, and oscilloscope) combine
visible scanlines, emission halation, edge falloff, and a subtle moving refresh
band. Shallow elliptic paraboloids provide continuous convex curvature through
the corners: center rise is 0.18 / 0.035 / 0.04 units respectively, within the
existing recessed hoods. The old product of edge-pinned arcs produced pinched
corners and balloon-like rolled shoulders; the faceplate normals now stay within
nine degrees of forward. The glass extends beneath the retaining lip so its cut
edge does not leave a second outline above the gasket; raster dimensions remain
unchanged. The main face uses a 128-column mesh and a finely sampled outline.
Restrained barrel distortion keeps frontal raster displacement
below 2% per axis across the visible content area. Scanlines integrate over the
projected pixel footprint to avoid distant moire; the previous baked raster was
removed to avoid stacking two grids. Halation samples bright text and traces,
preserving dark glass and extinguishing with power; the ruby windows glow from
one soft mip tap around their glyphs. The CRT textures fill their
full bounds so barrel distortion cannot expose transparent corner holes.
The exported ruby slabs serve as matte dark seats beneath the curved glass,
preventing a second flat specular surface from leaving straight white strips.
The glass envelope and emitting coating have distinct optical surfaces. For each
fragment the shader refracts the camera ray through the actual front-face normal
(IOR 1.52), then intersects a recessed curved phosphor surface. Its depth is
0.04 / 0.012 / 0.013 units and its rise is 0.168 / 0.03 / 0.034 units for the main
display, word windows and scope. Text, rules, scanlines and halation share this
view-dependent mapping and slight barrel distortion. The thin, softly masked
inner border keeps the picture seated within the glass. Optical tests cover
convexity, rim slope, bounded distortion, parallax and inverse input alignment.
Glass reflections use the scene's
actual lights and environment with restrained physical specular; raster highlights,
painted softboxes, and the previous synthetic reflection shader have been removed.
Projected input bounds numerically invert the same refraction and raster mapping
using the current camera, keeping input controls aligned during inspection.
DEV close-ups: `/preview?preview=encrypting&detail=screen` (also `words` and `scope`);
append `&view=oblique` or `&view=opposite` to compare the two viewing directions.
Reduced motion freezes the band. Scope history uses source-over
compositing and is displayed at a bounded 32% opacity beneath a fresh sharp trace.
The 45–1440 ms decay retains history during continuous tuning; changing waveform,
power or standby state clears stale history.

The printed leader and enlarged receipt both use `archiveRows`, including the
preview fixtures. Public answers are never derived from private current-round
state. The receipt exposes historical results directly and keeps team filtering,
scrolling, annotations and per-player local notes. The shortened top toggle is
64% of its former exposed height; the complete throw still passes 65-pose
geometry clearance validation (minimum sampled gap 0.0536).

DEV inspection URLs: `/preview?preview=encrypting&detail=nixie` and
`/preview?preview=encrypting&detail=recorder`. `&motion=slow` also slows paper mechanics
for inspecting the 420 ms feed/reader entrance and the 800 ms tear/disposal/reader dismissal.
`/preview?preview=late-game` shows round 16 with 15 completed public records, varied clues,
and one interception/error per team. Pull the paper to inspect a nearly full-length
receipt and the scrolling DOM archive; `&detail=recorder` gives a close-up.
`&paper-frame=0.5` runs the real feed and tear mechanics to that point and holds
the frame; add `&paper-phase=feed` to inspect feeding instead, or
`&paper-phase=refill` to inspect the emerging new tip.
The reader starts when feeding begins, and shares its duration with the physical paper.
Its exit also shares the physical tear duration. Reduced motion
settles each transition immediately.


`refine_nixie_cover.py` is the final model pass. It moves the complete Nixie
assemblies 0.64 units into a pocket cut through the column, enamel and chassis.
Their frontmost point is z=0.483, behind the console face at z=0.55. Tapered
sidewalls descend to a dark floor at z=-0.16. The tube bank is centered over the
score instrument, with the copy key in a separate ROOM CODE header row. Tubes
are 85% of their original height; the score assembly scales uniformly to 84%,
preserving circular lenses and leaving a 0.218-unit gap beneath the tube frame.

A single fitted acrylic cover has 0.024-unit walls, a 0.036-unit face, polished
rounded edges and a dark gasket. The enamel return uses the console column's
own material and sits flush to its face. The acrylic front is z=0.604, with
0.085 units between its inner face and the tubes. A continuous horizontal carrier
has four machined bores, socket retaining collars and tongues into both sidewalls.
The script checks that every socket intersects its carrier seat, as well as full
tube bounds, score separation and twelve rays through the machined recess.
Runtime transparency is ordered from cathode corona through each tube to the
cover. Global studio softboxes create view-dependent reflections; the
acrylic shader preserves physical specular light separately from its low-opacity
substrate, keeping the tube glass and digits visible underneath. Corona placement
and height follow the exported channel surface.

The entire console now shares a 28-degree perspective camera. Its distance
adapts to the viewport while keeping a consistent inspection direction. Detail
URLs crop this same camera frustum without repositioning or flattening it.
The global lighting balances a warm upper-left key, cool fill and two broad
studio sources against restrained environment light. Filtered (PCF) shadow maps
soften the machine's cast shadow and the contacts between its hardware. Copy-key
travel is relative to its exported mounting depth, including after model changes.
