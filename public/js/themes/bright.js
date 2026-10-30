// «فاتح»: a painted Fes plate whose rim is the 24-hour day (clock screen) and the day as a
// cobalt line with the sun on it (prayer screen). Both redraw once a minute.
import { prayerDay } from '../data.js';
import { parts, hhmm } from '../util.js';

const NS = 'http://www.w3.org/2000/svg';
const KEYS = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];
const SUN_RAYS = (r1, r2) => {
  let d = '';
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    d += `M${(r1 * Math.cos(a)).toFixed(1)} ${(r1 * Math.sin(a)).toFixed(1)}L${(r2 * Math.cos(a)).toFixed(1)} ${(r2 * Math.sin(a)).toFixed(1)}`;
  }
  return d;
};
const SUN = (r) => `<path d="${SUN_RAYS(r + 8, r + 15)}" stroke="#E9A23B" stroke-width="3.5" stroke-linecap="round"/><circle r="${r}" fill="#F2B84B" stroke="#FFFFFF" stroke-width="3"/>`;
const MOON = '<circle r="19" fill="#FFFFFF" stroke="#1F48A8" stroke-width="3"/><path d="M3 -12a12 12 0 1 0 9 19a9.5 9.5 0 1 1 -9 -19z" fill="#1F48A8"/>';

function svgEl(markup, attrs) {
  const el = document.createElementNS(NS, 'svg');
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  el.innerHTML = markup;
  return el;
}

// Local hour of day (0–24) of an instant, in the frame's time zone.
const hourOf = (t) => { const p = parts(t); return p.h + p.mi / 60 + p.s / 3600; };

// The names the screen shows (الجمعة on Fridays…), read from the prayer row.
function names(screen, sel) {
  const out = {};
  for (const k of KEYS) {
    const n = screen.querySelector(sel + ' .k-' + k + ' .prow-name');
    out[k] = (n && n.textContent) || '';
  }
  return out;
}
function nextKey(screen, sel) {
  const n = screen.querySelector(sel + ' .is-next');
  if (!n) return '';
  const k = KEYS.find((x) => n.classList.contains('k-' + x));
  return k || '';
}

// ---------- the plate ----------
const CX = 360, CY = 400;
const pt = (h, r) => {
  const a = (h / 24) * 2 * Math.PI + Math.PI; // midnight at the bottom, noon at the top
  return [CX + r * Math.sin(a), CY - r * Math.cos(a)];
};
const f1 = (v) => v.toFixed(1);
function arc(h0, h1, r) {
  let span = h1 - h0;
  while (span < 0) span += 24;
  if (span <= 0.01) return '';
  const [x0, y0] = pt(h0, r);
  const [x1, y1] = pt(h0 + span, r);
  return `M${f1(x0)} ${f1(y0)} A${r} ${r} 0 ${span > 12 ? 1 : 0} 1 ${f1(x1)} ${f1(y1)}`;
}

function plate(layer, screen) {
  // The fixed painting, as in the mockup: rim, the day track, an inner ring of 36 dots.
  const svg = svgEl(`
    <circle cx="${CX + 4}" cy="${CY + 10}" r="300" fill="#DCE4F3"/>
    <circle cx="${CX}" cy="${CY}" r="300" fill="#FFFFFF" stroke="#1F48A8" stroke-width="5"/>
    <circle cx="${CX}" cy="${CY}" r="288" fill="none" stroke="#1F48A8" stroke-width="1.5"/>
    <circle cx="${CX}" cy="${CY}" r="268" fill="none" stroke="#E3E9F6" stroke-width="22"/>
    <path class="br-day" fill="none" stroke="#FCE3B0" stroke-width="22"/>
    <path class="br-passed" fill="none" stroke="#F2B84B" stroke-width="22"/>
    <circle cx="${CX}" cy="${CY}" r="214" fill="none" stroke="#1F48A8" stroke-width="1.2"/>
    <g class="br-dots" fill="#1F48A8"></g>
    <g class="br-marks"></g>
    <g class="br-now"></g>`, { width: 1280, height: 800, class: 'br-plate', direction: 'ltr' });
  layer.appendChild(svg);
  const q = (s) => svg.querySelector(s);
  const day = q('.br-day'), passed = q('.br-passed'), dotsG = q('.br-dots'), marks = q('.br-marks'), nowG = q('.br-now');
  let last = '';
  return function tick(t) {
    const d = prayerDay(t);
    const nk = nextKey(screen, '.h-prayers');
    const nm = names(screen, '.h-prayers');
    const key = Math.floor(t / 60000) + nk + (d ? d.fajr : '') + nm.dhuhr;
    if (key === last) return;
    last = key;
    const hn = hourOf(t);
    nowG.innerHTML = '';
    marks.innerHTML = '';
    const labelAt = [];
    if (d) {
      const hr = hourOf(d.sunrise), hs = hourOf(d.sunset || d.maghrib);
      const isDay = hn >= hr && hn <= hs;
      day.setAttribute('d', arc(hr, hs, 268));
      passed.setAttribute('d', isDay ? arc(hr, hn, 268) : '');
      let m = '';
      for (const k of KEYS) {
        if (!d[k]) continue;
        const h = hourOf(d[k]);
        const [x, y] = pt(h, 268);
        const isNext = k === nk;
        const minor = k === 'sunrise';
        m += `<circle cx="${f1(x)}" cy="${f1(y)}" r="${minor ? 6 : isNext ? 13 : 10}" fill="#FFFFFF" stroke="${isNext ? '#E9A23B' : '#1F48A8'}" stroke-width="${isNext ? 5 : 3}"/>`;
        // The name just inside the rim, as on the mockup.
        const [lx, ly] = pt(h, 228);
        labelAt.push([lx, ly]);
        m += `<text x="${f1(lx)}" y="${f1(ly + 6)}" text-anchor="middle" class="br-plate-t${isNext ? ' is-next' : ''}">${minor ? 'الشروق' : nm[k]}</text>`;
      }
      marks.innerHTML = m;
      const [sx, sy] = pt(hn, 268);
      nowG.setAttribute('transform', `translate(${f1(sx)} ${f1(sy)})`);
      nowG.innerHTML = isDay ? SUN(17) : MOON;
    } else {
      day.setAttribute('d', '');
      passed.setAttribute('d', '');
    }
    // 36 dots, one every 40 minutes; the ones a name would sit on are left out.
    let dots = '';
    for (let i = 0; i < 36; i++) {
      const a = (i * Math.PI) / 18;
      const x = CX + 224 * Math.sin(a), y = CY - 224 * Math.cos(a);
      if (labelAt.some(([lx, ly]) => Math.abs(lx - x) < 30 && Math.abs(ly - y) < 13)) continue;
      dots += `<circle cx="${f1(x)}" cy="${f1(y)}" r="2.4"/>`;
    }
    dotsG.innerHTML = dots;
  };
}

// ---------- the day line on the prayer screen ----------
const X0 = 64, X1 = 1216, LY = 330;
function dayLine(layer, screen) {
  const svg = svgEl(`
    <line x1="${X0}" y1="${LY}" x2="${X1}" y2="${LY}" stroke="#E3E9F6" stroke-width="6" stroke-linecap="round"/>
    <line class="br-lday" y1="${LY}" y2="${LY}" stroke="#FCE3B0" stroke-width="14" stroke-linecap="round"/>
    <line class="br-lpassed" y1="${LY}" y2="${LY}" stroke="#F2B84B" stroke-width="14" stroke-linecap="round"/>
    <g class="br-lmarks"></g>
    <g class="br-lnow"></g>`, { width: 1280, height: 800, class: 'br-line', direction: 'ltr' });
  layer.appendChild(svg);
  const q = (s) => svg.querySelector(s);
  const lday = q('.br-lday'), lpassed = q('.br-lpassed'), marks = q('.br-lmarks'), nowG = q('.br-lnow');
  let last = '';
  return function tick(t) {
    const d = prayerDay(t);
    const nk = nextKey(screen, '.p-tiles');
    const key = Math.floor(t / 60000) + nk + (d ? d.fajr : '');
    if (key === last) return;
    last = key;
    svg.style.display = d ? '' : 'none';
    if (!d) return;
    const T0 = d.fajr - 64 * 60000, T1 = d.isha + 108 * 60000;
    const x = (tt) => X1 - ((Math.min(T1, Math.max(T0, tt)) - T0) / (T1 - T0)) * (X1 - X0);
    const sunset = d.sunset || d.maghrib;
    const isDay = t >= d.sunrise && t <= sunset;
    lday.setAttribute('x1', f1(x(d.sunrise)));
    lday.setAttribute('x2', f1(x(sunset)));
    lpassed.style.display = isDay ? '' : 'none';
    lpassed.setAttribute('x1', f1(x(d.sunrise)));
    lpassed.setAttribute('x2', f1(x(t)));
    let m = '';
    for (const k of KEYS) {
      if (!d[k]) continue;
      const px = x(d[k]);
      const isNext = k === nk;
      const minor = k === 'sunrise';
      m += `<circle cx="${f1(px)}" cy="${LY}" r="${isNext ? 12 : minor ? 6 : 9}" fill="#FFFFFF" stroke="${isNext ? '#E9A23B' : '#1F48A8'}" stroke-width="${isNext ? 5 : 3}"/>`;
      m += `<text x="${f1(px)}" y="${LY + 42}" text-anchor="middle" class="br-line-t${isNext ? ' is-next' : ''}">${minor ? 'الشروق' : hhmm(d[k])}</text>`;
    }
    marks.innerHTML = m;
    const nx = x(t);
    nowG.innerHTML = (isDay ? SUN(16) : MOON) + `<text y="-36" text-anchor="middle" class="br-line-now">الآن ${hhmm(t)}</text>`;
    nowG.setAttribute('transform', `translate(${f1(nx)} ${LY})`);
  };
}

export function mount({ screens, stage }) {
  const ticks = [];
  if (screens.home) ticks.push(plate(screens.home.art, screens.home.el));
  if (screens.prayer) ticks.push(dayLine(screens.prayer.art, screens.prayer.el));
  let shown = '';
  return {
    tick(t, screenName) {
      // The clock screen lays the top cards out in its right column.
      if (stage && screenName && screenName !== shown) { shown = screenName; stage.setAttribute('data-tscreen', screenName); }
      for (const f of ticks) f(t);
    },
    unmount() { if (stage) stage.removeAttribute('data-tscreen'); },
  };
}
