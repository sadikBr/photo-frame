// Default settings. Everything here except the technical values at the bottom can be changed
// from the control panel (/admin); what you save there overrides these defaults on the frame.
export default {
  city: 'الرباط',
  latitude: 34.0209,
  longitude: -6.8416,

  // Prayer times from aladhan.com. Method 21 = Morocco (Ministry of Habous angles,
  // Dhuhr and Maghrib +5 min). Minutes to add to each time if your mosque differs.
  prayerMethod: 21,
  prayerAdjust: { fajr: 0, sunrise: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 },

  // Hijri date uses the Umm al-Qura calendar. Morocco follows local moon sighting and is
  // sometimes a day apart; set -1 (or +1) if the frame shows the wrong Hijri day.
  hijriAdjust: 0,

  // Screens rotate on their own (seconds on each), in this order.
  rotation: [
    ['home', 90],
    ['photos', 120],
    ['prayer', 25],
    ['calendar', 30],
    ['lists', 30],
  ],

  // Bring the prayer screen forward around each adhan (minutes before / after).
  prayerFocus: { enabled: true, before: 10, after: 10 },

  // Night: dim the screen and show only the clock. Times are local, 24h.
  // off: the screen goes fully dark instead of dimming (backlight off through the kiosk app).
  night: { enabled: true, start: '23:00', end: '06:00', dim: 0.72, off: false },
  // Guest Wi-Fi card (set in the control panel): {ssid, password, security, hidden, showPassword}.
  wifi: null,

  photoSeconds: 15,

  // Let people swipe or tap the tabs on the frame to look at another screen.
  // Editing always happens in the control panel.
  touchNavigation: true,
  // After someone touches the frame, stay put this long, then go back to rotating.
  resumeAfterSeconds: 120,

  // Adhan at prayer times. Upload the adhan audio in the control panel first.
  adhan: { enabled: false, prayers: { fajr: true, dhuhr: true, asr: true, maghrib: true, isha: true }, volume: 0.8 },

  // Ramadan: the prayer screen counts down to iftar and suhoor during the month (it turns on
  // and off by itself from the Hijri date), with an optional Quran reading tracker.
  ramadan: { enabled: true, quran: true },

  // Morning adhkar after Fajr and evening adhkar after Asr, for this many minutes.
  // audioAuto: play the uploaded recording when they come up by themselves.
  adhkar: { auto: true, minutes: 30, audioAuto: true, volume: 0.8 },

  // A short verse or hadith of the day on the clock screen, and a plain weather tip.
  dailyVerse: true,
  weatherNudge: true,

  // «نبضة»: a soft chime when a moment arrives from a phone (never at night).
  pulseSound: true,

  // Quick-add buttons in the control panel.
  quickShopping: ['خبز', 'حليب', 'بيض', 'نعناع', 'طماطم', 'بصل', 'زيت الزيتون', 'سكر', 'أتاي', 'فواكه', 'خضر', 'ماء'],
  quickTasks: ['أداء الفاتورة', 'الاتصال بالوالدة', 'تنظيف البيت', 'سقي النباتات'],

  // ----- technical -----
  timezone: 'Africa/Casablanca',
  // Local time = UTC + this many minutes. Morocco has been on permanent GMT (0) since
  // 20 September 2026. The frame updates it automatically from the prayer-times service.
  utcOffsetMinutes: 0,
  // How often the frame refreshes (minutes). `board` brings lists, settings, dates and message.
  refresh: { board: 0.5, weather: 15, photos: 10, prayer: 360 },
};
