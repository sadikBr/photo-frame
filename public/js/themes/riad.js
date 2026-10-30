// «رياض»: a Moroccan window on today's sky (clock screen) and five arched windows, one per
// prayer, each showing the sky at its hour (prayer screen).
import { prayerDay } from '../data.js';

const NS = 'http://www.w3.org/2000/svg';
const ARCH = 'M22 654 L22 276 C0 244 -4 174 28 114 C66 46 144 10 220 0 C296 10 374 46 412 114 C444 174 440 244 418 276 L418 654';
const NICHE = 'M10 460 L10 150 C0 132 -2 96 13 66 C30 32 65 8 100 0 C135 8 170 32 187 66 C202 96 200 132 190 150 L190 460';

// Sky colours through the day (top → bottom).
const SKIES = {
  night: ['#040820', '#0C1645', '#1A2257'],
  dawn: ['#1B2A63', '#5F79B8', '#E8A985'],
  noon: ['#2F72C4', '#6E9BD0', '#A9D0EE'],
  after: ['#2A57A0', '#7EA7D2', '#E8C78E', '#F0AE68'],
  dusk: ['#1B2163', '#5B3B87', '#D3637A', '#F59A5A'],
};
const stops = (c) => c.map((col, i) => `<stop offset="${(i / (c.length - 1)).toFixed(2)}" stop-color="${col}"/>`).join('');

const CITY = (fill) => `<g fill="${fill}">
  <rect x="0" y="552" width="68" height="102"/><rect x="62" y="570" width="60" height="84"/><rect x="146" y="546" width="54" height="108"/>
  <rect x="194" y="566" width="70" height="88"/><rect x="318" y="552" width="62" height="102"/><rect x="374" y="570" width="66" height="84"/>
  <rect x="262" y="414" width="42" height="240"/><rect x="262" y="405" width="8" height="10"/><rect x="273" y="405" width="8" height="10"/>
  <rect x="285" y="405" width="8" height="10"/><rect x="296" y="405" width="8" height="10"/><rect x="274" y="376" width="18" height="34"/>
  <rect x="282" y="360" width="2" height="18"/><circle cx="283" cy="358" r="4"/></g>
  <g fill="none" stroke="${fill}" stroke-width="6" stroke-linecap="round"><path d="M112 580 C110 540 106 506 110 472"/>
  <path d="M110 472 C94 462 78 464 64 476"/><path d="M110 472 C98 452 84 446 68 450"/><path d="M110 472 C114 452 128 442 146 444"/>
  <path d="M110 472 C126 464 142 468 154 482"/><path d="M110 472 C108 456 110 440 118 428"/></g>`;

function svgEl(markup, attrs) {
  const wrap = document.createElementNS(NS, 'svg');
  for (const k in attrs) wrap.setAttribute(k, attrs[k]);
  wrap.innerHTML = markup;
  return wrap;
}

function phase(t, d) {
  if (!d) return 'after';
  if (t < d.fajr || t > d.isha + 20 * 60000) return 'night';
  if (t < d.sunrise + 40 * 60000) return 'dawn';
  if (t > d.maghrib - 45 * 60000 && t < d.isha) return t > d.maghrib + 25 * 60000 ? 'night' : 'dusk';
  if (t < d.asr) return 'noon';
  return 'after';
}

// The window's own sky stops where the design sets them (night and sunset); the rest evenly.
const ARCH_SKY = {
  night: [[0, '#040820'], [0.7, '#0C1645'], [1, '#1A2257']],
  dusk: [[0, '#1B2163'], [0.42, '#5B3B87'], [0.72, '#D3637A'], [1, '#F59A5A']],
};
const archStops = (ph) => (ARCH_SKY[ph] ? ARCH_SKY[ph].map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('') : stops(SKIES[ph]));

function homeArch(layer) {
  const svg = svgEl(`
    <defs>
      <clipPath id="rdArch"><path d="${ARCH} Z"/></clipPath>
      <linearGradient id="rdSky" x1="0" y1="0" x2="0" y2="1"></linearGradient>
      <radialGradient id="rdSun"><stop offset="0" stop-color="#FFF4D6" stop-opacity="0.95"/><stop offset="0.35" stop-color="#FFE3A3" stop-opacity="0.5"/><stop offset="1" stop-color="#FFE3A3" stop-opacity="0"/></radialGradient>
      <radialGradient id="rdSunM"><stop offset="0" stop-color="#FFD08A" stop-opacity="0.9"/><stop offset="0.4" stop-color="#FF9E6B" stop-opacity="0.45"/><stop offset="1" stop-color="#FF9E6B" stop-opacity="0"/></radialGradient>
      <radialGradient id="rdGlowN"><stop offset="0" stop-color="#F6E7B8" stop-opacity="0.24"/><stop offset="1" stop-color="#F6E7B8" stop-opacity="0"/></radialGradient>
      <mask id="rdMoonN" maskUnits="userSpaceOnUse" x="0" y="0" width="440" height="654"><circle cx="150" cy="180" r="38" fill="#fff"/><circle cx="166" cy="167" r="34" fill="#000"/></mask>
    </defs>
    <g transform="translate(10 6)">
      <g clip-path="url(#rdArch)">
        <rect width="440" height="654" fill="url(#rdSky)"/>
        <g class="rd-stars" fill="#FFFFFF"><circle cx="80" cy="120" r="1.6"/><circle cx="150" cy="80" r="1.3"/><circle cx="330" cy="140" r="1.5"/><circle cx="260" cy="210" r="1.1"/><circle cx="110" cy="260" r="1.2"/><circle cx="370" cy="300" r="1"/><circle cx="200" cy="40" r="1.4"/><circle cx="60" cy="350" r="1"/></g>
        <g class="rd-nstars" fill="#FFFFFF">
          <circle cx="90" cy="120" r="1.6" opacity="0.8"/><circle cx="250" cy="220" r="1.2" opacity="0.6"/><circle cx="210" cy="80" r="1.8" opacity="0.9"/>
          <circle cx="230" cy="300" r="1.1" opacity="0.5"/><circle cx="380" cy="250" r="1.5" opacity="0.7"/><circle cx="400" cy="160" r="1.2" opacity="0.6"/>
          <circle cx="60" cy="320" r="1.3" opacity="0.6"/><circle cx="170" cy="360" r="1.0" opacity="0.5"/><circle cx="350" cy="340" r="1.4" opacity="0.6"/>
          <circle cx="300" cy="130" r="1.0" opacity="0.6"/><circle cx="110" cy="420" r="1.1" opacity="0.45"/><circle cx="420" cy="400" r="1.2" opacity="0.5"/>
          <circle cx="330" cy="70" r="1.3" opacity="0.7"/><circle cx="60" cy="220" r="1.0" opacity="0.5"/><circle cx="280" cy="390" r="1.0" opacity="0.45"/></g>
        <g class="rd-dstars" fill="#FFFFFF"><circle cx="300" cy="96" r="1.6" opacity="0.8"/><circle cx="170" cy="70" r="1.3" opacity="0.7"/><circle cx="240" cy="130" r="1.1" opacity="0.6"/></g>
        <path class="rd-path" d="M400 540 Q220 -60 40 540" fill="none" stroke="#FFFFFF" stroke-opacity="0.4" stroke-width="2" stroke-dasharray="2 10" stroke-linecap="round"/>
        <g class="rd-streaks" fill="#F7B5A3"><ellipse cx="290" cy="320" rx="110" ry="7" opacity="0.45"/><ellipse cx="340" cy="350" rx="70" ry="5" opacity="0.4"/><ellipse cx="140" cy="400" rx="90" ry="6" opacity="0.4"/></g>
        <g class="rd-sun"><circle r="90" fill="url(#rdSun)"/><circle r="25" fill="#FFF3D1"/></g>
        <g class="rd-sunset"><circle cx="66" cy="548" r="130" fill="url(#rdSunM)"/><circle cx="66" cy="548" r="30" fill="#FFC27A"/></g>
        <g class="rd-moon"><circle cx="150" cy="180" r="120" fill="url(#rdGlowN)"/><rect x="108" y="138" width="84" height="84" fill="#F6E7B8" mask="url(#rdMoonN)"/></g>
        <g class="rd-clouds" fill="#FFFFFF"><ellipse cx="208" cy="300" rx="70" ry="19" opacity="0.6"/><ellipse cx="182" cy="288" rx="38" ry="19" opacity="0.6"/><ellipse cx="120" cy="150" rx="46" ry="11" opacity="0.3"/><ellipse cx="300" cy="380" rx="60" ry="9" opacity="0.3"/></g>
        <g class="rd-city">${CITY('#1C2456')}</g>
        <g class="rd-lit-d" fill="#F2C46B"><rect x="279" y="384" width="8" height="14" rx="4"/><rect x="162" y="580" width="8" height="10"/><rect x="340" y="576" width="8" height="10"/><rect x="20" y="586" width="8" height="10" opacity="0.7"/><rect x="410" y="596" width="8" height="10" opacity="0.7"/></g>
        <g class="rd-lit-n" fill="#D9A84E"><rect x="279" y="384" width="8" height="14" rx="4" opacity="0.9"/><rect x="162" y="580" width="8" height="10" opacity="0.8"/><rect x="398" y="596" width="8" height="10" opacity="0.6"/><rect x="30" y="590" width="8" height="10" opacity="0.5"/></g>
      </g>
      <path class="rd-fr" d="${ARCH}" fill="none" stroke="#0C1647" stroke-width="18"/>
      <path class="rd-gl" d="${ARCH}" fill="none" stroke="#E0A845" stroke-width="2.5"/>
    </g>`, { width: 460, height: 664, class: 'rd-arch' });
  layer.appendChild(svg);
  const q = (c) => svg.querySelector(c);
  const grad = q('#rdSky');
  const sun = q('.rd-sun');
  const show = (c, on) => { q(c).style.display = on ? '' : 'none'; };
  let last = '';
  return function tick(t) {
    const d = prayerDay(t);
    const ph = phase(t, d);
    let f = 0.5;
    if (d && d.sunset > d.sunrise) f = Math.min(1, Math.max(0, (t - d.sunrise) / (d.sunset - d.sunrise)));
    const key = ph + Math.round(f * 60);
    if (key === last) return;
    last = key;
    grad.innerHTML = archStops(ph);
    const night = ph === 'night', dusk = ph === 'dusk';
    // By day the sun runs along the dashed arc from sunrise (right) to sunset (left); at sunset
    // it sits on the roofs, at night the crescent shines over a dark, lit-up town.
    const x = (1 - f) * (1 - f) * 400 + 2 * f * (1 - f) * 220 + f * f * 40;
    const y = (1 - f) * (1 - f) * 540 + 2 * f * (1 - f) * -60 + f * f * 540;
    sun.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
    show('.rd-sun', ph === 'noon' || ph === 'after');
    show('.rd-path', !night && !dusk);
    show('.rd-sunset', dusk);
    show('.rd-streaks', dusk);
    show('.rd-dstars', dusk);
    show('.rd-moon', night);
    show('.rd-nstars', night);
    show('.rd-stars', ph === 'dawn');
    show('.rd-clouds', ph === 'noon' || ph === 'after');
    show('.rd-lit-d', dusk);
    show('.rd-lit-n', night);
    q('.rd-stars').setAttribute('opacity', '0.4');
    const city = q('.rd-city > g');
    const ink = night ? '#03061A' : dusk ? '#1A1235' : '#1C2456';
    city.setAttribute('fill', ink);
    q('.rd-city > g + g').setAttribute('stroke', ink);
    q('.rd-fr').setAttribute('stroke', night ? '#060B2A' : '#0C1647');
    q('.rd-gl').setAttribute('stroke', night ? '#8A6A2E' : '#E0A845');
  };
}

// The five prayer windows, right to left: dawn, noon, afternoon, sunset, night.
const NICHES = [
  { k: 'fajr', sky: SKIES.dawn, ground: '#13204A', extra: '<circle cx="150" cy="430" r="60" fill="#FFD9B0" opacity="0.35"/><g fill="#FFFFFF"><circle cx="60" cy="90" r="1.5"/><circle cx="130" cy="60" r="1.3"/><circle cx="90" cy="160" r="1.1" opacity="0.7"/></g>' },
  { k: 'dhuhr', sky: ['#2F72C4', '#A9D0EE'], ground: '#245079', extra: '<circle cx="100" cy="80" r="44" fill="#FFF6DD" opacity="0.35"/><circle cx="100" cy="80" r="17" fill="#FFF6DD"/><g fill="#FFFFFF" opacity="0.6"><ellipse cx="60" cy="200" rx="40" ry="10"/><ellipse cx="150" cy="250" rx="34" ry="8"/></g>' },
  { k: 'asr', sky: SKIES.after, ground: '#1C2456', extra: '<circle cx="62" cy="230" r="60" fill="#FFE3A3" opacity="0.35"/><circle cx="62" cy="230" r="18" fill="#FFF3D1"/><g fill="#FFFFFF" opacity="0.55"><ellipse cx="120" cy="250" rx="46" ry="11"/><ellipse cx="104" cy="242" rx="24" ry="11"/></g>' },
  { k: 'maghrib', sky: ['#1F2266', '#5B3B87', '#D3637A', '#F59A5A'], ground: '#1A1235', extra: '<g fill="#F7B5A3" opacity="0.45"><ellipse cx="120" cy="260" rx="70" ry="5"/><ellipse cx="80" cy="300" rx="50" ry="4"/></g><circle cx="46" cy="420" r="60" fill="#FFB27A" opacity="0.35"/><circle cx="46" cy="420" r="20" fill="#FFC27A"/>', lamp: '#F2C46B' },
  { k: 'isha', sky: ['#040820', '#142058'], ground: '#03061A', extra: '<path d="M70 70a24 24 0 1 0 16 40a19 19 0 1 1 -16 -40z" fill="#F6E7B8"/><g fill="#FFFFFF"><circle cx="50" cy="160" r="1.5"/><circle cx="80" cy="220" r="1.1" opacity="0.7"/><circle cx="170" cy="210" r="1.2" opacity="0.7"/><circle cx="40" cy="270" r="1" opacity="0.6"/><circle cx="150" cy="60" r="1.3"/><circle cx="150" cy="300" r="1" opacity="0.5"/></g>', lamp: '#D9A84E' },
];

function prayerNiches(layer, screen) {
  const row = document.createElement('div');
  row.className = 'rd-niches';
  const nodes = NICHES.map((n, i) => {
    const svg = svgEl(`
      <defs><clipPath id="rdN${i}"><path d="${NICHE} Z"/></clipPath>
      <linearGradient id="rdG${i}" x1="0" y1="0" x2="0" y2="1">${stops(n.sky)}</linearGradient></defs>
      <g transform="translate(10 10)">
        <g clip-path="url(#rdN${i})"><rect width="200" height="460" fill="url(#rdG${i})"/>${n.extra}
          <g fill="${n.ground}"><rect x="0" y="420" width="200" height="40"/><rect x="118" y="330" width="20" height="100"/><rect x="123" y="312" width="10" height="20"/></g>
          ${n.lamp ? `<rect x="125" y="316" width="6" height="11" rx="3" fill="${n.lamp}"/>` : ''}</g>
        <path class="rd-frame" d="${NICHE}" fill="none" stroke-width="12"/>
        <path class="rd-gold" d="${NICHE}" fill="none" stroke-width="3.5"/>
      </g>`, { width: 220, height: 480, class: 'rd-niche' });
    row.appendChild(svg);
    return { k: n.k, svg };
  });
  layer.appendChild(row);
  return function tick() {
    for (const n of nodes) {
      const item = screen.querySelector('.p-tiles .k-' + n.k);
      n.svg.classList.toggle('is-next', !!item && item.classList.contains('is-next'));
      n.svg.classList.toggle('is-past', !!item && item.classList.contains('is-past'));
    }
  };
}

// Ramadan on the prayer screen: glowing lanterns on gold chains and the crescent (R1); at iftar,
// the window on the sunset sky and two lanterns (R2). Drawn once; the CSS shows one or the other.
const LAMP = (id) => `<g id="${id}">
  <circle cx="50" cy="96" r="96" fill="url(#rdLampGlow)"/>
  <circle cx="50" cy="-6" r="6" fill="none" stroke="#D9A441" stroke-width="2.5"/>
  <path d="M28 26 Q50 -2 72 26 Z" fill="#D9A441"/>
  <path d="M24 30 H76 L84 60 V120 L76 150 H24 L16 120 V60 Z" fill="url(#rdLampGlass)" stroke="#D9A441" stroke-width="3.5"/>
  <path d="M24 64 Q50 42 76 64 M36 62 V132 M50 54 V140 M64 62 V132 M16 120 H84" fill="none" stroke="#B07A22" stroke-width="2.2"/>
  <path d="M28 150 L50 174 L72 150 Z" fill="#D9A441"/>
  <path d="M50 174 V188" stroke="#D9A441" stroke-width="2.5"/>
  <circle cx="50" cy="192" r="4.5" fill="#D9A441"/></g>`;

function ramadanArt(layer) {
  const svg = svgEl(`
    <defs>
      <radialGradient id="rdLampGlow"><stop offset="0" stop-color="#FFD07A" stop-opacity="0.42"/><stop offset="1" stop-color="#FFD07A" stop-opacity="0"/></radialGradient>
      <linearGradient id="rdLampGlass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFE7A8"/><stop offset="1" stop-color="#F0A33E"/></linearGradient>
      ${LAMP('rdLamp')}
      <mask id="rdMoonR" maskUnits="userSpaceOnUse" x="0" y="0" width="1280" height="690"><circle cx="420" cy="96" r="34" fill="#fff"/><circle cx="434" cy="84" r="30" fill="#000"/></mask>
      <mask id="rdMoonI" maskUnits="userSpaceOnUse" x="0" y="0" width="440" height="654"><circle cx="300" cy="150" r="30" fill="#fff"/><circle cx="313" cy="139" r="27" fill="#000"/></mask>
      <clipPath id="rdArchI"><path d="${ARCH} Z"/></clipPath>
      <linearGradient id="rdSkyI" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#16195A"/><stop offset="0.45" stop-color="#4E3584"/><stop offset="0.78" stop-color="#C95E78"/><stop offset="1" stop-color="#F29457"/></linearGradient>
    </defs>
    <g class="rd-r1">
      <rect x="380" y="56" width="80" height="80" fill="#F6E7B8" mask="url(#rdMoonR)"/>
      <g fill="#FFFFFF"><circle cx="360" cy="40" r="1.6" opacity="0.7"/><circle cx="470" cy="160" r="1.3" opacity="0.6"/><circle cx="300" cy="150" r="1.1" opacity="0.5"/></g>
      <g stroke="#D9A441" stroke-width="2"><line x1="110" y1="0" x2="110" y2="120"/><line x1="232" y1="0" x2="232" y2="44"/><line x1="340" y1="0" x2="340" y2="190"/></g>
      <use href="#rdLamp" transform="translate(60 126)"/>
      <use href="#rdLamp" transform="translate(196 50) scale(0.72)"/>
      <use href="#rdLamp" transform="translate(296 196) scale(0.88)"/>
    </g>
    <g class="rd-r2">
      <g stroke="#D9A441" stroke-width="2"><line x1="820" y1="0" x2="820" y2="26"/><line x1="1000" y1="0" x2="1000" y2="13"/></g>
      <use href="#rdLamp" transform="translate(784 30) scale(0.72)"/>
      <use href="#rdLamp" transform="translate(960 18) scale(0.8)"/>
      <g transform="translate(60 32)">
        <g clip-path="url(#rdArchI)">
          <rect width="440" height="654" fill="url(#rdSkyI)"/>
          <rect x="266" y="116" width="70" height="70" fill="#FFF0C8" mask="url(#rdMoonI)"/>
          <g fill="#FFFFFF"><circle cx="120" cy="110" r="1.6" opacity="0.8"/><circle cx="200" cy="70" r="1.3" opacity="0.7"/><circle cx="380" cy="230" r="1.1" opacity="0.6"/></g>
          <circle cx="70" cy="560" r="120" fill="#FFB27A" opacity="0.3"/>
          <g fill="#1A1235"><rect x="0" y="552" width="68" height="102"/><rect x="62" y="570" width="60" height="84"/><rect x="146" y="546" width="54" height="108"/>
            <rect x="194" y="566" width="70" height="88"/><rect x="318" y="552" width="62" height="102"/><rect x="374" y="570" width="66" height="84"/>
            <rect x="262" y="414" width="42" height="240"/><rect x="262" y="405" width="8" height="10"/><rect x="273" y="405" width="8" height="10"/>
            <rect x="285" y="405" width="8" height="10"/><rect x="296" y="405" width="8" height="10"/><rect x="274" y="376" width="18" height="34"/>
            <rect x="282" y="360" width="2" height="18"/><circle cx="283" cy="358" r="4"/></g>
          <g fill="#F2C46B"><rect x="279" y="384" width="8" height="14" rx="4"/><rect x="162" y="580" width="8" height="10"/><rect x="340" y="576" width="8" height="10"/><rect x="96" y="596" width="8" height="10"/><rect x="410" y="596" width="8" height="10"/></g>
        </g>
        <path d="${ARCH}" fill="none" stroke="#08112E" stroke-width="18"/>
        <path d="${ARCH}" fill="none" stroke="#E0A845" stroke-width="2.5"/>
      </g>
    </g>`, { width: 1280, height: 690, class: 'rd-ram' });
  layer.appendChild(svg);
}

export function mount({ screens, stage }) {
  const ticks = [];
  if (screens.home) ticks.push(homeArch(screens.home.art));
  if (screens.prayer) ticks.push(prayerNiches(screens.prayer.art, screens.prayer.el));
  if (screens.prayer) ramadanArt(screens.prayer.art);
  return {
    tick(t, name) {
      // Which screen is up (the chips at the top move out of the way on the other screens).
      if (stage && name && stage.getAttribute('data-rd-screen') !== name) stage.setAttribute('data-rd-screen', name);
      for (const f of ticks) f(t);
    },
  };
}
