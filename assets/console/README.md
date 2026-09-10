# Decrypto console

Approved visual: `reference.png`. Editable model: `decrypto-console.blend`.
The running interface uses actual Blender-exported geometry, not the reference bitmap.

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
```

Run `remodel_instrument.py` before `remodel_front.py`. The instrument pass replaces the slab
surrounds with hollow profiled castings, deepens the folded sleeve, adds louvres,
recessed ruby cartridges and a coax lead, and builds the reverse service panel.
It preserves the hand-made guard rails, floppy transport, keys, and all live
surface positions. The source keeps its bevel modifiers editable; export applies
them and uses Draco mesh compression. The decoder ships locally with the web
bundle—no external decoder/CDN dependency. With the front assemblies included,
the current compressed GLB, including embedded PBR maps, is about 9.3 MB.

`remodel_front.py` builds the roster carrier, eight inserts, score bank and
printer frame. `refine_front_mechanics.py` establishes the first moving assemblies,
then run `refine_tactile.py` **last**. The base interaction pass uses
`console_parts.py` and updates the editable scene, GLB and surface manifest together:

- Warm black phenolic cassettes, ivory name inserts and restrained satin metal edges.
- `ManualKey` has an amber opal cap and a dark spring-loaded skirt.
  The front DECRYPTO wordmark is removed; the four-cell room code has a clearly labeled ivory copy key.
- Eight independent `ScoreLamp_*` domed lenses with dark sockets and retaining collars.
  Runtime materials follow real team scores; flat token textures are removed.
  The `Score bezel` around them keeps a smooth satin black finish, outside the
  mottled phenolic texture set.
- A continuous, subdivided `Paper back` under `PaperFeed`, anchored at the roller nip.
  The resting leader is 0.43 units long and extends to 1.30 units, with a moving curl
  and matching feed-roller rotation. Its archive legend travels with the leader
  without stretching or staying behind on the chassis. Thirty-five
  tear teeth and two guides register to the same centerline.
- A warm VU scale with a red zero, tapered steel `ReceiverNeedle`, counterweight,
  brass hub and beveled glass. `MeterAmplitude` and `MeterRate` are independent
  five-position knobs; the pointer is a local toy, unrelated to game progress.
- `TransmitLever` keeps its compatibility name but is now a large red pushbutton
  with linear travel, a black skirt and a machined retaining collar. Its lettering
  moves with the cap.
- Four `BatteryCell_0` through `BatteryCell_3` groups have alternating raised
  positive terminals and flat negative ends. Matching coil springs and copper
  leaf contacts belong to the tray. Each complete cell can be removed and replaced.
- Eight `RosterCard_A0`–`RosterCard_B3` assemblies each hold one paper card and its
  exposed cut edge. A card slides straight out of its seat well toward the player
  when the seat empties; clips, channels and wells stay on the rack. Each well floor
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
- `ArchiveSheet.tsx` / `notebook.ts`: paper archive unfolding from its projected feed position, private notes,
  keyboard focus, responsive layout and local persistence.
- `Console.tsx`: store integration, Chinese IME/native input support, transparent
  keyboard-accessible targets and WebGL failure fallback.
- `model.ts`: action eligibility, archive visibility and development fixtures.

Geometry and surface URLs share the revision in `ConsoleEngine.load()`; bump it
when exporting a new model to prevent old geometry and new labels being mixed
in a cached production page.

Run the existing Go server and the frontend dev server (`cd web && npm run dev`).
If the local pnpm wrapper attempts to reinstall dependencies, `npm run build` and
`npm test` use the same installed tools without changing the lockfile.

Development-only visual fixtures (no WebSocket connection and no backend writes):

- `/?preview=encrypting`
- `/?preview=intercept`
- `/?preview=decrypt`
- `/?preview=waiting`
- `/?preview=room`
- `/?preview=room-empty` and `/?preview=room-partial` (empty seats and a long nickname)
- `/?preview=round_result`
- `/?preview=game_over`

## Controls

The front roster uses separately modeled ivory name inserts with human/AI insignia, seat numbers,
owner/self marks, and phase-aware public progress. The inserts are physical cards:
a joining player's card slides into its channel, a departing one lifts out, and an
empty seat reveals join instructions stamped into the well floor. Click the rack to
read the expanded roster on the central screen; Escape returns with clues and
guesses preserved. Entry and transmission are disabled while reading. The printed paper leader is the handle for the public archive. Per-player
connectivity is not inferred, and ambiguous nickname progress is not attributed.

Click clue lines to type with the system IME. In guessing phases, choose an answer
slot and use the 1–4 physical keys or the keyboard; Backspace removes a digit.
The large red transmit button is the single confirmation action. Ctrl/Cmd+Enter is
its keyboard shortcut. Complete guesses must contain three distinct numbers.

Click a red word window to conceal/reveal the team's words. Click or pull the short paper
leader down to feed the strip for 480 ms, then unfold the archive from that position. Filter by A/B and scroll
through public records; write per-round annotations or general deductions.
Notes are stored only in this browser, separately by room and player (previews
use a separate namespace). Escape or the close button puts the paper away and
restores focus to the paper. Escape also cancels an in-progress feed. The raised
manual key toggles the action manual and visibly depresses while selected.

Click the floppy or drive to eject/reinsert the disk. The oscilloscope has three
independent modeled controls, each supporting click, drag, wheel, and arrow keys:
MODE cycles vector, sine, dual-trace, square, triangle, pulse, sweep, and noise;
TIME selects five scan rates; PERSIST selects four phosphor-decay lengths. These
local controls combine into 160 display configurations and send no game messages.
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
