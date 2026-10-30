// «أندلسي»: the clock in a green alfiz with a polylobed arch (clock screen), and the lists as an
// open two-page manuscript on green (lists screen). The prayer niches are pure CSS.
import { prayerDay } from '../data.js';
import { hhmm } from '../util.js';

const NS = 'http://www.w3.org/2000/svg';

function svgEl(markup, attrs) {
  const el = document.createElementNS(NS, 'svg');
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  el.innerHTML = markup;
  return el;
}

const ROSETTE = (id, op) => `<pattern id="${id}" width="44" height="44" patternUnits="userSpaceOnUse">
  <g transform="translate(22 22)" fill="none" stroke="#B8913A" stroke-width="1.1" opacity="${op}"><rect x="-7" y="-7" width="14" height="14"/><rect x="-7" y="-7" width="14" height="14" transform="rotate(45)"/></g>
  <g fill="#B8913A" opacity="0.7"><circle cx="0" cy="0" r="1.6"/><circle cx="44" cy="0" r="1.6"/><circle cx="0" cy="44" r="1.6"/><circle cx="44" cy="44" r="1.6"/></g></pattern>`;

// The alfiz panel and its arch, as drawn in the mockup (the arch opening runs down to the band).
function alfiz(layer) {
  layer.appendChild(svgEl(`
    <defs>${ROSETTE('anRos', 0.75)}</defs>
    <rect x="290" y="22" width="700" height="678" fill="#1E4A3B"/>
    <rect x="290" y="22" width="700" height="678" fill="url(#anRos)"/>
    <rect x="298" y="30" width="684" height="670" fill="none" stroke="#C9A45A" stroke-width="2"/>
    <path d="M320 700 L320 230 A44 44 0 0 1 351.7 156.2 A58 58 0 0 1 440.3 97.1 A72 72 0 0 1 568.6 64.3 A78 78 0 0 1 711.4 64.3 A72 72 0 0 1 839.7 97.1 A58 58 0 0 1 928.3 156.2 A44 44 0 0 1 960 230 L960 700 Z" fill="#F7F1E4" stroke="#C9A45A" stroke-width="3"/>
    <path d="M334 700 L334 232 A40 40 0 0 1 363 165 A54 54 0 0 1 446 110 A68 68 0 0 1 570 79 A72 72 0 0 1 710 79 A68 68 0 0 1 834 110 A54 54 0 0 1 917 165 A40 40 0 0 1 946 232 L946 700" fill="none" stroke="#C9A45A" stroke-width="1" opacity="0.7"/>`,
  { width: 1280, height: 800, class: 'an-alfiz' }));
  // Sunrise, under the list of prayers.
  const sun = document.createElement('div');
  sun.className = 'an-sunrise';
  layer.appendChild(sun);
  let last = '';
  return function tick(t) {
    const d = prayerDay(t);
    const text = d && d.sunrise ? 'الشروق ' + hhmm(d.sunrise) : '';
    if (text !== last) { last = text; sun.textContent = text; }
  };
}

// The open book: shadow, two cream pages, the gutter, double gold frames and corner ornaments.
function book(layer) {
  const corner = (x, flip) => `<g transform="translate(${x} 70)${flip ? ' scale(-1 1)' : ''}"><path d="M0 0 H34 M0 0 V34" stroke="#A8812F" stroke-width="2" fill="none"/><g fill="#A8812F" transform="translate(14 14)"><rect x="-5" y="-5" width="10" height="10"/><rect x="-5" y="-5" width="10" height="10" transform="rotate(45)"/></g></g>`;
  layer.appendChild(svgEl(`
    <defs><linearGradient id="anGutter" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2B2118" stop-opacity="0"/><stop offset="0.5" stop-color="#2B2118" stop-opacity="0.18"/><stop offset="1" stop-color="#2B2118" stop-opacity="0"/></linearGradient></defs>
    <rect x="70" y="40" width="1140" height="660" rx="6" fill="#16372C"/>
    <rect x="76" y="34" width="1128" height="660" rx="4" fill="#F4ECDB"/>
    <rect x="610" y="34" width="60" height="660" fill="url(#anGutter)"/>
    <rect x="100" y="58" width="516" height="612" fill="none" stroke="#C9A45A" stroke-width="1.5"/>
    <rect x="106" y="64" width="504" height="600" fill="none" stroke="#C9A45A" stroke-width="0.8"/>
    <rect x="664" y="58" width="516" height="612" fill="none" stroke="#C9A45A" stroke-width="1.5"/>
    <rect x="670" y="64" width="504" height="600" fill="none" stroke="#C9A45A" stroke-width="0.8"/>
    ${corner(112)}${corner(604, true)}${corner(676)}${corner(1168, true)}`,
  { width: 1280, height: 800, class: 'an-book' }));
}

export function mount({ screens, stage }) {
  const ticks = [];
  if (screens.home) ticks.push(alfiz(screens.home.art));
  if (screens.lists) book(screens.lists.art);
  let shown = '';
  return {
    tick(t, screenName) {
      // The clock screen lays the top cards (family, match, Quran) out in its left column.
      if (stage && screenName && screenName !== shown) { shown = screenName; stage.setAttribute('data-tscreen', screenName); }
      for (const f of ticks) f(t);
    },
    unmount() { if (stage) stage.removeAttribute('data-tscreen'); },
  };
}
