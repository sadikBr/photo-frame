// Is it Ramadan, and which fast? Uses the Hijri date (with the control panel's adjustment).
// The Islamic day starts at Maghrib: after Maghrib on the last day of Sha'ban it is already
// the first night of Ramadan (suhoor comes next), and after Maghrib on the last day of
// Ramadan the month is over (Eid is next).
import config from './config.js';
import { hijri, now, DAY } from './util.js';
import { prayerDay } from './data.js';

let previewUntil = 0;
// The control panel's "preview" (or the demo's button) shows the Ramadan look until this time.
export function setRamadanPreview(until) { previewUntil = until || 0; }
export const ramadanPreviewing = () => now() < previewUntil;

// { active, day: the fast (1–30), night: after Maghrib (the night before `day`), year, preview }
export function ramadanInfo(t) {
  const h = hijri(t);
  if (!h) return { active: false };
  const today = prayerDay(t);
  const afterMaghrib = !!(today && t >= today.maghrib);
  const next = hijri(t + DAY);
  let info = { active: false };
  if (h.m === 9 && !(afterMaghrib && next && next.m === 10)) {
    info = { active: true, day: afterMaghrib ? h.d + 1 : h.d, night: afterMaghrib, year: h.y };
  } else if (afterMaghrib && next && next.m === 9 && next.d === 1) {
    info = { active: true, day: 1, night: true, year: next.y };
  }
  if (!info.active && ramadanPreviewing()) {
    // Preview outside Ramadan: pretend it is the 12th fast with today's real prayer times.
    return { active: true, day: afterMaghrib ? 13 : 12, night: afterMaghrib, year: h.m > 9 ? h.y + 1 : h.y, preview: true };
  }
  if (info.active && !config.ramadan.enabled) return { active: false };
  return info;
}

// The first day of the next Ramadan (for the control panel), searching up to a year ahead.
export function nextRamadanStart(fromMs) {
  for (let i = 0; i < 400; i++) {
    const t = fromMs + i * DAY;
    const h = hijri(t);
    if (h && h.m === 9 && h.d === 1) return t;
  }
  return null;
}
