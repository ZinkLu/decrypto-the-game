# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A web-based implementation of the board game "Decrypto" (谍报风云), with real-time multiplayer via WebSocket and AI player support.

## Build & Run Commands

```bash
# Build backend
go build -o server ./cmd/server

# Build frontend
cd web && pnpm install && pnpm build && cd ..

# Run (words.txt must exist in working directory)
./server

# Development (frontend hot reload)
cd web && pnpm dev    # port 3000, proxies /ws and /api to 8080

# Run tests
go test ./internal/room/ ./internal/ws/ ./internal/store/...

# Tests that load the word list need its absolute path
DECRYPTO_WORDS_PATH="$PWD/words.txt" go test ./...
```

**Runtime dependency:** `words.txt` must exist in the working directory.

**Runtime state:** rooms and games are kept in `data/decrypto.db` (SQLite; override with `DECRYPTO_DB_PATH`). The server refuses to start if it cannot open the file.

## Architecture

### Core Packages

- **`internal/core/`** — Game logic (sessions, rounds, teams, players, state machine)
- **`internal/core/word_providers/`** — Word source abstraction (file-based from `words.txt`)
- **`internal/ws/`** — WebSocket infrastructure (Hub, Client, message types)
- **`internal/room/`** — Room management (create, join, teams, AI slots)
- **`internal/game/`** — Bridge layer (WebSocket <-> game state machine)
- **`internal/server/`** — Message dispatcher (routes WebSocket messages to room/game handlers); stores rooms as they change and restores them at startup
- **`internal/store/`** — What the server needs from storage: the `Rooms` interface and its data types (room and game states, who opened and entered each room). No implementation, no dependencies
- **`internal/store/sqlite/`** — The SQLite implementation of `store.Rooms` (pure Go driver, builds with `CGO_ENABLED=0`)
- **`internal/ai/`** — AI players (LLM Provider abstraction + Claude/OpenAI implementations)
- **`web/`** — React frontend (pages, components, store, services)

### Key Architectural Patterns

**Handler Registration (Observer Pattern):** Game events use registered handlers in `internal/core/state.go`. Handlers are called at lifecycle events: INIT, ENCRYPTING, INTERCEPT, DECRYPT, DONE, GAMEOVER.

```go
RegisterEncryptHandler(func(ctx context.Context, r *Round, t *Team, p *Player, ts TeamState) ([3]string, bool) {
    return [3]string{}, false // return true to cancel
})
```

**State Machine:** Rounds progress through states: NEW → INIT → ENCRYPTING → INTERCEPT → DECRYPT → DONE. `Round.AutoForward()` advances through all states by calling registered handlers.

**WebSocket Message Flow:** Client → `ws.Hub` → `server.Handler` → `room.Room` / `game.Bridge` → broadcast back to clients.

**Persistence:** Each layer has a plain snapshot type with JSON tags and a restore function that refuses impossible states: `core.SessionSnapshot`, `room.State`, `game.Snapshot`. The bridge saves at every point where it changes what players see, while holding its lock. After a restart `Session.Resume()` re-enters the interrupted phase with a fresh deadline; a guess already scored is not asked for again. A restored game stays paused until the first human resumes. `server.Handler` knows storage only as `store.Rooms`; `cmd/server/main.go` chooses the implementation. Storing is best effort: a store that fails is logged and the game goes on. Raise `room.StateVersion` or `game.SnapshotVersion` when a stored state can no longer be read as written: a game of another version returns its room to the lobby.

## Game Logic Summary

- Two teams with 2+ players each
- Max 16 rounds (8 per team as encryptor)
- Win conditions: 2 successful interceptions OR opponent makes 2 decryption errors
- Round flow: Encryptor gets secret indices [1-4], provides clues, opponent intercepts (rounds 3+), team decrypts
