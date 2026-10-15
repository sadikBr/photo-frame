// Moroccan public holidays and religious occasions for the month calendar, plus the family's
// own dates (added in the control panel or imported from .ics files).
import { hijri, parts, dayKey, DAY } from './util.js';

// Civil holidays (fixed Gregorian dates): [month, day, name, short name, key].
const CIVIL = [
  [1, 1, 'رأس السنة الميلادية', 'رأس السنة', 'gnewyear'],
  [1, 11, 'ذكرى تقديم وثيقة الاستقلال', 'وثيقة الاستقلال', 'manifesto'],
  [1, 14, 'رأس السنة الأمازيغية', 'السنة الأمازيغية', 'amazigh'],
  [5, 1, 'عيد الشغل', 'عيد الشغل', 'labour'],
  [7, 30, 'عيد العرش', 'عيد العرش', 'throne'],
  [8, 14, 'ذكرى استرجاع وادي الذهب', 'وادي الذهب', 'oued'],
  [8, 20, 'ذكرى ثورة الملك والشعب', 'ثورة الملك والشعب', 'revolution'],
  [8, 21, 'عيد الشباب', 'عيد الشباب', 'youth'],
  [10, 31, 'عيد الوحدة', 'عيد الوحدة', 'unity'],
  [11, 6, 'ذكرى المسيرة الخضراء', 'المسيرة الخضراء', 'greenmarch'],
  [11, 18, 'عيد الاستقلال', 'عيد الاستقلال', 'independence'],
];

// Religious holidays (days off), by Hijri date: key, [month, day], name, number of days.
const RELIGIOUS = [
  { key: 'newyear', h: [1, 1], name: 'رأس السنة الهجرية', short: 'السنة الهجرية', days: 1 },
  { key: 'mawlid', h: [3, 12], name: 'عيد المولد النبوي', short: 'المولد النبوي', days: 2 },
  { key: 'fitr', h: [10, 1], name: 'عيد الفطر', short: 'عيد الفطر', days: 2 },
  { key: 'adha', h: [12, 10], name: 'عيد الأضحى', short: 'عيد الأضحى', days: 2 },
];

// Occasions that are not days off.
// `after` ties an occasion to a Moroccan-announced holiday in the same Hijri month
// (Ashura is 9 days after 1 Muharram), so it follows Morocco's moon sighting too.
const OBSERVANCES = [
  { key: 'ashura', h: [1, 10], name: 'عاشوراء', short: 'عاشوراء', after: ['newyear', 9] },
  { key: 'ramadan', h: [9, 1], name: 'بداية رمضان', short: 'أول رمضان' },
];

// Morocco fixes religious holidays by moon sighting, which can differ by a day from the
// computed Hijri calendar. First day of each holiday as announced (or forecast) for Morocco.
// Add next year's dates here when they are announced.
// 2027 is a forecast. Eid al-Adha: the Ministry of Education's 2026/27 school calendar
// (9–11 Dhu al-Hijja = 15–17 May) and Umm al-Qura both put the Eid on 16 May.
const MOROCCO_DATES = {
  2026: { official: true, fitr: '2026-03-20', adha: '2026-05-27', newyear: '2026-06-17', mawlid: '2026-08-25' },
  2027: { official: false, fitr: '2027-03-10', adha: '2027-05-16', newyear: '2027-06-06', mawlid: '2027-08-14' },
};

const KIND_ORDER = { religious: 0, national: 1, family: 2, observance: 3 };

// ---------- recognising holidays by name ----------
// Imported calendars (a school calendar, a company calendar) often list public holidays too.
// holidayKey() maps such a name to the built-in holiday it means, so it isn't shown twice.
function normalize(s) {
  return String(s || '')
    .replace(/[ً-ٰٟـ]/g, '') // tashkeel and tatweel
    .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ').trim();
}
const NAME_RULES = [
  ['manifesto', /وثيقه الاستقلال/],
  ['independence', /عيد الاستقلال/],
  ['amazigh', /امازيغ|ايض يناير/],
  ['gnewyear', /الميلادي|راس السنه$/],
  ['labour', /عيد الشغل|عيد العمال/],
  ['throne', /عيد العرش/],
  ['oued', /وادي الذهب/],
  ['revolution', /ثوره الملك/],
  ['youth', /عيد الشباب/],
  ['unity', /عيد الوحده/],
  ['greenmarch', /المسيره الخضراء/],
  ['fitr', /عيد الفطر/],
  ['adha', /عيد الاضحي|العيد الكبير/],
  ['mawlid', /المولد/],
  ['ashura', /عاشوراء/],
  ['newyear', /راس السنه الهجريه|السنه الهجريه|فاتح محرم/],
  ['ramadan', /(بدايه|اول|فاتح) (شهر )?رمضان/],
];
export function holidayKey(name) {
  const n = normalize(name);
  for (const [key, re] of NAME_RULES) if (re.test(n)) return key;
  return null;
}
// How far apart (days) an imported date may be from the built-in one and still be the same
// holiday: exact for civil dates, a few days for moon-sighted ones (forecasts differ).
export const MATCH_DAYS = { religious: 3, observance: 3, national: 0 };

// ---------- family dates, indexed by day ----------
// Entries: { name, date: 'MM-DD' (every year) | 'YYYY-MM-DD' (once), time?, end? (last day) }.
const isoToMs = (d) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
let familyCache = { src: null, yearly: null, once: null };
function familyIndex(family) {
  if (familyCache.src === family) return familyCache;
  const yearly = new Map(), once = new Map();
  const put = (map, k, f, extra) => { if (!map.has(k)) map.set(k, []); map.get(k).push(Object.assign({}, f, extra)); };
  for (const f of family) {
    const d = String(f.date);
    const hkey = holidayKey(f.name);
    if (d.length === 5) { put(yearly, d, f, { day: 1, days: 1, hkey }); continue; }
    if (d.length !== 10) continue;
    const start = isoToMs(d);
    let days = 1;
    if (f.end && f.end > d) days = Math.min(400, Math.round((isoToMs(f.end) - start) / DAY) + 1);
    for (let i = 0; i < days; i++) {
      put(once, new Date(start + i * DAY).toISOString().slice(0, 10), f, { day: i + 1, days, start: d, end: days > 1 ? f.end : undefined, hkey });
    }
  }
  familyCache = { src: family, yearly, once };
  return familyCache;
}

// All occasions on days in [fromMs, toMs), as Map dayKey -> [{ name, short, kind, approx,
// day, days, start?, end?, time?, key? }]. `day`/`days` place a day inside a multi-day span.
export function occasions(fromMs, toMs, family) {
  const fam = familyIndex(family || []);
  const out = new Map();
  const add = (ms, ev) => {
    const k = dayKey(ms);
    if (!out.has(k)) out.set(k, []);
    out.get(k).push(ev);
  };
  const midday = (ms) => ms + 12 * 3600000;
  const fixed = new Set(); // "year:key" pairs taken from MOROCCO_DATES

  // Announced Moroccan dates (check a little before the range for 2-day holidays).
  for (const y in MOROCCO_DATES) {
    const tbl = MOROCCO_DATES[y];
    for (const r of RELIGIOUS) {
      if (!tbl[r.key]) continue;
      fixed.add(y + ':' + r.key);
      const [yy, mm, dd] = tbl[r.key].split('-').map(Number);
      const first = Date.UTC(yy, mm - 1, dd, 12); // midday, safe for any local offset
      for (let i = 0; i < r.days; i++) {
        const ms = first + i * DAY;
        if (ms + DAY <= fromMs || ms >= toMs) continue;
        add(ms, { key: r.key, name: r.name, short: r.short, kind: 'religious', approx: !tbl.official, day: i + 1, days: r.days });
      }
    }
  }

  for (const y in MOROCCO_DATES) {
    const tbl = MOROCCO_DATES[y];
    for (const o of OBSERVANCES) {
      if (!o.after || !tbl[o.after[0]]) continue;
      fixed.add(y + ':' + o.key);
      const [yy, mm, dd] = tbl[o.after[0]].split('-').map(Number);
      const ms = Date.UTC(yy, mm - 1, dd, 12) + o.after[1] * DAY;
      if (ms + DAY > fromMs && ms < toMs) add(ms, { key: o.key, name: o.name, short: o.short, kind: 'observance', approx: !tbl.official, day: 1, days: 1 });
    }
  }

  for (let ms = fromMs; ms < toMs; ms += DAY) {
    const p = parts(midday(ms));
    for (const c of CIVIL) if (c[0] === p.m && c[1] === p.d) add(ms, { key: c[4], name: c[2], short: c[3], kind: 'national', approx: false, day: 1, days: 1 });
    const mmdd = String(p.m).padStart(2, '0') + '-' + String(p.d).padStart(2, '0');
    const isoDate = p.y + '-' + mmdd;
    for (const f of (fam.yearly.get(mmdd) || []).concat(fam.once.get(isoDate) || [])) {
      add(ms, {
        name: f.name, short: f.name, kind: 'family', approx: false, hkey: f.hkey,
        day: f.day, days: f.days, start: f.start, end: f.end, time: f.day === 1 ? f.time : undefined,
      });
    }
    const h = hijri(midday(ms));
    if (!h) continue;
    for (const r of RELIGIOUS) {
      if (fixed.has(p.y + ':' + r.key)) continue;
      for (let i = 0; i < r.days; i++) {
        // The holiday's i-th day: the Hijri date i days earlier is the holiday's first day.
        const hp = i ? hijri(midday(ms) - i * DAY) : h;
        if (hp && hp.m === r.h[0] && hp.d === r.h[1]) add(ms, { key: r.key, name: r.name, short: r.short, kind: 'religious', approx: true, day: i + 1, days: r.days });
      }
    }
    for (const o of OBSERVANCES) {
      if (fixed.has(p.y + ':' + o.key)) continue;
      if (h.m === o.h[0] && h.d === o.h[1]) add(ms, { key: o.key, name: o.name, short: o.short, kind: 'observance', approx: true, day: 1, days: 1 });
    }
  }

  for (const [k, list] of out) {
    // A family entry that is really a built-in holiday on the same day isn't shown twice
    // (safety net for calendars imported before the importer learned to skip them).
    const builtIn = new Set(list.filter((e) => e.kind !== 'family').map((e) => e.key));
    const kept = list.filter((e) => e.kind !== 'family' || !e.hkey || !builtIn.has(e.hkey));
    kept.sort((a, b) =>
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind]
      || (b.days > 1) - (a.days > 1) // spans first, so their bars line up from day to day
      || (a.start || '').localeCompare(b.start || '')
      || (a.time || '').localeCompare(b.time || '')
      || a.name.localeCompare(b.name));
    out.set(k, kept);
  }
  return out;
}

// Occasions from the day containing fromMs up to toMs. Multi-day ones are listed once, on
// their first day, except those already under way on the first day, which come first.
export function between(fromMs, toMs, family) {
  const map = occasions(fromMs, toMs, family);
  const firstKey = dayKey(fromMs + 12 * 3600000);
  const list = [];
  for (const [k, evs] of [...map.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    for (const ev of evs) {
      if (ev.day !== 1 && k !== firstKey) continue;
      list.push(Object.assign({ date: k, ongoing: ev.day > 1 }, ev));
    }
  }
  // Ones already under way go first.
  return list.filter((e) => e.ongoing).concat(list.filter((e) => !e.ongoing));
}

// The next `count` occasions from the day containing fromMs.
export function upcoming(fromMs, count, family) {
  return between(fromMs, fromMs + 400 * DAY, family).slice(0, count);
}
