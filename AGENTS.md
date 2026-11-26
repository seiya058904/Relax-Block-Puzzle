# Repository Guidelines

## Scope & Architecture
- Unified 3-platform block puzzle: WeChat Mini Game (`we xin xiao cheng xu/`), Android Kotlin/WebView (`we xin xiao cheng xu-android-apk/app/src/main/assets/`, version in `app/build.gradle.kts`), and Web Pages build (`we xin xiao cheng xu-android-apk/docs/` via `.github/workflows/deploy-pages.yml`).
- **`shared/js/` is the single source of truth** (configured by `config/platform-manifest.json`); never hand-edit generated copies — run `npm run sync`. Keep shared modules platform-independent (no `wx`/DOM/WebView globals); keep audio tiered (WeChat light vs Web/Android full).
- **Storage & render invariants**: cross-tab/async high-score writes must stay serialized through `wx.withStorageLock` (Web Locks / IndexedDB readwrite, no uncoordinated fallback) with `ScoreManager` `bestScoreGeneration` guard; delayed auth/score writes must wake the existing render loop while preserving idle frame shutdown.

## Commands & Verification
```powershell
npm run sync && npm test && npm run verify && npm run verify:assets
npm run verify:apk-assets                       # requires freshly built debug APK
node tests/browser/high-score.mjs
node tests/browser/quality.mjs
```
- No root lint, type-check, or formatting script. Browser scripts accept `QA_PLAYWRIGHT_PACKAGE`, `QA_SCREENSHOTS`, `QA_DOCS_ROOT`; Chromium WeChat-host checks never replace real WeChat DevTools or Android device acceptance.
- Android build (JDK 17 + `ANDROID_HOME`): `.\gradlew.bat assembleDebug --no-daemon` in `we xin xiao cheng xu-android-apk/`. For device/Mobile MCP/ADB/scrcpy workflow, read `docs/ANDROID_WORKFLOW.md` (or load global `android-device-workflow` skill). Preserve signing identity and assets.
- For touch, audio, vibration, safe-area, lifecycle, WebView, or Canvas changes, verify in WeChat DevTools or on a physical Android device and report any skipped checks honestly.

## Security & Authorization
- Never commit or expose `.env*`, credentials, tokens, passwords, keys, keystores, `local.properties`, `project.private.config.json`, admin/member codes, APKs/AABs, or build caches; keep backend secrets server-side.
- Do not change gameplay semantics, storage keys, compatibility defaults, or dependencies without authorization. Explicit authorization is required before commit, push, WeChat `upload`, deploy, publish, release, tag, `app/build.gradle.kts` version bump, signing, backend/auth, or DB changes.
