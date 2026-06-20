# Repository Guidelines

## Project Structure & Module Organization

This repository builds the Android APK for Relax Block Puzzle. It wraps the shared JavaScript game in a thin Kotlin WebView shell.

- `app/src/main/java/`: Android Kotlin host code. `MainActivity.kt` owns WebView setup and app lifecycle forwarding.
- `app/src/main/assets/`: bundled HTML, JavaScript, audio, and browser shim assets used inside the APK.
- `app/src/main/assets/js/game/`: active game logic, rendering, scoring, input, layout, and feedback modules.
- `app/build.gradle.kts`: Android package name, SDK settings, and `versionCode`/`versionName`.
- `release-notes/`: user-facing release notes.
- `release-assets/`: local APK and SHA-256 files only. Do not commit these files.
- `toolchain/`: bundled JDK, Android SDK, and Gradle support files.

## Build, Test, and Development Commands

Use PowerShell on Windows.

```powershell
$env:JAVA_HOME=(Resolve-Path "toolchain\jdk\jdk-17.0.19+10").Path
$env:ANDROID_HOME=(Resolve-Path "toolchain\android-sdk").Path
.\gradlew.bat assembleDebug
```

This builds `app/build/outputs/apk/debug/app-debug.apk`. From the parent workspace, run `npm test` to execute WeChat/Android parity tests.

## Coding Style & Naming Conventions

Use existing style: two-space indentation in JavaScript, Kotlin conventions in Android files, semicolons in JS modules, `PascalCase` for classes/files, `camelCase` for functions and variables, and `UPPER_SNAKE_CASE` for constants. Keep game rules in `GameState.js`, scoring in `ScoreManager.js`, input in `InputManager.js`, rendering in `Renderer.js`, and shared layout math in `LayoutMetrics.js`.

## Testing Guidelines

There is no standalone Android unit-test suite here. Before release work, run the parent workspace `npm test`, run JS/MJS syntax checks if game assets changed, and run `.\gradlew.bat assembleDebug`. Manually install or inspect the APK when checking WebView, touch, audio, vibration, layout, or lifecycle behavior.

## Commit & Pull Request Guidelines

Follow short, imperative commit messages such as `release: prepare Android v1.0.4` or `Update README with new image and game details`. PRs should list changed platform areas, test commands run, manual device checks, and screenshots for visible UI changes.

## Security & Release Rules

Do not commit `.apk`, `.aab`, `release-assets/`, `build/`, `.gradle/`, `local.properties`, signing keys, passwords, admin/member codes, or local machine paths. Do not create Git tags, GitHub Releases, upload APKs, force-push, or change version numbers unless explicitly requested.
