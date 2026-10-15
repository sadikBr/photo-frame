// Repeating tasks: when is a routine next due? Shared by the server (src/worker.js) and the
// control panel. Dates are 'YYYY-MM-DD'.
//   { kind: 'days', every: 3, start }   every 3 days from `start`
//   { kind: 'weekly', weekday: 5 }       every Friday (0 = Sunday)
//   { kind: 'monthly', day: 5 }          on the 5th; 29–31 fall on the last day of shorter months
const DAY_MS = 86400000;
export const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);
export const isoMs = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
export const addDays = (iso, n) => isoDay(isoMs(iso) + n * DAY_MS);
const daysInMonth = (y, m0) => new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();

// The first due day of routine r on or after day `from`.
export function dueFrom(r, from) {
  if (r.start && r.start > from) from = r.start;
  const f = isoMs(from);
  if (r.kind === 'days') {
    const s = isoMs(r.start || from);
    const k = Math.max(0, Math.ceil((f - s) / (r.every * DAY_MS)));
    return isoDay(s + k * r.every * DAY_MS);
  }
  if (r.kind === 'weekly') return isoDay(f + ((r.weekday - new Date(f).getUTCDay() + 7) % 7) * DAY_MS);
  let y = new Date(f).getUTCFullYear(), m = new Date(f).getUTCMonth();
  for (;;) {
    const t = Date.UTC(y, m, Math.min(r.day, daysInMonth(y, m)));
    if (t >= f) return isoDay(t);
    if (++m > 11) { m = 0; y++; }
  }
}
