// «وضع الماتش»: what the server, the frame and the phones share — the match's phase in words,
// and the 3-minute practice match (the control panel's «معاينة», and the demo).

// Where the match is, in words for the frame.
export function phaseAr(m) {
  const n = m.status || '';
  if (m.state === 'pre') return /POSTPONED|CANCEL|DELAY/.test(n) ? (/DELAY/.test(n) ? 'تأخّر انطلاقها' : 'أُجّلت') : '';
  if (m.state === 'post') return /PEN/.test(n) ? 'انتهت بركلات الترجيح' : /AET/.test(n) ? 'انتهت بعد الأشواط الإضافية' : /POSTPONED|CANCEL/.test(n) ? 'أُلغيت' : 'انتهت';
  if (/HALFTIME/.test(n)) return 'استراحة';
  if (/SHOOTOUT/.test(n)) return 'ركلات الترجيح';
  if (/OVERTIME|EXTRA/.test(n)) return 'أشواط إضافية';
  if (/END_OF_REGULATION|END_PERIOD/.test(n)) return 'نهاية الوقت الأصلي';
  return m.period === 2 ? 'الشوط الثاني' : 'الشوط الأول';
}

// A practice match for «معاينة» in the control panel: 3 minutes, Morocco scores at 0:20 and
// the other side at 1:10, then it ends. Built from the clock, so frame and phones agree.
export const PREVIEW_MS = 3 * 60000;
export function previewMatch(start, now) {
  const t = now - start;
  const mar = t >= 20000 ? 1 + (t >= 100000 ? 1 : 0) : 0, opp = t >= 70000 ? 1 : 0;
  const goals = [];
  if (t >= 20000) goals.push({ side: 'mar', min: "12'", who: 'تجربة', og: false, pen: false });
  if (t >= 70000) goals.push({ side: 'opp', min: "38'", who: 'تجربة', og: false, pen: false });
  if (t >= 100000) goals.push({ side: 'mar', min: "77'", who: 'تجربة', og: false, pen: false });
  const ended = t >= 140000;
  const m = {
    id: 'preview-' + start,
    slug: 'fifa.friendly',
    comp: 'معاينة',
    kickoff: start - 10 * 60000,
    state: ended ? 'post' : 'in',
    status: ended ? 'STATUS_FULL_TIME' : t >= 60000 ? 'STATUS_SECOND_HALF' : 'STATUS_FIRST_HALF',
    clock: ended ? '' : Math.min(90, 10 + Math.floor(t / 1500)) + "'",
    period: t >= 60000 ? 2 : 1,
    mar: { name: 'المغرب', abbr: 'MAR', logo: '', score: mar, home: true },
    opp: { name: 'البرتغال', abbr: 'POR', logo: '', score: opp, home: false },
    goals,
    preview: true,
  };
  m.phase = phaseAr(m);
  return m;
}
