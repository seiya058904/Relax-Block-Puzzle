# 微信优先三端同步与拖拽体验 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不重建仓库边界的前提下，以微信现有行为为基线，建立可重复的共享模块同步/验证体系，并提取跨平台拖拽计算模型。

**Architecture:** `shared/` 保存平台无关的确定性模块与拖拽模型；微信、网页、Android 保留各自入口、Renderer、生命周期、Canvas/DPR、shim 和资源目录。同步脚本只生成明确列入清单的 JS 文件，不触碰 HTML、音频或平台适配器；生成副本带有禁止直接修改标记。网页和 Android 的共享副本来自同一份生成结果，微信使用同一核心源码的微信适配输出。

**Tech Stack:** Node.js built-in test runner, ES modules, PowerShell, existing Gradle wrapper, no new dependency.

## Global Constraints

- 以 `we xin xiao cheng xu/js` 的现有行为作为产品基线。
- 不在根目录执行 `git init`，不创建分支、提交、推送、PR、Release 或版本号变更。
- 不删除 APK、工具链、缓存、`local.properties` 或用户未跟踪文件。
- 不同步或覆盖平台音频；微信音频预算保持约 3.9 MB，Android/Web 保持完整资源。
- 不让同步脚本覆盖平台入口、HTML、shim、Renderer、Canvas/DPR、生命周期和音频。
- 每个新增非平凡模块先写失败测试，再写最小实现。

### Task 1: 建立清单、基线和网页测试适配

**Files:**
- Create: `scripts/sync-platforms.mjs`
- Create: `scripts/verify-platforms.mjs`
- Create: `scripts/verify-assets.mjs`
- Create: `config/platform-manifest.json`
- Modify: `package.json`
- Modify: `tests/helpers/version-adapter.mjs`
- Modify: `tests/fixtures/core-vectors.mjs`
- Create: `tests/parity/platform-manifest.test.mjs`
- Create: `tests/parity/web-module-loading.test.mjs`
- Create: `docs/PLATFORM_SYNC.md`

**Interfaces:**
- `config/platform-manifest.json` declares `shared`, `platformSpecific`, `generated`, and resource budget entries.
- `sync-platforms.mjs --check` exits non-zero on drift; without `--check` copies only manifest-listed generated files and prepends a JS comment marker.
- `verify-platforms.mjs` checks all generated files, allowed differences, and stable repeated sync output.
- `version-adapter.mjs` exposes `wechat`, `web`, and `android` roots; existing tests keep their current two-version assertions until web parity fixtures are added.

- [ ] Add a manifest with the currently identical deterministic files (`Board.js`, `Piece.js`, `ScoreManager.js`, `utils/storage.js`) and `FeedbackState.js` only after its shared boundary is confirmed.
- [ ] Add platform-specific entries for `GameState.js`, `InputManager.js`, `Renderer.js`, `LayoutMetrics.js`, `constants.js`, `main.js`, `render.js`, HTML, shims, audio, and Android Kotlin.
- [ ] Write manifest tests that reject audio in the shared copy list and require all generated targets to exist.
- [ ] Run `npm test` and the new manifest tests; expected baseline remains 109 passing plus the new tests.
- [ ] Run sync twice and assert the second `--check` is clean.

### Task 2: Create the shared deterministic module boundary

**Files:**
- Create: `shared/js/game/Board.js`
- Create: `shared/js/game/Piece.js`
- Create: `shared/js/game/ScoreManager.js`
- Create: `shared/js/utils/storage.js`
- Create: `tests/shared/shared-module-contract.test.mjs`
- Modify: `scripts/sync-platforms.mjs`
- Modify: `config/platform-manifest.json`

**Interfaces:**
- Shared modules keep the existing public exports and behavior; no platform global may be referenced from `Board.js`, `Piece.js`, or `ScoreManager.js`.
- `storage.js` receives the existing platform storage surface through `wx` or browser adapters only at its boundary; normalization and migration stay shared.

- [ ] Write contract tests that import shared modules and compare their snapshots against the current WeChat baseline vectors.
- [ ] Run the contract tests before implementation and confirm failure because `shared/js` does not exist.
- [ ] Copy the current WeChat implementations into `shared/js` using `apply_patch`, preserving UTF-8 and ES modules.
- [ ] Make the sync script generate the three platform copies from the shared files with a stable marker.
- [ ] Run the focused contract tests, existing parity tests, and `git diff --check`.

### Task 3: Extract and test the pure drag model

**Files:**
- Create: `shared/js/game/DragModel.js`
- Create: `tests/shared/drag-model.test.mjs`
- Modify: `config/platform-manifest.json`
- Modify: `scripts/sync-platforms.mjs`

**Interfaces:**
- `createDragModel(options)` returns `{ begin, move, release, cancel, snapshot }`.
- `move({ x, y })` updates only the latest coordinate; `snapshot()` exposes `visualX`, `visualY`, `row`, `col`, `canPlace`, `lastValid`, and `phase`.
- Candidate changes use a hysteresis threshold of `0.16` cell by default; callers may override it for measurement.
- `release({ x, y, canPlace })` accepts only the current valid candidate or a nearest valid candidate within `0.2` cell; otherwise it returns `{ accepted: false }`.

- [ ] Write failing tests for immediate coordinate following, hysteresis, edge/corner candidates, near-valid release tolerance, invalid release rejection, and cancel cleanup.
- [ ] Run the focused test file and confirm expected failures before adding implementation.
- [ ] Implement the smallest pure model using injected `cellSize`, `boardRect`, `pieceCells`, and `canPlace(row, col)`.
- [ ] Add the model to the shared manifest and run the focused test plus existing suite.

### Task 4: Integrate frame-coalesced input and layout caching

**Files:**
- Modify: `we xin xiao cheng xu/js/game/InputManager.js`
- Modify: `we xin xiao cheng xu/js/game/GameState.js`
- Modify: `we xin xiao cheng xu/js/main.js`
- Modify: `we xin xiao cheng xu-android-apk/app/src/main/assets/js/game/InputManager.js`
- Modify: `we xin xiao cheng xu-android-apk/app/src/main/assets/js/game/GameState.js`
- Modify: `we xin xiao cheng xu-android-apk/app/src/main/assets/js/main.js`
- Modify: `we xin xiao cheng xu-android-apk/docs/js/game/InputManager.js`
- Modify: `we xin xiao cheng xu-android-apk/docs/js/game/GameState.js`
- Modify: `we xin xiao cheng xu-android-apk/docs/js/main.js`
- Create: `tests/parity/drag-scheduler.test.mjs`

**Interfaces:**
- Input handlers store the latest normalized point and request one frame; they do not call full render directly on every move.
- `GameState.setLayout()` remains the only layout cache update; drag updates reuse `boardRect`, `cellSize`, and rack hit areas.
- Lifecycle cancellation clears the drag model and pending point for WeChat `onHide`, browser visibility changes, and Android background callbacks.

- [ ] Add failing scheduler tests for many move events producing one update per frame, layout reuse during drag, and cancellation clearing pending state.
- [ ] Run the focused tests to verify they fail against the current per-event path.
- [ ] Integrate the shared drag model behind the existing public GameState methods without changing scoring or placement semantics.
- [ ] Keep platform input normalization separate and sync only the shared integration portions.
- [ ] Run all tests after each platform integration; fix parity regressions before continuing.

### Task 5: Add resource budgets, generation statistics, and build checks

**Files:**
- Modify: `scripts/verify-assets.mjs`
- Create: `scripts/simulate-piece-generation.mjs`
- Create: `tests/parity/resource-budget.test.mjs`
- Create: `tests/parity/piece-generation-simulation.test.mjs`
- Modify: `package.json`
- Modify: `docs/PLATFORM_SYNC.md`

**Interfaces:**
- `verify-assets.mjs` reports file count, total bytes, largest file, duplicate hashes, and target budgets without reading or copying audio between platforms.
- `simulate-piece-generation.mjs --samples 10000` prints per-difficulty category ratios, failed rack rate, snake streaks, rescue frequency on crowded boards, and a deterministic JSON summary.

- [ ] Write budget tests that enforce the current WeChat audio ceiling and require Android/Web audio totals not to fall below their recorded baseline.
- [ ] Run them before implementation and confirm failure for missing scripts.
- [ ] Implement Node-only scanners with stable sorted output and no dependencies.
- [ ] Run the simulation with 10,000 samples per difficulty and retain the actual output in the final report, not as a committed generated artifact.
- [ ] Add `npm run sync`, `npm run verify`, `npm run verify:assets`, and `npm run simulate:generation`.

### Task 6: Verify animation quality configuration and final platform parity

**Files:**
- Create: `shared/js/config/quality.js`
- Modify: `we xin xiao cheng xu/js/game/FeedbackState.js`
- Modify: `we xin xiao cheng xu-android-apk/app/src/main/assets/js/game/FeedbackState.js`
- Modify: `we xin xiao cheng xu-android-apk/docs/js/game/FeedbackState.js`
- Create: `tests/shared/quality-config.test.mjs`
- Modify: `docs/PLATFORM_SYNC.md`

**Interfaces:**
- Quality config preserves shared timing semantics and varies only particle count, shadow cost, DPR cap, and optional high-cost effects.
- WeChat uses the light quality profile; Android/Web use the full profile; no profile changes scoring or event order.

- [ ] Write failing tests for shared timing equality and platform-only quality differences.
- [ ] Implement the minimal config and connect existing feedback state parameters to it.
- [ ] Run the full Node suite, JavaScript syntax checks, platform verification, asset verification, and Android debug build when the local toolchain permits.
- [ ] Report WeChat Developer Tools and real-device checks separately because they cannot be run headlessly here.
