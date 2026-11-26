# Android / Web Subtree Notes

Follow root `../AGENTS.md` (edit `../shared/js/` and run `npm run sync`, `npm run verify`, `npm run verify:assets`, `npm run verify:apk-assets` from root).
- Build debug APK (JDK 17): `.\gradlew.bat assembleDebug --no-daemon`.
- Preserve signing identity and `app/build.gradle.kts` (`versionCode`/`versionName` changes require explicit authorization); keep `app/src/main/assets/js/js/` absent.
