// «الأطلس» (mockups T7-Atlas-*): Morocco's High Atlas. Layered ranges with snow caps, an ighrem
// on a ridge, poplars and cedars (clock screen); the five prayers as five summits along a ridge
// with a flag on the next one and the sun between the last and the next (prayer screen); two
// notice boards on posts for the lists.
// The landscape follows the season from the date (Morocco: winter Dec–Feb, spring Mar–May,
// summer Jun–Aug, autumn Sep–Nov) and the hour (dawn, day, dusk, night with stars and lit
// windows). Everything is coloured from CSS variables (--at-*) set on the stage, so a change is
// a handful of setProperty calls, never a redraw. ?season=winter|spring|summer|autumn forces one.
import config from '../config.js';
import { hhmm, parts, MINUTE } from '../util.js';
import { prayerDay } from '../data.js';
import { PRAYERS, prayerName, nextPrayer, lastPrayer, displayDay } from '../prayer-times.js';
import { ramadanInfo } from '../ramadan.js';

const NS = 'http://www.w3.org/2000/svg';
function svgEl(markup, attrs) {
  const el = document.createElementNS(NS, 'svg');
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  el.innerHTML = markup;
  return el;
}
const fill = (k) => `style="fill:var(--at-${k})"`;
const dfill = (k) => `style="fill:var(--atd-${k})"`;

// ---------- palettes (from the mockup's renderVals) ----------
const SEASONS = {
  autumn: { label: 'الخريف', rgb: '164, 86, 31', sky1: '#F4E6CC', sky2: '#E6C69C', sun: '#FBEBC8', far: '#BCC2CC', 'far-snow': 1, 'mid-snow': 0, mid: '#8E98A6', shade: '#7A8494', near: '#C98B3F', tree: '#DFA23A', trunk: '#6B4A2E', ground: '#2F3B2C', kasbah: '#B97A4B', accent: '#A4561F' },
  winter: { label: 'الشتاء', rgb: '63, 107, 140', sky1: '#E8EEF4', sky2: '#C3D2E0', sun: '#F7F4EA', far: '#CBD4E0', 'far-snow': 1, 'mid-snow': 1, mid: '#9AA8BA', shade: '#8696AB', near: '#EEF2F6', tree: '#2F4A3C', trunk: '#3D2F25', ground: '#26352D', kasbah: '#A8744C', accent: '#3F6B8C' },
  spring: { label: 'الربيع', rgb: '79, 127, 58', sky1: '#E3EFF3', sky2: '#F2EBD8', sun: '#FFF3D6', far: '#B6C6D0', 'far-snow': 0.8, 'mid-snow': 0, mid: '#869CAA', shade: '#748A99', near: '#8DB165', tree: '#F4D3DA', trunk: '#6B4A2E', ground: '#2E4630', kasbah: '#C08155', accent: '#4F7F3A' },
  summer: { label: 'الصيف', rgb: '160, 82, 28', sky1: '#F8EBCB', sky2: '#F0CC88', sun: '#FFF1C9', far: '#C9B79F', 'far-snow': 0, 'mid-snow': 0, mid: '#A98C70', shade: '#937860', near: '#D7AE62', tree: '#5C7F3D', trunk: '#5A3E28', ground: '#3A3424', kasbah: '#B9784A', accent: '#A0521C' },
};
// What the hour adds on top of the season.
const DAYTIME = { ink: '#1F2A26', ink2: 'rgba(31, 42, 38, 0.72)', chip: 'rgba(255, 255, 255, 0.55)', snow: '#FBF8F1', win: '#3A2A1E', stars: 0, moon: 0, sunop: 1, glow: 0, 'sun-dy': '0px' };
const DUSK = { sky1: '#DCCFE0', sky2: '#F0B489', sun: '#F7B36E', far: '#A9A9BC', mid: '#7E8499', shade: '#6C7287', 'sun-dy': '150px' };
const DAWN = { sky1: '#CBD3E5', sky2: '#F4D2B0', sun: '#FBD9A6', far: '#B0B7C9', mid: '#838DA1', shade: '#727C90', 'sun-dy': '140px' };
const NIGHT = {
  sky1: '#0C1530', sky2: '#26335E', sun: '#F3EBD2', far: '#39446A', mid: '#27314F', shade: '#1D2640', trunk: '#251C15', ground: '#0E1511',
  kasbah: '#4D3B2F', win: '#F2C46B', snow: '#C3CDE2', ink: '#F4EBD8', ink2: 'rgba(244, 235, 216, 0.8)', chip: 'rgba(244, 235, 216, 0.14)',
  stars: 1, moon: 1, sunop: 0, glow: 1, 'sun-dy': '0px',
};
const NIGHT_SEASON = {
  autumn: { near: '#4A3A27', tree: '#7A5A26', accent: '#EDA866' },
  winter: { near: '#76839F', tree: '#16241D', accent: '#A9CBE6' },
  spring: { near: '#2C4230', tree: '#9A8790', accent: '#B7D89C' },
  summer: { near: '#55452E', tree: '#28381F', accent: '#EDB872' },
};
const DAY_KEYS = ['sky1', 'sky2', 'far', 'far-snow', 'mid', 'near', 'tree', 'trunk', 'ground'];

const FORCED = (() => {
  try { const s = new URLSearchParams(location.search).get('season'); return SEASONS[s] ? s : null; } catch (e) { return null; }
})();
function seasonOf(t) {
  if (FORCED) return FORCED;
  const m = parts(t).m;
  return m === 12 || m <= 2 ? 'winter' : m <= 5 ? 'spring' : m <= 8 ? 'summer' : 'autumn';
}
// Night from Maghrib + 25 min until Fajr; a dusk tint from 40 min before Maghrib, a dawn tint
// from Fajr until half an hour after sunrise.
function phaseOf(t) {
  const d = prayerDay(t);
  if (!d) return 'day';
  if (t >= d.maghrib + 25 * MINUTE || t < d.fajr) return 'night';
  if (t >= d.maghrib - 40 * MINUTE) return 'dusk';
  if (t < d.sunrise + 30 * MINUTE) return 'dawn';
  return 'day';
}
function paletteOf(season, phase) {
  const s = SEASONS[season];
  const v = Object.assign({}, s, DAYTIME);
  if (phase === 'dusk') Object.assign(v, DUSK);
  if (phase === 'dawn') Object.assign(v, DAWN);
  if (phase === 'night') Object.assign(v, NIGHT, NIGHT_SEASON[season]);
  delete v.label;
  delete v.rgb;
  return v;
}

// ---------- shared pieces ----------
const skyGrad = (id, pre = 'at') => `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--${pre}-sky1)"/><stop offset="1" style="stop-color:var(--${pre}-sky2)"/></linearGradient>`;
const sunGrad = (id) => `<radialGradient id="${id}"><stop offset="0" style="stop-color:var(--at-sun)"/><stop offset="0.45" style="stop-color:var(--at-sun);stop-opacity:0.55"/><stop offset="1" style="stop-color:var(--at-sun);stop-opacity:0"/></radialGradient>`;
const POPLAR = (id, rx, ry) => `<g id="${id}"><rect x="-2" y="-8" width="4" height="16" ${fill('trunk')}/><ellipse cx="0" cy="${-ry - 2}" rx="${rx}" ry="${ry}" ${fill('tree')}/></g>`;
// Spring: almond trees in blossom instead of the poplars.
const ALMOND = (id) => `<g id="${id}"><path d="M-2 8 V-12 L-10 -22 M2 -12 L9 -24 M0 -6 V-28" ${'style="stroke:var(--at-trunk)"'} stroke-width="3.5" fill="none" stroke-linecap="round"/><g ${fill('tree')}><circle cx="0" cy="-30" r="15"/><circle cx="-13" cy="-23" r="11"/><circle cx="13" cy="-24" r="11"/><circle cx="-5" cy="-40" r="9"/><circle cx="7" cy="-39" r="9"/></g></g>`;
const CEDAR = (id) => `<g id="${id}" ${fill('ground')}><path d="M0 -70 L18 -40 L9 -40 L26 -14 L12 -14 L30 10 L-30 10 L-12 -14 L-26 -14 L-9 -40 L-18 -40 Z"/><rect x="-3" y="10" width="6" height="12"/></g>`;

// Stars at fixed, pseudo-random places in the upper sky (night only).
function stars(n, seed, x0, x1, y0, y1) {
  let s = seed, out = '';
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < n; i++) {
    const x = x0 + rnd() * (x1 - x0), y = y0 + rnd() * (y1 - y0), r = 0.8 + rnd() * 1.1, o = 0.45 + rnd() * 0.5;
    out += `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${r.toFixed(1)}" opacity="${o.toFixed(2)}"/>`;
  }
  return `<g fill="#FFFFFF" style="opacity:var(--at-stars)">${out}</g>`;
}
// A crescent with a soft glow (night only).
function moon(id, cx, cy, r) {
  return `<g style="opacity:var(--at-moon)">
    <circle cx="${cx}" cy="${cy}" r="${r * 3.4}" fill="url(#${id}G)"/>
    <mask id="${id}M" maskUnits="userSpaceOnUse" x="${cx - r - 2}" y="${cy - r - 2}" width="${2 * r + 4}" height="${2 * r + 4}"><circle cx="${cx}" cy="${cy}" r="${r}" fill="#fff"/><circle cx="${cx + r * 0.42}" cy="${cy - r * 0.3}" r="${r * 0.86}" fill="#000"/></mask>
    <rect x="${cx - r - 2}" y="${cy - r - 2}" width="${2 * r + 4}" height="${2 * r + 4}" fill="#F3EBD2" mask="url(#${id}M)"/></g>`;
}
const moonGrad = (id) => `<radialGradient id="${id}G"><stop offset="0" stop-color="#F3EBD2" stop-opacity="0.3"/><stop offset="1" stop-color="#F3EBD2" stop-opacity="0"/></radialGradient>`;

// ---------- clock screen ----------
function homeArt(layer) {
  layer.appendChild(svgEl(`
    <defs>
      ${skyGrad('atSkyH')}${sunGrad('atSunH')}${moonGrad('atMoonH')}
      <radialGradient id="atLampH"><stop offset="0" stop-color="#F2C46B" stop-opacity="0.6"/><stop offset="1" stop-color="#F2C46B" stop-opacity="0"/></radialGradient>
      ${POPLAR('atPoplarH', 11, 32)}${ALMOND('atAlmondH')}${CEDAR('atCedarH')}
    </defs>
    <rect width="1280" height="800" fill="url(#atSkyH)"/>
    ${stars(46, 7, 20, 1260, 16, 330)}
    ${moon('atMoonH', 548, 104, 26)}
    <g style="opacity:var(--at-sunop);transform:translateY(var(--at-sun-dy))"><circle cx="470" cy="150" r="120" fill="url(#atSunH)"/><circle cx="470" cy="150" r="34" ${fill('sun')}/></g>
    <path d="M0 430 L90 360 L170 392 L300 262 L392 330 L470 296 L560 372 L650 352 L760 430 L900 410 L1040 450 L1160 430 L1280 452 L1280 800 L0 800 Z" ${fill('far')}/>
    <g style="fill:var(--at-snow);opacity:var(--at-far-snow)">
      <path d="M300 262 L262 300 L280 298 L292 312 L306 296 L322 306 L344 286 Z"/>
      <path d="M470 296 L446 320 L462 318 L472 330 L484 318 L500 324 Z"/>
      <path d="M90 360 L68 378 L84 378 L94 388 L106 376 L118 380 Z"/>
    </g>
    <path d="M0 540 L110 482 L230 520 L360 462 L480 520 L610 488 L760 540 L900 508 L1030 552 L1160 520 L1280 548 L1280 800 L0 800 Z" ${fill('mid')}/>
    <g style="fill:var(--at-snow);opacity:var(--at-mid-snow)">
      <path d="M110 482 L84 496 L98 497 L108 506 L120 496 L136 496 Z"/>
      <path d="M360 462 L330 478 L346 479 L358 489 L372 478 L390 478 Z"/>
      <path d="M610 488 L586 500 L600 501 L610 510 L622 500 L636 501 Z"/>
      <path d="M1160 520 L1138 532 L1150 533 L1160 541 L1170 532 L1184 533 Z"/>
    </g>
    <g transform="translate(860 470)">
      <g ${fill('kasbah')}>
        <rect x="0" y="22" width="34" height="46"/><rect x="30" y="38" width="62" height="30"/><rect x="86" y="14" width="30" height="54"/>
        <path d="M0 22 l4 -6 l4 6 l4 -6 l4 6 l4 -6 l4 6 l4 -6 l4 6 Z M86 14 l4 -6 l4 6 l4 -6 l4 6 l4 -6 l4 6 l4 -6 l3 6 Z"/>
      </g>
      <g style="opacity:var(--at-glow)" fill="url(#atLampH)"><circle cx="15" cy="38" r="16"/><circle cx="101" cy="30" r="16"/><circle cx="55" cy="52" r="15"/><circle cx="101" cy="50" r="15"/></g>
      <g ${fill('win')}><rect x="12" y="34" width="6" height="9"/><rect x="98" y="26" width="6" height="9"/><rect x="52" y="48" width="6" height="8"/><rect x="98" y="46" width="6" height="8"/></g>
    </g>
    <path d="M0 640 C 180 600, 380 646, 560 618 S 900 596, 1100 636 S 1240 628, 1280 622 L1280 800 L0 800 Z" ${fill('near')}/>
    <g class="at-poplars">
      <use href="#atPoplarH" transform="translate(120 626)"/><use href="#atPoplarH" transform="translate(150 618)"/><use href="#atPoplarH" transform="translate(182 614)"/><use href="#atPoplarH" transform="translate(214 612) scale(0.9)"/>
      <use href="#atPoplarH" transform="translate(1060 628)"/><use href="#atPoplarH" transform="translate(1090 624) scale(1.1)"/><use href="#atPoplarH" transform="translate(1124 628) scale(0.85)"/>
    </g>
    <g class="at-almonds">
      <use href="#atAlmondH" transform="translate(128 624)"/><use href="#atAlmondH" transform="translate(176 614) scale(0.85)"/><use href="#atAlmondH" transform="translate(222 612) scale(0.7)"/>
      <use href="#atAlmondH" transform="translate(1064 628)"/><use href="#atAlmondH" transform="translate(1112 626) scale(0.8)"/>
    </g>
    <path d="M0 700 C 260 680, 560 712, 860 694 S 1180 688, 1280 696 L1280 800 L0 800 Z" ${fill('ground')}/>
    <g><use href="#atCedarH" transform="translate(36 690)"/><use href="#atCedarH" transform="translate(78 700) scale(0.8)"/><use href="#atCedarH" transform="translate(1238 692) scale(0.9)"/></g>`,
  { width: 1280, height: 800 }));
}

// ---------- prayer screen: five summits ----------
// Right to left (RTL): Fajr, Dhuhr, Asr, Maghrib, Isha. The ridge rises to noon like the sun.
const PEAKS = [{ x: 1110, y: 520 }, { x: 870, y: 380 }, { x: 640, y: 430 }, { x: 410, y: 500 }, { x: 180, y: 560 }];
const FIVE = PRAYERS.filter((p) => !p.minor);
const f1 = (v) => v.toFixed(1);

function prayerArt(layer) {
  const svg = svgEl(`
    <defs>${skyGrad('atSkyP')}${sunGrad('atSunP')}${moonGrad('atMoonP')}${POPLAR('atPoplarP', 10, 28)}${ALMOND('atAlmondP')}</defs>
    <rect width="1280" height="800" fill="url(#atSkyP)"/>
    ${stars(44, 11, 20, 1260, 16, 400)}
    ${moon('atMoonP', 560, 140, 28)}
    <g class="atp-sun" style="opacity:var(--at-sunop)">
      <path class="atp-arc" d="M110 -6 Q 30 -66 -90 -16" fill="none" style="stroke:var(--at-accent)" stroke-width="2" stroke-dasharray="2 9" stroke-linecap="round" opacity="0.6"/>
      <circle r="110" fill="url(#atSunP)"/>
      <circle r="30" ${fill('sun')} stroke="#F2D29A" stroke-width="3"/>
    </g>
    <path d="M0 520 L140 470 L260 500 L400 440 L560 480 L700 450 L840 470 L1000 430 L1140 470 L1280 450 L1280 800 L0 800 Z" ${fill('far')}/>
    <path d="M0 640 L180 560 L295 620 L410 500 L525 600 L640 430 L755 590 L870 380 L990 590 L1110 520 L1200 600 L1280 580 L1280 800 L0 800 Z" ${fill('mid')}/>
    <path d="M640 430 L700 520 L690 590 L755 590 Z M870 380 L940 480 L930 590 L990 590 Z M410 500 L460 560 L455 600 L525 600 Z M1110 520 L1150 570 L1200 600 Z M180 560 L240 600 L295 620 Z" ${fill('shade')}/>
    <g style="fill:var(--at-snow);opacity:var(--at-far-snow)">
      <path d="M870 380 L842 414 L858 410 L870 424 L884 408 L900 414 Z"/>
      <path d="M640 430 L616 460 L630 458 L642 470 L654 456 L668 462 Z"/>
      <path d="M1110 520 L1092 540 L1104 540 L1112 548 L1122 538 L1132 542 Z" opacity="0.9"/>
      <path d="M410 500 L392 520 L404 520 L412 528 L422 518 L432 522 Z" opacity="0.9"/>
      <path d="M180 560 L164 576 L176 576 L184 584 L192 574 L200 578 Z" opacity="0.9"/>
    </g>
    <g class="atp-flag"><rect x="-1.5" y="-62" width="3" height="62" ${fill('ink')}/><path d="M1.5 -62 L38 -50 L1.5 -38 Z" ${fill('accent')}/></g>
    <path d="M0 700 C 220 666, 480 704, 760 684 S 1160 676, 1280 690 L1280 800 L0 800 Z" ${fill('near')}/>
    <g class="at-poplars"><use href="#atPoplarP" transform="translate(96 690)"/><use href="#atPoplarP" transform="translate(126 684)"/><use href="#atPoplarP" transform="translate(158 682) scale(0.9)"/><use href="#atPoplarP" transform="translate(1128 690)"/><use href="#atPoplarP" transform="translate(1160 686) scale(1.1)"/></g>
    <g class="at-almonds"><use href="#atAlmondP" transform="translate(104 690) scale(0.85)"/><use href="#atAlmondP" transform="translate(150 684) scale(0.7)"/><use href="#atAlmondP" transform="translate(1138 690) scale(0.9)"/></g>
    <path d="M0 748 C 300 736, 700 756, 1280 742 L1280 800 L0 800 Z" ${fill('ground')}/>`,
  { width: 1280, height: 800 });
  layer.appendChild(svg);
  const sun = svg.querySelector('.atp-sun');
  const flag = svg.querySelector('.atp-flag');
  const arc = svg.querySelector('.atp-arc');

  // The names and times above the summits.
  const labs = FIVE.map(() => {
    const n = document.createElement('span');
    n.className = 'atp-n';
    const tm = document.createElement('bdi');
    tm.className = 'atp-t';
    tm.setAttribute('dir', 'ltr');
    const el = document.createElement('div');
    el.className = 'atp-lab';
    el.append(n, tm);
    layer.appendChild(el);
    return { el, n, tm };
  });
  const foot = document.createElement('div');
  foot.className = 'atp-foot';
  foot.textContent = 'خمس قمم في اليوم · «أرحنا بها يا بلال»';
  layer.appendChild(foot);

  let last = '';
  return function tick(t) {
    const dd = displayDay(t);
    const np = nextPrayer(t);
    const key = Math.floor(t / MINUTE) + ':' + (dd ? dd.times.fajr : '') + ':' + (np ? np.at : '');
    if (key === last) return;
    last = key;
    const show = dd ? '' : 'hidden';
    sun.style.visibility = flag.style.visibility = show;
    for (const l of labs) l.el.style.visibility = show;
    if (!dd) return;
    const T = dd.times;
    // The flag marks the next prayer, or the one whose time has just come (as the big title does).
    const lp = lastPrayer(t);
    const after = (config.prayerFocus && config.prayerFocus.after) || 0;
    const hi = lp && t - lp.at < after * MINUTE ? lp : np;
    let flagAt = null;
    FIVE.forEach((p, i) => {
      const at = T[p.k];
      const l = labs[i];
      const isHi = !!(hi && at && hi.k === p.k && hi.at === at);
      const past = !isHi && !!at && at <= t;
      l.el.classList.toggle('is-next', isHi);
      l.el.classList.toggle('is-past', past);
      l.n.textContent = at ? prayerName(p.k, at) : p.ar;
      l.tm.textContent = at ? hhmm(at) : '';
      const pk = PEAKS[i];
      // As in the mockup: a 180px column centred on the summit, higher for the flagged one.
      l.el.style.left = (pk.x - 90) + 'px';
      l.el.style.top = (pk.y - (isHi ? 188 : 110)) + 'px';
      if (isHi) flagAt = pk;
    });
    flag.style.display = flagAt ? '' : 'none';
    if (flagAt) flag.setAttribute('transform', `translate(${flagAt.x} ${flagAt.y})`);

    // The sun between the peaks of the last and the next prayer, as high as it stands in the sky;
    // after sunset it sinks behind the far range.
    const ats = FIVE.map((p) => T[p.k]);
    let x = PEAKS[0].x;
    if (t >= ats[4]) x = PEAKS[4].x;
    else if (t > ats[0]) {
      for (let i = 0; i < 4; i++) {
        if (t < ats[i + 1]) { x = PEAKS[i].x + (PEAKS[i + 1].x - PEAKS[i].x) * (t - ats[i]) / (ats[i + 1] - ats[i]); break; }
      }
    }
    const sr = T.sunrise, ss = T.sunset || T.maghrib;
    const y = t >= sr && t <= ss ? 380 - 210 * Math.sin(Math.PI * (t - sr) / (ss - sr))
      : 380 + Math.min(220, (t < sr ? sr - t : t - ss) / MINUTE * 6);
    sun.setAttribute('transform', `translate(${f1(x)} ${f1(y)})`);
    arc.style.display = t >= sr && t <= ss ? '' : 'none'; // the path only while the sun is up
  };
}

// ---------- lists: two notice boards on the landscape ----------
function listsArt(layer) {
  layer.appendChild(svgEl(`
    <defs>${skyGrad('atSkyL')}</defs>
    <rect width="1280" height="800" fill="url(#atSkyL)"/>
    ${stars(30, 5, 20, 1260, 8, 30)}
    <path d="M0 560 L120 500 L250 540 L390 430 L520 520 L660 470 L800 540 L960 450 L1100 520 L1280 480 L1280 800 L0 800 Z" ${fill('far')}/>
    <path d="M390 430 L368 452 L382 450 L392 460 L402 448 L416 454 Z M960 450 L940 470 L952 468 L962 478 L972 466 L986 470 Z" style="fill:var(--at-snow);opacity:var(--at-far-snow)"/>
    <path d="M0 660 C 240 620, 520 670, 800 640 S 1180 630, 1280 650 L1280 800 L0 800 Z" ${fill('mid')}/>
    <path d="M0 740 C 300 716, 700 748, 1280 728 L1280 800 L0 800 Z" ${fill('ground')}/>
    <g fill="#6B4A2E"><rect x="1166" y="680" width="12" height="80"/><rect x="740" y="680" width="12" height="80"/><rect x="530" y="680" width="12" height="80"/><rect x="134" y="680" width="12" height="80"/></g>`,
  { width: 1280, height: 800 }));
}

// ---------- calendar and adhkar: the day sky and a low ridge along the bottom ----------
function ridgeArt(layer, id) {
  layer.appendChild(svgEl(`
    <defs>${skyGrad(id, 'atd')}</defs>
    <rect width="1280" height="800" fill="url(#${id})"/>
    <path d="M0 742 L90 716 L170 728 L300 690 L392 716 L470 702 L560 726 L650 718 L760 738 L900 722 L1040 740 L1160 728 L1280 736 L1280 800 L0 800 Z" ${dfill('far')}/>
    <path d="M300 690 L284 702 L294 701 L302 707 L310 700 L320 702 Z M470 702 L458 710 L466 710 L472 715 L478 709 L486 711 Z" style="fill:#FBF8F1;opacity:var(--atd-far-snow)"/>
    <path d="M0 766 C 260 752, 560 774, 860 760 S 1180 756, 1280 762 L1280 800 L0 800 Z" ${dfill('ground')}/>`,
  { width: 1280, height: 800 }));
}

const SEASON_CLASSES = ['at-autumn', 'at-winter', 'at-spring', 'at-summer', 'at-day', 'at-dawn', 'at-dusk', 'at-night', 'at-ramadan', 'at-art'];

export function mount({ screens, stage }) {
  const ticks = [];
  const layers = [];
  const add = (name, fn, ...rest) => {
    if (!screens[name]) return;
    layers.push(screens[name].art);
    const f = fn(screens[name].art, ...rest);
    if (f) ticks.push(f);
  };
  add('home', homeArt);
  add('prayer', prayerArt);
  add('lists', listsArt);
  add('calendar', ridgeArt, 'atSkyC');
  add('adhkar', ridgeArt, 'atSkyA');
  const homeLayer = screens.home && screens.home.art;
  const props = new Set();
  const setVar = (k, v) => { if (!stage) return; props.add(k); stage.style.setProperty(k, String(v)); };

  let lastKey = '', ticksSince = 5, ramadan = false;
  function apply(season, phase) {
    const v = paletteOf(season, phase);
    for (const k in v) setVar('--at-' + k, v[k]);
    const day = SEASONS[season];
    for (const k of DAY_KEYS) setVar('--atd-' + k, day[k]);
    // The accent of the whole look follows the season (calendar, adhkar, the dock…).
    setVar('--saffron', day.accent);
    setVar('--accent-rgb', day.rgb);
    setVar('--at-season', '"' + day.label + ' في الأطلس"');
    for (const l of layers) {
      for (const c of SEASON_CLASSES) if (c !== 'at-ramadan') l.classList.remove(c);
      l.classList.add('at-art', 'at-' + season, 'at-' + phase);
    }
  }

  return {
    tick(t) {
      // Ramadan (or its preview from the control panel) checked every few seconds.
      if (++ticksSince >= 5) {
        ticksSince = 0;
        ramadan = !!ramadanInfo(t).active;
        if (homeLayer) homeLayer.classList.toggle('at-ramadan', ramadan);
      }
      const season = seasonOf(t), phase = phaseOf(t);
      const key = season + ':' + phase;
      if (key !== lastKey) { lastKey = key; apply(season, phase); }
      for (const f of ticks) f(t);
    },
    unmount() {
      if (stage) for (const k of props) stage.style.removeProperty(k);
      for (const l of layers) for (const c of SEASON_CLASSES) l.classList.remove(c);
    },
  };
}
