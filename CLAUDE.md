# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Relax Block Puzzle (轻松俄罗斯方块) — a casual 10×10 block puzzle Android game. Originally a WeChat Mini Program, wrapped in a thin Android WebView shell for APK distribution.

## Architecture

Two-layer design:

- **Kotlin shell**: Single `MainActivity.kt` creates a `WebView`, serves local assets via `WebViewAssetLoader`, and forwards lifecycle events to JS (`ANDROID_APP_BACKGROUND`/`ANDROID_APP_FOREGROUND`). Two-step pause: `onPause` notifies JS, `onStop` halts timers — prevents background jank.
- **JavaScript game engine**: All game logic runs inside the WebView on an HTML5 Canvas. The JS was originally written for WeChat Mini Programs; `browser-wx-shim.js` translates `wx.*` APIs (touch, audio, storage, vibration, keyboard) into standard browser APIs.

Entry point: `game.js` → `main.js` (dirty-render loop via `requestAnimationFrame`, idles when nothing is animating).

### Key JS modules (`app/src/main/assets/js/`)

| File | Purpose |
|------|---------|
| `main.js` | Game loop — update/render cycle, event dispatch, lifecycle |
| `game/GameState.js` | Core state machine (~1250 lines): screen flow, drag logic, tools, scoring, revive system |
| `game/Board.js` | 10×10 grid — placement validation, line detection, clearing |
| `game/Piece.js` | Shape definitions (rescue/simple/medium/hard), weighted random rack generation per difficulty |
| `game/InputManager.js` | Touch and keyboard input routing |
| `game/Renderer.js` | Canvas 2D rendering of board, UI panels, drag previews |
| `game/ScoreManager.js` | Scoring: 10/cell placed, 100/line cleared, combo bonus 50·n² |
| `game/SoundManager.js` | Sound effects + 4 BGM tracks |
| `game/constants.js` | Colors, layout constants, animation timings |
| `../browser-wx-shim.js` | wx API → browser bridge (essential for understanding how JS runs) |

## Build Commands

The toolchain is self-contained under `/toolchain/` (bundled JDK 17, Android SDK 34, Gradle 8.7). Environment variables required before building:

```bash
export JAVA_HOME=toolchain/jdk/jdk-17.0.19+10
export ANDROID_HOME=toolchain/android-sdk
./gradlew assembleDebug     # Debug APK → app/build/outputs/apk/debug/
./gradlew assembleRelease   # Release APK
```

No test suite or linter exists in this project.

## Important Notes

- `assets/js/js/` is a duplicate copy of the engine, gitignored — ignore it entirely.
- Three difficulty levels (简单/普通/大师) each have different piece weight distributions and tool allowances, controlled in `Piece.js` and `GameState.js`. Tool counts: easy (3 refresh, 1 clear, 1 undo), normal (2 refresh, 1 clear, 1 undo), master (1 refresh, 0 clear, 1 undo).
- Version is set in `app/build.gradle.kts` (`versionName`). Release notes live in `/release-notes/`. GitHub Releases used for distribution.
- The app locks to portrait orientation and requests `VIBRATE` permission for haptic feedback.
- When editing game logic, changes go in the `assets/js/` files, not in the Kotlin layer. The Kotlin side is purely a thin host.
- `render.js` caps device pixel ratio to keep canvas under ~5M pixels — don't bypass this, it stabilizes WebView rendering.
- `index.html` has a boot error handler that catches JS errors and displays them on screen prefixed with "启动失败" — useful for debugging WebView crashes.

## Game Configuration (constants.js / Piece.js)

- `DEBUG_CODE_ENABLED = true` — admin panel entry enabled (hidden, via repeated title taps)
- `REVIVE_CLEAR_COUNT = 5`, `ADMIN_CLEAR_COUNT = 5`
- `MEMBERSHIP_CODES = ['RELAX2026']`
- Score storage migrates from a single `v1` key to per-difficulty keys
- Admin mode grants infinite revives, disables best score tracking
