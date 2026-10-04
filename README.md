# Relax Block Puzzle / 轻松俄罗斯方块

Relax Block Puzzle is a casual 10×10 block puzzle game maintained as one three-platform workspace:

- **WeChat Mini Game** — `we xin xiao cheng xu/`
- **Android APK** — `we xin xiao cheng xu-android-apk/app/`
- **Web version** — `we xin xiao cheng xu-android-apk/docs/`

The WeChat version is the product baseline. Android and Web share the gameplay behavior while keeping their own WebView/browser adapters, layouts, lifecycle handling, and full-quality audio resources. WeChat retains its light audio package and WeChat-specific APIs.

## Shared Architecture

Platform-independent source lives in `shared/js/`. The generated copies are written to the WeChat, Web, and Android targets declared in `config/platform-manifest.json`.

Edit shared modules in `shared/js/`, then synchronize and verify them from the repository root. Do not edit generated copies directly or replace WeChat audio with Android/Web audio.

## Verification

Run from the repository root:

```powershell
npm test
npm run verify
npm run verify:assets
npm run verify:apk-assets
```

The test suite uses Node's built-in test runner. Android builds run from `we xin xiao cheng xu-android-apk/`:

```powershell
.\gradlew.bat assembleDebug
```

Open `we xin xiao cheng xu/` in WeChat Developer Tools as a Mini Game project for compile, simulator, preview, and real-device checks. Touch, audio, vibration, safe-area, and lifecycle behavior require manual platform testing.

## Android Release

The current Android package version is `1.0.12` (`versionCode 12`). The previous `v1.0.11` release remains intact; new releases follow the existing matching version/Tag sequence. APK files are ignored by Git and distributed through [GitHub Releases](https://github.com/seiya058904/Relax-Block-Puzzle/releases/tag/v1.0.12).

The Release APK is explicitly **unsigned** and cannot be installed as supplied. The separate **Debug preview** APK is installable and uses the same Android Debug certificate as the previous release; it is not a production-signed Release build. Checksums accompany both files. Android-specific notes are in [`we xin xiao cheng xu-android-apk/README.md`](we%20xin%20xiao%20cheng%20xu-android-apk/README.md).

This release freezes the existing tactile/material/feedback candidate without changing gameplay or save formats. The 241-test suite, Web/WeChat Chromium host checks and installed Android emulator regression have separate evidence boundaries in [TEST_BASELINE](docs/TEST_BASELINE.md). Physical Android/WeChat devices and the remaining WeChat native interactions are unverified.

## Documentation

- [Unified product and technical specification](docs/UNIFIED_SPEC.md)
- [Platform synchronization rules](docs/PLATFORM_SYNC.md)
- [Test baseline](docs/TEST_BASELINE.md)
- [Parity audit](docs/PARITY_AUDIT.md)
- [Android release notes](we%20xin%20xiao%20cheng%20xu-android-apk/release-notes/)

Do not commit private project configuration, credentials, keys, local SDK/toolchains, build outputs, APKs, or other generated files.
