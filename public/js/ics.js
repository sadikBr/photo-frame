// Minimal iCalendar (.ics) reader, used by the control panel to import calendar files.
// Handles what Google / Apple / Outlook calendar feeds actually use:
// all-day and timed events, TZID / UTC / floating times, DURATION,
// RRULE (DAILY, WEEKLY, MONTHLY, YEARLY with INTERVAL, COUNT, UNTIL,
// BYDAY incl. ordinals, BYMONTHDAY, BYMONTH), EXDATE, RECURRENCE-ID
// overrides and cancelled events. No dependencies.

const DAY = 86400000;
const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

// ---------- time zone helpers ----------
// Zones pinned to a fixed UTC offset (minutes). Used when the runtime's time-zone data may be
// out of date, e.g. Morocco's move to permanent GMT on 20 September 2026.
const FIXED = new Map();
export function setFixedOffsets(spec) {
  FIXED.clear();
  for (const part of String(spec || '').split(/[,;\n]+/)) {
    const m = /^\s*([A-Za-z_\/+-]+)\s*=\s*([+-]?\d+)\s*$/.exec(part);
    if (m) FIXED.set(m[1], +m[2]);
  }
}
// Outlook / Exchange feeds use Windows zone names.
const ALIASES = {
  'Morocco Standard Time': 'Africa/Casablanca',
  'GMT Standard Time': 'Europe/London',
  'Greenwich Standard Time': 'Atlantic/Reykjavik',
  'Romance Standard Time': 'Europe/Paris',
  'W. Europe Standard Time': 'Europe/Berlin',
  'Arab Standard Time': 'Asia/Riyadh',
  'Arabian Standard Time': 'Asia/Dubai',
  'Eastern Standard Time': 'America/New_York',
};
export function resolveTz(tz) {
  if (!tz) return null;
  const name = ALIASES[tz] || tz;
  return FIXED.has(name) || validTz(name) ? name : null;
}

const dtfCache = new Map();
function dtf(tz) {
  let f = dtfCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric',
    });
    dtfCache.set(tz, f);
  }
  return f;
}

export function validTz(tz) {
  if (!tz) return false;
  if (FIXED.has(tz)) return true;
  try { dtf(tz); return true; } catch (e) { return false; }
}

// Wall-clock parts of a UTC instant in a zone.
export function zonedParts(ms, tz) {
  if (FIXED.has(tz)) {
    const d = new Date(ms + FIXED.get(tz) * 60000);
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), s: d.getUTCSeconds() };
  }
  const p = {};
  for (const x of dtf(tz).formatToParts(new Date(ms))) p[x.type] = x.value;
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, s: +p.second };
}

function offsetAt(tz, ms) {
  const p = zonedParts(ms, tz);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000;
}

// Wall-clock time in a zone -> UTC milliseconds.
export function wallToUtc(y, m, d, h, mi, s, tz) {
  if (FIXED.has(tz)) return Date.UTC(y, m - 1, d, h, mi, s) - FIXED.get(tz) * 60000;
  const guess = Date.UTC(y, m - 1, d, h, mi, s);
  const off1 = offsetAt(tz, guess);
  let t = guess - off1;
  const off2 = offsetAt(tz, t);
  if (off2 !== off1) t = guess - off2;
  return t;
}

// Day number (days since epoch) for a calendar date; weekday 0 = Sunday.
const dayNum = (y, m, d) => Math.floor(Date.UTC(y, m - 1, d) / DAY);
const fromDayNum = (n) => {
  const dt = new Date(n * DAY);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate(), wd: dt.getUTCDay() };
};
const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

// ---------- parsing ----------
function unescapeText(v) {
  return v.replace(/\\([nN,;\\])/g, (_, c) => (c === 'n' || c === 'N' ? '\n' : c));
}

function parseLine(line) {
  // NAME;PARAM=a;PARAM2="b:c":VALUE
  let i = 0, inQ = false;
  for (; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQ = !inQ;
    else if (c === ':' && !inQ) break;
  }
  const head = line.slice(0, i);
  const value = line.slice(i + 1);
  const parts = head.split(';');
  const name = parts.shift().toUpperCase();
  const params = {};
  for (const p of parts) {
    const eq = p.indexOf('=');
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, '');
  }
  return { name, params, value };
}

// Returns {allDay, y,m,d,h,mi,s, tz, utc} — utc is the instant (start of day in tz for all-day).
function parseDate(prop, defaultTz) {
  const v = prop.value.trim();
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?/.exec(v);
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (!m[4] || prop.params.VALUE === 'DATE') {
    return { allDay: true, y, m: mo, d, h: 0, mi: 0, s: 0, tz: defaultTz, utc: wallToUtc(y, mo, d, 0, 0, 0, defaultTz) };
  }
  const h = +m[4], mi = +m[5], s = +(m[6] || 0);
  if (m[7]) {
    const utc = Date.UTC(y, mo - 1, d, h, mi, s);
    const w = zonedParts(utc, defaultTz);
    return { allDay: false, ...w, tz: defaultTz, utc };
  }
  const tz = resolveTz(prop.params.TZID) || defaultTz;
  return { allDay: false, y, m: mo, d, h, mi, s, tz, utc: wallToUtc(y, mo, d, h, mi, s, tz) };
}

function parseDuration(v) {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(v.trim());
  if (!m) return 0;
  const sign = m[1] === '-' ? -1 : 1;
  return sign * (((+m[2] || 0) * 7 + (+m[3] || 0)) * DAY + (+m[4] || 0) * 3600000 + (+m[5] || 0) * 60000 + (+m[6] || 0) * 1000);
}

function parseRule(v) {
  const r = {};
  for (const part of v.split(';')) {
    const [k, val] = part.split('=');
    if (k && val !== undefined) r[k.toUpperCase()] = val;
  }
  const rule = {
    freq: r.FREQ,
    interval: Math.max(1, +r.INTERVAL || 1),
    count: r.COUNT ? +r.COUNT : 0,
    until: null,
    byday: r.BYDAY ? r.BYDAY.split(',').map((x) => {
      const mm = /^([+-]?\d+)?([A-Z]{2})$/.exec(x.trim());
      return mm ? { n: mm[1] ? +mm[1] : 0, wd: WEEKDAYS.indexOf(mm[2]) } : null;
    }).filter((x) => x && x.wd >= 0) : null,
    bymonthday: r.BYMONTHDAY ? r.BYMONTHDAY.split(',').map(Number) : null,
    bymonth: r.BYMONTH ? r.BYMONTH.split(',').map(Number) : null,
    wkst: WEEKDAYS.indexOf(r.WKST || 'MO'),
  };
  if (r.UNTIL) {
    const mm = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z?)?/.exec(r.UNTIL);
    if (mm) rule.until = Date.UTC(+mm[1], +mm[2] - 1, +mm[3], +(mm[4] || 23), +(mm[5] || 59), +(mm[6] || 59));
  }
  return rule;
}

export function parseICS(text, defaultTz) {
  const lines = text.replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  const events = [];
  let cur = null, depth = 0;
  for (const raw of lines) {
    if (!raw) continue;
    const line = parseLine(raw);
    if (line.name === 'BEGIN') {
      if (line.value.toUpperCase() === 'VEVENT' && !cur) { cur = { exdates: [] }; depth = 0; }
      else if (cur) depth++;
      continue;
    }
    if (line.name === 'END') {
      if (cur && depth === 0 && line.value.toUpperCase() === 'VEVENT') { events.push(cur); cur = null; }
      else if (cur) depth--;
      continue;
    }
    if (!cur || depth > 0) continue; // skip VALARM etc.
    switch (line.name) {
      case 'UID': cur.uid = line.value; break;
      case 'SUMMARY': cur.title = unescapeText(line.value); break;
      case 'LOCATION': cur.location = unescapeText(line.value); break;
      case 'STATUS': cur.status = line.value.toUpperCase(); break;
      case 'DTSTART': cur.start = parseDate(line, defaultTz); break;
      case 'DTEND': cur.end = parseDate(line, defaultTz); break;
      case 'DURATION': cur.duration = parseDuration(line.value); break;
      case 'RRULE': cur.rule = parseRule(line.value); break;
      case 'RECURRENCE-ID': cur.recurrenceId = parseDate(line, defaultTz); break;
      case 'EXDATE':
        for (const v of line.value.split(',')) {
          const d = parseDate({ params: line.params, value: v }, defaultTz);
          if (d) cur.exdates.push(d);
        }
        break;
    }
  }
  return events.filter((e) => e.start);
}

// ---------- recurrence ----------
function nthWeekdayMatch(date, spec, y, m) {
  if (date.wd !== spec.wd) return false;
  if (!spec.n) return true;
  if (spec.n > 0) return Math.ceil(date.d / 7) === spec.n;
  return Math.ceil((daysInMonth(y, m) - date.d + 1) / 7) === -spec.n;
}

function monthDayMatch(date, list, y, m) {
  const dim = daysInMonth(y, m);
  return list.some((n) => (n > 0 ? date.d === n : date.d === dim + n + 1));
}

// Does calendar day `n` (day number) match the rule, ignoring COUNT/UNTIL?
function matches(rule, start, sDay, n) {
  if (n < sDay) return false;
  const date = fromDayNum(n);
  const { y, m } = date;
  const diffDays = n - sDay;
  switch (rule.freq) {
    case 'DAILY':
      if (diffDays % rule.interval) return false;
      if (rule.bymonth && !rule.bymonth.includes(m)) return false;
      if (rule.byday && !rule.byday.some((b) => b.wd === date.wd)) return false;
      return true;
    case 'WEEKLY': {
      const wkStart = (x) => x - ((fromDayNum(x).wd - rule.wkst + 7) % 7);
      const weeks = Math.round((wkStart(n) - wkStart(sDay)) / 7);
      if (weeks % rule.interval) return false;
      const days = rule.byday ? rule.byday.map((b) => b.wd) : [start.wd];
      return days.includes(date.wd);
    }
    case 'MONTHLY': {
      const months = (y - start.y) * 12 + (m - start.m);
      if (months % rule.interval) return false;
      if (rule.bymonth && !rule.bymonth.includes(m)) return false;
      if (rule.bymonthday) return monthDayMatch(date, rule.bymonthday, y, m);
      if (rule.byday) return rule.byday.some((b) => nthWeekdayMatch(date, b, y, m));
      return date.d === start.d;
    }
    case 'YEARLY': {
      if ((y - start.y) % rule.interval) return false;
      const months = rule.bymonth || [start.m];
      if (!months.includes(m)) return false;
      if (rule.bymonthday) return monthDayMatch(date, rule.bymonthday, y, m);
      if (rule.byday) return rule.byday.some((b) => nthWeekdayMatch(date, b, y, m));
      return date.d === start.d;
    }
  }
  return false;
}

function instance(ev, day, durMs) {
  const s = ev.start;
  const date = fromDayNum(day);
  const startMs = s.allDay
    ? wallToUtc(date.y, date.m, date.d, 0, 0, 0, s.tz)
    : wallToUtc(date.y, date.m, date.d, s.h, s.mi, s.s, s.tz);
  return { startMs, endMs: startMs + durMs, day };
}

// Expand events overlapping [fromMs, toMs).
export function expand(events, fromMs, toMs) {
  const overrides = new Map(); // uid -> Set of original start ms
  for (const ev of events) {
    if (ev.recurrenceId && ev.uid) {
      if (!overrides.has(ev.uid)) overrides.set(ev.uid, new Set());
      overrides.get(ev.uid).add(ev.recurrenceId.utc);
    }
  }
  const out = [];
  for (const ev of events) {
    const s = ev.start;
    let durMs;
    if (ev.end) durMs = Math.max(0, ev.end.utc - s.utc);
    else if (ev.duration) durMs = ev.duration;
    else durMs = s.allDay ? DAY : 0;
    if (s.allDay && durMs < DAY) durMs = DAY;

    const push = (startMs, endMs) => {
      if (ev.status === 'CANCELLED') return;
      const effEnd = Math.max(endMs, startMs + 1);
      if (effEnd <= fromMs || startMs >= toMs) return;
      out.push({ uid: ev.uid, title: ev.title || '', location: ev.location || '', allDay: s.allDay, start: startMs, end: endMs });
    };

    if (!ev.rule || ev.recurrenceId) { push(s.utc, s.utc + durMs); continue; }

    const rule = ev.rule;
    const sDay = dayNum(s.y, s.m, s.d);
    const startInfo = { ...s, wd: fromDayNum(sDay).wd };
    const ex = new Set(ev.exdates.map((d) => (s.allDay || d.allDay ? 'd' + dayNum(d.y, d.m, d.d) : 't' + d.utc)));
    const ov = overrides.get(ev.uid);
    const spanDays = Math.ceil(durMs / DAY) + 1;
    const lastDay = Math.floor(toMs / DAY) + 1;
    // With COUNT we must count from the first occurrence; otherwise start near the window.
    let n = rule.count ? sDay : Math.max(sDay, Math.floor(fromMs / DAY) - spanDays);
    let produced = 0;
    for (let guard = 0; n <= lastDay && guard < 40000; n++, guard++) {
      if (!matches(rule, startInfo, sDay, n)) continue;
      const inst = instance(ev, n, durMs);
      if (rule.until && inst.startMs > rule.until) break;
      produced++;
      if (rule.count && produced > rule.count) break;
      const key = s.allDay ? 'd' + n : 't' + inst.startMs;
      if (ex.has(key) || ex.has('d' + n)) continue;
      if (ov && ov.has(inst.startMs)) continue;
      push(inst.startMs, inst.endMs);
    }
  }
  out.sort((a, b) => a.start - b.start || (b.allDay - a.allDay));
  return out;
}
