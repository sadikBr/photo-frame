import { prayerDay } from './data.js';
import { parts, DAY, MINUTE } from './util.js';

export const PRAYERS = [
  { k: 'fajr', ar: 'الفجر' },
  { k: 'sunrise', ar: 'الشروق', minor: true },
  { k: 'dhuhr', ar: 'الظهر' },
  { k: 'asr', ar: 'العصر' },
  { k: 'maghrib', ar: 'المغرب' },
  { k: 'isha', ar: 'العشاء' },
];

export function prayerName(k, at) {
  if (k === 'dhuhr' && parts(at).wd === 5) return 'الجمعة';
  return PRAYERS.find((p) => p.k === k).ar;
}

// Next obligatory prayer after t: { k, ar, at } or null when times are not loaded.
export function nextPrayer(t) {
  for (const offset of [0, 1]) {
    const day = prayerDay(t + offset * DAY);
    if (!day) return null;
    for (const p of PRAYERS) {
      if (p.minor || !day[p.k]) continue;
      if (day[p.k] > t) return { k: p.k, ar: prayerName(p.k, day[p.k]), at: day[p.k] };
    }
  }
  return null;
}

// Most recent obligatory prayer at or before t.
export function lastPrayer(t) {
  for (const offset of [0, -1]) {
    const day = prayerDay(t + offset * DAY);
    if (!day) continue;
    for (let i = PRAYERS.length - 1; i >= 0; i--) {
      const p = PRAYERS[i];
      if (p.minor || !day[p.k]) continue;
      if (day[p.k] <= t) return { k: p.k, ar: prayerName(p.k, day[p.k]), at: day[p.k] };
    }
  }
  return null;
}

// Which day's timetable to draw: after Isha (+1h) switch to tomorrow.
export function displayDay(t) {
  const today = prayerDay(t);
  if (today && t > today.isha + 60 * MINUTE) {
    const tomorrow = prayerDay(t + DAY);
    if (tomorrow) return { times: tomorrow, ref: t + DAY };
  }
  return today ? { times: today, ref: t } : null;
}
