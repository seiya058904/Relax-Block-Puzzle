# CLAUDE.md

## Project Identity

Relax Block Puzzle is a WeChat Mini Game, not a regular mini-program. It uses plain JavaScript ES modules, WeChat `wx.*` APIs, Canvas 2D, local storage, audio, vibration, and lifecycle callbacks.

## Entry and Modules

- `game.js` starts the game and creates `Main` from `js/main.js`.
- `js/main.js` connects state, rendering, input, settings, sound, lifecycle, and optional authentication.
- `js/game/GameState.js` owns gameplay state and rules; `Board.js`, `Piece.js`, and `ScoreManager.js` provide model logic.
- `Renderer.js` draws Canvas UI and effects; `InputManager.js` handles touch/keyboard routing; `LayoutMetrics.js` handles responsive layout.
- `SoundManager.js` and `storage.js` own audio and persistence adapters.

Keep shared gameplay behavior aligned with the root `shared/js/` source. Keep `wx` calls, Canvas initialization, DPR limits, lifecycle handling, and light audio in the WeChat adapter. Do not copy Android/Web assets into this directory.

## Run and Verify

Open this directory in WeChat Developer Tools as a Mini Game project, compile it, then use Preview or real-device debugging for touch, audio, vibration, safe-area, authentication, and background/foreground behavior. No npm install or local build command is defined here.

Never put private project settings, AppID values, tokens, passwords, backend credentials, admin/member codes, or user/session data in source, documentation, logs, screenshots, or replies. Read relevant files first, preserve uncommitted changes, avoid broad refactors, and obtain explicit authorization before upload, release, backend changes, commit, or push.
