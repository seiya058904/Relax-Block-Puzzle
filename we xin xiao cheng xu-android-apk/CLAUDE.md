# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Relax Block Puzzle (轻松俄罗斯方块) — a casual 10×10 block puzzle game. Originally a WeChat Mini Program, wrapped in a thin Android WebView shell for APK distribution. The same JS engine is also deployed as a **GitHub Pages web version** from `docs/`.

## Architecture

### Two deployment targets

| Target | Entry | Source of truth |
|--------|-------|----------------|
| **Android APK** | `app/src/main/assets/index.html` | `app/src/main/assets/` (all JS, HTML, audio) |
| **GitHub Pages (web)** | `docs/index.html` | `docs/` (same file structure, independently maintained) |

The two `index.html` files and their `browser-wx-shim.js` copies are **not auto-synced** — each can diverge. The web version (`docs/`) has web-specific fixes (inputLayer for context menu, favicon) that the Android version doesn't need, since Android WebView has no right-click.

### Layer stack

1. **Kotlin shell** (`app/src/main/java/com/blockpuzzle/android/MainActivity.kt`): Single activity creates a `WebView`, serves local assets via `WebViewAssetLoader`, forwards lifecycle events to JS (`ANDROID_APP_BACKGROUND`/`ANDROID_APP_FOREGROUND`). Two-step pause: `onPause` notifies JS, `onStop` halts timers — prevents background jank. Portrait-locked, `VIBRATE` permission.
2. **browser-wx-shim.js**: Translates WeChat `wx.*` APIs (touch, audio, storage, vibration, keyboard) into standard browser APIs, plus the global `canvas` object. Touch/mouse events are bound to `#inputLayer` (web) or `#gameCanvas` (Android).
3. **JavaScript game engine**: All game logic on an HTML5 Canvas, dirty-render loop via `requestAnimationFrame`.

### Entry chain

```
index.html  ──>  game.js (new Main())  ──>  js/main.js  ──>  GameState / Renderer / etc.
                         └── imports browser-wx-shim.js first for wx.* shims & canvas
```

### Key JS modules (`app/src/main/assets/js/` or `docs/js/`)

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
| `game/LayoutMetrics.js` | Shared layout math for responsive sizing |
| `game/FeedbackState.js` | Visual feedback state machine (line-clear laser effects, etc.) |
| `utils/storage.js` | LocalStorage-based persistence (scores, settings) |
| `RenderScheduler.js` | Dirty-render scheduler — idles when nothing animating |

### Web-only additions in `docs/`

- `#inputLayer` transparent overlay (z-index: 1) receives all touch/mouse events, preventing the browser from treating the canvas as an image and showing "copy image" in the right-click menu.
- `favicon.png` with `<link>` references.
- `.nojekyll` file (tells GitHub Pages not to process with Jekyll).

## Build Commands

### Android APK

The toolchain is self-contained under `toolchain/` (bundled JDK 17, Android SDK 34, Gradle 8.7).

```powershell
$env:JAVA_HOME=(Resolve-Path "toolchain\jdk\jdk-17.0.19+10").Path
$env:ANDROID_HOME=(Resolve-Path "toolchain\android-sdk").Path
.\gradlew.bat assembleDebug     # → app/build/outputs/apk/debug/
.\gradlew.bat assembleRelease   # → app/build/outputs/apk/release/
```

### GitHub Pages (web) — local preview

```powershell
python -m http.server 8000 -d docs
# Open http://localhost:8000/
# Do NOT open the HTML directly from the local filesystem — JS modules may not load.
```

## Important Notes

- **`assets/js/js/`** is a duplicate copy of the engine, gitignored — ignore it entirely.
- **Two `index.html` files exist** — `docs/index.html` (web) and `app/src/main/assets/index.html` (Android). When modifying game UI or HTML, check if both need updating.
- The two `browser-wx-shim.js` files (`docs/` and `app/src/main/assets/`) also exist independently. The `docs/` version binds events to `#inputLayer`; the `assets/` version binds to `#gameCanvas`.
- **Version** is set in `app/build.gradle.kts` (`versionName` / `versionCode`). Release notes live in `release-notes/`. APKs distributed via GitHub Releases.
- **No test suite or linter** exists in this project.
- **Game changes** go in `app/src/main/assets/js/` (and `docs/js/` for web parity), never in the Kotlin layer.
- `render.js` caps device pixel ratio to keep canvas under ~5M pixels — stabilizes WebView rendering.
- Both `index.html` files have a boot error handler that catches JS errors and displays them on screen prefixed with "启动失败".
- The `.gitignore` excludes `*.apk`, `*.aab`, `release-assets/`, `toolchain/`, and signing keys.

## Game Configuration

| Constant | File | Default | Notes |
|----------|------|---------|-------|
| `DEBUG_CODE_ENABLED` | `constants.js` | `true` | Admin panel via repeated title taps |
| `REVIVE_CLEAR_COUNT` | `constants.js` | `5` | Lines to clear for free revive |
| `ADMIN_CLEAR_COUNT` | `constants.js` | `5` | Lines to clear in admin mode |
| `MEMBERSHIP_CODES` | `constants.js` | `['RELAX2026']` | Welfare codes for revive benefits |

### Tool counts per difficulty

| Difficulty | Refresh | Clear | Undo |
|------------|---------|-------|------|
| 简单 (Easy) | 3 | 1 | 1 |
| 普通 (Normal) | 2 | 1 | 1 |
| 大师 (Master) | 1 | 0 | 1 |

Admin mode grants infinite revives and disables best score tracking.

## Git Conventions

- Imperative commit messages: `add web favicon`, `fix web context menu target`, `release: prepare Android v1.0.5`.
- `docs/` (GitHub Pages) and `release-notes/` are the primary push targets after code changes.
- Do not commit `.apk`, `.aab`, `release-assets/`, `.gradle/`, `build/`, signing keys, or local environment files.
