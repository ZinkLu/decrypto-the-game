# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A web-based implementation of the board game "Decrypto" (谍报风云), with real-time multiplayer via WebSocket and AI player support.

## Build & Run Commands

```bash
# Build backend
go build -o server ./cmd/server

# Build frontend (webgl/ — three.js, outputs to web/dist which the Go server hosts)
cd webgl && pnpm install && pnpm build && cd ..

# Run (words.txt must exist in working directory)
./server

# Development (frontend hot reload)
cd webgl && pnpm dev   # port 3001, proxies /ws and /api to 8080

# Frontend protocol smoke tests (server must be running)
node webgl/scripts/smoke-e2e.mjs      # two scripted WS clients + AI, full game
node webgl/scripts/browser-e2e.mjs    # headless Chrome, full game on the canvas UI
node webgl/scripts/frame-shots.mjs    # screenshots the home view at 4 resolutions

# Run tests
go test ./internal/room/ ./internal/ws/

# Core game logic tests (needs words.txt in cwd)
go test ./internal/core/
```

**Runtime dependency:** `words.txt` must exist in the working directory.
**Legacy frontend:** `web/` is the old React frontend, kept for reference only — do not build it; both packages output to `web/dist`, and `webgl/` owns it now.

## Architecture

### Core Packages

- **`internal/core/`** — Game logic (sessions, rounds, teams, players, state machine)
- **`internal/core/word_providers/`** — Word source abstraction (file-based from `words.txt`)
- **`internal/ws/`** — WebSocket infrastructure (Hub, Client, message types)
- **`internal/room/`** — Room management (create, join, teams, AI slots)
- **`internal/game/`** — Bridge layer (WebSocket <-> game state machine)
- **`internal/server/`** — Message dispatcher (routes WebSocket messages to room/game handlers)
- **`internal/ai/`** — AI players (LLM Provider abstraction + Claude/OpenAI implementations)
- **`webgl/`** — Active frontend: three.js + vanilla TypeScript (Vite). "Listening Room" concept: a fixed-camera signals post (pre-computer era — no computer imagery). **The whole UI lives inside the 3D scene**: views are painted onto the main CRT's canvas texture (`src/ui3d/`: `painter.ts` canvas+texture owner, `kit.ts` canvas widgets + HitArea, `views/` one canvas view per game state, `shell.ts` routing/state->stage), and interaction is raycast → UV → hit-area dispatch. Text input goes through a transparent hidden `<input>` (`ui3d/ime.ts`) — the only way browsers deliver IME composition; everything visible is canvas. Round history lives in the **codebook**: a 3D notebook prop on the desk (raycast click, or `H` key) raises a paper sheet in front of the camera with the archive / field manual. Desk displays show your 4 code words, the VU meter is the phase countdown (server-synced via the `deadline` field in `phase_change`/`full_sync`), and the lamp board on top of the side CRT is the score. Instruments power down in menus via `stage.setPowered`. Narrow windows dolly the camera onto the main CRT (`updateZoom`). **No-WebGL fallback**: the legacy DOM overlay (`src/ui/` + `style.css`) is kept and loaded only when `new Stage()` throws. `src/protocol.ts` mirrors `internal/ws/message.go`; `src/store.ts` is the protocol state machine; `src/scene.ts` the render stage. `web/src/store/gameStore.ts` remains the protocol reference implementation.
- **`web/`** — Legacy React frontend (deprecated, kept for reference)

### Key Architectural Patterns

**Handler Registration (Observer Pattern):** Game events use registered handlers in `internal/core/state.go`. Handlers are called at lifecycle events: INIT, ENCRYPTING, INTERCEPT, DECRYPT, DONE, GAMEOVER.

```go
RegisterEncryptHandler(func(ctx context.Context, r *Round, t *Team, p *Player, ts TeamState) ([3]string, bool) {
    return [3]string{}, false // return true to cancel
})
```

**State Machine:** Rounds progress through states: NEW → INIT → ENCRYPTING → INTERCEPT → DECRYPT → DONE. `Round.AutoForward()` advances through all states by calling registered handlers.

**WebSocket Message Flow:** Client → `ws.Hub` → `server.Handler` → `room.Room` / `game.Bridge` → broadcast back to clients.

## Game Logic Summary

- Two teams with 2+ players each
- Max 16 rounds (8 per team as encryptor)
- Win conditions: 2 successful interceptions OR opponent makes 2 decryption errors
- Round flow: Encryptor gets secret indices [1-4], provides clues, opponent intercepts (rounds 3+), team decrypts
