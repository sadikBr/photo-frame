import config from '../config.js';
import { h, setText, now, parts, WEEKDAYS, dateLine, hijriLine, hhmm, durationAr, DAY, dayKey, startOfDay } from '../util.js';
import { state, on, prayerDay } from '../data.js';
import { weatherIcon, describeWeather, ICON, khatam, nudgeIcon } from '../icons.js';
import { nextPrayer } from '../prayer-times.js';
import { weatherNudge } from '../nudge.js';
import { verseOfDay } from '../adhkar-data.js';
import { ramadanInfo } from '../ramadan.js';
import { createPrayerRow } from '../prayer-row.js';

const deg = (v) => Math.round(v) + '°';

export function createHome() {
  const weekday = h('div', { class: 'h-weekday' });
  const greg = h('div', { class: 'h-greg' });
  const hij = h('div', { class: 'h-hijri' });
  const clock = h('bdi', { dir: 'ltr' });
  const nextName = h('span', { class: 'h-next-name' });
  const nextTime = h('bdi', { class: 'h-next-time', dir: 'ltr' });
  const nextIn = h('span', { class: 'h-next-in' });
  const next = h('div', { class: 'h-next' }, h('span', { class: 'h-next-icon', html: ICON.crescent }), nextName, nextTime, nextIn);

  const weatherBox = h('div', { class: 'h-weather' });
  // A note for the family, written in the control panel.
  const msgText = h('span', { class: 'h-msg-text' });
  const msg = h('div', { class: 'h-msg', hidden: true }, h('span', { class: 'h-msg-icon', html: khatam(26) }), msgText);
  // Verse or hadith of the day, where the message goes when there is none.
  const verseText = h('span', { class: 'h-verse-text' });
  const verseRef = h('span', { class: 'h-verse-ref' });
  const verse = h('div', { class: 'h-verse', hidden: true }, verseText, verseRef);

  const prow = createPrayerRow('h-prayers');
  const wxTemp = h('bdi', { class: 'hw-temp', dir: 'ltr' });
  const wxCond = h('span', { class: 'hw-cond' });
  const wxNext = h('span', { class: 'hw-next' });
  const wxIcon = h('span', { class: 'hw-icon' });
  const wxTip = h('span', { class: 'hw-tip' }); // the same weather sentence as the original look
  const wxMini = h('div', { class: 'h-wxm' }, wxIcon, h('span', { class: 'hw-text' }, wxTemp, wxCond, wxNext), wxTip);

  const el = h('section', { class: 'screen s-home', 'data-screen': 'home', style: '--ground:var(--g-home)' },
    h('div', { class: 'home-grid' },
      h('div', { class: 'h-main' },
        h('div', { class: 'h-dates' }, weekday, greg, hij),
        msg,
        verse,
        h('div', { class: 'h-clock' }, clock),
        next,
        prow.el, // themes only: today's prayers in a row
      ),
      h('div', { class: 'rule' }),
      weatherBox,
    ),
    wxMini, // themes only: the weather in two lines
    h('div', { class: 'band' }),
  );

  let lastMinute = -1;
  function tick(t) {
    const p = parts(t);
    const minute = p.h * 60 + p.mi;
    if (minute !== lastMinute) {
      lastMinute = minute;
      renderMessage(); // drops a message once its time is up
      setText(clock, hhmm(t));
      setText(weekday, WEEKDAYS[p.wd]);
      setText(greg, dateLine(t));
      setText(hij, hijriLine(t));
      renderWeather();
    }
    // In Ramadan the line counts down to iftar during the fast and to imsak at night.
    const rm = ramadanInfo(t);
    const today = rm.active ? prayerDay(t) : null;
    let target = null;
    if (today) {
      if (t >= today.imsak && t < today.maghrib) target = { ar: 'الإفطار', at: today.maghrib };
      else if (t < today.imsak) target = { ar: 'الإمساك', at: today.imsak };
      else if (t >= today.maghrib + 30 * 60000) { const tm = prayerDay(t + DAY); if (tm) target = { ar: 'الإمساك', at: tm.imsak }; }
    }
    prow.update(t);
    const np = target || nextPrayer(t);
    next.style.visibility = np ? 'visible' : 'hidden';
    if (np) {
      setText(nextName, np.ar);
      setText(nextTime, hhmm(np.at));
      setText(nextIn, 'بعد ' + durationAr(np.at - t));
    }
  }

  function renderWeather() {
    const w = state.weather;
    weatherBox.textContent = '';
    if (!w) {
      weatherBox.appendChild(h('div', { class: 'h-empty' }, 'جاري تحميل الطقس…'));
      return;
    }
    const c = w.current;
    const d = describeWeather(c.code);
    const todayKey = dayKey(now());
    const days = w.daily.filter((x) => x.date >= todayKey);
    const today = days[0];
    const ahead = days.slice(1, 6);
    wxIcon.innerHTML = weatherIcon(d.kind, c.isDay, 64);
    setText(wxTemp, deg(c.temp));
    setText(wxCond, d.ar);
    setText(wxNext, days[1] ? 'غداً ' + deg(days[1].max) + ' · ' + describeWeather(days[1].code).ar : '');

    weatherBox.appendChild(h('div', { class: 'w-city' }, config.city));
    weatherBox.appendChild(h('div', { class: 'w-now' },
      h('div', { class: 'w-icon', html: weatherIcon(d.kind, c.isDay, 116) }),
      h('bdi', { class: 'w-temp', dir: 'ltr' }, deg(c.temp)),
    ));
    weatherBox.appendChild(h('div', { class: 'w-cond' }, d.ar));
    // A plain sentence instead of numbers when the day calls for one (from 5 pm, about tomorrow).
    const evening = parts(now()).h >= 17;
    const tip = config.weatherNudge !== false ? weatherNudge(evening ? days[1] : today, evening) : null;
    setText(wxTip, tip ? tip.text : '');
    wxTip.className = 'hw-tip' + (tip ? ' k-' + tip.kind : '');
    if (tip) {
      weatherBox.appendChild(h('div', { class: 'w-nudge k-' + tip.kind },
        h('span', { class: 'w-nudge-icon', html: nudgeIcon(tip.kind) }),
        h('span', { class: 'w-nudge-text' }, tip.text)));
    } else {
      const meta = (label, value) => h('div', null, h('span', null, label), value);
      const ltr = (v) => h('bdi', { dir: 'ltr' }, v);
      weatherBox.appendChild(h('div', { class: 'w-meta' },
        today ? meta('العظمى', ltr(deg(today.max))) : null,
        today ? meta('الصغرى', ltr(deg(today.min))) : null,
        meta('الرطوبة', ltr(Math.round(c.humidity) + '%')),
        meta('الرياح', h('b', null, Math.round(c.wind) + ' كم/س')),
      ));
    }

    if (ahead.length) {
      const lo = Math.min(...ahead.map((x) => x.min));
      const hi = Math.max(...ahead.map((x) => x.max));
      const span = Math.max(1, hi - lo);
      const list = h('div', { class: 'w-days' });
      for (const day of ahead) {
        const [y, m, dd] = day.date.split('-').map(Number);
        const wd = new Date(Date.UTC(y, m - 1, dd)).getUTCDay();
        const dk = describeWeather(day.code);
        const start = ((day.min - lo) / span) * 100;
        const width = Math.max(6, ((day.max - day.min) / span) * 100);
        list.appendChild(h('div', { class: 'w-day' },
          h('span', { class: 'w-dname' }, WEEKDAYS[wd]),
          h('span', { class: 'w-dicon', html: weatherIcon(dk.kind, true, 40) }),
          h('bdi', { class: 'w-lo', dir: 'ltr' }, deg(day.min)),
          h('span', { class: 'w-bar' }, h('i', { style: 'right:' + start.toFixed(1) + '%;width:' + width.toFixed(1) + '%' })),
          h('bdi', { class: 'w-hi', dir: 'ltr' }, deg(day.max)),
        ));
      }
      weatherBox.appendChild(list);
    }
  }

  function renderMessage() {
    const m = state.message;
    const show = !!(m && m.text && (!m.until || m.until > Date.now()));
    msg.hidden = !show;
    if (show) setText(msgText, m.text);
    // The family's message comes first; otherwise the verse or hadith of the day.
    const v = !show && config.dailyVerse !== false ? verseOfDay(Math.round(startOfDay(now()) / DAY)) : null;
    verse.hidden = !v;
    if (v) {
      verse.className = 'h-verse is-' + v.kind;
      setText(verseText, v.kind === 'verse' ? '﴿' + v.text + '﴾' : '«' + v.text + '»');
      setText(verseRef, v.ref);
    }
    el.classList.toggle('has-msg', show || !!v);
  }
  on('message', renderMessage);
  renderMessage();

  on('weather', () => { lastMinute = -1; });
  on('settings', () => { lastMinute = -1; });
  on('prayer', () => { prow.reset(); tick(now()); });

  return { name: 'home', label: 'الساعة', el, tick, show() { lastMinute = -1; tick(now()); } };
}
