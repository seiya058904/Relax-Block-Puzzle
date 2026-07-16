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

The current Android package version is `1.0.6` (`versionCode 6`). APK files are ignored by Git and should be distributed through a release attachment rather than committed to the repository. Android-specific notes are in [`we xin xiao cheng xu-android-apk/README.md`](we%20xin%20xiao%20cheng%20xu-android-apk/README.md).

## Documentation

- [Unified product and technical specification](docs/UNIFIED_SPEC.md)
- [Platform synchronization rules](docs/PLATFORM_SYNC.md)
- [Test baseline](docs/TEST_BASELINE.md)
- [Parity audit](docs/PARITY_AUDIT.md)
- [Android release notes](we%20xin%20xiao%20cheng%20xu-android-apk/release-notes/)

Do not commit private project configuration, credentials, keys, local SDK/toolchains, build outputs, APKs, or other generated files.
