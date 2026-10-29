// Sample data for previewing the dashboard without a backend (open with ?demo).
import { startOfDay, now, parts, dayKey, DAY, MINUTE, HOUR, store } from './util.js';
import { dueFrom, addDays } from './routines.js';
import { previewMatch, PREVIEW_MS } from './match-common.js';
import { tileCount, PATTERN_COUNT, weekIndex } from './zellige.js';
import { DEFAULT_FAVS, SCHEDULE_SUGGESTIONS } from './quran-common.js';

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

// «نبضة» in demo mode: moments live in this browser's storage, so the demo control panel and
// the demo frame (/?demo) in another tab see each other's moments at once (storage events).
// Voice notes are kept as data: URLs (a 15-second note is about 60 KB).
const PULSE_KEEP = 40;
export function pulses(since) {
  releaseLater();
  const week = Date.now() - 7 * DAY;
  return store.get('demo-pulses', []).filter((p) => p.at > (since || 0) && p.at > week);
}
export function pulseAdd(p) {
  const list = pulses(0);
  const at = Math.max(Date.now(), list.length ? list[list.length - 1].at + 1 : 0);
  if (list.some((x) => x.from === p.from && x.kind === p.kind && x.to === p.to && at - x.at < 2000)) {
    const e = new Error('لحظة… أُرسلت للتو.');
    e.status = 429;
    throw e;
  }
  const pulse = Object.assign({ id: at.toString(36) + Math.random().toString(36).slice(2, 6), at }, p);
  list.push(pulse);
  while (list.length > PULSE_KEEP) list.shift();
  try { localStorage.setItem('fd:demo-pulses', JSON.stringify(list)); } catch (e) {
    // Storage full (voice notes): drop the oldest voice notes and try once more.
    const lean = list.filter((x, i) => !x.audioData || i >= list.length - 4);
    store.set('demo-pulses', lean);
  }
  return { pulse, live: Date.now() - store.get('demo-frame-alive', 0) < 12000 ? 1 : 0 };
}

// A child's drawing for the preview: a heart, the house, the sun and some grass.
export function sampleDrawing() {
  const strokes = [];
  let t = 0;
  const stroke = (c, w, pts) => {
    const p = [];
    for (const [x, y] of pts) { p.push(Math.round(x), Math.round(y), t); t += 18; }
    t += 350;
    strokes.push({ c, w, p });
  };
  const heart = [];
  for (let i = 0; i <= 80; i++) {
    const a = (i / 80) * 2 * Math.PI;
    const x = 16 * Math.pow(Math.sin(a), 3), y = 13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a);
    heart.push([280 + x * 11, 420 - y * 14]);
  }
  stroke(5, 2, heart);
  stroke(0, 1, [[560, 720], [560, 450], [700, 320], [840, 450], [840, 720], [560, 720]]);
  stroke(1, 1, [[665, 720], [665, 600], [735, 600], [735, 720]]);
  stroke(4, 1, [[600, 520], [640, 520], [640, 560], [600, 560], [600, 520]]);
  const sun = [];
  for (let i = 0; i <= 40; i++) { const a = (i / 40) * 2 * Math.PI; sun.push([880 + 55 * Math.cos(a), 170 + 73 * Math.sin(a)]); }
  stroke(1, 2, sun);
  const grass = [];
  for (let i = 0; i < 30; i++) grass.push([70 + i * 30, 890 - (i % 2) * 60]);
  stroke(3, 1, grass);
  return strokes;
}

// ---------- «عجلة الحظ», «الدقّة السرية», «وضع الماتش» in demo mode ----------
const DEMO_WHEELS = [
  { id: 'demowheel1', name: 'من يغسل الصحون؟', items: ['ماما', 'بابا', 'سلمى', 'يوسف'] },
  { id: 'demowheel2', name: 'أين نخرج يوم الأحد؟', items: ['البحر', 'الغابة', 'عند الجدة', 'المدينة القديمة', 'السينما', 'الحديقة'] },
];
export function wheels() { return store.get('demo-wheels', DEMO_WHEELS); }
export function saveWheels(list) { store.set('demo-wheels', list); return list; }
export function spin(wheelId, from) {
  const w = wheels().find((x) => x.id === wheelId);
  if (!w) throw new Error('That wheel is gone.');
  const idx = Math.floor(Math.random() * w.items.length);
  return pulseAdd({ kind: 'spin', from: from || 'البيت', wheel: w.id, wheelName: w.name, items: w.items, idx, result: w.items[idx] });
}
export const phones = () => ['ماما', 'بابا', 'جدتي'];

// The demo's match: the 3-minute practice match when started, otherwise one tonight at 21:00.
export function match() {
  const cfg = Object.assign({ on: true, push: true }, store.get('demo-match-cfg', {}));
  const start = store.get('demo-match-start', 0);
  const t = Date.now();
  if (start && t - start < PREVIEW_MS + 15000) return { on: true, cfg, mode: 'live', match: previewMatch(start, t), now: t, cheers: store.get('demo-cheers', []).filter((c) => t - c.at < 120000) };
  if (!cfg.on) return { on: false, cfg, mode: 'none', match: null, now: t, cheers: [] };
  const kick = today() + 21 * HOUR;
  const m = previewMatch(kick + 10 * MINUTE, kick + 10 * MINUTE);
  Object.assign(m, { id: 'demo-tonight', comp: 'مباراة ودية', kickoff: kick, state: 'pre', status: 'STATUS_SCHEDULED', clock: '', period: 0, goals: [], preview: false, phase: '' });
  m.mar.score = 0;
  m.opp = { name: 'مالي', abbr: 'MLI', logo: '', score: 0, home: false };
  return { on: true, cfg, mode: t < kick - 15 * MINUTE ? 'today' : 'none', match: m, now: t, cheers: [] };
}
export function matchPreview(stop) { store.set('demo-match-start', stop ? 0 : Date.now()); return match(); }
export function matchCfg(c) { store.set('demo-match-cfg', Object.assign(store.get('demo-match-cfg', {}), c)); return match(); }
export function cheer(from, key) {
  const list = store.get('demo-cheers', []).filter((c) => Date.now() - c.at < 120000);
  const c = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), from, cheer: key, at: Date.now() };
  list.push(c);
  store.set('demo-cheers', list.slice(-30));
  return { cheer: c, live: Date.now() - store.get('demo-frame-alive', 0) < 12000 ? 1 : 0 };
}

// ---------- surprises, statuses and colouring in demo mode ----------
export function later(from) { return store.get('demo-later', []).filter((x) => !from || x.from === from); }
export function schedule(p, due) {
  const list = later();
  const item = Object.assign({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }, p, { due, sched: true, sentAt: Date.now() });
  list.push(item);
  list.sort((a, b) => a.due - b.due);
  store.set('demo-later', list);
  return { later: item, live: 0 };
}
export function cancelLater(id) { store.set('demo-later', later().filter((x) => x.id !== id)); }
function releaseLater() {
  const list = store.get('demo-later', []);
  const due = list.filter((x) => x.due <= Date.now());
  if (!due.length) return;
  store.set('demo-later', list.filter((x) => x.due > Date.now()));
  for (const x of due) { const p = Object.assign({}, x); delete p.due; delete p.id; try { pulseAdd(p); } catch (e) { /* skip */ } }
}

export function statuses() {
  const all = store.get('demo-statuses', null) || { 'سلمى': { text: 'في الامتحان', emoji: '📚', until: today() + 12 * HOUR, at: Date.now() - HOUR } };
  return Object.keys(all).filter((n) => all[n].until > Date.now()).map((n) => Object.assign({ name: n }, all[n])).sort((a, b) => b.at - a.at);
}
export function setStatus(from, text, emoji, until) {
  const all = {};
  for (const x of statuses()) all[x.name] = { text: x.text, emoji: x.emoji, until: x.until, at: x.at };
  if (text) all[from] = { text, emoji, until, at: Date.now() }; else delete all[from];
  store.set('demo-statuses', all);
  return { statuses: statuses() };
}

export function coloring() {
  const week = weekIndex(Date.now());
  let page = store.get('demo-coloring', null);
  if (!page || page.week !== week) {
    page = { pid: week % PATTERN_COUNT, week, fills: {}, who: {}, v: 0, doneAt: 0, savedAt: 0 };
    // A few tiles already coloured, so the preview isn't blank.
    [0, 1, 3, 5, 9, 10, 14, 18].forEach((t, i) => { page.fills[t] = [0, 2, 1, 7, 0, 2, 6, 3][i]; });
    page.who = { 'سلمى': 5, 'جدتي': 3 };
    store.set('demo-coloring', page);
  }
  return { page, archive: [], tiles: tileCount(page.pid), week };
}
export function colorFill(tile, color, from) {
  const page = coloring().page;
  if (color < 0) delete page.fills[tile]; else page.fills[tile] = color;
  page.who[from] = (page.who[from] || 0) + 1;
  page.v++;
  page.doneAt = Object.keys(page.fills).length >= tileCount(page.pid) ? Date.now() : 0;
  store.set('demo-coloring', page);
  return { v: page.v, done: !!page.doneAt };
}
export function colorNew() {
  const old = coloring().page;
  store.set('demo-coloring', { pid: (old.pid + 1) % PATTERN_COUNT, week: old.week, fills: {}, who: {}, v: old.v + 1, doneAt: 0, savedAt: 0 });
  return coloring();
}

// ---------- «القرآن» in demo mode (same rules as the server) ----------
export function quran() {
  const st = store.get('demo-quran', null) || {};
  const cfg = Object.assign({ favs: DEFAULT_FAVS.slice(), mode: 'list', volume: 0.8, schedules: SCHEDULE_SUGGESTIONS.map((x, i) => Object.assign({ id: 'demosched' + i, on: true }, x)), reciter: 'nufais' }, st.cfg);
  return { cfg, play: st.play || null, status: st.status || null };
}
function saveQuran(q) { store.set('demo-quran', q); return q; }
export function quranCfg(c) { const q = quran(); Object.assign(q.cfg, c); return saveQuran(q); }
export function quranCmd(b) {
  const q = quran();
  const a = b.action;
  if (a === 'play') {
    const list = b.list ? b.list.slice() : [b.surah];
    q.play = { id: Date.now().toString(36), list, idx: Math.min(list.length - 1, b.idx || 0), mode: b.mode || (list.length > 1 ? (q.cfg.mode === 'one' ? 'list' : q.cfg.mode) : 'one'), by: b.from || 'البيت', at: Date.now(), paused: false, rev: 0 };
    q.status = null;
  } else if (a === 'volume') q.cfg.volume = Math.min(1, Math.max(0, b.volume));
  else if (q.play) {
    if (a === 'pause') q.play.paused = true;
    else if (a === 'resume') q.play.paused = false;
    else if (a === 'stop') q.play = null;
    else if (a === 'next' || a === 'prev') {
      let i = q.play.idx + (a === 'next' ? 1 : -1);
      if (i >= q.play.list.length) i = q.play.mode === 'repeat' ? 0 : -1;
      if (i < 0 && a === 'prev') i = 0;
      if (i < 0) q.play = null; else { q.play.idx = i; q.play.paused = false; q.status = null; }
    }
    if (q.play) q.play.rev = (q.play.rev || 0) + 1;
  }
  return saveQuran(q);
}
export function quranStatus(s) {
  const q = quran();
  if (!q.play || q.play.id !== s.id) return;
  if (s.state === 'ended') { q.play = null; q.status = null; } else { q.play.idx = s.idx; q.status = Object.assign({ at: Date.now() }, s); }
  // (no storage event for the frame's own progress every second)
  try { localStorage.setItem('fd:demo-quran', JSON.stringify(q)); } catch (e) { /* full */ }
}
