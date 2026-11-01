# Repository Guidelines

## Project Overview

This directory contains the Android WebView wrapper and browser build for Relax Block Puzzle. Android uses Kotlin/Gradle and bundles local HTML, JavaScript, and full-quality audio. The browser build is under `docs/`. The formal source of truth is the unified three-platform workspace; shared JavaScript is generated into these platform targets.

## Structure

- Android entry: `app/src/main/assets/index.html` → `game.js` → `js/main.js`; Web entry: `docs/index.html` → `game.js` → `js/main.js`. `browser-wx-shim.js` adapts browser storage, input, audio, vibration and Canvas behavior.
- `app/src/main/java/`: Kotlin host; `MainActivity.kt` owns WebView and lifecycle forwarding.
- `app/src/main/assets/`: Android HTML, JavaScript, browser shim, and full audio.
- `docs/`: GitHub Pages web entry and web-specific HTML/shim assets.
- `app/build.gradle.kts`: Android package and the authoritative `versionCode`/`versionName`.
- `release-notes/`: user-facing notes. APKs and toolchains remain local and ignored.

## Build & Verify

From the formal workspace root run `npm test`, `npm run verify`, `npm run verify:assets`, and `npm run verify:apk-assets` as applicable. With local JDK/Android SDK variables configured, run from this directory:

```powershell
.\gradlew.bat assembleDebug
```

The APK is written under `app/build/outputs/apk/debug/`. Manually check WebView, drag input, audio, vibration, layout, and lifecycle behavior when those areas change. There is no standalone Android unit-test suite or root lint/type-check command.

For Android device work, follow the root `docs/ANDROID_WORKFLOW.md`: use the connected physical test phone with Mobile MCP when available, and retain this project's build, signing and data-protection requirements.

## Agent and Security Rules

Keep shared gameplay, scoring, drag semantics, and feedback timing aligned with the WeChat and Web targets. Do not hand-edit generated shared files, downgrade Android/Web audio, or change platform adapters to force file identity. Android/Web HTML and shims may intentionally differ; keep `assets/js/js/` absent from source and APK. Version metadata changes require explicit authorization. Do not commit APK/AAB files, `build/`, `.gradle/`, `local.properties`, toolchains, signing material, secrets, credentials, admin/member codes, or local paths. Read and preserve existing changes; make focused diffs. Commit, push, release/tag creation, upload, publish, deploy, signing, backend/auth, and database changes require explicit authorization.
