# Decrypto console

Approved visual: `reference.png`. Editable model: `decrypto-console.blend`.
The running interface uses actual Blender-exported geometry, not the reference bitmap.

## Rebuild geometry

From the repository root:

```sh
blender -b --python assets/console/build_console.py
```

This saves the editable `.blend`, `web/public/models/decrypto-console.glb`, and
`web/public/models/console-surfaces.json`. The script is the source of truth for
geometry positions and the exported surface manifest. Meshes for the lever,
number keys, floppy, paper roller and scroll wheel remain separately editable.
The `.blend` contains the physical chassis; live lettering is supplied by Three.js.

## Runtime

- `web/src/components/console/engine.ts`: GLB loading, lighting, canvas textures,
  mechanical animation and projection of accessible interaction targets.
- `paint.ts`: all visible text/controls are drawn into Three.js textures, including
  home, room setup, clues, guesses, waiting, results and paper archive.
- `Console.tsx`: store integration, Chinese IME/native input support, transparent
  keyboard-accessible targets and WebGL failure fallback.
- `model.ts`: action eligibility, archive visibility and development fixtures.

Run the existing Go server and the frontend dev server (`cd web && npm run dev`).
If the local pnpm wrapper attempts to reinstall dependencies, `npm run build` and
`npm test` use the same installed tools without changing the lockfile.

Development-only visual fixtures (no WebSocket connection and no backend writes):

- `/?preview=encrypting`
- `/?preview=intercept`
- `/?preview=decrypt`
- `/?preview=waiting`
- `/?preview=room`
- `/?preview=round_result`
- `/?preview=game_over`

## Controls

Click clue lines to type with the system IME. In guessing phases, choose an answer
slot and use the 1–4 physical keys or the keyboard; Backspace removes a digit.
The physical transmit lever is the single confirmation action. Ctrl/Cmd+Enter is
its keyboard shortcut. Complete guesses must contain three distinct numbers.

Click a red word window to conceal/reveal the team's words. Click paper to enlarge
it for side-by-side comparison; filter by A/B, scroll, or page through records.
Escape closes the manual or enlarged paper. The badge opens the action manual.

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
