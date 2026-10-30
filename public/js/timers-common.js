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
