# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Go-based multi-platform bot for playing the board game "Decrypto" (谍报风云). Currently supports Discord, with deprecated QQ support (API changed, non-functional).

## Build & Run Commands

```bash
# Build
go build

# Run (requires BOT_SECRET environment variable)
export BOT_SECRET="your-discord-token"
./decrypto-the-game

# Debug mode
export DEBUG=true

# Run tests
go test ./...

# Run tests with verbose output
go test -v ./pkg/decrypto/api/
```

**Runtime dependency:** `words.txt` must exist in the working directory.

## Architecture

### Core Packages

- **`pkg/decrypto/api/`** - Game logic (sessions, rounds, teams, players, state machine)
- **`pkg/decrypto/fronts/`** - Bot platform implementations
- **`pkg/decrypto/word_providers/`** - Word source abstraction (currently file-based from `words.txt`)

### Key Architectural Patterns

**Handler Registration (Observer Pattern):** Game events use registered handlers in `api/state.go`. Handlers are called at lifecycle events: INIT, ENCRYPTING, INTERCEPT, DECRYPT, DONE, GAMEOVER.

```go
RegisterEncryptHandler(func(ctx context.Context, r *Round, t *Team, p *Player, ts TeamState) ([3]string, bool) {
    return [3]string{}, false // return true to cancel
})
```

**State Machine:** Rounds progress through states: NEW → INIT → ENCRYPTING → INTERCEPT → DECRYPT → DONE. `Round.AutoForward()` advances through all states by calling registered handlers.

**Bot Interface:** All platform bots implement `BotInterface` with `Start()` method. Platform-agnostic `GamePool` in `fronts/common/game_pool/` manages sessions across platforms.

### Adding a New Bot Platform

1. Create `pkg/decrypto/fronts/new_platform/bot.go`
2. Implement `BotInterface` with `Start()` method
3. Create handlers in `handlers/` subdirectory
4. Update `main.go` to instantiate new bot type

## Game Logic Summary

- Two teams with 2+ players each
- Max 16 rounds (8 per team as encryptor)
- Win conditions: 2 successful interceptions OR opponent makes 2 decryption errors
- Round flow: Encryptor gets secret indices [1-4], provides clues, opponent intercepts (rounds 3+), team decrypts
