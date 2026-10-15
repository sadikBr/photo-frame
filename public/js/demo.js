// Sample data for previewing the dashboard without a backend (open with ?demo).
import { startOfDay, now, parts, dayKey, DAY, MINUTE, HOUR, store } from './util.js';
import { dueFrom, addDays } from './routines.js';

const today = () => startOfDay(now());
const at = (dayOffset, h, m) => today() + dayOffset * DAY + (h * 60 + m) * MINUTE;

export function weather() {
  const base = today();
  const codes = [2, 1, 0, 3, 61, 2, 0];
  const highs = [24, 25, 27, 22, 19, 21, 23];
  const lows = [15, 15, 17, 16, 13, 13, 14];
  const h = parts(now()).h;
  return {
    current: { temp: 22, feels: 21, humidity: 64, wind: 14, code: 2, isDay: h >= 7 && h < 18 },
    daily: codes.map((code, i) => ({ date: dayKey(base + i * DAY + HOUR * 12), code, max: highs[i], min: lows[i], rain: code === 61 ? 70 : 5 })),
    fetched: now(),
  };
}

export function prayerMonth(y, m) {
  const days = {};
  const first = Date.UTC(y, m - 1, 1, 12);
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  for (let i = 0; i < n; i++) {
    const noon = first + i * DAY;
    const s = startOfDay(noon);
    const t = (hh, mm) => s + (hh * 60 + mm) * MINUTE;
    days[dayKey(noon)] = {
      imsak: t(4, 54), fajr: t(5, 4), sunrise: t(6, 32), dhuhr: t(12, 18), asr: t(15, 27),
      sunset: t(17, 53), maghrib: t(17, 58), isha: t(19, 12),
    };
  }
  return days;
}

const DEFAULT_LISTS = {
  tasks: [
    { id: 't1', text: 'أداء فاتورة الكهرباء', done: false, rid: 'r2' },
    { id: 't2', text: 'حجز موعد التلقيح للصغيرة', done: false },
    { id: 't3', text: 'إرجاع كتب المكتبة', done: false },
    { id: 't5', text: 'سقي النباتات', done: false, rid: 'r1' },
    { id: 't4', text: 'شراء هدية سلمى', done: true },
  ],
  shopping: [
    { id: 's1', text: 'خبز', done: false },
    { id: 's2', text: 'نعناع', done: false },
    { id: 's3', text: 'حليب', done: false },
    { id: 's4', text: 'زيت الزيتون', done: false },
    { id: 's5', text: 'طماطم', done: true },
    { id: 's6', text: 'بيض', done: false },
  ],
};

export function lists() {
  return store.get('demo-lists', JSON.parse(JSON.stringify(DEFAULT_LISTS)));
}

export function listOp(body) {
  const data = lists();
  const items = data[body.list] || [];
  if (body.op === 'add') items.unshift({ id: 'd' + Date.now().toString(36), text: body.text, done: false });
  if (body.op === 'toggle') { const it = items.find((x) => x.id === body.id); if (it) it.done = !it.done; }
  if (body.op === 'remove') data[body.list] = items.filter((x) => x.id !== body.id);
  else if (body.op === 'clearDone') data[body.list] = items.filter((x) => !x.done);
  else data[body.list] = items;
  store.set('demo-lists', data);
  return data;
}

export function photos() {
  const base = (window.FRAME_DEMO_BASE || '') + 'demo/';
  return { photos: [1, 2, 3, 4].map((i) => ({ id: 'demo' + i, src: base + 'photo-' + i + '.jpg' })) };
}

// ---------- control-panel data kept in this browser for the preview ----------
function sampleEvents() {
  const p = parts(now() + 2 * DAY);
  return [
    { id: 'e1', name: 'عيد ميلاد سلمى', date: String(p.m).padStart(2, '0') + '-' + String(p.d).padStart(2, '0') },
    { id: 'e2', name: 'ذكرى زواج الوالدين', date: '06-21' },
  ];
}
// No sample message: like a fresh frame, the clock screen shows the verse of the day until
// someone writes one in the control panel.
const SAMPLE_MESSAGE = null;

export const events = () => store.get('demo-events', sampleEvents());
export const settings = () => store.get('demo-settings', {});
export const message = () => store.get('demo-message', SAMPLE_MESSAGE);

// Repeating tasks in the preview work like the real ones: a task due today goes on the list,
// and `next` is the following due day.
export const routines = () => store.get('demo-routines', sampleRoutines()).map((r) => {
  // Repairs dates saved by older previews (they always said "today").
  const today = dayKey(now());
  if (!r.next || r.next <= today) r.next = dueFrom(r, today);
  return r;
});
const sampleRoutines = () => ([
  { id: 'r1', text: 'سقي النباتات', kind: 'days', every: 3, start: dayKey(now()), next: addDays(dayKey(now()), 3) },
  { id: 'r2', text: 'أداء فاتورة الكهرباء', kind: 'monthly', day: 5, next: dueFrom({ kind: 'monthly', day: 5 }, addDays(dayKey(now()), 1)) },
]);
export function routinesOp(body) {
  let list = routines();
  const today = dayKey(now());
  if (body.op === 'add') {
    const r = { id: 'r' + Date.now().toString(36), text: body.text, kind: body.kind, start: body.start && body.start > today ? body.start : today };
    if (body.kind === 'days') r.every = body.every;
    if (body.kind === 'weekly') r.weekday = body.weekday;
    if (body.kind === 'monthly') r.day = body.day;
    r.next = dueFrom(r, today);
    if (r.next === today) {
      const data = lists();
      if (!data.tasks.some((x) => !x.done && x.text === r.text)) data.tasks.unshift({ id: 'd' + Date.now().toString(36), text: r.text, done: false, rid: r.id });
      store.set('demo-lists', data);
      r.next = dueFrom(r, addDays(today, 1));
    }
    list.push(r);
  }
  if (body.op === 'remove') list = list.filter((r) => r.id !== body.id);
  store.set('demo-routines', list);
  return { routines: list, lists: lists() };
}

export function board() {
  return {
    lists: lists(), settings: settings(), events: events(), message: message(), routines: routines(),
    quran: store.get('demo-quran', null), audio: {}, preview: preview(), frameSeen: now() - 60000, frameAudio: 'ok', now: now(),
  };
}

// Previews in demo mode: the demo control panel and the demo frame (/?demo) share this
// browser's storage, so the frame picks them up straight away.
export function preview() {
  const p = store.get('demo-preview', null);
  return p && p.until > Date.now() ? p : null;
}
export function setPreview(what, minutes) {
  const p = what === 'none' ? null : { id: 'p' + Date.now().toString(36), what, until: Date.now() + (minutes || 10) * 60000 };
  store.set('demo-preview', p);
  return p;
}

export function saveSettings(s) { store.set('demo-settings', s); return s; }
export function eventsOp(body) {
  let list = events();
  if (body.op === 'add') list.push({ id: 'd' + Date.now().toString(36), name: body.name, date: body.date });
  if (body.op === 'remove') list = list.filter((e) => e.id !== body.id);
  if (body.op === 'import') {
    list = list.filter((e) => e.src !== body.source)
      .concat(body.events.map((e, i) => Object.assign({ id: 'i' + Date.now().toString(36) + i, src: body.source }, e)));
  }
  if (body.op === 'removeSource') list = list.filter((e) => e.src !== body.source);
  list.sort((a, b) => (a.date.slice(-5) < b.date.slice(-5) ? -1 : 1));
  store.set('demo-events', list);
  return list;
}
export function setMessage(text, hours) {
  const m = { text, at: Date.now(), until: hours ? Date.now() + hours * 3600000 : null };
  store.set('demo-message', m);
  return m;
}
export function clearMessage() { store.set('demo-message', null); return null; }
