# Repository Guidelines

## Project Overview

Relax Block Puzzle is a three-platform block-puzzle project: a WeChat Mini Game, an Android WebView APK, and a browser build. Gameplay is plain JavaScript ES modules; the Android shell is Kotlin/Gradle. The WeChat project is opened in WeChat Developer Tools. The browser build is served from `we xin xiao cheng xu-android-apk/docs/` and deployed to GitHub Pages by `.github/workflows/deploy-pages.yml`; Android bundles its web assets under `app/src/main/assets/`.

## Project Structure & Module Organization

- `shared/js/`: source of truth for platform-independent modules. Do not edit generated copies directly.
- `we xin xiao cheng xu/`: WeChat entry (`game.js`) and platform-specific renderer, input, lifecycle, audio, storage, and authentication code.
- `we xin xiao cheng xu-android-apk/`: Android project, browser build, release notes, and platform-specific assets. `app/build.gradle.kts` owns Android version metadata.
- `tests/`: Node built-in test-runner tests for board rules, state, feedback, dragging, layout, resources, and three-platform parity.
- `config/`: platform manifest and audio/resource mapping.
- `scripts/`: synchronization, parity, resource-budget, piece-simulation, and APK-boundary checks.
- `docs/`: frozen product rules, architecture decisions, audit notes, and test baseline.

## Architecture Notes

`shared/js` is copied with a generated marker into the three targets listed in `config/platform-manifest.json`; `npm run sync` is the only normal synchronization path. Platform renderers and input/lifecycle adapters remain independent. WeChat uses light audio/effect settings; Android and Web retain full audio resources. Do not merge platform audio or move `wx`/WebView-specific code into shared modules. Storage keys, scoring, difficulty, drag semantics, and feedback timing are compatibility contracts.

## Build, Test & Development Commands

Run from the repository root:

```powershell
npm test
npm run test:parity
npm run verify
npm run verify:assets
npm run verify:apk-assets
npm run simulate:generation -- --samples 10000
```

`npm run verify` checks generated parity across all three targets. `verify:assets` checks audio mappings and budgets. `verify:apk-assets` requires a freshly built debug APK. For Android, set local `JAVA_HOME` and `ANDROID_HOME`, then run from `we xin xiao cheng xu-android-apk`:

```powershell
.\gradlew.bat assembleDebug --no-daemon
```

Open `we xin xiao cheng xu/` in WeChat Developer Tools for compile, simulator, preview, and device checks. No root lint, type-check, or formatting script is defined.

## Android CLI / APK Workflow

普通 APK 开发、构建、安装和 UI 测试不需要 Android Studio；从 `we xin xiao cheng xu-android-apk/` 使用上面的仓库 Gradle Wrapper 命令。

- Java 必须为 JDK 17；不要使用 Android Studio 内置 JBR，也不要安装系统级 Gradle。
- 不要无理由升级 AGP、Gradle、compileSdk 或 Build Tools。
- 启动标准测试 AVD，并禁止 snapshot、snapshot 保存和 cache：

  ```powershell
  emulator -avd Codex_Maestro_Android34 -no-snapshot -no-snapshot-save -no-snapstorage -no-cache
  adb devices
  adb -s <device-id> shell getprop sys.boot_completed
  ```

  仅在 `sys.boot_completed` 为 `1` 后继续；除非 AVD 损坏或任务明确要求，不创建其他 AVD。
- 构建成功后用 `adb -s <device-id> install -r <apk-path>` 安装并启动 App；从 Gradle/Manifest 读取 package/application id，不在此处猜测或写死。
- UI 测试优先使用 Maestro MCP：`list_devices`、`inspect_screen`、`run`、`take_screenshot`，以及 `click`、`input`、`swipe`、`drag` 和 assertions。Codex Desktop 的 MCP 配置变更后需重启 Desktop。
- 本项目是 WebView + Canvas 游戏；Canvas 内部元素可能没有完整 accessibility tree。必要时使用坐标级 tap/swipe/drag，并用 screenshot、可见状态和 surrounding UI 验证；不要因缺少语义节点判定 Maestro 失效。
- 启动失败、WebView/JS 异常或 crash 时，用 ADB/Logcat 过滤当前 App 或错误相关日志；测试完成后执行 `adb -s <device-id> emu kill`，不要保存 Quick Boot snapshot。

Required: JDK 17、项目 Gradle Wrapper 8.7、Android SDK Platform 34、Build Tools 34.0.0、platform-tools/adb、cmdline-tools、Android Emulator、Android 34 Google APIs x86_64 image、`Codex_Maestro_Android34`、Maestro CLI/MCP。

Not required for normal work: Android Studio（除非任务明确需要 Layout Inspector、Android Profiler 或其他 IDE-only tooling）、Android 37、SDK Sources、NDK、CMake、system-wide Gradle、additional AVDs。

## Coding Style & Naming

Follow adjacent code: two-space JavaScript indentation, semicolons, single-quoted strings, ES modules, `PascalCase` class files, `camelCase` functions/variables, and `UPPER_SNAKE_CASE` constants. Keep rules in `GameState`/model modules, input in `InputManager`, drawing/layout in `Renderer`/`LayoutMetrics`, and persistence in `storage.js`.

## Testing & Verification

Tests use Node's built-in runner and end in `.test.mjs`. Run `npm test` after gameplay, shared-module, rendering-state, or resource changes. Changes affecting touch, audio, vibration, safe areas, lifecycle, WebView, or Canvas also require relevant WeChat Developer Tools and real-device checks. Report skipped manual checks honestly. Review `git status --short`, `git diff`, and generated drift before handoff.

## Commit & Pull Request Guidelines

Use one-purpose, short imperative commits such as `release: prepare Android v1.0.6`. Describe behavior changes, affected platforms, tests, build results, and manual checks. Do not commit APKs, AABs, `build/`, `.gradle/`, `local.properties`, toolchains, caches, release assets, or unrelated files.

## Security & Agent Rules

Never commit or expose environment files, credentials, tokens, passwords, private keys, keystores, connection strings, admin/member codes, or private project configuration. Keep backend secrets server-side; frontend backend configuration must contain public values only. Read relevant files first, state a short plan, preserve existing uncommitted work, and make the smallest reviewable change. Do not invent commands or interfaces, install dependencies, auto-format, or change gameplay rules, values, compatibility behavior, or platform boundaries without authorization. Stop and explain material uncertainty.

Commit, push, deploy, publish, release/tag creation, database writes, backend/auth changes, signing changes, and production configuration changes require explicit user authorization. Before any authorized commit, check status, diff, secrets, generated files, and required tests; state every check not run.

## Pre-Commit Checklist

- `git status --short` and `git diff --stat` show only task files.
- `git diff --check` passes and no secrets or local paths are staged.
- `npm test`, relevant `npm run verify*` checks, and Android build/manual checks are complete or explicitly reported as skipped.
- Generated files are synchronized and build outputs remain ignored.
- Commit/push/release authorization is explicit.
