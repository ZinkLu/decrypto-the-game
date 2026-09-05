# Three.js tabletop frontend

The active UI is composed in `src/App.tsx`: Home, Lobby, Game, ActionPanel, Result and shared word rack/history/score components. Rendering and layout styles live in `src/index.css`.

`src/components/tabletop/DecoderScene.tsx` builds original black/ivory decoder machines, red filter windows, a code card and tokens with Three.js. It is lazy-loaded separately from the game UI, caps device pixel ratio, releases GPU resources, honors reduced motion, pauses drawing when hidden/still and provides a CSS fallback when WebGL is unavailable.

## Screens

- Home: nickname, create/join mode, four-character alphanumeric room code, connection status, rules.
- Lobby: two teams, 4 seats per side, AI add/remove for owner, team join/leave, start readiness.
- Encrypting: secret three-number code, Chinese keywords, three clue inputs; others see waiting/progress.
- Intercept: opponents use unique 1–4 keys to guess the code; current team waits.
- Decrypt: teammates guess; encryptor and opponents watch progress.
- Round result: incremental interception/decryption outcomes and current scores.
- Game over: winner/tie, scores and return to home.

All controls use the existing Go WebSocket protocol. The Go backend was not changed. Disconnects clear the unusable old seat and show an explanation; this server cannot restore identities after reconnecting. Phase timers are estimates starting when the phase message arrives, because the server does not supply an authoritative deadline. Without an AI provider, the server uses placeholder clues.

## Validation

`npm test` exercises real store/client code with protocol messages: idempotent connection, public clues, incremental results, new-round reset, error feedback and disconnect cleanup.

`npm run build` typechecks and builds production files into `dist/`. Run the Go server from the repository root (with `words.txt`) and visit http://localhost:8080. Development uses `npm run dev` on port 3000.
