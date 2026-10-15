// Turns an .ics calendar file into entries for the frame's month calendar.
// Runs in the control panel (on the phone), so the server only stores the result.
import config from './config.js';
import { parseICS, expand, setFixedOffsets } from './ics.js';
import { parts, startOfDay, now, DAY } from './util.js';
import { occasions, holidayKey, MATCH_DAYS } from './holidays.js';

const TZ = config.timezone;
const MAX_ENTRIES = 500;
const pad = (n) => String(n).padStart(2, '0');
const ymd = (p) => p.y + '-' + pad(p.m) + '-' + pad(p.d);
const hm = (p) => pad(p.h) + ':' + pad(p.mi);
const cleanName = (s) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 100) || 'موعد';

// A plain "every year on this date" rule (birthdays, anniversaries): stored once as MM-DD.
function isSimpleYearly(ev) {
  const r = ev.rule;
  if (!r || r.freq !== 'YEARLY' || r.interval !== 1 || r.count || r.until || r.byday) return false;
  if (r.bymonth && (r.bymonth.length !== 1 || r.bymonth[0] !== ev.start.m)) return false;
  if (r.bymonthday && (r.bymonthday.length !== 1 || r.bymonthday[0] !== ev.start.d)) return false;
  return true;
}

// Is this imported entry one of the holidays the frame already knows, on (about) the same dates?
const dayMs = (iso) => startOfDay(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10), 12));
function isBuiltInHoliday(e) {
  const key = holidayKey(e.name);
  if (!key) return false;
  const iso = e.date.length === 5 ? parts(now()).y + '-' + e.date : e.date;
  const first = dayMs(iso), last = e.end ? dayMs(e.end) : first;
  const around = occasions(first - 3 * DAY, last + 4 * DAY, []);
  for (const [k, list] of around) {
    for (const h of list) {
      if (h.key !== key) continue;
      const t = dayMs(k);
      const gap = t < first ? (first - t) / DAY : t > last ? (t - last) / DAY : 0;
      if (gap <= MATCH_DAYS[h.kind]) return true;
    }
  }
  return false;
}

// Returns { entries: [{name, date, time?, end?}], stats } covering about a month back
// to a year ahead. Repeating events are spread out over that window.
export function importICS(text) {
  // Morocco has been on GMT since September 2026; don't trust older time-zone data.
  setFixedOffsets('Africa/Casablanca=' + config.utcOffsetMinutes);
  const events = parseICS(text, TZ);
  if (!events.length) throw new Error('لا توجد مواعيد في هذا الملف. تأكد أنه ملف تقويم (ics).');

  const today = startOfDay(now());
  const from = today - 31 * DAY;
  const to = today + 366 * DAY;
  const entries = [];
  const seen = new Set();
  const push = (e) => {
    const k = e.name + '|' + e.date + '|' + (e.time || '');
    if (seen.has(k)) return;
    seen.add(k);
    entries.push(e);
  };

  const yearlyUids = new Set();
  let yearly = 0;
  for (const ev of events) {
    if (ev.status === 'CANCELLED' || ev.recurrenceId || !isSimpleYearly(ev)) continue;
    yearlyUids.add(ev.uid);
    const p = ev.start.allDay ? ev.start : parts(ev.start.utc);
    push(Object.assign({ name: cleanName(ev.title), date: pad(p.m) + '-' + pad(p.d) }, ev.start.allDay ? {} : { time: hm(p) }));
    yearly++;
  }

  const rest = events.filter((ev) => !yearlyUids.has(ev.uid));
  for (const inst of expand(rest, from, to)) {
    const s = parts(inst.start);
    const e = { name: cleanName(inst.title), date: ymd(s) };
    if (!inst.allDay) e.time = hm(s);
    // Last day the event touches (end is exclusive), for trips and multi-day events.
    const lastMs = Math.max(inst.start, inst.end - (inst.allDay ? DAY : 60000));
    const lp = parts(lastMs);
    const last = ymd(lp);
    if (last > e.date) {
      const span = Math.round((startOfDay(lastMs) - startOfDay(inst.start)) / DAY);
      e.end = span > 366 ? ymd(parts(inst.start + 366 * DAY)) : last;
    }
    push(e);
  }

  // Public holidays the frame already shows (many school and work calendars list them too).
  const own = entries.filter((e) => !isBuiltInHoliday(e));
  const holidays = entries.length - own.length;

  own.sort((a, b) => (a.date.length - b.date.length) || (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const dropped = Math.max(0, own.length - MAX_ENTRIES);
  const kept = own.slice(0, MAX_ENTRIES);
  const dated = kept.filter((e) => e.date.length === 10);
  return {
    entries: kept,
    stats: {
      total: kept.length,
      yearly,
      holidays,
      first: dated.length ? dated[0].date : null,
      last: dated.length ? dated[dated.length - 1].date : null,
      dropped,
    },
  };
}
