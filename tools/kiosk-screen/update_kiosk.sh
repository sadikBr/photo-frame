#!/usr/bin/env bash
# Adds "screen fully off at night" and "loud timer alarms" to the frame's Home HQ app and reinstalls it (keeps its
# saved dashboard address and Home setting). Run from this folder with the frame on adb:
#   bash update_kiosk.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
KIOSK="$HOME/Work/wesbos-frame/dashboard/kiosk"
SRC="$KIOSK/src/com/wesbos/homehq"
[ -f "$SRC/MainActivity.java" ] || { echo "Kiosk source not found in $KIOSK" >&2; exit 1; }
adb get-state >/dev/null 2>&1 || { echo "The frame isn't on adb. Check: adb devices" >&2; exit 1; }

echo "1/4  Adding ScreenControl.java"
cp "$HERE/ScreenControl.java" "$SRC/ScreenControl.java"
if ! grep -q 'new ScreenControl(this)' "$SRC/MainActivity.java"; then
  grep -q 's.setMediaPlaybackRequiresUserGesture(false);' "$SRC/MainActivity.java" \
    || { echo "Couldn't find where to add it in MainActivity.java" >&2; exit 1; }
  sed -i '/s.setMediaPlaybackRequiresUserGesture(false);/a\    // The dashboard turns the screen off at night through this (ScreenControl.java).\n    web.addJavascriptInterface(new ScreenControl(this), "HomeHQ");' "$SRC/MainActivity.java"
fi
grep -n 'ScreenControl' "$SRC/MainActivity.java"

echo "2/4  Building"
if [ -x "$HOME/Work/build_kiosk.sh" ]; then
  "$HOME/Work/build_kiosk.sh"
else
  ANDROID_HOME="$HOME/android-sdk" bash "$KIOSK/build.sh"
fi
APK="$KIOSK/build/homehq.apk"
[ -f "$APK" ] || { echo "No APK at $APK" >&2; exit 1; }

echo "3/4  Installing on the frame"
adb install -r "$APK"
adb shell am start -n com.wesbos.homehq/.MainActivity >/dev/null

echo "4/4  Checking the screen light (10 s)"
sleep 10
LINE="$(adb logcat -d -s HomeHQ:I | grep 'Screen light' | tail -1 || true)"
echo "${LINE:-No report yet}"
case "$LINE" in
  *"/sys/class/"*) echo "OK: the app can switch the screen's light off." ;;
  *) echo "The app found no light switch (or su refused it). The screen will go black at the lowest brightness instead."
     echo "Send me the output of:  adb shell su -c 'ls /sys/class/leds /sys/class/backlight'" ;;
esac
