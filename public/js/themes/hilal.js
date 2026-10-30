// «الهلال» (mockups T10-Hilal-*): tonight's real moon over a sleeping city. The clock screen shows
// the moon in its actual phase (computed here), ringed by one dot per day of the Hijri month and
// framed by a gold arch; the prayer screen joins the five prayers and sunrise into a
// constellation; the lists tick off with crescents that become full moons. Every screen has the
// same night: a faint khatam lattice and stars (CSS), a skyline with a few lit windows and a
// handful of slowly twinkling stars (drawn here once).
import { hijri, hhmm, MONTHS, HIJRI_MONTHS, DAY, MINUTE, parts, startOfDay } from '../util.js';
import { prayerDay } from '../data.js';
import { PRAYERS, prayerName, nextPrayer, displayDay } from '../prayer-times.js';

const NS = 'http://www.w3.org/2000/svg';
function svgEl(markup, attrs) {
  const el = document.createElementNS(NS, 'svg');
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  el.innerHTML = markup;
  return el;
}
function div(cls, parent, html) {
  const el = document.createElement('div');
  el.className = cls;
  if (html) el.innerHTML = html;
  parent.appendChild(el);
  return el;
}
const f1 = (v) => (Math.round(v * 10) / 10).toString();

// ---------- the moon ----------
// Phase from the Moon's elongation (Meeus, Astronomical Algorithms ch. 48, low precision: the
// lit fraction to about 1%); the age in days counts the synodic month (29.530588 days) from a
// known new moon (6 Jan 2000, 18:14 UTC); the next new moon from Meeus ch. 49 (a few minutes).
const SYN = 29.530588853;
const NEW0 = Date.UTC(2000, 0, 6, 18, 14);
const RAD = Math.PI / 180;
const sin = (d) => Math.sin(d * RAD), cos = (d) => Math.cos(d * RAD);

export function moonPhase(t) {
  const T = (t / DAY + 2440587.5 - 2451545) / 36525;
  const D = 297.8501921 + 445267.1114034 * T;
  const M = 357.5291092 + 35999.0502909 * T;
  const Mp = 134.9633964 + 477198.8675055 * T;
  const el = D + 6.289 * sin(Mp) - 2.1 * sin(M) + 1.274 * sin(2 * D - Mp) + 0.658 * sin(2 * D) + 0.214 * sin(2 * Mp) + 0.11 * sin(D);
  const e = ((el % 360) + 360) % 360;
  return { frac: (1 - cos(e)) / 2, waxing: e < 180, age: ((((t - NEW0) / DAY) % SYN) + SYN) % SYN };
}
function newMoon(k) {
  const T = k / 1236.85, E = 1 - 0.002516 * T;
  const M = 2.5534 + 29.1053567 * k, Mp = 201.5643 + 385.81693528 * k;
  const F = 160.7108 + 390.67050284 * k, Om = 124.7746 - 1.56375588 * k;
  const jde = 2451550.09766 + 29.530588861 * k + 0.00015437 * T * T
    - 0.4072 * sin(Mp) + 0.17241 * E * sin(M) + 0.01608 * sin(2 * Mp) + 0.01039 * sin(2 * F) + 0.00739 * E * sin(Mp - M)
    - 0.00514 * E * sin(Mp + M) + 0.00208 * E * E * sin(2 * M) - 0.00111 * sin(Mp - 2 * F) - 0.00057 * sin(Mp + 2 * F)
    + 0.00056 * E * sin(2 * Mp + M) - 0.00042 * sin(3 * Mp) + 0.00042 * E * sin(M + 2 * F) + 0.00038 * E * sin(M - 2 * F)
    - 0.00024 * E * sin(2 * Mp - M) - 0.00017 * sin(Om);
  return (jde - 2440587.5) * DAY - 69000; // TT → UT
}
function newMoonAfter(t) {
  let k = Math.floor((t - NEW0) / DAY / SYN) - 1;
  while (newMoon(k) <= t) k++;
  return newMoon(k);
}
export function phaseName(m) {
  if (m.frac < 0.03) return 'محاق';
  if (m.frac > 0.97) return 'بدر';
  if (Math.abs(m.frac - 0.5) <= 0.04) return m.waxing ? 'تربيع أول' : 'تربيع أخير';
  if (m.frac < 0.5) return m.waxing ? 'هلال متزايد' : 'هلال متناقص';
  return m.waxing ? 'أحدب متزايد' : 'أحدب متناقص';
}
// The evening the next month's crescent can be looked for: the first sunset at which the Moon is
// at least 20 hours old (sunset from the prayer times when known, else 18:00).
function crescentEvening(t, hd) {
  const nm = newMoonAfter(hd >= 25 ? t - 3 * DAY : t);
  let day = startOfDay(nm);
  for (let i = 0; i < 4; i++, day += DAY) {
    const pd = prayerDay(day + 12 * 3600000);
    const sunset = pd && (pd.sunset || pd.maghrib) ? (pd.sunset || pd.maghrib) : day + 18 * 3600000;
    if (sunset - nm >= 20 * 3600000) break;
  }
  return Math.max(day, startOfDay(t));
}
// The lit part of a disc of radius r at the origin: the limb on one side and the terminator, a
// half-ellipse. Waxing: lit on the right (as seen from Morocco); waning: on the left.
function litPath(r, m) {
  const rx = f1(Math.abs(1 - 2 * m.frac) * r);
  const a = m.waxing ? 1 : 0, b = (m.frac > 0.5) === m.waxing ? 1 : 0;
  return `M0 ${-r}A${r} ${r} 0 0 ${a} 0 ${r}A${rx} ${r} 0 0 ${b} 0 ${-r}Z`;
}
const MARIA = (r) => {
  const s = r / 150;
  const e = (x, y, rx, ry) => `<ellipse cx="${f1(x * s)}" cy="${f1(y * s)}" rx="${f1(rx * s)}" ry="${f1(ry * s)}"/>`;
  return e(-48, -48, 46, 34) + e(20, -70, 30, 22) + e(-68, 30, 34, 44) + e(0, 62, 22, 16) + e(56, 4, 26, 30) + e(-20, -6, 16, 12)
    + `<circle cx="${f1(42 * s)}" cy="${f1(112 * s)}" r="${f1(9 * s)}"/><circle cx="${f1(-100 * s)}" cy="${f1(-100 * s)}" r="${f1(7 * s)}"/>`;
};
// A moon of radius r at (x, y), with ids prefixed by p. Returns its markup and an updater.
function moonMarkup(p, x, y, r, glow) {
  return `
    <defs>
      <radialGradient id="${p}Glow"><stop offset="0" stop-color="#EDE9DC" stop-opacity="0.2"/><stop offset="0.45" stop-color="#EDE9DC" stop-opacity="0.07"/><stop offset="1" stop-color="#EDE9DC" stop-opacity="0"/></radialGradient>
      <radialGradient id="${p}Face" cx="0.4" cy="0.38" r="0.7"><stop offset="0" stop-color="#F6F3EA"/><stop offset="1" stop-color="#D9D4C4"/></radialGradient>
      <clipPath id="${p}Lit"><path class="hl-lit" d=""/></clipPath>
    </defs>
    <g transform="translate(${x} ${y})">
      <circle r="${glow}" fill="url(#${p}Glow)"/>
      <circle r="${r}" fill="#121939"/>
      <g fill="#EDE9DC" opacity="0.05">${MARIA(r)}</g>
      <g clip-path="url(#${p}Lit)"><circle r="${r}" fill="url(#${p}Face)"/><g fill="#B6B09E" opacity="0.42">${MARIA(r)}</g></g>
      <circle r="${r}" fill="none" stroke="#2B3466" stroke-width="1"/>
    </g>`;
}
function moonUpdater(svg, r) {
  const lit = svg.querySelector('.hl-lit');
  let key = '';
  return (m) => {
    const k = Math.round(m.frac * 400) + (m.waxing ? 'w' : 'n');
    if (k === key) return;
    key = k;
    lit.setAttribute('d', litPath(r, m));
  };
}

// ---------- the night around every screen ----------
// The city: a wall with flat roofs, merlons, white-domed koubbas, a minaret with its lantern and
// three gilded balls, two palms; a farther, paler row behind; a few lit windows.
function city(dy, low) {
  const P = [];
  const block = (x, w, top) => P.push(`M${x} 800V${top}H${x + w}V800Z`);
  const merlons = (x, w, top) => { block(x, w, top); for (let i = x + 3; i + 7 <= x + w; i += 13) P.push(`M${i} ${top}v-7h7v7Z`); };
  const dome = (x, w, top) => {
    block(x, w, top);
    const r = w * 0.38, c = x + w / 2;
    P.push(`M${f1(c - r)} ${top}A${f1(r)} ${f1(r * 1.05)} 0 0 1 ${f1(c + r)} ${top}Z`);
    P.push(`M${f1(c - 1.2)} ${f1(top - r * 1.05 + 2)}v-12h2.4v12Z`);
  };
  const minaret = (c, top) => {
    block(c - 22, 44, top);
    for (let i = c - 22; i < c + 22; i += 11) P.push(`M${i} ${top}l3 -9h5l3 9Z`);
    block(c - 11, 22, top - 40);
    P.push(`M${c - 11} ${top - 40}A11 9 0 0 1 ${c + 11} ${top - 40}Z`);
    P.push(`M${c - 1} ${top - 49}v-28h2v28Z`);
  };
  // the far row
  const far = [];
  const fb = (x, w, top) => far.push(`M${x} 800V${top}H${x + w}V800Z`);
  const fd = (x, w, top) => { fb(x, w, top); const r = w * 0.4, c = x + w / 2; far.push(`M${f1(c - r)} ${top}A${f1(r)} ${f1(r)} 0 0 1 ${f1(c + r)} ${top}Z`); };
  fb(0, 1280, 700); fb(40, 70, 672); fd(150, 60, 668); fb(300, 90, 662); fb(470, 60, 676); fd(700, 90, 664); fb(840, 70, 670);
  fd(1000, 64, 672); fb(1170, 80, 668);
  if (!low) { fb(843, 34, 636); far.push('M843 636l4-8h26l4 8Z M851 628v-16h18v16Z M859 612v-14h2v14Z'); }
  // the near row
  block(0, 1280, 722);
  merlons(0, 96, 692); dome(108, 72, 700); block(196, 64, 686); merlons(262, 110, 702); dome(380, 92, 694); block(484, 70, 708);
  merlons(560, 54, 690); if (!low) minaret(640, 600); merlons(678, 64, 698); dome(760, 84, 700); block(856, 96, 690); merlons(960, 80, 704);
  dome(1050, 74, 694); block(1136, 52, 684); merlons(1196, 84, 700);
  // palms
  const palm = (x, top, s) => `<g transform="translate(${x} ${top}) scale(${s})"><path d="M0 0C-2 30 -4 60 -1 96" stroke-width="5"/><path d="M0 0C-14 -10 -30 -8 -42 4M0 0C-12 -18 -28 -22 -40 -16M0 0C4 -18 18 -26 34 -22M0 0C14 -8 30 -6 40 8M0 0C-2 -14 2 -26 10 -34" stroke-width="4"/></g>`;
  // lit windows kept clear of the prayer names along the roofs of the clock screen
  const lit = [[40, 702], [86, 712], [268, 712], [318, 700], [500, 716], [568, 700], [740, 708], [796, 712], [962, 714], [1004, 714], [1180, 696], [1236, 712]];
  if (!low) lit.push([637, 640]);
  const farLit = [[64, 688], [330, 680], [745, 676], [1196, 684]];
  const win = (x, y, o, c) => `<path d="M${x} ${y + 10}v-6a3 3 0 0 1 6 0v6Z" fill="${c}" opacity="${o}"/>`;
  return `<g class="hl-city" transform="translate(0 ${dy})">
    <path d="${far.join('')}" fill="#121A45"/>
    ${farLit.map(([x, y]) => win(x, y, 0.4, '#C9A65A')).join('')}
    ${low ? '' : `<g fill="none" stroke="#070B20" stroke-linecap="round">${palm(58, 640, 0.9)}${palm(1010, 652, 0.75)}</g>`}
    <path d="${P.join('')}" fill="#070B20"/>
    ${lit.map(([x, y], i) => win(x, y, i % 3 ? 0.85 : 0.6, '#E9C46A')).join('')}
  </g>`;
}
// A few stars that twinkle (separate small elements: only their opacity animates).
function twinkles(layer, spots) {
  for (const [x, y, s, d] of spots) {
    const el = document.createElement('i');
    el.className = 'hl-tw';
    el.style.cssText = `left:${x - s / 2}px;top:${y - s / 2}px;width:${s}px;height:${s}px;animation-delay:${d}s`;
    layer.appendChild(el);
  }
}
const STAR4 = 'M0 -50L11 -11L50 0L11 11L0 50L-11 11L-50 0L-11 -11Z';
const star4 = (x, y, size, attrs) => `<path transform="translate(${f1(x)} ${f1(y)}) scale(${(size / 100).toFixed(3)})" d="${STAR4}" ${attrs}/>`;

// ---------- clock screen ----------
const CX = 320, CY = 350, MR = 158, RR = 226, AR = 272;
function homeArt(layer, screen) {
  let dots = '';
  for (let i = 1; i <= 30; i++) {
    const a = (-90 - (i - 1) * 12) * RAD;
    dots += `<circle class="hl-d" cx="${f1(CX + RR * Math.cos(a))}" cy="${f1(CY + RR * Math.sin(a))}" r="4.5"/>`;
  }
  const arch = (r) => `M${CX - r} 760V${CY}A${r} ${r} 0 0 1 ${CX + r} ${CY}V760`;
  const svg = svgEl(`
    ${moonMarkup('hlM', CX, CY, MR, 330)}
    <path d="${arch(AR)}" fill="none" stroke="#E9C46A" stroke-opacity="0.42" stroke-width="1.5"/>
    <path d="${arch(AR - 9)}" fill="none" stroke="#E9C46A" stroke-opacity="0.16" stroke-width="1"/>
    <g fill="#E9C46A" opacity="0.8">${star4(CX, CY - AR, 22, '')}</g>
    <circle cx="${CX}" cy="${CY}" r="${RR}" fill="none" stroke="#2B3466" stroke-width="1.5"/>
    <g class="hl-dots">${dots}</g>
    <text class="hl-one" x="${CX}" y="${CY - RR - 16}" text-anchor="middle">1</text>
    <g class="hl-today"><circle r="16" fill="#E9C46A" opacity="0.18"/><circle r="9" fill="#E9C46A" stroke="#FFF3CF" stroke-width="3"/></g>
    <text class="hl-tnum" text-anchor="middle"></text>
    ${city(0)}`, { width: 1280, height: 800, class: 'hl-art' });
  layer.appendChild(svg);
  twinkles(layer, [[612, 92, 16, 0], [1236, 34, 12, 2.2], [36, 520, 13, 4.1], [744, 626, 11, 1.3], [580, 250, 10, 3.2], [1150, 640, 12, 5]]);
  const cap = div('hl-cap', layer);
  const capMoon = div('hl-cap-moon', cap);
  const capNext = div('hl-cap-next', cap);
  const setMoon = moonUpdater(svg, MR);
  const dotEls = svg.querySelectorAll('.hl-d');
  const today = svg.querySelector('.hl-today');
  const tnum = svg.querySelector('.hl-tnum');
  const wx = screen.querySelector('.h-wxm');
  const main = screen.querySelector('.h-main');
  const next = screen.querySelector('.h-next');
  let lastMoon = -1, lastDay = '', lastWx = '';

  return function tick(t) {
    // the gap for the weather line under the next prayer (its height follows the sentence)
    const minute = Math.floor(t / MINUTE);
    const wkey = minute + '|' + wx.textContent;
    if (wkey !== lastWx) {
      lastWx = wkey;
      screen.style.setProperty('--hl-wx-top', (main.offsetTop + next.offsetTop + next.offsetHeight + 6) + 'px');
      screen.style.setProperty('--hl-wx-h', wx.offsetHeight + 'px');
    }
    const slot = Math.floor(t / (5 * MINUTE));
    if (slot !== lastMoon) {
      lastMoon = slot;
      const m = moonPhase(t);
      setMoon(m);
      capMoon.textContent = 'القمر الليلة: ' + phaseName(m) + ' · مضاء ' + Math.round(m.frac * 100) + '%';
    }
    const hj = hijri(t);
    const dk = hj ? hj.y + '-' + hj.m + '-' + hj.d : '';
    if (dk === lastDay) return;
    lastDay = dk;
    // the Hijri date in two sizes (the same date as .h-hijri, whose own text is set aside)
    screen.style.setProperty('--hl-hd', hj ? '"' + hj.d + ' ' + hj.month + '"' : '""');
    screen.style.setProperty('--hl-hy', hj ? '"' + hj.y + '"' : '""');
    screen.classList.toggle('hl-has-hijri', !!hj);
    if (!hj) { today.style.display = 'none'; return; }
    for (let i = 0; i < 30; i++) {
      const n = i + 1;
      dotEls[i].setAttribute('class', 'hl-d' + (n < hj.d ? ' is-past' : n === hj.d ? ' is-on' : '') + (n === 30 ? ' is-maybe' : ''));
    }
    const a = (-90 - (hj.d - 1) * 12) * RAD;
    today.style.display = '';
    today.setAttribute('transform', `translate(${f1(CX + RR * Math.cos(a))} ${f1(CY + RR * Math.sin(a))})`);
    tnum.textContent = String(hj.d);
    tnum.setAttribute('x', f1(CX + (RR + 30) * Math.cos(a)));
    tnum.setAttribute('y', f1(CY + (RR + 30) * Math.sin(a) + 8));
    const ev = parts(crescentEvening(t, hj.d));
    capNext.textContent = 'يُرتقب هلال ' + HIJRI_MONTHS[hj.m % 12] + ' نحو ' + ev.d + ' ' + MONTHS[ev.m - 1];
  };
}

// ---------- prayer screen: the constellation ----------
const SPOTS = { fajr: [1110, 500], sunrise: [990, 432], dhuhr: [850, 312], asr: [620, 380], maghrib: [400, 462], isha: [180, 532] };
function prayerArt(layer, screen) {
  const svg = svgEl(`
    <g class="hl-pmoon">${moonMarkup('hlP', 560, 150, 40, 120)}</g>
    ${city(0)}
    <g class="hl-const"><g class="hl-lines"></g><circle class="hl-glow" r="130" fill="url(#hlPGold)"/><g class="hl-stars"></g></g>
    <defs><radialGradient id="hlPGold"><stop offset="0" stop-color="#E9C46A" stop-opacity="0.42"/><stop offset="1" stop-color="#E9C46A" stop-opacity="0"/></radialGradient></defs>`, { width: 1280, height: 800, class: 'hl-art' });
  layer.appendChild(svg);
  twinkles(layer, [[300, 280, 14, 0.6], [1000, 250, 12, 2.6], [120, 380, 12, 4.4], [760, 560, 10, 1.6], [1210, 400, 13, 3.4]]);
  div('hl-foot', layer, '«أرحنا بها يا بلال»');
  const setMoon = moonUpdater(svg, 40);
  const lines = svg.querySelector('.hl-lines');
  const stars = svg.querySelector('.hl-stars');
  const glow = svg.querySelector('.hl-glow');
  let last = '', lastMoon = -1, lastHj = '';

  return function tick(t) {
    const slot = Math.floor(t / (5 * MINUTE));
    if (slot !== lastMoon) { lastMoon = slot; setMoon(moonPhase(t)); }
    const hj = hijri(t);
    const hs = hj ? '"\\00a0· ' + hj.d + ' ' + hj.month + '"' : '""';
    if (hs !== lastHj) { lastHj = hs; screen.style.setProperty('--hl-hijri', hs); }
    const dd = displayDay(t);
    const np = nextPrayer(t);
    const key = Math.floor(t / MINUTE) + ':' + (dd ? dd.times.fajr : '') + ':' + (np ? np.at : '');
    if (key === last) return;
    last = key;
    svg.querySelector('.hl-const').style.display = dd ? '' : 'none';
    if (!dd) return;
    const T = dd.times;
    const list = PRAYERS.filter((p) => T[p.k]);
    let html = '', solid = '', dashed = '', reached = true;
    let prev = null;
    for (const p of list) {
      const at = T[p.k];
      const [x, y] = SPOTS[p.k];
      const next = !!(np && np.k === p.k && np.at === at);
      const past = !next && at <= t;
      if (prev) {
        const seg = `M${prev[0]} ${prev[1]}L${x} ${y}`;
        if (reached && (past || next)) solid += seg; else dashed += seg;
      }
      if (!(past || next)) reached = false;
      prev = [x, y];
      const size = next ? 64 : p.minor ? 18 : 30;
      const fill = next ? 'fill="#E9C46A" stroke="#FFF3CF" stroke-width="5"'
        : past || p.minor ? 'fill="#C9C5B6" stroke="#C9C5B6" stroke-width="5"' : 'fill="#0D1330" stroke="#8C93BD" stroke-width="5"';
      const cls = 'hl-pt' + (next ? ' is-next' : past ? ' is-past' : '') + (p.minor ? ' is-minor' : '');
      const ny = y + size / 2 + (next ? 36 : p.minor ? 20 : 30);
      const ty = ny + (next ? 46 : p.minor ? 20 : 34);
      html += `<g class="${cls}">${star4(x, y, size, fill)}<text class="hl-sn" x="${x}" y="${ny}" text-anchor="middle">${prayerName(p.k, at)}</text><text class="hl-st" x="${x}" y="${ty}" text-anchor="middle">${hhmm(at)}</text></g>`;
      if (next) glow.setAttribute('transform', `translate(${x} ${y})`);
    }
    glow.style.display = np && list.some((p) => np.k === p.k && np.at === T[p.k]) ? '' : 'none';
    lines.innerHTML = `<path d="${solid}" fill="none" stroke="#C9C5B6" stroke-opacity="0.7" stroke-width="2"/><path d="${dashed}" fill="none" stroke="#4A5590" stroke-width="2" stroke-dasharray="4 8"/>`;
    stars.innerHTML = html;
  };
}

// ---------- lists ----------
function listsArt(layer, screen) {
  layer.appendChild(svgEl(`
    <line x1="640" y1="92" x2="640" y2="540" stroke="#2B3466" stroke-width="1.5"/>
    <g fill="#E9C46A" opacity="0.75">${star4(640, 80, 18, '')}</g>
    <circle cx="640" cy="330" r="15" fill="#0D1330" stroke="#2B3466" stroke-width="1.5"/>
    <path d="M640 319A11 11 0 1 0 640 341A7.5 11 0 1 1 640 319Z" fill="#E9C46A"/>
    ${city(0)}`, { width: 1280, height: 800, class: 'hl-art' }));
  twinkles(layer, [[566, 30, 13, 1], [24, 300, 11, 3], [1262, 480, 12, 4.6], [660, 600, 10, 2.2]]);
  let lastHj = '';
  return (t) => {
    const hj = hijri(t);
    const hs = hj ? '" · ' + hj.d + ' ' + hj.month + '"' : '""';
    if (hs !== lastHj) { lastHj = hs; screen.style.setProperty('--hl-hijri', hs); }
  };
}

// The other screens: the same night, with a lower city.
function plainArt(layer, tw) {
  layer.appendChild(svgEl(city(52, true), { width: 1280, height: 800, class: 'hl-art hl-low' }));
  if (tw) twinkles(layer, tw);
}

export function mount({ screens, stage }) {
  const ticks = [];
  if (screens.home) ticks.push(homeArt(screens.home.art, screens.home.el));
  if (screens.prayer) ticks.push(prayerArt(screens.prayer.art, screens.prayer.el));
  if (screens.lists) ticks.push(listsArt(screens.lists.art, screens.lists.el));
  if (screens.calendar) plainArt(screens.calendar.art);
  if (screens.adhkar) plainArt(screens.adhkar.art, [[640, 30, 12, 1.5], [30, 640, 11, 3.5]]);
  let shown = '';
  return {
    tick(t, name) {
      if (stage && name && name !== shown) { shown = name; stage.setAttribute('data-hl-screen', name); }
      for (const f of ticks) f(t);
    },
    unmount() {
      if (stage) stage.removeAttribute('data-hl-screen');
      for (const k in screens) {
        const el = screens[k].el;
        el.classList.remove('hl-has-hijri');
        for (const v of ['--hl-wx-top', '--hl-wx-h', '--hl-hd', '--hl-hy', '--hl-hijri']) el.style.removeProperty(v);
      }
    },
  };
}
