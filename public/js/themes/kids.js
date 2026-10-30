// «للأطفال» (mockups T3-Kids-*): a sunny day on green hills with a big colourful clock whose hands
// show the real time and whose face is shaded up to the next prayer (clock screen); the prayers as
// a board-game road with a pawn at "now" (prayer screen); a dashed card, a star count and little
// pictures on the shopping stickers (lists screen).
import { parts } from '../util.js';
import { prayerDay } from '../data.js';
import { nextPrayer, displayDay } from '../prayer-times.js';

const NS = 'http://www.w3.org/2000/svg';
const HOUR = 3600000;
const KEYS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
const COLORS = { fajr: '#7B6CF6', dhuhr: '#FF9F1C', asr: '#FF6B57', maghrib: '#FF8FB1', isha: '#3D4A8F' };

function svgEl(markup, attrs) {
  const el = document.createElementNS(NS, 'svg');
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  el.innerHTML = markup;
  return el;
}
const lerp = (a, b, f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const fmt = (p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1);

const CLOUD = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})"><circle cx="0" cy="0" r="26"/><circle cx="30" cy="-12" r="32"/><circle cx="64" cy="0" r="24"/><rect x="0" y="-4" width="64" height="28" rx="14"/></g>`;
const FLOWER = (x, y) => `<g transform="translate(${x} ${y})"><circle r="5" fill="#FFFFFF"/><circle r="2.4" fill="#FFD23F"/></g>`;

// ---------- clock screen ----------
const NUMS = [['#FF6B57', '#FFFFFF'], ['#FF9F1C', '#FFFFFF'], ['#FFD23F', '#1F2A44'], ['#5BBE6A', '#FFFFFF'], ['#7B6CF6', '#FFFFFF'], ['#FF8FB1', '#FFFFFF']];
const CX = 220, CY = 220, R = 190;
const onRim = (deg, r) => { const a = (deg * Math.PI) / 180; return [CX + r * Math.sin(a), CY - r * Math.cos(a)]; };
const HOME_ROAD = 'M1250 700 Q1150 660 1035 690 T 800 690 T 560 690 T 315 690 T 80 690';

function homeArt(layer) {
  let nums = '';
  for (let n = 1; n <= 12; n++) {
    const [x, y] = onRim(n * 30, 150);
    const c = NUMS[n % 6];
    nums += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="26" fill="${c[0]}"/><text x="${x.toFixed(1)}" y="${(y + 10).toFixed(1)}" fill="${c[1]}" class="kd-num" text-anchor="middle">${n}</text>`;
  }
  const svg = svgEl(`
    <defs>
      <linearGradient id="kdSky" x1="0" y1="0" x2="0" y2="1"><stop class="kd-sky0" offset="0" stop-color="#8FD0FF"/><stop class="kd-sky1" offset="1" stop-color="#D6EFFF"/></linearGradient>
    </defs>
    <rect width="1280" height="800" fill="url(#kdSky)"/>
    <g class="kd-stars" fill="#FFFFFF"><circle cx="560" cy="200" r="2.5"/><circle cx="760" cy="180" r="2"/><circle cx="600" cy="330" r="2.2"/><circle cx="880" cy="250" r="1.8"/><circle cx="40" cy="60" r="2"/><circle cx="520" cy="40" r="2.4"/></g>
    <g fill="#FFFFFF" opacity="0.9">${CLOUD(600, 70, 0.9)}${CLOUD(70, 560, 0.7)}${CLOUD(1100, 470, 0.8)}</g>
    <path d="M0 590 C 160 520, 360 520, 520 575 S 900 520, 1060 560 S 1220 545, 1280 550 L1280 800 L0 800 Z" fill="#7ED07A"/>
    <path d="M0 640 C 220 600, 420 660, 640 625 S 1040 600, 1280 640 L1280 800 L0 800 Z" fill="#5BBE6A"/>
    ${FLOWER(110, 610)}${FLOWER(300, 772)}${FLOWER(560, 600)}${FLOWER(810, 770)}${FLOWER(1030, 590)}${FLOWER(1235, 760)}${FLOWER(30, 760)}${FLOWER(1210, 615)}
    <path d="${HOME_ROAD}" fill="none" stroke="#F7E3A8" stroke-width="34" stroke-linecap="round"/>
    <path d="${HOME_ROAD}" fill="none" stroke="#FFFFFF" stroke-width="4" stroke-dasharray="2 16" stroke-linecap="round"/>

    <g class="kd-sun" transform="translate(1150 118)">
      <g fill="#FF9F1C"><path d="M0 -92 L12 -66 L-12 -66 Z"/><path d="M0 92 L12 66 L-12 66 Z"/><path d="M-92 0 L-66 12 L-66 -12 Z"/><path d="M92 0 L66 12 L66 -12 Z"/><path d="M-65 -65 L-38 -55 L-55 -38 Z"/><path d="M65 -65 L55 -38 L38 -55 Z"/><path d="M-65 65 L-55 38 L-38 55 Z"/><path d="M65 65 L38 55 L55 38 Z"/></g>
      <circle r="58" fill="#FFD23F" stroke="#FFB800" stroke-width="4"/>
      <circle cx="-19" cy="-10" r="6" fill="#1F2A44"/><circle cx="19" cy="-10" r="6" fill="#1F2A44"/>
      <circle cx="-32" cy="10" r="8" fill="#FF8FB1" opacity="0.7"/><circle cx="32" cy="10" r="8" fill="#FF8FB1" opacity="0.7"/>
      <path d="M-20 14 Q0 34 20 14" fill="none" stroke="#1F2A44" stroke-width="5" stroke-linecap="round"/>
    </g>
    <g class="kd-moon" transform="translate(1150 118)">
      <circle r="72" fill="#FFF6D6" opacity="0.35"/>
      <circle r="58" fill="#FFF3C4" stroke="#F2DC9A" stroke-width="4"/>
      <circle cx="24" cy="-30" r="7" fill="#F2DC9A"/><circle cx="-30" cy="28" r="5" fill="#F2DC9A"/>
      <path d="M-27 -8 Q-19 0 -11 -8 M11 -8 Q19 0 27 -8" fill="none" stroke="#1F2A44" stroke-width="4.5" stroke-linecap="round"/>
      <circle cx="-32" cy="10" r="7" fill="#FF8FB1" opacity="0.6"/><circle cx="32" cy="10" r="7" fill="#FF8FB1" opacity="0.6"/>
      <path d="M-12 16 Q0 26 12 16" fill="none" stroke="#1F2A44" stroke-width="4.5" stroke-linecap="round"/>
      <text x="62" y="-62" class="kd-zzz">z</text><text x="84" y="-86" class="kd-zzz kd-zzz2">z</text>
    </g>

    <g transform="translate(100 70)">
      <circle cx="${CX}" cy="${CY + 6}" r="214" fill="#E8584A"/>
      <circle cx="${CX}" cy="${CY}" r="214" fill="#FF6B57"/>
      <circle cx="${CX}" cy="${CY}" r="${R}" fill="#FFFFFF"/>
      <path class="kd-wedge" d="" fill="#FFF1B8"/>
      <circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="#FFE3DE" stroke-width="3"/>
      ${nums}
      <line class="kd-min" x1="${CX}" y1="${CY}" x2="${CX}" y2="${CY - 155}" stroke="#FF9F1C" stroke-width="16" stroke-linecap="round"/>
      <line class="kd-hour" x1="${CX}" y1="${CY}" x2="${CX}" y2="${CY - 105}" stroke="#7B6CF6" stroke-width="22" stroke-linecap="round"/>
      <circle cx="${CX}" cy="${CY}" r="20" fill="#1F2A44"/>
      <circle cx="${CX}" cy="${CY}" r="7" fill="#FFD23F"/>
      <text class="kd-until" x="${CX}" y="316" text-anchor="middle" stroke-linejoin="round"></text>
    </g>`, { width: 1280, height: 800, class: 'kd-home' });
  layer.appendChild(svg);

  const q = (s) => svg.querySelector(s);
  const wedge = q('.kd-wedge'), until = q('.kd-until');
  const minH = q('.kd-min'), hourH = q('.kd-hour');
  const sun = q('.kd-sun'), moon = q('.kd-moon'), stars = q('.kd-stars');
  const sky0 = q('.kd-sky0'), sky1 = q('.kd-sky1');
  let last = '';

  return function tick(t) {
    const p = parts(t);
    const np = nextPrayer(t);
    const key = p.h + ':' + p.mi + ':' + (np ? np.k + np.at : '');
    if (key === last) return;
    last = key;
    // Hands: the real time.
    minH.setAttribute('transform', `rotate(${p.mi * 6} ${CX} ${CY})`);
    hourH.setAttribute('transform', `rotate(${((p.h % 12) + p.mi / 60) * 30} ${CX} ${CY})`);

    // Shade the face from now to the next prayer: on the minute scale (the long orange hand walks
    // to the end of the slice) within the hour, else on the hour scale (the short purple hand).
    if (np) {
      const mins = Math.max(0, Math.ceil((np.at - t) / 60000));
      const byMinute = mins <= 60;
      const a0 = byMinute ? p.mi * 6 : ((p.h % 12) + p.mi / 60) * 30;
      const a1 = a0 + Math.min(359.5, byMinute ? mins * 6 : (mins / 60) * 30);
      const p0 = onRim(a0, R), p1 = onRim(a1, R);
      wedge.setAttribute('d', `M${CX} ${CY} L${fmt(p0)} A${R} ${R} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${fmt(p1)} Z`);
      wedge.setAttribute('fill', byMinute ? '#FFF1B8' : '#E8E3FF');
      until.textContent = 'حتى ' + np.ar;
      until.setAttribute('fill', byMinute ? '#C98A00' : '#6A5BE0');
      until.setAttribute('stroke', byMinute ? '#FFF1B8' : '#E8E3FF');
      wedge.style.display = until.style.display = '';
    } else {
      wedge.style.display = until.style.display = 'none';
    }

    // Day: the smiling sun; from Maghrib to sunrise: a sleepy moon in a lilac sky.
    const d = prayerDay(t);
    const night = !!d && (t >= d.maghrib || t < d.sunrise);
    sun.style.display = night ? 'none' : '';
    moon.style.display = stars.style.display = night ? '' : 'none';
    sky0.setAttribute('stop-color', night ? '#A79FEA' : '#8FD0FF');
    sky1.setAttribute('stop-color', night ? '#E3DEFF' : '#D6EFFF');
  };
}

// ---------- prayer screen: «طريق الصلوات» ----------
// The mockup's road: five quadratic bends; stop k sits halfway along bend k.
const BENDS = [
  [[1250, 470], [1150, 330], [1035, 470]],
  [[1035, 470], [920, 610], [800, 470]],
  [[800, 470], [680, 330], [560, 470]],
  [[560, 470], [440, 610], [315, 470]],
  [[315, 470], [190, 330], [80, 470]],
];
const BOARD_ROAD = 'M1250 470 Q1150 330 1035 470 T 800 470 T 560 470 T 315 470 T 80 470';
// The road from g0 to g1 (g = bend index + position along it), as path commands.
function roadPart(g0, g1) {
  let d = '';
  for (let i = Math.floor(g0); i < 5 && i < g1; i++) {
    const a = Math.max(0, g0 - i), b = Math.min(1, g1 - i);
    if (b <= a) continue;
    // Sub-curve of a quadratic between a and b (blossoming).
    const [P0, P1, P2] = BENDS[i];
    const at = (u, v) => { const w = [lerp(P0, P1, u), lerp(P1, P2, u)]; return lerp(w[0], w[1], v); };
    const s = at(a, a), c = at(a, b), e = at(b, b);
    d += (d ? ' L' : 'M') + fmt(s) + ' Q' + fmt(c) + ' ' + fmt(e);
  }
  return d;
}
function roadPoint(g) {
  const i = Math.min(4, Math.floor(g)), u = g - i;
  const [P0, P1, P2] = BENDS[i];
  return lerp(lerp(P0, P1, u), lerp(P1, P2, u), u);
}
const PAST_AR = ['لم تمرّ صلاة بعد', 'مرّت صلاة واحدة', 'مرّت صلاتان', 'مرّت ثلاث صلوات', 'مرّت أربع صلوات', 'مرّت الصلوات الخمس'];
const LEFT_AR = ['خمس صلوات تنتظرنا', 'وبقيت أربع', 'وبقيت ثلاث', 'وبقيت اثنتان', 'وبقيت واحدة', 'أحسنتم!'];

function prayerBoard(layer, screen) {
  const svg = svgEl(`
    <g opacity="0.85">
      <rect x="560" y="60" width="16" height="16" rx="3" fill="#FFD23F" transform="rotate(20 568 68)"/>
      <circle cx="660" cy="150" r="8" fill="#FF8FB1"/>
      <rect x="90" y="230" width="14" height="14" rx="3" fill="#5BBE6A" transform="rotate(-15 97 237)"/>
      <circle cx="1220" cy="250" r="9" fill="#FF9F1C"/>
      <rect x="1080" y="640" width="16" height="16" rx="3" fill="#7B6CF6" transform="rotate(35 1088 648)"/>
      <circle cx="140" cy="640" r="7" fill="#FF6B57"/>
      <circle cx="860" cy="230" r="6" fill="#5BBE6A"/>
      <rect x="300" y="300" width="12" height="12" rx="3" fill="#FF8FB1" transform="rotate(10 306 306)"/>
      <circle cx="1000" cy="740" r="8" fill="#FFD23F"/>
      <circle cx="40" cy="120" r="9" fill="#7B6CF6"/>
    </g>
    <path d="${BOARD_ROAD}" fill="none" stroke="#D9D0FF" stroke-width="64" stroke-linecap="round"/>
    <path d="${BOARD_ROAD}" fill="none" stroke="#FFFFFF" stroke-width="46" stroke-dasharray="34 10"/>
    <path class="kd-trail" d="" fill="none" stroke="#FFD23F" stroke-width="12" stroke-linecap="round" stroke-dasharray="1 18"/>`,
  { width: 1280, height: 800, class: 'kd-board' });
  layer.appendChild(svg);
  // The pawn stands in front of the stops (it may be arriving at one), so it gets its own layer.
  const top = svgEl(`
    <g class="kd-pawn">
      <ellipse cx="0" cy="34" rx="30" ry="8" fill="#1F2A44" opacity="0.15"/>
      <path d="M-24 34 Q-20 0 0 -4 Q20 0 24 34 Z" fill="#7B6CF6"/>
      <circle cx="0" cy="-20" r="20" fill="#7B6CF6"/>
      <circle cx="-6" cy="-24" r="6" fill="#FFFFFF" opacity="0.6"/>
      <rect x="-25" y="-82" width="82" height="29" rx="14" fill="#7B6CF6"/>
      <text class="kd-board-label" x="16" y="-61" text-anchor="middle">نحن هنا</text>
    </g>`, { width: 1280, height: 800, class: 'kd-top', 'aria-hidden': 'true' });
  screen.insertBefore(top, screen.querySelector(':scope > .band'));
  const beadsText = document.createElement('div');
  beadsText.className = 'kd-beads-text';
  const beads = document.createElement('div');
  beads.className = 'kd-beads';
  const dots = KEYS.map((k) => {
    const i = document.createElement('i');
    i.style.borderColor = COLORS[k];
    beads.appendChild(i);
    return { k, i };
  });
  layer.appendChild(beadsText);
  layer.appendChild(beads);

  const trail = svg.querySelector('.kd-trail');
  const pawn = top.querySelector('.kd-pawn');
  let last = '';
  const tick = function (t) {
    const dd = displayDay(t);
    const key = Math.floor(t / 60000) + ':' + (dd ? dd.times.fajr : '');
    if (key === last) return;
    last = key;
    svg.style.visibility = top.style.visibility = beads.style.visibility = beadsText.style.visibility = dd ? '' : 'hidden';
    if (!dd) return;
    const at = KEYS.map((k) => dd.times[k]);
    // Where on the road is "now"? Stop k is at g = k + 0.5. Between two stops the pawn keeps a
    // little away from both, so it is seen walking between them.
    let g;
    if (t < at[0]) g = 0.04 + 0.12 * clamp01(1 - (at[0] - t) / (4 * HOUR));
    else if (t >= at[4]) g = 4.84 + 0.12 * clamp01((t - at[4]) / (3 * HOUR));
    else {
      let i = 0;
      while (i < 3 && t >= at[i + 1]) i++;
      g = i + 0.5 + 0.34 + 0.32 * clamp01((t - at[i]) / (at[i + 1] - at[i]));
    }
    trail.setAttribute('d', g > 0.5 ? roadPart(0.5, g) : '');
    const pt = roadPoint(g);
    pawn.setAttribute('transform', `translate(${fmt(pt)})`);

    const past = at.filter((x) => x && x <= t).length;
    dots.forEach((d, i) => {
      const done = i < past;
      d.i.className = done ? 'is-done' : '';
      d.i.style.background = done ? COLORS[d.k] : '#FFFFFF';
    });
    beadsText.innerHTML = PAST_AR[past] + '<span>' + LEFT_AR[past] + '</span>';
  };
  tick.unmount = () => top.remove();
  return tick;
}

// ---------- lists screen ----------
// A picture for common things on the shopping list. Only pictures this device can draw in colour
// are used (older Android has no glyph for the newer emoji).
const PICS = [
  ['زيت الزيتون', '🫒'], ['زيتون', '🫒'], ['زيت', '🫙'], ['خبز', '🍞'], ['حليب', '🥛'], ['لبن', '🥛'], ['نعناع', '🌿'], ['بيض', '🥚'],
  ['سكر', '🍬'], ['صابون', '🧼'], ['طماطم', '🍅'], ['بطاطس', '🥔'], ['بطاطا', '🥔'], ['بصل', '🧅'], ['ثوم', '🧄'], ['جزر', '🥕'],
  ['ليمون', '🍋'], ['برتقال', '🍊'], ['تفاح', '🍎'], ['موز', '🍌'], ['عنب', '🍇'], ['بطيخ', '🍉'], ['فراولة', '🍓'], ['لحم', '🥩'],
  ['دجاج', '🍗'], ['سمك', '🐟'], ['جبن', '🧀'], ['فرماج', '🧀'], ['زبدة', '🧈'], ['أرز', '🍚'], ['رز', '🍚'], ['شاي', '🍵'], ['أتاي', '🍵'],
  ['قهوة', '☕'], ['ماء', '💧'], ['عصير', '🧃'], ['دقيق', '🌾'], ['طحين', '🌾'], ['ملح', '🧂'], ['عسل', '🍯'], ['شوكولا', '🍫'],
  ['حلوى', '🍬'], ['بسكويت', '🍪'], ['كعك', '🍪'], ['معكرونة', '🍝'], ['فلفل', '🌶️'], ['تمر', '🌴'], ['مناديل', '🧻'], ['ورق', '🧻'],
  ['شامبو', '🧴'], ['معجون', '🪥'], ['دواء', '💊'], ['خس', '🥬'], ['خيار', '🥒'], ['فول', '🫘'], ['عدس', '🫘'], ['حمص', '🫘'],
];
const drawable = {};
function canDraw(e) {
  if (e in drawable) return drawable[e];
  let ok = false;
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 24;
    const x = c.getContext('2d');
    x.textBaseline = 'top';
    x.font = '20px sans-serif';
    x.fillStyle = '#000';
    x.fillText(e, 0, 0);
    const px = x.getImageData(0, 0, 24, 24).data;
    for (let i = 0; i < px.length && !ok; i += 4) if (px[i + 3] > 0 && (Math.abs(px[i] - px[i + 1]) > 20 || Math.abs(px[i + 1] - px[i + 2]) > 20)) ok = true;
  } catch (err) { ok = false; }
  drawable[e] = ok;
  return ok;
}
function picFor(text) {
  for (const [k, e] of PICS) if (text.indexOf(k) >= 0) return canDraw(e) ? e : '';
  return '';
}

function listsArt(layer, screen) {
  layer.appendChild(svgEl(`
    <rect x="40" y="36" width="476" height="728" rx="36" fill="#FFFFFF"/>
    <rect x="40" y="36" width="476" height="728" rx="36" fill="none" stroke="#7B6CF6" stroke-width="5" stroke-dasharray="14 10"/>`,
  { width: 1280, height: 800 }));
  const stars = document.createElement('div');
  stars.className = 'kd-stars-line';
  layer.appendChild(stars);
  const tiles = screen.querySelector('.l-tiles');
  const rows = screen.querySelector('.l-rows');
  function dress() {
    if (tiles) {
      for (const tile of tiles.querySelectorAll('.l-tile')) {
        if (tile.querySelector('.kd-emoji')) continue;
        const text = tile.querySelector('.l-tile-text');
        if (text && text.textContent.length > 6) tile.classList.add('kd-long');
        const pic = text ? picFor(text.textContent) : '';
        if (!pic) continue;
        const span = document.createElement('span');
        span.className = 'kd-emoji';
        span.setAttribute('aria-hidden', 'true');
        span.textContent = pic;
        tile.insertBefore(span, text);
      }
    }
    const n = rows ? rows.querySelectorAll('.l-row.is-done').length : 0;
    stars.innerHTML = 'نجوم المهام: <b>' + n + '</b>';
  }
  const obs = new MutationObserver(dress);
  if (tiles) obs.observe(tiles, { childList: true });
  if (rows) obs.observe(rows, { childList: true });
  dress();
  const tick = () => {};
  tick.unmount = () => {
    obs.disconnect();
    for (const e of screen.querySelectorAll('.kd-emoji')) e.remove();
    for (const e of screen.querySelectorAll('.kd-long')) e.classList.remove('kd-long');
  };
  return tick;
}

export function mount({ screens }) {
  const ticks = [];
  if (screens.home) ticks.push(homeArt(screens.home.art));
  if (screens.prayer) ticks.push(prayerBoard(screens.prayer.art, screens.prayer.el));
  if (screens.lists) ticks.push(listsArt(screens.lists.art, screens.lists.el));
  return {
    tick(t) { for (const f of ticks) f(t); },
    unmount() { for (const f of ticks) if (f.unmount) f.unmount(); },
  };
}
