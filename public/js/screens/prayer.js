import config from '../config.js';
import { h, setText, now, hhmm, countdown, durationAr, MINUTE, DAY, WEEKDAYS, MONTHS as MONTHS_AR, parts } from '../util.js';
import { on, state, prayerDay, frameQuranOp } from '../data.js';
import { PRAYERS, prayerName, nextPrayer, lastPrayer, displayDay } from '../prayer-times.js';
import { ramadanInfo } from '../ramadan.js';
import { decorHTML, garlandSVG } from '../ramadan-decor.js';
import { createPrayerRow } from '../prayer-row.js';

// Ramadan: the times that matter for the fast, in order. Imsak and Maghrib are highlighted.
const R_TILES = [
  { k: 'imsak', ar: 'الإمساك', note: 'آخر السحور', key: true },
  { k: 'fajr', ar: 'الفجر' },
  { k: 'dhuhr', ar: 'الظهر' },
  { k: 'asr', ar: 'العصر' },
  { k: 'maghrib', ar: 'المغرب', note: 'الإفطار', key: true },
  { k: 'isha', ar: 'العشاء', note: 'التراويح' },
];
const juzAr = (n) => (n === 1 ? 'جزء واحد' : n === 2 ? 'جزأين' : n <= 10 ? n + ' أجزاء' : n + ' جزءاً');

const NS = 'http://www.w3.org/2000/svg';
const W = 1152, H = 470, PAD = 70, HORIZON = 300, ARC = 190, DIP = 72;

function s(tag, attrs) {
  const el = document.createElementNS(NS, tag);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  return el;
}

export function createPrayer() {
  const nextName = h('div', { class: 'p-name' });
  const nextAt = h('div', { class: 'p-at' });
  const nextIn = h('span', { class: 'p-in' }); // "in 47 minutes", for the themes
  const cdNum = h('bdi', { class: 'p-count', dir: 'ltr' });
  const cdCap = h('div', { class: 'p-cap' });
  // direction=ltr so text-anchor start/end are physical left/right.
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'p-arc', direction: 'ltr', 'aria-hidden': 'true' });
  const empty = h('div', { class: 'p-empty' }, 'جاري تحميل مواقيت الصلاة…');

  // ----- Ramadan -----
  const rDay = h('div', { class: 'r-day' });
  const rDots = h('div', { class: 'r-dots' });
  const rTiles = h('div', { class: 'r-tiles' });
  const qCount = h('div', { class: 'r-q-count' });
  const qBar = h('div', { class: 'r-q-bar' });
  const qStatus = h('div', { class: 'r-q-status' });
  const qMinus = h('button', { class: 'r-q-btn', type: 'button', 'aria-label': 'إنقاص جزء' }, '−');
  const qPlus = h('button', { class: 'r-q-btn r-q-plus', type: 'button' }, '+ جزء');
  const rQuran = h('div', { class: 'r-quran' },
    h('div', { class: 'r-q-main' },
      h('div', { class: 'r-q-head' }, h('span', { class: 'r-q-title' }, 'ختمة رمضان'), qCount),
      qBar,
      qStatus,
    ),
    h('div', { class: 'r-q-btns' }, qMinus, qPlus),
  );
  const rGarland = h('div', { class: 'r-garland-box', html: garlandSVG(1128) });
  // Theme-only (hidden in the original look): days left, the date in the Ramadan month, and the
  // moment of iftar written out.
  const rLeft = h('div', { class: 'r-left' });
  const rStage = h('div', { class: 'r-stage' }, h('div', { class: 'r-top' }, rDay, rLeft, rDots), rTiles, rGarland, rQuran);
  const rhDay = h('span', { class: 'rh-day' });
  const rhDate = h('span', { class: 'rh-date' });
  const rHead = h('div', { class: 'r-hday' }, rhDay, rhDate);
  const riWhen = h('div', { class: 'ri-when' });
  const riIsha = h('bdi', { class: 'ri-t', dir: 'ltr' });
  const riSuhoor = h('bdi', { class: 'ri-t', dir: 'ltr' });
  const rIftar = h('div', { class: 'r-iftar' },
    riWhen,
    h('div', { class: 'ri-title' }, 'تقبّل الله صيامكم'),
    h('div', { class: 'ri-dua' }, 'ذَهَبَ الظَّمَأُ، وَابْتَلَّتِ الْعُرُوقُ، وَثَبَتَ الْأَجْرُ إِنْ شَاءَ اللَّهُ'),
    h('div', { class: 'ri-next' }, h('span', null, 'العشاء والتراويح ', riIsha), h('span', { class: 'ri-suhoor' }, 'السحور حتى ', riSuhoor)));
  // Lanterns, crescent and night sky, behind the text; only drawn in Ramadan.
  const rDecor = h('div', { class: 'r-decor', 'aria-hidden': 'true', html: decorHTML() });

  // Used by the themes only: the prayers as tiles, and the time now in a corner.
  const tiles = createPrayerRow('p-tiles', { sunrise: true });
  const nowTime = h('bdi', { class: 'pc-time', dir: 'ltr' });
  const nowDate = h('span', { class: 'pc-date' });
  const nowSun = h('span', { class: 'pc-sun' }); // sunrise, for the themes that have no tile for it
  const nowBox = h('div', { class: 'p-clock' }, nowTime, nowDate, nowSun);

  const el = h('section', { class: 'screen s-prayer', 'data-screen': 'prayer', style: '--ground:var(--g-prayer)' },
    rDecor,
    h('div', { class: 'p-head' },
      rHead,
      h('div', { class: 'p-next' }, h('div', { class: 'p-name-row' }, nextName, nextIn), nextAt),
      h('div', { class: 'p-cd' }, cdNum, cdCap),
    ),
    h('div', { class: 'p-stage' }, svg, empty),
    tiles.el,
    nowBox,
    rStage,
    rIftar,
    h('div', { class: 'band' }),
  );

  // The countdown, with its seconds in a span of their own (the themes can set them smaller).
  function setCd(str) {
    if (cdNum.getAttribute('data-v') === str) return;
    cdNum.setAttribute('data-v', str);
    const m = /^(\d+:\d\d)(:\d\d)$/.exec(str);
    cdNum.textContent = '';
    if (m) cdNum.append(h('span', { class: 'p-cd-hm' }, m[1]), h('span', { class: 'p-cd-s' }, m[2]));
    else cdNum.textContent = str;
  }
  // "… at 18:32", with the time in a span of its own.
  function setAt(text, at) {
    const v = text + (at || '');
    if (nextAt.getAttribute('data-v') === v) return;
    nextAt.setAttribute('data-v', v);
    nextAt.textContent = text;
    if (at) nextAt.appendChild(h('span', { class: 'p-at-t' }, at));
  }

  let drawnFor = '';
  let marker = null, clipRect = null, geometry = null;

  function draw(times, t) {
    svg.textContent = '';
    const T0 = times.fajr - 50 * MINUTE;
    const T1 = times.isha + 50 * MINUTE;
    const x = (tt) => W - PAD - ((tt - T0) / (T1 - T0)) * (W - 2 * PAD);
    const y = (tt) => {
      if (tt >= times.sunrise && tt <= times.sunset) return HORIZON - ARC * Math.sin((Math.PI * (tt - times.sunrise)) / (times.sunset - times.sunrise));
      if (tt < times.sunrise) return HORIZON + DIP * Math.sin((Math.PI / 2) * Math.min(1, (times.sunrise - tt) / (times.sunrise - T0)));
      return HORIZON + DIP * Math.sin((Math.PI / 2) * Math.min(1, (tt - times.sunset) / (T1 - times.sunset)));
    };
    geometry = { x, y, T0, T1, times };

    let d = '';
    for (let i = 0; i <= 160; i++) {
      const tt = T0 + ((T1 - T0) * i) / 160;
      d += (i ? 'L' : 'M') + x(tt).toFixed(1) + ' ' + y(tt).toFixed(1);
    }

    const defs = s('defs', {});
    const glow = s('radialGradient', { id: 'sunGlow' });
    glow.appendChild(s('stop', { offset: '0', style: 'stop-color:var(--saffron);stop-opacity:0.55' }));
    glow.appendChild(s('stop', { offset: '1', style: 'stop-color:var(--saffron);stop-opacity:0' }));
    defs.appendChild(glow);
    const clip = s('clipPath', { id: 'passed' });
    clipRect = s('rect', { x: 0, y: 0, width: W, height: H });
    clip.appendChild(clipRect);
    defs.appendChild(clip);
    svg.appendChild(defs);

    // Night ground below the horizon.
    // Full-bleed night ground and horizon (the stage is inset 64px each side).
    svg.appendChild(s('rect', { x: -64, y: HORIZON, width: W + 128, height: H - HORIZON + 40, class: 'p-ground' }));
    svg.appendChild(s('line', { x1: -64, x2: W + 64, y1: HORIZON, y2: HORIZON, class: 'p-horizon', 'stroke-width': 1.5 }));
    svg.appendChild(s('path', { d, fill: 'none', class: 'p-path', 'stroke-width': 2, 'stroke-dasharray': '2 9', 'stroke-linecap': 'round' }));
    const passed = s('path', { d, fill: 'none', class: 'p-passed', 'stroke-width': 3, 'clip-path': 'url(#passed)', 'stroke-linecap': 'round' });
    svg.appendChild(passed);

    const np = nextPrayer(t);
    for (const p of PRAYERS) {
      const at = times[p.k];
      if (!at) continue;
      const px = x(at), py = y(at);
      // Labels go where the curve is not: above for daytime prayers, below for the ones
      // under the horizon; sunrise and maghrib sit beside their point, away from the arc.
      const place = { fajr: 'below', sunrise: 'below-day', dhuhr: 'above', asr: 'above', maghrib: 'below-night', isha: 'below' }[p.k];
      const below = place !== 'above';
      const lx = place === 'below-day' ? px - 22 : place === 'below-night' ? px + 22 : px;
      const anchor = place === 'below-day' ? 'end' : place === 'below-night' ? 'start' : 'middle';
      const isNext = np && np.k === p.k && np.at === at;
      const isPast = at <= t;
      const g = s('g', { class: 'p-pt' + (isNext ? ' is-next' : isPast ? ' is-past' : '') + (p.minor ? ' is-minor' : '') });
      if (isNext) g.appendChild(s('circle', { cx: px, cy: py, r: 21, class: 'p-ring' }));
      g.appendChild(s('circle', { cx: px, cy: py, r: isNext ? 11 : p.minor ? 6 : 8, class: 'p-dot' }));
      const nameY = below ? py + 48 : py - 66;
      const timeY = below ? py + 92 : py - 24;
      const name = s('text', { x: lx, y: nameY, class: 'p-lname', 'text-anchor': anchor });
      name.textContent = prayerName(p.k, at);
      const time = s('text', { x: lx, y: timeY, class: 'p-ltime', 'text-anchor': anchor, direction: 'ltr' });
      time.textContent = hhmm(at);
      g.appendChild(name);
      g.appendChild(time);
      svg.appendChild(g);
    }

    marker = s('g', { class: 'p-marker' });
    svg.appendChild(marker);
  }

  function placeMarker(t) {
    if (!geometry) return;
    const { x, y, T0, T1, times } = geometry;
    const tt = Math.min(T1, Math.max(T0, t));
    const mx = x(tt), my = y(tt);
    clipRect.setAttribute('x', mx.toFixed(1));
    clipRect.setAttribute('width', (W - mx).toFixed(1));
    const isDay = t >= times.sunrise && t <= times.sunset;
    const kind = isDay ? 'sun' : 'moon';
    if (marker.getAttribute('data-kind') !== kind) {
      marker.textContent = '';
      marker.setAttribute('data-kind', kind);
      if (isDay) {
        marker.appendChild(s('circle', { cx: 0, cy: 0, r: 54, fill: 'url(#sunGlow)' }));
        marker.appendChild(s('circle', { cx: 0, cy: 0, r: 17, class: 'p-sun' }));
      } else {
        marker.appendChild(s('path', { d: 'M5 -16a17 17 0 1 0 12 26 a13.5 13.5 0 1 1 -12 -26z', class: 'p-moon' }));
      }
    }
    marker.setAttribute('transform', `translate(${mx.toFixed(1)} ${my.toFixed(1)})`);
  }

  // ----- Ramadan -----
  let rInfo = { active: false };
  let previewJuz = null; // during a preview, + / − change only this, not the family's count
  const juzNow = () => {
    if (rInfo.preview) return previewJuz != null ? previewJuz : 0;
    const q = state.quran;
    return q && q.year === rInfo.year ? q.juz : 0;
  };
  function quranStep(op) {
    if (rInfo.preview) {
      previewJuz = Math.min(30, Math.max(0, juzNow() + (op === 'inc' ? 1 : -1)));
      renderQuran();
      return;
    }
    frameQuranOp({ year: rInfo.year, op });
  }
  qPlus.addEventListener('click', () => quranStep('inc'));
  qMinus.addEventListener('click', () => quranStep('dec'));
  on('quran', () => { if (rInfo.active) renderQuran(); });

  function renderQuran() {
    const show = config.ramadan.quran !== false;
    rQuran.hidden = !show;
    if (!show) return;
    const juz = juzNow();
    // One juz a day: by the end of day N, N juz. At night the day's reading is still open.
    const expected = Math.min(30, rInfo.night ? rInfo.day - 1 : rInfo.day);
    setText(qCount, juz === 0 ? 'لم نبدأ بعد' : 'قرأنا ' + juzAr(juz) + ' من 30');
    qBar.textContent = '';
    for (let i = 1; i <= 30; i++) {
      qBar.appendChild(h('i', { class: (i <= juz ? 'is-read' : '') + (i === expected ? ' is-target' : '') }));
    }
    qBar.appendChild(h('b', { class: 'r-q-n' }, String(juz), h('small', null, 'من 30 جزءاً')));
    const diff = juz - expected;
    setText(qStatus, juz >= 30 ? 'ختمنا القرآن، تقبّل الله منا ومنكم'
      : diff === 0 ? 'في الموعد: جزء كل يوم تُختم الختمة مع آخر رمضان'
        : diff < 0 ? 'متأخرون بـ' + juzAr(-diff) + ' عن جزء في اليوم'
          : 'متقدمون بـ' + juzAr(diff) + ' عن جزء في اليوم');
    qMinus.disabled = juz === 0;
    qPlus.disabled = juz >= 30;
  }

  function renderRamadan(t) {
    const today = prayerDay(t);
    const tomorrow = prayerDay(t + DAY);
    if (!today) return false;
    // Head: the next thing the fasting family waits for.
    const iftarDone = t >= today.maghrib;
    const justBroke = iftarDone && t - today.maghrib < 30 * MINUTE;
    // Lanterns are lit from Maghrib until imsak.
    el.classList.toggle('is-lit', iftarDone || t < today.imsak);
    el.classList.toggle('is-now', justBroke);
    if (justBroke) {
      setText(nextName, 'الإفطار');
      setAt('تقبّل الله صيامكم');
      setCd(hhmm(today.maghrib));
      setText(cdCap, 'أذان المغرب');
      setText(riWhen, 'المغرب ' + hhmm(today.maghrib) + ' · ' + rInfo.day + ' رمضان');
      setText(riIsha, hhmm(today.isha));
      setText(riSuhoor, tomorrow && tomorrow.imsak ? hhmm(tomorrow.imsak) : '');
    } else if (t >= today.imsak && !iftarDone) {
      setText(nextName, 'الإفطار');
      setAt('أذان المغرب على الساعة ', hhmm(today.maghrib));
      setCd(countdown(today.maghrib - t));
      setText(cdCap, 'متبقية حتى الإفطار');
    } else {
      const imsak = t < today.imsak ? today.imsak : tomorrow && tomorrow.imsak;
      const fajr = t < today.imsak ? today.fajr : tomorrow && tomorrow.fajr;
      setText(nextName, 'السحور');
      setAt(imsak ? 'الإمساك ' + hhmm(imsak) + ' · الفجر ' + hhmm(fajr) : '');
      setCd(imsak ? countdown(imsak - t) : '');
      setText(cdCap, 'متبقية حتى الإمساك');
    }

    // The fast's day and the month so far.
    setText(rDay, (rInfo.night ? 'ليلة ' : 'اليوم ') + rInfo.day + ' من رمضان' + (rInfo.preview ? ' · معاينة' : ''));
    setText(rhDay, rInfo.day + ' رمضان');
    { const q = parts(t); setText(rhDate, WEEKDAYS[q.wd] + ' ' + q.d + ' ' + MONTHS_AR[q.m - 1] + ' · ' + hhmm(t)); }
    const left = Math.max(0, 30 - rInfo.day + (rInfo.night ? 1 : 0));
    setText(rLeft, left === 0 ? 'آخر يوم' : left === 1 ? 'يبقى يوم واحد' : left === 2 ? 'يبقى يومان' : left <= 10 ? 'يبقى ' + left + ' أيام' : 'يبقى ' + left + ' يوماً');
    if (rDots.childElementCount !== 30 || rDots.getAttribute('data-day') !== rInfo.day + ':' + rInfo.night) {
      rDots.setAttribute('data-day', rInfo.day + ':' + rInfo.night);
      rDots.textContent = '';
      for (let i = 1; i <= 30; i++) {
        rDots.appendChild(h('i', { class: i < rInfo.day ? 'is-past' : i === rInfo.day ? 'is-on' : '' }));
      }
    }

    // Times of the fast: tonight's suhoor belongs to tomorrow's fast.
    const day = iftarDone && !justBroke && tomorrow ? tomorrow : today;
    const key = R_TILES.map((x) => day[x.k]).join(',') + ':' + Math.floor(t / MINUTE);
    if (rTiles.getAttribute('data-key') !== key) {
      rTiles.setAttribute('data-key', key);
      rTiles.textContent = '';
      let nextMarked = false;
      for (const x of R_TILES) {
        const at = day[x.k];
        if (!at) continue;
        const past = at <= t;
        const isNext = !past && !nextMarked;
        if (isNext) nextMarked = true;
        rTiles.appendChild(h('div', { class: 'r-tile k-' + x.k + (x.key ? ' is-key' : '') + (past ? ' is-past' : '') + (isNext ? ' is-next' : '') },
          h('div', { class: 'r-t-name' }, x.ar),
          h('bdi', { class: 'r-t-time', dir: 'ltr' }, hhmm(at)),
          h('div', { class: 'r-t-note' }, x.note || ''),
        ));
      }
    }
    renderQuran();
    return true;
  }

  function tick(t) {
    const info = ramadanInfo(t);
    if (info.active !== rInfo.active || info.preview !== rInfo.preview) previewJuz = null;
    rInfo = info;
    el.classList.toggle('is-ramadan', !!info.active);
    if (!info.active) el.classList.remove('is-lit');
    if (info.active) {
      empty.style.display = 'none';
      if (renderRamadan(t)) return;
    }
    const dd = displayDay(t);
    empty.style.display = dd ? 'none' : '';
    svg.style.display = dd ? '' : 'none';
    if (!dd) return;
    tiles.update(t);
    setText(nowTime, hhmm(t));
    { const q = parts(t); setText(nowDate, WEEKDAYS[q.wd] + ' ' + q.d + ' ' + MONTHS_AR[q.m - 1]); }
    { const dd = displayDay(t); setText(nowSun, dd && dd.times.sunrise ? 'الشروق ' + hhmm(dd.times.sunrise) : ''); }
    const np = nextPrayer(t);
    const key = dd.times.fajr + ':' + (np ? np.k + np.at : '') + ':' + Math.floor(t / (5 * MINUTE));
    if (key !== drawnFor) { drawnFor = key; draw(dd.times, t); }
    placeMarker(t);

    const lp = lastPrayer(t);
    if (lp && t - lp.at < config.prayerFocus.after * MINUTE && lp.k !== 'sunrise') {
      setText(nextName, lp.ar);
      setAt('حان الآن وقت الصلاة');
      setCd(hhmm(lp.at));
      setText(cdCap, 'الأذان');
      setText(nextIn, 'حان الآن');
      el.classList.add('is-now');
    } else if (np) {
      el.classList.remove('is-now');
      setText(nextName, np.ar);
      const p = parts(np.at);
      const sameDay = parts(t).d === p.d;
      setAt((sameDay ? 'يُرفع الأذان على الساعة ' : 'يُرفع الأذان ' + WEEKDAYS[p.wd] + ' على الساعة ') + hhmm(np.at));
      setText(nextIn, 'بعد ' + durationAr(np.at - t));
      setCd(countdown(np.at - t));
      setText(cdCap, 'متبقية حتى الأذان');
    }
  }

  on('prayer', () => { drawnFor = ''; tiles.reset(); rTiles.removeAttribute('data-key'); tick(now()); });
  on('settings', () => { rTiles.removeAttribute('data-key'); tick(now()); });

  return { name: 'prayer', label: 'الصلاة', el, tick, show() { drawnFor = ''; tick(now()); } };
}
