# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Encrypto is an unofficial web-based fan project inspired by the board game "Decrypto" (谍报风云), with real-time multiplayer via WebSocket and AI player support. The whole interface is one modeled machine, the Console (Three.js), in `web/`.

The project began as a chat-channel bot. That code is gone; `origin_msg.md` and `docs/intro.gif` remain from it, and `server/internal/core` still knows nothing about WebSocket so that other channels can drive a game later. Leave those in place.

## Build & Run Commands

The repository holds three independent parts: `server/` (Go module `github.com/ZinkLu/decrypto-the-game/server`), `web/` (pnpm) and `assets/` (Blender and audio sources, whose scripts write into `web/public`). The root keeps only docs, the `Makefile` and the `Dockerfile`. Run make targets from the root.

```bash
make build          # web/dist, then bin/server
make run            # build, then run bin/server from the root on 8080
make dev-web        # port 3000, hot reload, proxies /ws to 8080
make test           # both sides
make test-server    # cd server && DECRYPTO_WORDS_PATH=$PWD/words.txt go test ./...
make test-web       # cd web && pnpm test && pnpm build (Node, no browser)
make docker
```

pnpm is the only package manager for `web/`. Go commands run inside `server/`.

**Runtime layout:** the server runs from the repository root and reads `web/dist` (`DECRYPTO_WEB_DIR`) and `words.txt` (`DECRYPTO_WORDS_PATH`; the file lives at `server/words.txt`, which `make run` passes) relative to its working directory.

**Runtime state:** rooms and games are kept in `data/decrypto.db` (SQLite; override with `DECRYPTO_DB_PATH`). The server refuses to start if it cannot open the file.

## Architecture

### Core Packages

Go paths below are relative to `server/`.

- **`internal/core/`** — Game logic (sessions, rounds, teams, players, state machine)
- **`internal/core/word_providers/`** — Word source abstraction (file-based from `words.txt`)
- **`internal/ws/`** — WebSocket infrastructure (Hub, Client, message types)
- **`internal/room/`** — Room management (create, join, teams, AI slots)
- **`internal/game/`** — Bridge layer (WebSocket <-> game state machine)
- **`internal/server/`** — Message dispatcher (routes WebSocket messages to room/game handlers); stores rooms as they change and restores them at startup
- **`internal/store/`** — What the server needs from storage: the `Rooms` interface and its data types (room and game states, who opened and entered each room). No implementation, no dependencies
- **`internal/store/sqlite/`** — The SQLite implementation of `store.Rooms` (pure Go driver, builds with `CGO_ENABLED=0`)
- **`internal/ai/`** — AI players (LLM Provider abstraction + Claude/OpenAI implementations)
- **`web/src/console/`** — The Console: the whole interface. React holds state and accessibility (`Console.tsx`, with `Controls.tsx`, `Settings.tsx`, `Transcript.tsx`), Three.js draws the machine (`engine.ts` owns the renderer and the frame loop; every moving assembly is a module in `parts/`), 2D canvases painted by `paint()` (`paint.ts`, `paintScreen.ts`, `paintFaces.ts`) become its screens and print, and transparent DOM controls are projected over the 3D parts
- **`web/src/store/gameStore.ts`**, **`web/src/services/websocket.ts`** — Game state from the server (Zustand) and the WebSocket connection
- **`web/scripts/*.test.mjs`** — Frontend tests; they transpile the TypeScript modules and run in Node (`scripts/load.mjs` links a module with its siblings), so logic under test lives in modules without Three.js or DOM imports
- **`assets/console/`**, **`assets/audio/`** — Blender source and passes for the model, build scripts for sounds and music

### Key Architectural Patterns

**Handler Registration (Observer Pattern):** Game events use registered handlers in `internal/core/state.go`. Handlers are called at lifecycle events: INIT, ENCRYPTING, GUESSING, DONE, GAMEOVER. The guess handler hands each team's guess to the round as it arrives (`Round.SetDecryptedSecret`, `Round.SetInterceptSecret`); both are scored together when the round leaves GUESSING.

```go
RegisterEncryptHandler(func(ctx context.Context, r *Round, t *Team, p *Player, ts TeamState) ([3]string, bool) {
    return [3]string{}, false // return true to cancel
})
```

**State Machine:** Rounds progress through states: NEW → INIT → ENCRYPTING → GUESSING → DONE. `Round.AutoForward()` advances through all states by calling registered handlers. In GUESSING both teams guess at once: the encryptor's teammates decode and, from round 3, the opponents intercept. The bridge keeps one action per team with its own deadline and draft; a guess's digits reach only its team and the round's encryptor (`Bridge.RelayProgress`).

**WebSocket Message Flow:** Client → `ws.Hub` → `server.Handler` → `room.Room` / `game.Bridge` → broadcast back to clients.

**Persistence:** Each layer has a plain snapshot type with JSON tags and a restore function that refuses impossible states: `core.SessionSnapshot`, `room.State`, `game.Snapshot`. The bridge saves at every point where it changes what players see, while holding its lock. After a restart `Session.Resume()` re-enters the interrupted phase with a fresh deadline; a guess already given is not asked for again, and is scored only when the round is revealed. A restored game stays paused until the first human resumes. `server.Handler` knows storage only as `store.Rooms`; `cmd/server/main.go` chooses the implementation. Storing is best effort: a store that fails is logged and the game goes on. Raise `room.StateVersion` or `game.SnapshotVersion` when a stored state can no longer be read as written: a game of another version returns its room to the lobby.

**Console:** `paint()` is memoized by `paintKey`; a state change that alters neither `displayState` nor `paintKey` leaves a stale screen. Analog input (knobs) must not repaint. After exporting a new GLB, bump `revision` in `ConsoleEngine.load()`. A part fetches what it moves with `chassis.moving(name)`, which keeps it out of the static batch, and returns an `Effect` from `tick()` so that a still machine draws nothing. Ambient frames redraw only the regions parts list in `ambientRegions()`, over a copy of the last full frame (`partialRedraw.ts`): anything that moves on its own must be listed there or it freezes, and damped motion must land on its target; `?partial=verify` catches both. Whether a control works in the machine's state (power, face, link) is decided by `reachable()` in `actions.ts`, not inside `act()`. Strings are written in Chinese and translated through `translate()`; every new string needs its English entry in `i18n.ts`.

## Documentation

`README.md` introduces the project and stays short and non-technical. Everything else lives in `docs/` (index: `docs/README.md`) and is written in Chinese, describing the current state without changelog sections:

- `docs/gameplay.md`, `docs/getting-started.md`, `docs/deployment.md`
- `docs/architecture.md`, `docs/protocol.md`
- `docs/console/` — design overview, code organisation, displays, mechanics, rear linkage, audio, themes, quality, preview URLs
- `assets/console/README.md`, `assets/audio/README.md` — how the model and the audio are made

When behaviour changes, update the document that describes it.

## Game Logic Summary

- Two teams with 2+ players each
- Max 16 rounds (8 per team as encryptor)
- Win conditions: 2 successful interceptions OR opponent makes 2 decryption errors; 16 rounds played without a winner are decided by interceptions minus errors
- Round flow: Encryptor gets secret indices [1-4] and provides clues; then both teams guess at once (team decrypts, opponent intercepts from round 3); once both have answered or run out of time, the code is revealed and both guesses score independently
