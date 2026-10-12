#!/usr/bin/env bash
set -euo pipefail

evidence="${RUNNER_TEMP:-/tmp}/relax-android-smoke"
mkdir -p "$evidence"
android='we xin xiao cheng xu-android-apk'
(cd "$android" && chmod +x ./gradlew && ./gradlew :app:assembleDebug --no-daemon)
apk="$android/app/build/outputs/apk/debug/app-debug.apk"
test -s "$apk"
badging="$("$ANDROID_HOME/build-tools/34.0.0/aapt" dump badging "$apk")"
printf '%s\n' "$badging" > "$evidence/apk-badging.txt"
printf '%s\n' "$badging" | grep -F "name='com.blockpuzzle.android'" | grep -F "versionCode='13'" | grep -F "versionName='1.0.13'"
"$ANDROID_HOME/build-tools/34.0.0/apksigner" verify --print-certs "$apk" > "$evidence/apk-signature.txt"
adb shell getprop sys.boot_completed | tr -d '\r' | grep -x 1
adb install -r "$apk" | tee "$evidence/install.txt"
adb shell am start -W -n 'com.blockpuzzle.android/.MainActivity' | tee "$evidence/launch.txt"
sleep 8
pid="$(adb shell pidof com.blockpuzzle.android | tr -d '\r')"
test -n "$pid"
adb shell dumpsys activity activities > "$evidence/activities.txt"
grep -F 'com.blockpuzzle.android/.MainActivity' "$evidence/activities.txt"
adb forward tcp:9222 "localabstract:webview_devtools_remote_$pid"
node scripts/android-emulator-smoke.mjs set | tee "$evidence/webview-initial.json"
adb shell input keyevent KEYCODE_BACK
sleep 5
adb shell am force-stop com.blockpuzzle.android
adb forward --remove tcp:9222
adb shell am start -W -n 'com.blockpuzzle.android/.MainActivity' | tee "$evidence/relaunch.txt"
sleep 5
pid="$(adb shell pidof com.blockpuzzle.android | tr -d '\r')"
test -n "$pid"
adb forward tcp:9222 "localabstract:webview_devtools_remote_$pid"
node scripts/android-emulator-smoke.mjs verify | tee "$evidence/webview-reload.json"
adb shell screencap -p /sdcard/relax-smoke.png
adb pull /sdcard/relax-smoke.png "$evidence/screen.png"
adb logcat -d -b crash > "$evidence/crash-buffer.txt"
if grep -F 'Process: com.blockpuzzle.android' "$evidence/crash-buffer.txt"; then
  echo 'Android crash buffer contains a fatal exception' >&2
  exit 1
fi
sha256sum "$apk" | tee "$evidence/apk-sha256.txt"
