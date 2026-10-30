// «صحراء» (mockups T4-Sahara-*): golden-hour dunes with a camel caravan and a sun that holds the
// weather (clock screen); the sun's path across the sky as a dashed ellipse with the five prayers
// on it, the travelled part solid and the sun at "now" (prayer screen); two woven rugs with
// fringes for the lists.
import { hhmm } from '../util.js';
import { prayerDay } from '../data.js';
import { PRAYERS, prayerName, nextPrayer, displayDay } from '../prayer-times.js';

const NS = 'http://www.w3.org/2000/svg';
function svgEl(markup, attrs) {
  const el = document.createElementNS(NS, 'svg');
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  el.innerHTML = markup;
  return el;
}
const RUG_TILE = '<rect width="64" height="48" fill="#A8322A"/><path d="M32 6 L54 24 L32 42 L10 24 Z" fill="none" stroke="#F6DDB8" stroke-width="3"/><path d="M32 15 L43 24 L32 33 L21 24 Z" fill="#2A1A14"/><circle cx="32" cy="24" r="2.5" fill="#F2B84B"/><path d="M0 0 L6 6 L0 12 Z M64 0 L58 6 L64 12 Z M0 48 L6 42 L0 36 Z M64 48 L58 42 L64 36 Z" fill="#2A1A14"/>';
const SKY = (id) => `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FBEBD2"/><stop offset="1" stop-color="#F2C389"/></linearGradient>`;
const CAMEL = 'M0 -36 L6 -40 L12 -38 L14 -30 Q16 -24 20 -22 Q26 -36 34 -36 Q42 -36 46 -24 L52 -22 Q56 -20 54 -14 L52 -14 L52 0 L49 0 L49 -12 L44 -12 L44 0 L41 0 L41 -13 L26 -13 L26 0 L23 0 L23 -13 L19 -13 L19 0 L16 0 L16 -16 Q12 -20 10 -30 L6 -33 Z';
const isNight = (t) => { const d = prayerDay(t); return !!d && (t >= d.maghrib + 20 * 60000 || t < d.sunrise); };

// ---------- clock screen ----------
function homeArt(layer) {
  const svg = svgEl(`
    <defs>
      ${SKY('shSky')}
      <radialGradient id="shSun" cx="0.5" cy="0.5" r="0.5"><stop class="sh-g0" offset="0" stop-color="#FFE2A8"/><stop class="sh-g1" offset="0.7" stop-color="#F9C273"/><stop class="sh-g1" offset="1" stop-color="#F9C273" stop-opacity="0"/></radialGradient>
      <path id="shCamel" d="${CAMEL}"/>
    </defs>
    <rect width="1280" height="800" fill="url(#shSky)"/>
    <circle cx="300" cy="300" r="190" fill="url(#shSun)"/>
    <circle class="sh-disc" cx="300" cy="300" r="96" fill="#FBD08C"/>
    <path d="M0 520 C 180 440, 360 470, 520 500 S 860 420, 1060 470 S 1220 470, 1280 450 L1280 800 L0 800 Z" fill="#E7B074"/>
    <path d="M860 438 C 900 450, 1000 500, 1060 470 L1060 800 L 600 800 Z" fill="#D89A5C" opacity="0.55"/>
    <g fill="#5A2E1A" opacity="0.8"><use href="#shCamel" transform="translate(890 446) scale(0.7)"/><use href="#shCamel" transform="translate(940 452) scale(0.7)"/><use href="#shCamel" transform="translate(992 461) scale(0.62)"/></g>
    <path d="M0 600 C 220 560, 420 610, 640 580 S 1040 560, 1280 590 L1280 800 L0 800 Z" fill="#A9622F"/>
    <path d="M0 600 C 220 560, 420 610, 640 580 L 640 800 L 0 800 Z" fill="#96542A" opacity="0.6"/>`,
  { width: 1280, height: 800 });
  layer.appendChild(svg);
  const disc = svg.querySelector('.sh-disc');
  const g0 = svg.querySelector('.sh-g0');
  const g1 = svg.querySelectorAll('.sh-g1');
  let last = null;
  return function tick(t) {
    // After dusk the sun becomes a pale full moon (the weather stays written on it).
    const night = isNight(t);
    if (night === last) return;
    last = night;
    disc.setAttribute('fill', night ? '#FBF0DA' : '#FBD08C');
    g0.setAttribute('stop-color', night ? '#FFF6E4' : '#FFE2A8');
    for (const s of g1) s.setAttribute('stop-color', night ? '#F4DDB8' : '#F9C273');
  };
}

// ---------- prayer screen: the sun's path ----------
const CX = 640, CY = 560, RX = 520, RY = 330;
const onArc = (deg) => { const a = (deg * Math.PI) / 180; return [CX + RX * Math.cos(a), CY - RY * Math.sin(a)]; };
const f1 = (v) => v.toFixed(1);

function prayerArt(layer) {
  const svg = svgEl(`
    <defs>
      ${SKY('shSky2')}
      <radialGradient id="shGlow2" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#FFE2A8"/><stop offset="1" stop-color="#FFE2A8" stop-opacity="0"/></radialGradient>
    </defs>
    <rect width="1280" height="800" fill="url(#shSky2)"/>
    <path d="M1160 560 A520 330 0 0 0 120 560" fill="none" stroke="#C9844A" stroke-width="3" stroke-dasharray="2 12" stroke-linecap="round"/>
    <path class="sh-done" d="" fill="none" stroke="#E08A3C" stroke-width="7" stroke-linecap="round"/>
    <g class="sh-sun">
      <circle r="110" fill="url(#shGlow2)"/>
      <g stroke="#E08A3C" stroke-width="4" stroke-linecap="round"><path d="M0 -62V-50M0 50V62M-62 0H-50M50 0H62M-44 -44L-35 -35M35 35L44 44M-44 44L-35 35M35 -35L44 -44"/></g>
      <circle r="38" fill="#F9B24E" stroke="#FFF1D6" stroke-width="4"/>
    </g>
    <g class="sh-moon" transform="translate(430 150)"><circle r="44" fill="#FFF6E4" opacity="0.5"/><path d="M8 -26a28 28 0 1 0 18 46a22 22 0 1 1 -18 -46z" fill="#FBF0DA" stroke="#E2B57A" stroke-width="2"/></g>
    <path d="M0 620 C 200 580, 420 640, 640 605 S 1060 585, 1280 615 L1280 800 L0 800 Z" fill="#E7B074"/>
    <path d="M0 668 C 260 640, 520 690, 760 662 S 1120 650, 1280 670 L1280 800 L0 800 Z" fill="#C9844A"/>
    <g class="sh-marks"></g>`, { width: 1280, height: 800 });
  layer.appendChild(svg);
  const foot = document.createElement('div');
  foot.className = 'sh-foot';
  layer.appendChild(foot);
  const done = svg.querySelector('.sh-done');
  const sun = svg.querySelector('.sh-sun');
  const moon = svg.querySelector('.sh-moon');
  const marks = svg.querySelector('.sh-marks');
  let last = '';

  return function tick(t) {
    const dd = displayDay(t);
    const np = nextPrayer(t);
    const key = Math.floor(t / 60000) + ':' + (dd ? dd.times.fajr : '') + ':' + (np ? np.at : '');
    if (key === last) return;
    last = key;
    svg.style.visibility = foot.style.visibility = dd ? '' : 'hidden';
    if (!dd) return;
    const T = dd.times;
    // Each prayer's place on the path: in proportion to the time from Fajr (right) to Isha (left),
    // kept at least 24° apart so their labels never collide; the sun moves between them in step.
    const list = PRAYERS.filter((p) => !p.minor && T[p.k]);
    const span = T[list[list.length - 1].k] - T[list[0].k];
    const ang = list.map((p) => 180 * (T[p.k] - T[list[0].k]) / span);
    for (let i = ang.length - 2; i >= 0; i--) ang[i] = Math.min(ang[i], ang[i + 1] - 24);
    for (let i = 1; i < ang.length; i++) ang[i] = Math.max(ang[i], ang[i - 1] + 24);
    const angle = (at) => {
      if (at <= T[list[0].k]) return 0;
      for (let i = 1; i < list.length; i++) {
        const a0 = T[list[i - 1].k], a1 = T[list[i].k];
        if (at <= a1) return ang[i - 1] + (ang[i] - ang[i - 1]) * (at - a0) / (a1 - a0);
      }
      return 180;
    };
    const first = T[list[0].k], lastAt = T[list[list.length - 1].k];

    // The sun from Fajr to Isha; outside that a crescent sits in the sky.
    const day = t >= first && t <= lastAt;
    const a = t < first ? 0 : angle(t);
    const [sx, sy] = onArc(a);
    done.setAttribute('d', a > 0.2 ? `M1160 560 A${RX} ${RY} 0 0 0 ${f1(sx)} ${f1(sy)}` : '');
    sun.setAttribute('transform', `translate(${f1(sx)} ${f1(sy)})`);
    sun.style.display = day ? '' : 'none';
    moon.style.display = day ? 'none' : '';

    // The five prayers on the path.
    let html = '';
    for (const p of list) {
      const at = T[p.k];
      const [x, y] = onArc(angle(at));
      const next = !!(np && np.k === p.k && np.at === at);
      const past = !next && at <= t;
      const d = next ? 40 : 26;
      const circle = next ? `<circle cx="${f1(x)}" cy="${f1(y)}" r="17" fill="#FBEBD2" stroke="#A8322A" stroke-width="6"/>`
        : past ? `<circle cx="${f1(x)}" cy="${f1(y)}" r="13" fill="#8E3A1E"/>`
          : `<circle cx="${f1(x)}" cy="${f1(y)}" r="11" fill="#FBEBD2" stroke="#8E3A1E" stroke-width="4"/>`;
      const ny = y + d / 2 + 8 + (next ? 27 : 22);
      const ty = ny + (next ? 46 : 38);
      html += `<g class="sh-mark${next ? ' is-next' : ''}">${circle}<text class="sh-name" x="${f1(x)}" y="${f1(ny)}" text-anchor="middle">${prayerName(p.k, at)}</text><text class="sh-time" x="${f1(x)}" y="${f1(ty)}" text-anchor="middle">${hhmm(at)}</text></g>`;
    }
    marks.innerHTML = html;
    foot.textContent = 'الشروق ' + hhmm(T.sunrise) + ' · الغروب ' + hhmm(T.sunset || T.maghrib) + ' · «أرحنا بها يا بلال»';
  };
}

// ---------- lists screen: two rugs ----------
function rug(x, w) {
  let fringe = '';
  for (let i = 20; i < w; i += 30) fringe += `M${i} 712 v14 `;
  return `<g transform="translate(${x} 36)">
    <rect width="${w}" height="712" rx="6" fill="url(#shStripe)"/>
    <rect width="${w}" height="40" fill="url(#shRug)"/>
    <rect y="672" width="${w}" height="40" fill="url(#shRug)"/>
    <rect width="${w}" height="712" rx="6" fill="none" stroke="#2A1A14" stroke-width="3"/>
    <path d="${fringe}" stroke="#2A1A14" stroke-width="2"/></g>`;
}
function listsArt(layer) {
  layer.appendChild(svgEl(`
    <defs>
      <pattern id="shRug" width="64" height="48" patternUnits="userSpaceOnUse">${RUG_TILE}</pattern>
      <pattern id="shStripe" width="12" height="12" patternUnits="userSpaceOnUse"><rect width="12" height="12" fill="#FBEBD2"/><rect y="10" width="12" height="2" fill="#F1DCB8"/></pattern>
    </defs>
    <path d="M0 260 C 260 200, 520 250, 760 220 S 1100 200, 1280 230 L1280 800 L0 800 Z" fill="#E4B37A"/>
    <path d="M0 520 C 300 470, 560 540, 860 500 S 1180 490, 1280 510 L1280 800 L0 800 Z" fill="#D49B5E"/>
    ${rug(676, 566)}${rug(38, 600)}`, { width: 1280, height: 800 }));
  return () => {};
}

export function mount({ screens }) {
  const ticks = [];
  if (screens.home) ticks.push(homeArt(screens.home.art));
  if (screens.prayer) ticks.push(prayerArt(screens.prayer.art));
  if (screens.lists) ticks.push(listsArt(screens.lists.art));
  return { tick(t) { for (const f of ticks) f(t); } };
}
