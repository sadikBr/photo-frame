// «ماجوريل»: the blue garden in Marrakech. A yellow art-deco window on the garden (clock screen),
// bougainvillea spilling from the corners, and a pool that reflects the five prayer panels
// (prayer screen). The cactus pots, the panels and the tiles themselves are CSS on the real items.
import { prayerDay } from '../data.js';

const NS = 'http://www.w3.org/2000/svg';
const YELLOW = '#F4C430';

function svgEl(markup, attrs) {
  const wrap = document.createElementNS(NS, 'svg');
  for (const k in attrs) wrap.setAttribute(k, attrs[k]);
  wrap.innerHTML = markup;
  return wrap;
}

// One bougainvillea blossom: three pink bracts around a pale centre.
const FLOWER = '<circle r="9" fill="#D9418C"/><circle cx="7" cy="-6" r="7" fill="#E9609F"/><circle cx="-7" cy="-5" r="7" fill="#C2337A"/><circle r="3" fill="#FFF1A8"/>';
const flowers = (pts) => pts.map(([x, y]) => `<g transform="translate(${x} ${y})">${FLOWER}</g>`).join('');

// Garden colours behind the grille, through the day (sky → lawn).
const GARDEN = {
  night: ['#16205A', '#1F4A4A', '#123826'],
  dawn: ['#F2C2A0', '#6FA27A', '#2F6B4F'],
  day: ['#9FD8F2', '#5E9E6E', '#2F6B4F'],
  dusk: ['#F5A26A', '#7C8E62', '#28583F'],
};
const OFFS = ['0', '0.55', '1'];

function phase(t, d) {
  if (!d) return 'day';
  if (t < d.fajr || t > d.isha + 20 * 60000) return 'night';
  if (t < d.sunrise + 40 * 60000) return 'dawn';
  if (t > d.maghrib - 45 * 60000) return t > d.maghrib + 30 * 60000 ? 'night' : 'dusk';
  return 'day';
}

// The clock screen: the yellow window on the garden, bougainvillea spilling from the corner.
function homeArt(layer) {
  const svg = svgEl(`
    <defs>
      <pattern id="mjGrille" width="60" height="60" patternUnits="userSpaceOnUse" x="82" y="52">
        <path d="M30 0 L60 30 L30 60 L0 30 Z" fill="none" stroke="${YELLOW}" stroke-width="3"/>
        <path d="M30 0 V60 M0 30 H60" stroke="${YELLOW}" stroke-width="1.5" opacity="0.6"/>
      </pattern>
      <linearGradient id="mjGarden" x1="0" y1="0" x2="0" y2="1"></linearGradient>
    </defs>
    <rect x="82" y="52" width="336" height="388" fill="url(#mjGarden)"/>
    <path class="mj-moon" d="M352 96a22 22 0 1 0 15 37a17 17 0 1 1 -15 -37z" fill="#F6E7B8"/>
    <g class="mj-palm" fill="#2F6B4F"><path d="M250 440 L262 200 L270 200 L282 440 Z"/><path d="M266 205 C 220 180, 180 196, 150 230 C 200 206, 236 206, 266 212 Z"/><path d="M266 205 C 310 176, 350 190, 384 222 C 334 204, 300 204, 266 212 Z"/><path d="M266 202 C 250 160, 220 140, 186 136 C 226 160, 246 180, 262 210 Z"/><path d="M266 202 C 286 160, 316 142, 350 140 C 312 162, 290 182, 270 210 Z"/></g>
    <rect x="82" y="52" width="336" height="388" fill="url(#mjGrille)"/>
    <path d="M68 454 V70 L100 38 H400 L432 70 V454 Z" fill="none" stroke="${YELLOW}" stroke-width="16" stroke-linejoin="round"/>
    <rect x="52" y="452" width="396" height="22" rx="4" fill="${YELLOW}"/>
    <g fill="#2F6B4F"><path d="M0 0 C 60 30, 120 20, 170 60 C 120 50, 60 70, 0 60 Z"/><path d="M30 0 C 100 10, 170 0, 230 30 C 160 30, 100 40, 40 30 Z"/></g>
    ${flowers([[28, 30], [66, 22], [104, 40], [140, 30], [178, 46], [210, 26], [46, 62], [88, 76], [16, 96], [126, 68], [30, 140], [58, 112], [246, 40], [20, 180]])}`,
  { width: 1280, height: 800, class: 'mj-home' });
  layer.appendChild(svg);
  const grad = svg.querySelector('#mjGarden');
  const moon = svg.querySelector('.mj-moon');
  const palm = svg.querySelector('.mj-palm');
  let last = '';
  return function tick(t) {
    const ph = phase(t, prayerDay(t));
    if (ph === last) return;
    last = ph;
    grad.innerHTML = GARDEN[ph].map((c, i) => `<stop offset="${OFFS[i]}" stop-color="${c}"/>`).join('');
    moon.style.display = ph === 'night' ? '' : 'none';
    palm.setAttribute('fill', ph === 'night' ? '#123826' : '#2F6B4F');
  };
}

// The weather follows the next-prayer line («العصر بعد 47 دقيقة · 22° غائم جزئياً»). It is its own
// element, so its place is measured whenever that line changes and handed to the CSS.
function weatherAfterNext(screen) {
  const main = screen.querySelector('.h-main');
  const next = screen.querySelector('.h-next');
  const wx = screen.querySelector('.h-wxm');
  if (!main || !next || !wx) return () => {};
  let last = '';
  return function tick(t) {
    // (re-measured when the text, the layout or the font loading state changes, and every minute)
    const fonts = document.fonts ? document.fonts.status : '';
    const key = next.textContent + '|' + wx.textContent + '|' + screen.className + '|' + fonts + '|' + Math.floor(t / 60000);
    if (key === last) return;
    last = key;
    let left = Infinity;
    for (const c of next.children) if (c.offsetWidth) left = Math.min(left, c.offsetLeft);
    if (left === Infinity) return;
    screen.style.setProperty('--mj-wx-right', Math.round(main.offsetWidth - left + 12) + 'px');
    screen.style.setProperty('--mj-wx-top', next.offsetTop + 'px');
  };
}

// The pool under the five panels: each panel's reflection, pink for the next prayer.
const DECO = 'M0 300 V60 H20 V36 H44 V16 H70 V0 H120 V16 H146 V36 H170 V60 H190 V300 Z';
const PANELS = [['fajr', 1026], ['dhuhr', 785.5], ['asr', 545], ['maghrib', 304.5], ['isha', 64]];

function prayerArt(layer, screen) {
  const svg = svgEl(`
    <defs>
      <linearGradient id="mjPool" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2F7FCF"/><stop offset="1" stop-color="#1E4FA0"/></linearGradient>
      <clipPath id="mjPoolClip"><rect x="0" y="606" width="1280" height="138"/></clipPath>
    </defs>
    <rect y="596" width="1280" height="12" fill="${YELLOW}"/>
    <rect y="606" width="1280" height="138" fill="url(#mjPool)"/>
    <g clip-path="url(#mjPoolClip)" opacity="0.28">
      ${PANELS.map(([k, x]) => `<path class="mj-ref k-${k}" d="${DECO}" fill="${YELLOW}" transform="translate(${x} 896) scale(1 -1)"/>`).join('')}
    </g>
    <g fill="none" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" opacity="0.45">
      <path d="M90 640 q 20 -8 40 0 t 40 0"/><path d="M420 672 q 20 -8 40 0 t 40 0 t 40 0"/><path d="M760 650 q 20 -8 40 0 t 40 0"/>
      <path d="M1040 690 q 20 -8 40 0 t 40 0 t 40 0"/><path d="M240 712 q 20 -8 40 0 t 40 0"/><path d="M620 720 q 20 -8 40 0 t 40 0"/>
    </g>`, { width: 1280, height: 800, class: 'mj-pool' });
  layer.appendChild(svg);
  const refs = PANELS.map(([k]) => ({ k, el: svg.querySelector('.mj-ref.k-' + k) }));
  let last = '';
  return function tick() {
    let key = '';
    for (const r of refs) {
      const item = screen.querySelector('.p-tiles .k-' + r.k);
      key += item ? (item.classList.contains('is-next') ? 'n' : item.classList.contains('is-past') ? 'p' : 'o') : '-';
    }
    if (key === last) return;
    last = key;
    refs.forEach((r, i) => r.el.setAttribute('fill', key[i] === 'n' ? '#D9418C' : key[i] === 'p' ? '#B9A04E' : YELLOW));
  };
}

// The lists: bougainvillea in the top-right corner, behind the title.
function listsArt(layer) {
  layer.appendChild(svgEl(`<path d="M280 0 C 220 40, 150 24, 100 64 C 160 56, 220 70, 280 60 Z" fill="#2F6B4F"/>
    ${flowers([[256, 30], [220, 18], [186, 40], [150, 28], [240, 66], [262, 104], [116, 52]])}`,
  { width: 280, height: 120, class: 'mj-vine' }));
}

export function mount({ screens }) {
  const ticks = [];
  if (screens.home) {
    ticks.push(homeArt(screens.home.art));
    ticks.push(weatherAfterNext(screens.home.el));
  }
  if (screens.prayer) ticks.push(prayerArt(screens.prayer.art, screens.prayer.el));
  if (screens.lists) listsArt(screens.lists.art);
  return {
    tick(t) { for (const f of ticks) f(t); },
    unmount() {
      if (screens.home) for (const p of ['--mj-wx-right', '--mj-wx-top']) screens.home.el.style.removeProperty(p);
    },
  };
}
