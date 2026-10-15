import config from './config.js';

export const MINUTE = 60000;
export const HOUR = 3600000;
export const DAY = 86400000;

// ---------- clock (corrected against the server: the frame's clock drifts after power cuts) ----------
let offset = 0;
export const now = () => Date.now() + offset;
export function setServerTime(serverMs, sentAt, receivedAt) {
  const local = (sentAt + receivedAt) / 2;
  const diff = serverMs - local;
  offset = Math.abs(diff) > 30000 ? diff : 0;
}

// ---------- calendar names (Moroccan usage) ----------
export const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'ماي', 'يونيو', 'يوليوز', 'غشت', 'شتنبر', 'أكتوبر', 'نونبر', 'دجنبر'];
export const WEEKDAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
export const HIJRI_MONTHS = ['محرم', 'صفر', 'ربيع الأول', 'ربيع الآخر', 'جمادى الأولى', 'جمادى الآخرة', 'رجب', 'شعبان', 'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة'];

// ---------- local time ----------
// Local time is UTC plus an explicit offset, NOT the device's time-zone rules: Morocco moved
// to permanent GMT in September 2026 and the frame's Android 6 (and older WebViews) still
// think it is GMT+1. The offset starts from config and is then taken from the prayer-times
// service, which tracks the current law (see data.js).
let tzOffset = config.utcOffsetMinutes * MINUTE;
export function setUtcOffsetMinutes(min) {
  if (typeof min === 'number' && isFinite(min) && Math.abs(min) <= 14 * 60) tzOffset = min * MINUTE;
}
// The same offset as a fixed time-zone name for services that take one ('GMT', 'Etc/GMT-1'…).
// Services' own rules for a city name can be out of date (Morocco's 2026 change).
export function fixedTimeZone() {
  const h = Math.round(tzOffset / 3600000);
  return h === 0 ? 'GMT' : 'Etc/GMT' + (h > 0 ? '-' : '+') + Math.abs(h);
}

let hijriFmt = null;
try {
  hijriFmt = new Intl.DateTimeFormat('en-US-u-ca-islamic-umalqura', { timeZone: 'UTC', year: 'numeric', month: 'numeric', day: 'numeric' });
} catch (e) { hijriFmt = null; }

// Local wall-clock parts of an instant.
export function parts(ms) {
  const d = new Date(ms + tzOffset);
  return {
    y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(),
    h: d.getUTCHours(), mi: d.getUTCMinutes(), s: d.getUTCSeconds(), wd: d.getUTCDay(),
  };
}

export function hijri(ms) {
  if (!hijriFmt) return null;
  const p = {};
  for (const x of hijriFmt.formatToParts(new Date(ms + tzOffset + config.hijriAdjust * DAY))) p[x.type] = x.value;
  const m = +p.month, d = +p.day, y = parseInt(p.year || p.relatedYear, 10);
  if (!m || !d) return null;
  return { d, m, y, month: HIJRI_MONTHS[m - 1] };
}

const pad = (n) => (n < 10 ? '0' : '') + n;
export const hhmm = (ms) => { const p = parts(ms); return pad(p.h) + ':' + pad(p.mi); };
export const dayKey = (ms) => { const p = parts(ms); return p.y + '-' + pad(p.m) + '-' + pad(p.d); };
export const minutesOfDay = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };

// Local midnight of the day containing ms, as an instant.
export function startOfDay(ms) {
  const local = ms + tzOffset;
  return local - (((local % DAY) + DAY) % DAY) - tzOffset;
}

export function dateLine(ms) {
  const p = parts(ms);
  return p.d + ' ' + MONTHS[p.m - 1] + ' ' + p.y;
}
export function hijriLine(ms) {
  const h = hijri(ms);
  return h ? h.d + ' ' + h.month + ' ' + h.y : '';
}

// Relative day name for agenda headers.
export function dayName(ms, todayMs) {
  const diff = Math.round((startOfDay(ms) - startOfDay(todayMs)) / DAY);
  if (diff === 0) return 'اليوم';
  if (diff === 1) return 'غداً';
  if (diff === -1) return 'أمس';
  return WEEKDAYS[parts(ms).wd];
}

// ---------- Arabic durations ----------
const minutesAr = (n) => (n === 1 ? 'دقيقة' : n === 2 ? 'دقيقتين' : n <= 10 ? n + ' دقائق' : n + ' دقيقة');
const hoursAr = (n) => (n === 1 ? 'ساعة' : n === 2 ? 'ساعتين' : n <= 10 ? n + ' ساعات' : n + ' ساعة');
export function durationAr(ms) {
  const total = Math.ceil(ms / MINUTE);
  if (total < 1) return 'أقل من دقيقة';
  const h = Math.floor(total / 60), m = total % 60;
  if (!h) return minutesAr(m);
  if (!m) return hoursAr(h);
  return hoursAr(h) + ' و' + minutesAr(m);
}
export function countdown(ms) {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return h + ':' + pad(m) + ':' + pad(s);
}

// ---------- DOM ----------
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
  return el;
}
export const $ = (sel, root) => (root || document).querySelector(sel);
export function setText(el, text) { if (el && el.textContent !== text) el.textContent = text; }

// ---------- storage (never throws: some WebViews block it) ----------
export const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem('fd:' + key); return v == null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem('fd:' + key, JSON.stringify(value)); } catch (e) { /* full or blocked */ }
  },
};
