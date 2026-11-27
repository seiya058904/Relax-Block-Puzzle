# CLOUD HANDOFF — Relax Block Puzzle

> Audited source handoff · 2026-10-10 · based on `4d1c308`.

## 1. Identity and first step

This is the complete audited source for the existing 10 × 10 puzzle, with its
three difficulties, scoring, tools and platform-specific presentation preserved.

- Repository: https://github.com/seiya058904/Relax-Block-Puzzle
- Reference commit: `4d1c30889c95b4458bb16c2704efba885553316a`
- The supplied 2026-10-09 source ZIP is the comparison baseline. This archive adds
  the audit fixes and regression tests; it is **not a new Git commit**.
- No commit, push, PR/issue, deployment, APK publication or signing change was made.
- The archive has no `.git`, installed dependencies, SDK, build output or APK/AAB.
- The Android duplicate audio mirror is omitted to keep the ZIP below 50,000,000
  bytes. All retained audio is unchanged. **Restore it before tests or a build:**

```bash
node scripts/restore-android-audio.mjs
```

This cross-platform Node command is safe to run more than once. It restores all
11 mapped full-quality files (26,936,009 bytes) and verifies every SHA-256 against
the retained Web file. It refuses unrelated target entries instead of deleting them.

## 2. Authoritative source boundary

| Directory | Role |
| --- | --- |
| `shared/js/` | Authoritative source for platform-independent modules |
| `we xin xiao cheng xu/` | WeChat Mini Game, light audio and native adapters |
| `we xin xiao cheng xu-android-apk/docs/` | Browser build and retained full audio |
| `we xin xiao cheng xu-android-apk/app/src/main/assets/` | Android WebView-specific HTML, shim and JS |
| `tests/`, `scripts/`, `config/` | Existing tests, synchronization and resource contracts |
| `docs/AUDIT_2026-10-10.md` | Integrated audit, severity, reproduction, fixes and limitations |
| `audit/` | Independent review reports, raw results, selected screenshots and source diff |
| `MANIFEST-SHA256.txt` | SHA-256 and byte counts of this archive's files, excluding itself |

The manifest `config/platform-manifest.json` defines **11 shared modules and three
targets**. Edit the shared source once and use `npm run sync`. Never hand-edit the
33 generated copies. Audio, Renderer, GameState, InputManager, LayoutMetrics,
main/render, HTML, shims and the Kotlin shell remain platform-specific.

## 3. Reproduce the software gates

Run these from the extracted project root after audio restoration:

```bash
npm test
npm run test:parity
npm run verify
npm run verify:assets
npm run simulate:generation -- --samples 10000
```

No installation is required for these Node-only commands. The original restored
baseline passed 242/242 main tests and 222/222 parity tests. The earlier three
missing-audio failures and two `spawnSync EBUSY` environment failures were all
retested; none was counted as a product defect. Current results and exact evidence
are in `docs/AUDIT_2026-10-10.md` and `audit/final/`.

For a shared edit, run `npm run sync` before the gates. A second sync must be a no-op.
The generation simulation intentionally has a bounded failure protocol; its exit
status and each metric, including failed attempts, are recorded in the audit.

## 4. Browser regression

With an existing Playwright/Chromium installation:

```bash
node tests/browser/high-score.mjs
node tests/browser/quality.mjs
```

Use the repository's `QA_PLAYWRIGHT_PACKAGE` and `QA_SCREENSHOTS` overrides when
needed. Set `QA_DOCS_ROOT` to `we xin xiao cheng xu-android-apk/app/src/main/assets`
to test the packaged Android web resources. The audit ran both roots and the
WeChat Chromium host. These checks do not establish native Android or WeChat
acceptance. See `audit/README.md` for optional independent probes.

## 5. Android audio and build

The browser audio directory is the complete retained source for the **Android
mirror only**. The WeChat encodings are different and must never be overwritten.

```bash
node scripts/restore-android-audio.mjs
npm run verify:assets
```

Do not copy the containing `audio` directory into an already existing target:
that older command could create `audio/audio`. If a prior attempt left unexpected
entries, inspect them before rerunning; the restoration script reports them.

Use JDK 17 and the existing Gradle wrapper 8.7, SDK Platform 34 and Build Tools
34.0.0. From `we xin xiao cheng xu-android-apk/` on the configured Windows host:

```powershell
.\gradlew.bat assembleDebug --no-daemon
```

Then from the project root:

```powershell
npm run verify:apk-assets
```

The latter requires a freshly built debug APK and PowerShell. This audit environment
had JDK 17 but no Android SDK, adb/emulator or WeChat Developer Tools/device, so
native builds and device acceptance were not run. No toolchain or signing upgrade
was made. Follow `AGENTS.md` for the existing device workflow.

## 6. What is preserved and omitted

The original source files are retained, including the Gradle wrapper, all three
platform entries, Android-specific HTML/shim, optional `server/`, `patches/`,
configuration, release notes, shared source and original tests. The audit adds
focused tests and the idempotent audio-restoration script.

Only the recoverable Android duplicate audio directory is intentionally omitted
from source content. Local dependencies, original comparison extracts, tool helper
copies, temporary browser profiles and build outputs are not deliverables. The
evidence directory keeps selected screenshots plus complete selected result logs;
large duplicate screenshot matrices can be regenerated with the recorded commands.

For historical comparison, fetch the exact repository commit above. Cloning that
commit does not include these unpushed audit changes; use this ZIP or the included
source diff for the audited version.

## 7. Contracts and device limitations

- Keep all best-score read/merge/write operations inside the existing coordinator.
  Web Locks / IndexedDB and native WeChat synchronous storage are preserved.
- Delayed results must respect the current game, difficulty, panel and visibility.
  Keep idle rendering shutdown and do not add a permanent frame loop.
- Keep the 3000 ms Combo window, 180 ms clear delay, score formula, fixed shape
  library, probabilities, generation budgets, tools and storage keys unchanged.
- Unusable viewports show a size/orientation prompt, freeze play and retain the
  same round for recovery. Supported portrait layouts remain unchanged.
- Validate native IME, actual audio output, Activity/context recreation and WeChat
  APIs on the appropriate devices. The container lacks CJK fonts, so screenshots
  prove geometry and state but do not prove Chinese font rendering on devices.
- Read the integrated audit for confirmed fixes and explicitly unverified risks;
  do not interpret a missing SDK/device as a successful native release gate.
