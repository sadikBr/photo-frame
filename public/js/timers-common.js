// «مؤقّت»: the timers' rules, shared by the server (pulse-hub.js), the frame (frame-timers.js), the
// control panel (admin-timers.js) and the preview pages (demo.js), so they all agree.
//
// A timer: { id, label, by, total, end, left, snoozed, rang }
//   running: end = when it rings (ms); paused: end = 0 and left = ms still to go.
//   by: the name of whoever started it from a phone ('' from the frame) — they get a
//   notification when it rings; rang: that notification went out.
//
// timerOp(list, body, now) → { list } or { error }. Ops:
//   {op:"add", minutes, label?, by?}        start one (1–240 minutes; at most MAX_TIMERS)
//   {op:"more", id, minutes?}               add time (1 minute by default)
//   {op:"pause", id} · {op:"resume", id}
//   {op:"cancel", id}
//   {op:"stop", ids?}                       silence the ringing ones (or those ids)
//   {op:"snooze", minutes, ids?}            ring again later (1–30 minutes)
export const MAX_TIMERS = 6;
export const TIMER_LABELS = ['أتاي', 'الطبخ', 'الفرن', 'الخبز', 'الغسيل', 'الأطفال'];
export const TIMER_PRESETS = [1, 3, 5, 10, 15, 20, 30, 45, 60];
export const SNOOZES = [1, 5, 10];
const MIN = 60000;
const STALE = 30 * MIN; // one that ended this long ago and was never stopped is dropped

const text = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
const newId = (t) => 't' + t.toString(36) + Math.random().toString(36).slice(2, 5);
export const timerEnded = (x, t) => !!x.end && x.end <= t;
export const timerLeft = (x, t) => (x.end ? x.end - t : x.left);

// Drops broken entries and long-forgotten rings; keeps the order they were started in.
export function cleanTimers(list, t) {
  return (Array.isArray(list) ? list : []).filter((x) => x && typeof x.id === 'string' && x.total > 0
    && (x.end > 0 || x.left > 0) && !(x.end && t - x.end > STALE)).slice(0, MAX_TIMERS);
}

export function timerOp(input, body, t) {
  const list = cleanTimers(input, t).map((x) => Object.assign({}, x));
  const b = body || {};
  const find = () => list.find((x) => x.id === b.id);
  const ids = Array.isArray(b.ids) ? b.ids.map(String) : null;
  const ringing = (x) => timerEnded(x, t) && (!ids || ids.includes(x.id));
  const mins = (v, lo, hi, dflt) => { const n = Math.round(Number(v == null ? dflt : v)); return Number.isFinite(n) && n >= lo && n <= hi ? n : null; };
  switch (b.op) {
    case 'add': {
      const m = mins(b.minutes, 1, 240);
      if (m == null) return { error: 'Choose 1 to 240 minutes.' };
      if (list.length >= MAX_TIMERS) return { error: 'يكفي ' + MAX_TIMERS + ' مؤقّتات في وقت واحد. أوقفوا واحداً أولاً.' };
      const x = { id: newId(t), label: text(b.label, 20), by: text(b.by, 24), total: m * MIN, end: t + m * MIN, left: 0, snoozed: false, rang: false };
      list.push(x);
      return { list, timer: x };
    }
    case 'more': {
      const x = find();
      if (!x) return { error: 'That timer is gone.' };
      const m = mins(b.minutes, 1, 60, 1);
      if (m == null) return { error: 'Add 1 to 60 minutes.' };
      if (x.end) x.end = Math.max(x.end, t) + m * MIN; else x.left += m * MIN;
      x.total = Math.max(x.total, timerLeft(x, t));
      x.rang = false;
      return { list };
    }
    case 'pause': case 'resume': {
      const x = find();
      if (!x) return { error: 'That timer is gone.' };
      if (timerEnded(x, t)) return { list };
      if (b.op === 'pause' && x.end) { x.left = x.end - t; x.end = 0; }
      if (b.op === 'resume' && !x.end) { x.end = t + x.left; x.left = 0; }
      return { list };
    }
    case 'cancel':
      return { list: list.filter((x) => x.id !== b.id) };
    case 'stop':
      return { list: list.filter((x) => !ringing(x)) };
    case 'snooze': {
      const m = mins(b.minutes, 1, 30, 5);
      if (m == null) return { error: 'Snooze 1 to 30 minutes.' };
      for (const x of list) if (ringing(x)) { x.end = t + m * MIN; x.total = m * MIN; x.snoozed = true; x.rang = false; }
      return { list };
    }
    default:
      return { error: 'Unknown timer op.' };
  }
}

// "4:05", "12:30", "1:05:00" (Western digits, like the clock).
export function fmtTimer(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
  const p2 = (n) => String(n).padStart(2, '0');
  return hh ? hh + ':' + p2(mm) + ':' + p2(ss) : mm + ':' + p2(ss);
}
export const minutesAr = (m) => (m === 1 ? 'دقيقة' : m === 2 ? 'دقيقتان' : m <= 10 ? m + ' دقائق' : m + ' دقيقة');
export const timerName = (x) => x.label || minutesAr(Math.max(1, Math.round(x.total / MIN)));

// ---------- «منبّه يومي»: a daily alarm at a set time (the pill at 21:00) ----------
// An alarm: { id, label, time: "HH:MM" (the frame's local time), days: [0–6] (Sunday = 0; empty =
// every day), on, by, ringDay, doneDay }. The frame rings it when its clock reaches the time
// (or up to ALARM_WINDOW minutes later, if it was off), unless it was already stopped that day.
// ringDay: the day the frame last rang it (the phone that set it is told, once); doneDay: the day
// someone stopped it.
//
// alarmOp(list, body) → { list } or { error }. Ops:
//   {op:"add", label, time, days?, by?} · {op:"update", id, label?, time?, days?, on?}
//   {op:"remove", id} · {op:"ring", id, day} · {op:"done", id, day}
export const MAX_ALARMS = 20;
export const ALARM_WINDOW = 30; // minutes after the time when a missed alarm still rings
export const ALARM_LABELS = ['الدواء', 'حبوب الحمل', 'الفيتامين', 'قياس السكر', 'سقي النباتات'];
export const DAY_SHORT = ['ح', 'ن', 'ث', 'ر', 'خ', 'ج', 'س']; // Sunday first, like Date.getDay()
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAYKEY = /^\d{4}-\d{2}-\d{2}$/;

const cleanDays = (v) => [...new Set((Array.isArray(v) ? v : []).map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
export function cleanAlarms(list) {
  return (Array.isArray(list) ? list : []).filter((x) => x && typeof x.id === 'string' && HHMM.test(x.time)).slice(0, MAX_ALARMS)
    .map((x) => ({ id: x.id, label: text(x.label, 30), time: x.time, days: cleanDays(x.days).length === 7 ? [] : cleanDays(x.days), on: x.on !== false, by: text(x.by, 24), ringDay: DAYKEY.test(x.ringDay) ? x.ringDay : '', doneDay: DAYKEY.test(x.doneDay) ? x.doneDay : '' }));
}

export function alarmOp(input, body, t) {
  const list = cleanAlarms(input);
  const b = body || {};
  const x = list.find((y) => y.id === b.id);
  switch (b.op) {
    case 'add': {
      if (list.length >= MAX_ALARMS) return { error: 'يكفي ' + MAX_ALARMS + ' منبّهاً.' };
      if (!HHMM.test(String(b.time))) return { error: 'اختر الساعة.' };
      const label = text(b.label, 30);
      if (!label) return { error: 'اكتب ما يذكّر به المنبّه.' };
      const a = cleanAlarms([{ id: 'a' + (t || Date.now()).toString(36) + Math.random().toString(36).slice(2, 5), label, time: b.time, days: b.days, on: true, by: b.by }])[0];
      list.push(a);
      list.sort((p, q) => p.time.localeCompare(q.time));
      return { list, alarm: a };
    }
    case 'update': {
      if (!x) return { error: 'That alarm is gone.' };
      if (b.time != null) { if (!HHMM.test(String(b.time))) return { error: 'اختر الساعة.' }; x.time = b.time; x.ringDay = ''; x.doneDay = ''; }
      if (b.label != null) { const l = text(b.label, 30); if (!l) return { error: 'اكتب ما يذكّر به المنبّه.' }; x.label = l; }
      if (b.days != null) x.days = cleanDays(b.days).length === 7 ? [] : cleanDays(b.days);
      if (b.on != null) x.on = !!b.on;
      list.sort((p, q) => p.time.localeCompare(q.time));
      return { list };
    }
    case 'remove':
      return { list: list.filter((y) => y.id !== b.id) };
    case 'ring': case 'done': {
      if (!x) return { error: 'That alarm is gone.' };
      if (!DAYKEY.test(String(b.day))) return { error: 'Which day?' };
      if (b.op === 'ring') { x.firstRing = x.ringDay !== b.day; x.ringDay = b.day; } else x.doneDay = b.day;
      const out = { list: list.map((y) => { const c = Object.assign({}, y); delete c.firstRing; return c; }) };
      if (b.op === 'ring') out.firstRing = x.firstRing;
      return out;
    }
    default:
      return { error: 'Unknown alarm op.' };
  }
}

// Is this alarm ringing now? w = the frame's local {day: "YYYY-MM-DD", wd: 0–6, minutes: since midnight}.
export function alarmRinging(a, w) {
  if (!a.on || a.doneDay === w.day) return false;
  if (a.days.length && !a.days.includes(w.wd)) return false;
  const [hh, mm] = a.time.split(':').map(Number);
  const m = hh * 60 + mm;
  return w.minutes >= m && w.minutes < m + ALARM_WINDOW;
}
// «كل يوم», «أيام العمل», «ن ث ر»…
export function daysAr(days) {
  if (!days || !days.length || days.length === 7) return 'كل يوم';
  const k = days.join(',');
  if (k === '1,2,3,4,5') return 'من الإثنين إلى الجمعة';
  if (k === '0,6') return 'نهاية الأسبوع';
  const names = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  return days.map((d) => names[d]).join('، ');
}
