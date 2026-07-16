# Repository Guidelines

## Project Structure & Module Organization

This workspace keeps the WeChat Mini Game and Android APK version side by side.

- `we xin xiao cheng xu/`: WeChat Mini Game project. Main entry files include `game.js`, `game.json`, `project.config.json`, and JavaScript modules under `js/`.
- `we xin xiao cheng xu-android-apk/`: Android WebView wrapper and APK build project. Android code lives in `app/src/main/java/`; bundled game assets live in `app/src/main/assets/`.
- `tests/`: Node test suite for shared behavior and WeChat/Android parity checks.
- `docs/`: specifications, audit notes, and manual checklists such as `UNIFIED_SPEC.md` and `TEST_BASELINE.md`.

## Build, Test, and Development Commands

Run commands from the workspace root unless noted.

- `npm test`: runs all Node parity and behavior tests in `tests/**/*.test.mjs`.
- `npm run test:parity`: runs only parity tests in `tests/parity/`.
- `cd "we xin xiao cheng xu-android-apk"; .\gradlew.bat assembleDebug`: builds the Android debug APK.
- Open `we xin xiao cheng xu/` in WeChat Developer Tools to preview and manually test the Mini Game.

## Coding Style & Naming Conventions

Use plain JavaScript ES modules for game logic. Keep gameplay state in `GameState.js`, scoring in `ScoreManager.js`, input routing in `InputManager.js`, rendering in `Renderer.js`, and shared layout calculations in `LayoutMetrics.js`. Use descriptive camelCase names for variables and functions. Keep constants in `constants.js` or clearly named module-level constants.

## Testing Guidelines

Tests use Node's built-in test runner. Name new tests with the `.test.mjs` suffix and place shared helpers in `tests/helpers/` or fixtures in `tests/fixtures/`. When changing gameplay rules, score behavior, undo, rendering state, or layout logic, update or add tests for both WeChat and Android paths, then run `npm test`.

## Commit & Pull Request Guidelines

Recent commits use short imperative messages, for example `release: prepare Android v1.0.4` or `Update README with new image and game details`. Keep commits focused. Pull requests should describe user-visible changes, list test commands run, mention affected platform paths, and include screenshots or APK/manual-test notes for visual UI changes.

## Security & Configuration Tips

Do not commit APK files, build outputs, local SDK files, secrets, real admin codes, AppSecret values, or private user data. Keep release APKs in the Android project's ignored `release-assets/` directory. Do not bulk-delete files; remove only explicit single file paths after confirming they are safe.
