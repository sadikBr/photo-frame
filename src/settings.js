// Validation for the frame settings saved from the control panel.
export const SCREENS = ['home', 'prayer', 'calendar', 'lists', 'photos'];
export const PRAYERS = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];

// Only known fields with sane values are kept; anything else is dropped.
export const clean = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
export const num = (v, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : null; };
const int = (v, lo, hi) => { const n = num(v, lo, hi); return n == null ? null : Math.round(n); };
const hhmm = (v) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(String(v)) ? String(v) : null);
const words = (arr, n, max) => (Array.isArray(arr) ? arr.map((x) => clean(x, max)).filter(Boolean).slice(0, n) : null);

export function sanitizeSettings(input) {
  const s = {};
  const i = input && typeof input === 'object' ? input : {};
  const city = clean(i.city, 40);
  if (city) s.city = city;
  const lat = num(i.latitude, -90, 90), lon = num(i.longitude, -180, 180);
  if (lat != null && lon != null && i.latitude !== '' && i.longitude !== '') { s.latitude = +lat.toFixed(4); s.longitude = +lon.toFixed(4); }
  if (i.prayerAdjust && typeof i.prayerAdjust === 'object') {
    s.prayerAdjust = {};
    for (const p of PRAYERS) s.prayerAdjust[p] = int(i.prayerAdjust[p], -30, 30) || 0;
  }
  const hj = int(i.hijriAdjust, -2, 2);
  if (hj != null) s.hijriAdjust = hj;
  if (i.night && typeof i.night === 'object') {
    s.night = {
      enabled: i.night.enabled !== false,
      start: hhmm(i.night.start) || '23:00',
      end: hhmm(i.night.end) || '06:00',
      dim: num(i.night.dim, 0, 0.95) != null ? +num(i.night.dim, 0, 0.95).toFixed(2) : 0.72,
      // Screen fully off instead of dimmed (the kiosk app turns the backlight off; a touch wakes it).
      off: i.night.off === true,
    };
  }
  // Guest Wi-Fi card: the frame shows the network as a QR code. The password is kept exactly as
  // typed (spaces count in Wi-Fi passwords), without control characters. No name = no card.
  if (i.wifi && typeof i.wifi === 'object') {
    const raw = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max);
    const ssid = raw(i.wifi.ssid, 32);
    const security = ['WPA', 'WEP', 'nopass'].includes(i.wifi.security) ? i.wifi.security : 'WPA';
    s.wifi = ssid.trim() ? { ssid, password: security === 'nopass' ? '' : raw(i.wifi.password, 63), security, hidden: i.wifi.hidden === true, showPassword: i.wifi.showPassword !== false } : null;
  }
  if (i.screens && typeof i.screens === 'object') {
    s.screens = {};
    for (const k of SCREENS) {
      const v = i.screens[k] || {};
      s.screens[k] = { on: v.on !== false, seconds: int(v.seconds, 5, 600) || 30 };
    }
    if (!SCREENS.some((k) => s.screens[k].on)) s.screens.home.on = true; // never an empty rotation
  }
  if (typeof i.prayerFocus === 'boolean') s.prayerFocus = i.prayerFocus;
  if (typeof i.touchNavigation === 'boolean') s.touchNavigation = i.touchNavigation;
  const ps = int(i.photoSeconds, 5, 120);
  if (ps != null) s.photoSeconds = ps;
  // Adhan at prayer times (the audio file itself is uploaded separately).
  if (i.adhan && typeof i.adhan === 'object') {
    const pr = i.adhan.prayers || {};
    s.adhan = {
      enabled: i.adhan.enabled === true,
      prayers: {},
      volume: num(i.adhan.volume, 0.1, 1) != null ? +num(i.adhan.volume, 0.1, 1).toFixed(2) : 0.8,
    };
    for (const p of ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha']) s.adhan.prayers[p] = pr[p] !== false;
  }
  // Ramadan look on the prayer screen (switches on by itself in Ramadan) and the Quran tracker.
  if (i.ramadan && typeof i.ramadan === 'object') s.ramadan = { enabled: i.ramadan.enabled !== false, quran: i.ramadan.quran !== false };
  // Morning and evening adhkar shown after Fajr and Asr; their recording (if uploaded) can start
  // by itself when they come up, at its own volume.
  if (i.adhkar && typeof i.adhkar === 'object') {
    const v = num(i.adhkar.volume, 0.1, 1);
    s.adhkar = { auto: i.adhkar.auto !== false, minutes: int(i.adhkar.minutes, 5, 120) || 30, audioAuto: i.adhkar.audioAuto !== false, volume: v != null ? +v.toFixed(2) : 0.8 };
  }
  if (typeof i.dailyVerse === 'boolean') s.dailyVerse = i.dailyVerse;
  if (typeof i.weatherNudge === 'boolean') s.weatherNudge = i.weatherNudge;
  if (typeof i.pulseSound === 'boolean') s.pulseSound = i.pulseSound;
  const qs = words(i.quickShopping, 30, 30), qt = words(i.quickTasks, 30, 40);
  if (qs) s.quickShopping = qs;
  if (qt) s.quickTasks = qt;
  return s;
}

