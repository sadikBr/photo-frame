package com.wesbos.homehq;

import android.app.Activity;
import android.content.SharedPreferences;
import android.util.Log;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.regex.Pattern;

/**
 * Lets the dashboard turn the screen off at night and on again: window.HomeHQ.screen(false|true).
 *
 * Off: the panel's backlight is switched off through root (the frame's su), so the screen is dark
 * but still takes touches, and the page turns it on again at the first touch. The window also
 * asks Android for the lowest brightness, which is all that happens when no light can be found
 * or su is refused. window.HomeHQ.info() says which: "backlight", "dim", or "probing" while it
 * is still looking.
 *
 * Only fixed commands are run: the light's path is found by the app itself and checked against a
 * strict pattern, and the only number written is one read from that same file.
 */
final class ScreenControl {
  private static final String TAG = "HomeHQ";
  private static final String PREFS = "screen";
  private static final String PREF_LEVEL = "level";
  private static final int FALLBACK_LEVEL = 128;
  // The usual places for the panel's light on Android (Allwinner boards use the leds one).
  private static final String FIND =
      "for f in /sys/class/leds/lcd-backlight/brightness /sys/class/backlight/*/brightness; do"
      + " if [ -e \"$f\" ]; then echo \"$f\"; break; fi; done";
  private static final Pattern SAFE =
      Pattern.compile("^/sys/class/(leds|backlight)/[A-Za-z0-9_.-]+/brightness$");

  private final Activity activity;
  private final SharedPreferences prefs;
  private final Object lock = new Object();
  private volatile String light; // the brightness file, or null
  private volatile boolean probed;
  private boolean off;

  ScreenControl(Activity activity) {
    this.activity = activity;
    this.prefs = activity.getSharedPreferences(PREFS, Activity.MODE_PRIVATE);
    new Thread(new Runnable() {
      @Override
      public void run() {
        synchronized (lock) {
          probe();
          // If the app stopped while the light was off (a crash, an update at night), turn it on.
          if (light != null && readLevel() == 0) writeLevel(savedLevel());
        }
      }
    }, "screen-probe").start();
  }

  @JavascriptInterface
  public String info() {
    return light != null ? "backlight" : probed ? "dim" : "probing";
  }

  @JavascriptInterface
  public void screen(final boolean on) {
    new Thread(new Runnable() {
      @Override
      public void run() {
        synchronized (lock) {
          if (!probed) probe();
          if (on) turnOn(); else turnOff();
        }
      }
    }, "screen-light").start();
  }

  private void turnOff() {
    if (off) return;
    off = true;
    if (light != null) {
      // Remember the family's brightness before anything changes it.
      int level = readLevel();
      if (level > 0) prefs.edit().putInt(PREF_LEVEL, level).apply();
    }
    setWindowBrightness(WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_OFF);
    if (light != null) {
      // Let Android apply the lowest brightness first, so it doesn't write over our 0.
      try { Thread.sleep(700); } catch (InterruptedException e) { /* go on */ }
      writeLevel(0);
    }
    Log.i(TAG, "Screen off (" + info() + ")");
  }

  private void turnOn() {
    if (!off) return;
    off = false;
    if (light != null) writeLevel(savedLevel());
    // Android then sets the family's brightness again by itself.
    setWindowBrightness(WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE);
    Log.i(TAG, "Screen on");
  }

  private void setWindowBrightness(final float value) {
    activity.runOnUiThread(new Runnable() {
      @Override
      public void run() {
        Window w = activity.getWindow();
        WindowManager.LayoutParams lp = w.getAttributes();
        lp.screenBrightness = value;
        w.setAttributes(lp);
      }
    });
  }

  private void probe() {
    String out = su(FIND);
    String path = out == null ? "" : out.trim();
    light = SAFE.matcher(path).matches() ? path : null;
    probed = true;
    Log.i(TAG, "Screen light: " + (light != null ? light : "not found or no root; lowest brightness only"));
  }

  private int savedLevel() {
    int v = prefs.getInt(PREF_LEVEL, FALLBACK_LEVEL);
    return v > 0 && v <= 4095 ? v : FALLBACK_LEVEL;
  }

  private int readLevel() {
    String out = su("cat " + light);
    try { return Integer.parseInt(out == null ? "" : out.trim()); } catch (NumberFormatException e) { return -1; }
  }

  private void writeLevel(int level) {
    if (light == null || level < 0 || level > 4095) return;
    su("echo " + level + " > " + light);
  }

  /** Runs one fixed command as root; returns its output, or null if su is missing or refused. */
  private static String su(String cmd) {
    Process p = null;
    try {
      p = Runtime.getRuntime().exec(new String[] {"su", "-c", cmd});
      BufferedReader r = new BufferedReader(new InputStreamReader(p.getInputStream()));
      StringBuilder out = new StringBuilder();
      String line;
      while ((line = r.readLine()) != null) out.append(line).append('\n');
      return p.waitFor() == 0 ? out.toString() : null;
    } catch (Exception e) {
      Log.w(TAG, "su failed: " + e);
      return null;
    } finally {
      if (p != null) p.destroy();
    }
  }
}
