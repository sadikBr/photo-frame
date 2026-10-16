// Times on the control panel are Morocco's (the server says the offset), whatever the phone
// believes: some phones still think Morocco is GMT+1.
const DAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const two = (n) => String(n).padStart(2, '0');
export function wall(ms, off) {
  const d = new Date(ms + off * 60000);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), wd: d.getUTCDay() };
}
// "2026-10-17" + "07:30" in Morocco → ms.
export function fromWall(date, time, off) {
  const [y, m, d] = String(date).split('-').map(Number);
  const [h, mi] = String(time || '00:00').split(':').map(Number);
  if (![y, m, d, h, mi].every(Number.isFinite)) return NaN;
  return Date.UTC(y, m - 1, d, h, mi) - off * 60000;
}
export const wallDate = (ms, off) => { const w = wall(ms, off); return w.y + '-' + two(w.m) + '-' + two(w.d); };
export const wallTime = (ms, off) => { const w = wall(ms, off); return two(w.h) + ':' + two(w.mi); };
// «اليوم 20:00», «غداً 07:30», «السبت 10:00», «12/11 10:00».
export function whenAr(ms, off, now = Date.now()) {
  const a = wall(ms, off), b = wall(now, off);
  const day = Math.round((Date.UTC(a.y, a.m - 1, a.d) - Date.UTC(b.y, b.m - 1, b.d)) / 86400000);
  const hm = two(a.h) + ':' + two(a.mi);
  if (day === 0) return (a.h >= 18 ? 'الليلة ' : 'اليوم ') + hm;
  if (day === 1) return a.h === 0 && a.mi === 0 ? 'منتصف هذه الليلة' : 'غداً ' + hm;
  if (day > 1 && day < 7) return DAYS[a.wd] + ' ' + hm;
  return a.d + '/' + a.m + ' ' + hm;
}
