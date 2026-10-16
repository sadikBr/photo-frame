// Data layer for the frame: fetches, caches in localStorage (so the frame keeps working through
// network drops), applies the settings saved in the control panel, and notifies screens.
// Everything is edited from the control panel (/admin); on the frame itself people can only
// tick items off, clear finished items and count the juz read in Ramadan.
import config from './config.js';
import { store, setServerTime, setUtcOffsetMinutes, fixedTimeZone, now, parts, dayKey, DAY, MINUTE, HOUR } from './util.js';
import * as demo from './demo.js';

const BOOT = Date.now();
export const DEMO = !!(window.FRAME_DEMO || /[?&]demo\b/.test(location.search));

// The access key arrives once as ?key=… (the kiosk saves that URL); keep it and tidy the address.
(function captureKey() {
  try {
    const u = new URL(location.href);
    const k = u.searchParams.get('key');
    if (k) {
      store.set('key', k);
      u.searchParams.delete('key');
      history.replaceState(null, '', u.pathname + u.search + u.hash);
    }
  } catch (e) { /* ignore */ }
})();
export const accessKey = () => store.get('key', '');
// GET (no body) or send JSON, with the access key; resolves to the JSON answer.
export async function frameFetch(path, method, body) {
  const headers = {};
  const k = accessKey();
  if (k) headers['x-key'] = k;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(path, { method: method || 'GET', headers, cache: 'no-store', body: body === undefined ? undefined : JSON.stringify(body) });
  if (!res.ok) {
    let msg = 'HTTP ' + res.status;
    try { msg = (await res.json()).error || msg; } catch (e) { /* not json */ }
    throw new Error(msg);
  }
  return res.json();
}
// The demo keeps its own cache, so it and the real frame (same address, same browser) never
// show each other's lists or weather while starting up.
const ck = (name) => (DEMO ? 'demo-cache-' : '') + name;

async function api(path) {
  const headers = {};
  const k = accessKey();
  if (k) headers['x-key'] = k;
  const res = await fetch(path, { headers, cache: 'no-store' });
  if (!res.ok) {
    let msg = 'HTTP ' + res.status;
    try { msg = (await res.json()).error || msg; } catch (e) { /* not json */ }
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export function photoUrl(photo) {
  if (DEMO || photo.src) return photo.src;
  const k = accessKey();
  return '/api/photos/' + photo.id + (k ? '?key=' + encodeURIComponent(k) : '');
}

// ---------- settings from the control panel, layered over config.js ----------
const DEFAULTS = JSON.parse(JSON.stringify(config));
const ROTATION_ORDER = ['home', 'photos', 'prayer', 'calendar', 'lists'];

function applySettings(s) {
  s = s || {};
  const before = config.latitude + ',' + config.longitude;
  config.city = s.city || DEFAULTS.city;
  config.latitude = typeof s.latitude === 'number' ? s.latitude : DEFAULTS.latitude;
  config.longitude = typeof s.longitude === 'number' ? s.longitude : DEFAULTS.longitude;
  config.hijriAdjust = typeof s.hijriAdjust === 'number' ? s.hijriAdjust : DEFAULTS.hijriAdjust;
  config.prayerAdjust = Object.assign({}, DEFAULTS.prayerAdjust, s.prayerAdjust);
  config.night = Object.assign({}, DEFAULTS.night, s.night);
  config.prayerFocus = Object.assign({}, DEFAULTS.prayerFocus, typeof s.prayerFocus === 'boolean' ? { enabled: s.prayerFocus } : null);
  config.touchNavigation = typeof s.touchNavigation === 'boolean' ? s.touchNavigation : DEFAULTS.touchNavigation;
  config.photoSeconds = s.photoSeconds || DEFAULTS.photoSeconds;
  config.adhan = Object.assign({}, DEFAULTS.adhan, s.adhan, { prayers: Object.assign({}, DEFAULTS.adhan.prayers, s.adhan && s.adhan.prayers) });
  config.ramadan = Object.assign({}, DEFAULTS.ramadan, s.ramadan);
  config.adhkar = Object.assign({}, DEFAULTS.adhkar, s.adhkar);
  config.dailyVerse = typeof s.dailyVerse === 'boolean' ? s.dailyVerse : DEFAULTS.dailyVerse;
  config.weatherNudge = typeof s.weatherNudge === 'boolean' ? s.weatherNudge : DEFAULTS.weatherNudge;
  config.pulseSound = typeof s.pulseSound === 'boolean' ? s.pulseSound : DEFAULTS.pulseSound;
  if (s.screens) {
    config.rotation = ROTATION_ORDER.filter((k) => s.screens[k] && s.screens[k].on).map((k) => [k, s.screens[k].seconds]);
  } else {
    config.rotation = DEFAULTS.rotation.map((r) => r.slice());
  }
  if (!config.rotation.length) config.rotation = [['home', 60]];
  return before !== config.latitude + ',' + config.longitude;
}

// ---------- fetchers ----------
// The demo uses the same live weather and prayer times as the real frame, so it looks the
// same; only when those services can't be reached does it fall back to sample values.
const liveOrSample = (live, sample) => async (...args) => {
  try { return await live(...args); } catch (e) { if (DEMO) return sample(...args); throw e; }
};
const fetchWeather = liveOrSample(fetchWeatherLive, () => demo.weather());
async function fetchWeatherLive() {
  // Days are counted in the frame's own offset (from the prayer-times service), not the
  // weather service's rules for the city, which still put Morocco at GMT+1. Yesterday is
  // included so the list can never start a day late.
  const q = new URLSearchParams({
    latitude: config.latitude, longitude: config.longitude, timezone: fixedTimeZone(), past_days: '1',
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_gusts_10m_max',
    forecast_days: '8', wind_speed_unit: 'kmh',
  });
  const res = await fetch('https://api.open-meteo.com/v1/forecast?' + q);
  if (!res.ok) throw new Error('Weather service: HTTP ' + res.status);
  const j = await res.json();
  const c = j.current, d = j.daily;
  return {
    current: {
      temp: c.temperature_2m, feels: c.apparent_temperature, humidity: c.relative_humidity_2m,
      wind: c.wind_speed_10m, code: c.weather_code, isDay: !!c.is_day,
    },
    daily: d.time.map((date, i) => ({
      date, code: d.weather_code[i], max: d.temperature_2m_max[i], min: d.temperature_2m_min[i],
      rain: d.precipitation_probability_max ? d.precipitation_probability_max[i] : null,
      mm: d.precipitation_sum ? d.precipitation_sum[i] : null,
      gusts: d.wind_gusts_10m_max ? d.wind_gusts_10m_max[i] : null,
    })),
    fetched: now(),
  };
}

// "(+01)" -> 60
function offsetOf(str) {
  const mm = /\(([+-])(\d{2}):?(\d{2})?\)/.exec(str || '');
  return mm ? (mm[1] === '-' ? -1 : 1) * (+mm[2] * 60 + (+mm[3] || 0)) : null;
}

// "05:04 (+01)" on a given date -> UTC instant.
function prayerInstant(str, y, m, d) {
  const mm = /(\d{1,2}):(\d{2})\s*\(([+-])(\d{2}):?(\d{2})?\)/.exec(str);
  if (!mm) return null;
  const off = (mm[3] === '-' ? -1 : 1) * (+mm[4] * 60 + (+mm[5] || 0));
  return Date.UTC(y, m - 1, d, +mm[1], +mm[2]) - off * MINUTE;
}

const fetchPrayerMonth = liveOrSample(fetchPrayerMonthLive, (y, m) => demo.prayerMonth(y, m));
async function fetchPrayerMonthLive(y, m) {
  // Per-prayer adjustments are applied in prayerDay(), not here: the service ignores its own
  // `tune` option for the Morocco method, and applying them locally makes changes instant.
  const q = new URLSearchParams({
    latitude: config.latitude, longitude: config.longitude, method: config.prayerMethod,
    timezonestring: config.timezone,
  });
  const res = await fetch('https://api.aladhan.com/v1/calendar/' + y + '/' + m + '?' + q);
  if (!res.ok) throw new Error('Prayer times service: HTTP ' + res.status);
  const j = await res.json();
  const days = {};
  for (const day of j.data) {
    const [dd, mo, yy] = day.date.gregorian.date.split('-').map(Number);
    const t = day.timings;
    const key = yy + '-' + String(mo).padStart(2, '0') + '-' + String(dd).padStart(2, '0');
    days[key] = {
      imsak: t.Imsak ? prayerInstant(t.Imsak, yy, mo, dd) : null,
      fajr: prayerInstant(t.Fajr, yy, mo, dd), sunrise: prayerInstant(t.Sunrise, yy, mo, dd),
      dhuhr: prayerInstant(t.Dhuhr, yy, mo, dd), asr: prayerInstant(t.Asr, yy, mo, dd),
      sunset: prayerInstant(t.Sunset, yy, mo, dd), maghrib: prayerInstant(t.Maghrib, yy, mo, dd),
      isha: prayerInstant(t.Isha, yy, mo, dd),
      off: offsetOf(t.Fajr),
    };
  }
  return days;
}

// Whether this browser lets the page play the adhan; reported to the control panel.
let audioStatus = 'off';
let reportTimer = null;
export function setAudioStatus(v) {
  if (v === audioStatus) return;
  audioStatus = v;
  // Tell the control panel soon, not only with the next regular check.
  clearTimeout(reportTimer);
  if (!DEMO) reportTimer = setTimeout(refreshBoard, 1500);
}
const fetchBoard = () => (DEMO ? demo.board() : api('/api/board?frame=1&audio=' + audioStatus));
const fetchPhotos = () => (DEMO ? demo.photos() : api('/api/photos'));

// ---------- state ----------
const cachedBoard = store.get(ck('board'), null);
export const state = {
  weather: store.get(ck('weather'), null),
  photos: store.get(ck('photos'), null),
  prayer: store.get(ck('prayer'), {}), // { location, months: { 'YYYY-MM': { 'YYYY-MM-DD': {...} } } }
  lists: cachedBoard && cachedBoard.lists,
  events: (cachedBoard && cachedBoard.events) || [],
  message: cachedBoard && cachedBoard.message,
  settings: (cachedBoard && cachedBoard.settings) || {},
  quran: cachedBoard && cachedBoard.quran,
  audio: (cachedBoard && cachedBoard.audio) || {},
  preview: null,
  errors: {},
  lastOk: {},
};
applySettings(state.settings);

const subs = {};
export function on(name, fn) { (subs[name] = subs[name] || []).push(fn); }
function emit(name) {
  for (const fn of subs[name] || []) {
    try { fn(state[name]); } catch (e) { console.error(e); }
  }
}

async function refresh(name, fetcher) {
  try {
    const v = await fetcher();
    state[name] = v;
    state.errors[name] = null;
    state.lastOk[name] = Date.now();
    store.set(ck(name), v);
    emit(name);
  } catch (e) {
    state.errors[name] = { message: e.message, status: e.status, at: Date.now() };
    console.warn(name, e);
  }
  emit('status');
}

let lastBoard = JSON.stringify(cachedBoard);
let build = null; // the deployed version this page was loaded with
async function refreshBoard() {
  try {
    const b = await fetchBoard();
    if (b.build && !DEMO) {
      if (!build) build = b.build;
      else if (b.build !== build) { location.reload(); return; } // a new version was deployed
    }
    state.errors.board = null;
    state.lastOk.board = Date.now();
    // A preview lasts until the server's time says so; turned into this frame's clock, which
    // may be off (no /api/time sync yet, or a wrong device clock).
    const pv = b.preview && b.now ? Object.assign({}, b.preview, { until: now() + (b.preview.until - b.now) }) : null;
    if ((pv && pv.id) !== (state.preview && state.preview.id)) { state.preview = pv; emit('preview'); }
    const snapshot = JSON.stringify({ lists: b.lists, settings: b.settings, events: b.events, message: b.message, quran: b.quran || null, audio: b.audio || {} });
    if (snapshot === lastBoard) return;
    lastBoard = snapshot;
    store.set(ck('board'), JSON.parse(snapshot));
    const settingsChanged = JSON.stringify(b.settings) !== JSON.stringify(state.settings);
    state.lists = b.lists;
    state.events = b.events || [];
    state.message = b.message || null;
    state.settings = b.settings || {};
    state.quran = b.quran || null;
    state.audio = b.audio || {};
    if (settingsChanged) {
      const moved = applySettings(state.settings);
      if (moved) {
        // New location: fetch weather and prayer times for it.
        state.prayer = {};
        store.set(ck('prayer'), {});
        ensurePrayerMonths();
        refresh('weather', fetchWeather);
      }
      emit('settings');
      emit('prayer');
    }
    emit('lists');
    emit('events');
    emit('message');
    emit('quran');
    emit('audio');
  } catch (e) {
    state.errors.board = { message: e.message, status: e.status, at: Date.now() };
    console.warn('board', e);
  } finally {
    emit('status');
  }
}

// ---------- the edits the frame can make: tick shopping items, clear finished items ----------
// Applied on screen at once, then sent; if sending fails the list goes back as it was.
export async function frameListOp(body) {
  const prev = state.lists;
  const next = JSON.parse(JSON.stringify(prev || { tasks: [], shopping: [] }));
  const items = next[body.list] || [];
  if (body.op === 'toggle') { const it = items.find((x) => x.id === body.id); if (it) it.done = !it.done; }
  if (body.op === 'clearDone') next[body.list] = items.filter((x) => !x.done);
  state.lists = next;
  emit('lists');
  try {
    let result;
    if (DEMO) {
      result = demo.listOp(body);
    } else {
      const k = accessKey();
      const res = await fetch('/api/lists', {
        method: 'POST',
        headers: Object.assign({ 'content-type': 'application/json' }, k ? { 'x-key': k } : {}),
        body: JSON.stringify(body),
      });
      if (!res.ok) throw Object.assign(new Error('HTTP ' + res.status), { status: res.status });
      result = await res.json();
    }
    state.lists = result;
    emit('lists');
    return true;
  } catch (e) {
    state.lists = prev; // put the list back so the frame matches the server
    emit('lists');
    state.errors.board = { message: e.message, status: e.status, at: Date.now() };
    emit('status');
    return false;
  }
}

// ---------- Ramadan Quran tracker: + / − a juz from the frame ----------
export async function frameQuranOp(body, localOnly) {
  const prev = state.quran;
  const cur = prev && prev.year === body.year ? prev.juz : 0;
  const juz = Math.min(30, Math.max(0, cur + (body.op === 'inc' ? 1 : -1)));
  state.quran = { year: body.year, juz };
  emit('quran');
  if (localOnly || DEMO) return true; // previews don't change the real count
  try {
    const k = accessKey();
    const res = await fetch('/api/quran', {
      method: 'POST',
      headers: Object.assign({ 'content-type': 'application/json' }, k ? { 'x-key': k } : {}),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    state.quran = await res.json();
    emit('quran');
    return true;
  } catch (e) {
    state.quran = prev;
    emit('quran');
    return false;
  }
}

export function audioUrl(name) {
  const a = state.audio && state.audio[name];
  if (!a || DEMO) return null;
  const k = accessKey();
  return '/api/audio/' + name + '?v=' + a.at + (k ? '&key=' + encodeURIComponent(k) : '');
}

// ---------- prayer helpers ----------
const monthKey = (ms) => { const p = parts(ms); return p.y + '-' + String(p.m).padStart(2, '0'); };
const locKey = () => config.latitude + ',' + config.longitude;

async function ensurePrayerMonths() {
  if (state.prayer.location !== locKey() || !state.prayer.months) state.prayer = { location: locKey(), months: {} };
  const months = state.prayer.months;
  const t = now();
  const keys = [monthKey(t), monthKey(t + DAY)];
  let changed = false;
  for (const k of keys) {
    if (months[k]) continue;
    const [y, m] = k.split('-').map(Number);
    try {
      months[k] = await fetchPrayerMonth(y, m);
      changed = true;
      state.errors.prayer = null;
    } catch (e) {
      state.errors.prayer = { message: e.message, at: Date.now() };
    }
  }
  // Keep only this month and the next to stay small.
  for (const k of Object.keys(months)) if (!keys.includes(k)) { delete months[k]; changed = true; }
  syncOffsetFromPrayer();
  if (changed) { store.set(ck('prayer'), state.prayer); emit('prayer'); }
  emit('status');
}

const ADJUSTED = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];
export function prayerDay(ms) {
  const months = state.prayer.months;
  const m = months && months[monthKey(ms)];
  const day = m && m[dayKey(ms)];
  if (!day) return null;
  const adj = config.prayerAdjust || {};
  const out = Object.assign({}, day);
  for (const k of ADJUSTED) if (adj[k]) out[k] = day[k] + adj[k] * MINUTE;
  // Imsak moves with Fajr; older cached timetables have none, so take 10 minutes before Fajr.
  out.imsak = (day.imsak || day.fajr - 10 * MINUTE) + (adj.fajr || 0) * MINUTE;
  return out;
}

// The prayer service knows the current legal offset (e.g. Morocco's 2026 return to GMT);
// use it for every clock on the frame.
function syncOffsetFromPrayer() {
  const today = prayerDay(now());
  if (today && typeof today.off === 'number') {
    setUtcOffsetMinutes(today.off);
    store.set('utcOffset', today.off);
  }
}
setUtcOffsetMinutes(store.get('utcOffset', config.utcOffsetMinutes));

// ---------- status for the nav band ----------
export function connectionProblem() {
  const auth = Object.values(state.errors).find((e) => e && e.status === 401);
  if (auth) return 'مفتاح الدخول غير صحيح. افتح الرابط مع ?key=';
  const recent = ['weather', 'board'].filter((k) => state.errors[k]);
  if (!recent.length) return '';
  const oldest = Math.min(...recent.map((k) => state.lastOk[k] || BOOT));
  return Date.now() - oldest > 10 * MINUTE ? 'لا يوجد اتصال بالإنترنت' : '';
}

// ---------- scheduling ----------
async function syncClock() {
  if (DEMO) return;
  try {
    const sent = Date.now();
    const res = await fetch('/api/time', { cache: 'no-store' });
    const { now: server } = await res.json();
    setServerTime(server, sent, Date.now());
  } catch (e) { /* keep the device clock */ }
}

export function start() {
  const r = config.refresh;
  // Demo mode: the demo control panel in another tab writes to this browser's storage;
  // show its changes (previews, lists, message…) at once instead of at the next check.
  if (DEMO) window.addEventListener('storage', (e) => { if (e.key && e.key.indexOf('fd:demo-') === 0) refreshBoard(); });
  const every = (min, fn) => { fn(); setInterval(fn, Math.max(0.25, min) * MINUTE); };
  syncClock();
  setInterval(syncClock, HOUR);
  every(r.board, refreshBoard);
  every(r.prayer, ensurePrayerMonths);
  every(r.weather, () => refresh('weather', fetchWeather));
  every(r.photos, () => refresh('photos', fetchPhotos));
  // Day rollover: make sure next month's prayer times are there.
  setInterval(ensurePrayerMonths, 30 * MINUTE);
}
