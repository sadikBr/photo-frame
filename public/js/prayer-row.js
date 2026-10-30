// Today's prayers as a row of items (name, time, and "in N minutes" on the next one).
// The original look doesn't show it; the themes lay it out their own way (tiles, niches, pots,
// stops along a path…) from the classes: .prow > .prow-i.is-past / .is-next / .is-minor.
import { h, setText, hhmm, durationAr } from './util.js';
import { PRAYERS, prayerName, nextPrayer, displayDay } from './prayer-times.js';

const PATH = {
  fajr: 'M3 18h18M7 18a5 5 0 0 1 10 0M12 6v3M5.6 10.6l1.4 1.4M18.4 10.6L17 12',
  sunrise: 'M3 18h18M8 18a4 4 0 0 1 8 0M12 5v6M9 8l3-3 3 3',
  dhuhr: 'M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  asr: 'M14 9a4 4 0 1 0 0 8a4 4 0 1 0 0-8M3 20h18M5 9l2 1M8 5l1 2',
  maghrib: 'M3 18h18M7 18a5 5 0 0 1 10 0M12 13V8M9 11l3 3 3-3',
  isha: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
};
export const prayerIcon = (k, size) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="${PATH[k]}"/></svg>`;

export function createPrayerRow(cls, { sunrise = false } = {}) {
  const list = PRAYERS.filter((p) => sunrise || !p.minor);
  const items = list.map((p) => {
    const name = h('span', { class: 'prow-name' });
    const time = h('bdi', { class: 'prow-time', dir: 'ltr' });
    const note = h('span', { class: 'prow-in' });
    const el = h('div', { class: 'prow-i k-' + p.k + (p.minor ? ' is-minor' : '') },
      h('span', { class: 'prow-icon', html: prayerIcon(p.k, 40) }), name, time, note);
    return { p, el, name, time, note };
  });
  const el = h('div', { class: 'prow ' + cls, 'aria-label': 'مواقيت اليوم' }, ...items.map((x) => x.el));
  let key = '';

  function update(t) {
    const dd = displayDay(t);
    el.classList.toggle('is-empty', !dd);
    if (!dd) return;
    const np = nextPrayer(t);
    const k2 = dd.times.fajr + ':' + (np ? np.k + np.at : '') + ':' + Math.floor(t / 60000);
    if (k2 === key) return;
    key = k2;
    for (const x of items) {
      const at = dd.times[x.p.k];
      const isNext = !!(np && np.k === x.p.k && np.at === at);
      const isPast = !!at && at <= t;
      x.el.classList.toggle('is-next', isNext);
      x.el.classList.toggle('is-past', isPast && !isNext);
      setText(x.name, at ? prayerName(x.p.k, at) : x.p.ar);
      setText(x.time, at ? hhmm(at) : '');
      setText(x.note, isNext ? 'بعد ' + durationAr(np.at - t) : '');
    }
  }
  return { el, update, reset() { key = ''; } };
}
