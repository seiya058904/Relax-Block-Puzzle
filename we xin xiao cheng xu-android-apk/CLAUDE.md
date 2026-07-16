# CLAUDE.md

## Project Overview

Relax Block Puzzle is a 10×10 Canvas block puzzle. This directory supplies the Android WebView APK and the GitHub Pages browser build. Android and Web use platform shims while shared gameplay modules are generated from the unified workspace.

## Runtime Boundaries

- Android entry: `app/src/main/assets/index.html` → `game.js` → `js/main.js`.
- Web entry: `docs/index.html` → `game.js` → `js/main.js`.
- `browser-wx-shim.js` adapts storage, touch/mouse, audio, vibration, keyboard, and canvas behavior.
- Kotlin `MainActivity.kt` owns WebView setup and Android lifecycle forwarding.
- `js/game/` contains game state, board, pieces, scoring, input, renderer, layout, sound, and feedback modules.

The Android and Web HTML/shim files may differ for platform input behavior. Shared model files must remain synchronized; audio stays platform-specific, with full-quality resources for Android/Web. Keep `assets/js/js/` absent from source and APK.

## Build

Set local `JAVA_HOME` and `ANDROID_HOME`, then run `.\gradlew.bat assembleDebug` from this directory. The output is `app/build/outputs/apk/debug/app-debug.apk`. Use the root Node commands for parity and resource checks. Do not treat a successful build as a substitute for device checks of WebView touch, audio, vibration, layout, or lifecycle behavior.

## Safety

Do not expose or commit environment files, tokens, passwords, private keys, keystores, connection strings, admin/member codes, local paths, build output, or release assets. Read relevant files first, preserve existing work, avoid broad rewrites, and report skipped checks. Obtain explicit authorization before changing version metadata, signing, backend/auth, release files, commit, push, upload, publish, deploy, or database behavior.
