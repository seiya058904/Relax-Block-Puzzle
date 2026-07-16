# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Identity

- **Name:** 轻松俄罗斯方块 (Relaxing Block Puzzle)
- **Type:** WeChat Mini Game (not a regular mini-program)
- **Language:** Pure JavaScript (ES modules, no TypeScript)
- **Platform:** WeChat Mini Game SDK (`wx.*` APIs, Canvas 2D)
- **Build system:** None -- ES modules served directly by WeChat Developer Tools

## How to Run

1. Open WeChat Developer Tools
2. Create/open a Mini Game project pointing to this directory
3. AppID: `wx347500290c0f48fd` (or use test AppID)
4. Click compile -- no build step, no npm install needed

## Architecture

### Entry Point
- `game.js` -- Initializes cloud SDK, creates `Main` instance

### Core Game (`js/game/`)
- `GameState.js` (~32KB) -- Core game logic: screens, UI state, scoring, difficulty, piece management, revive, admin mode
- `Renderer.js` (~47KB) -- All Canvas 2D rendering: board, pieces, UI panels, animations
- `InputManager.js` -- Touch and keyboard input handling, UI navigation
- `Board.js` -- 10x10 board grid data structure
- `Piece.js` -- Piece shape definitions, difficulty-weighted random generation
- `ScoreManager.js` -- Score calculation
- `SoundManager.js` -- Sound effects and BGM via `wx.createInnerAudioContext`
- `constants.js` -- Board size, colors, animation timings, admin/membership codes

### Infrastructure (`js/`)
- `render.js` -- Canvas setup, screen dimensions, pixel ratio
- `main.js` -- Main class: game loop (`requestAnimationFrame`), auth init, settings, event dispatch
- `api/AuthClient.js` -- WeChat silent login, cloud container calls, admin verification
- `config/backend.js` -- Cloud environment and service configuration
- `utils/storage.js` -- Local storage for settings and best scores

### Deprecated Template Files
- The original shooting-game template files under `js/base/`, `js/runtime/`, `js/player/`, `js/npc/`, `js/databus.js`, and `js/libs/` were removed after reference checks on 2026-07-16.

### Assets
- `audio/` -- Sound effects and 4 BGM tracks (MP3)

## Key Conventions

- All rendering is Canvas 2D -- no game engine, no DOM
- Game loop uses `requestAnimationFrame` with deltaTime (max 32ms)
- Three screens: Home, Game, Help -- managed by `GameState.ui.currentScreen`
- Three difficulties: easy, normal, master -- different piece pools and tool counts
- Settings and scores stored via `wx.getStorageSync`/`wx.setStorageSync`
- Cloud backend is optional -- game works fully offline
- Touch input via `wx.onTouchStart/Move/End`

## Testing

No automated test framework. Manual testing via WeChat Developer Tools simulator. See README.md "How to Test" section for test cases.

## Linting

ESLint configured in `.eslintrc.js` -- ES2018, WeChat globals (`wx`, `App`, `Page`, `canvas`). No custom rules defined. Run via WeChat Developer Tools ESLint extension.

## Important Notes

- No `package.json` -- this is NOT a Node.js project
- No `app.json` -- this is a Mini GAME, not a mini-program (uses `game.json`)
- Audio assets in `audio/` need commercial license verification before publishing
- Admin mode and membership are local prototypes -- not production-ready
- Backend config in `js/config/backend.js` uses placeholder/real cloud values
