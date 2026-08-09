# Repository Guidelines

## Project Overview

Relax Block Puzzle is a three-platform block-puzzle project: a WeChat Mini Game, an Android WebView APK, and a browser build. Gameplay is plain JavaScript ES modules; the Android shell is Kotlin/Gradle. The WeChat project is opened in WeChat Developer Tools. The browser build is served from `we xin xiao cheng xu-android-apk/docs/`, and Android bundles its web assets under `app/src/main/assets/`.

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
.\gradlew.bat assembleDebug
```

Open `we xin xiao cheng xu/` in WeChat Developer Tools for compile, simulator, preview, and device checks. No root lint, type-check, or formatting script is defined.

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

## Personal Knowledge Context

The user's shared long-term AI context lives at `D:\xia zai\AI project\Knowledge`.

For substantial work, read `Knowledge\AGENTS.md`, locate this project in `Knowledge\01-Projects\Repository-Index.md`, then read this project's Project Page and `AI-HANDOFF.md`. Read `CONTEXT-HISTORY.md` only when historical decisions, rejected directions, architecture rationale, prior user instructions, or redesign context matters. This repository's current files and Git state are the source of truth when they conflict with Knowledge. Follow Minimum Necessary Context; do not load the entire Vault by default.

When the user explicitly says the project/task is ready to “收工” or gives an equivalent finalization instruction, read and follow `D:\xia zai\AI project\Knowledge\02-AI\Prompts\项目收工提示词.md`. This trigger does not expand current task permissions; do not merge, deploy, force-push, resolve remote conflicts, or modify unrelated files unless separately authorized.

- `git status --short` and `git diff --stat` show only task files.
- `git diff --check` passes and no secrets or local paths are staged.
- `npm test`, relevant `npm run verify*` checks, and Android build/manual checks are complete or explicitly reported as skipped.
- Generated files are synchronized and build outputs remain ignored.
- Commit/push/release authorization is explicit.
