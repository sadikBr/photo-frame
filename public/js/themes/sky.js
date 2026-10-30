// «السماء الحيّة» (mockups T8-Sky-*): every screen is the real sky outside, drawn from the live
// weather (state.weather) and the time of day (the prayer timetable's sunrise and sunset).
// Weather kind × time phase gives the gradient, the sun or the moon (with its phase), the clouds
// (none / wisps / soft cumulus / a grey deck), rain, snow, fog or a storm. Clouds are pre-softened
// shapes (radial gradients, no blur filter) in their own layers that drift slowly by transform;
// rain and snow are one repeating layer each that slides down. Nothing is rebuilt per second:
// each screen keeps its SVG and only gets new attributes when the sky's key changes.
//   clock: hills along the bottom with the day's five prayers on a horizon line and "now" on it.
//   prayer: the day itself, dawn (right) to night (left), each prayer at its real time.
//   lists: the sky behind two glass panels. The other screens: the sky behind their content.
// Testing: ?sky=rain (clear, mostly, partly, cloudy, fog, drizzle, rain, storm, snow) forces a kind.
import { state, prayerDay } from '../data.js';
import { describeWeather } from '../icons.js';
import { hhmm } from '../util.js';
import { PRAYERS, prayerName, nextPrayer, displayDay } from '../prayer-times.js';

const NS = 'http://www.w3.org/2000/svg';
const M = 60000;
const KINDS = ['clear', 'mostly', 'partly', 'cloudy', 'fog', 'drizzle', 'rain', 'storm', 'snow'];
const FORCED = (() => {
  try { const k = new URLSearchParams(location.search).get('sky'); return KINDS.includes(k) ? k : null; } catch (e) { return null; }
})();

// ---------- colours ----------
const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const toHex = (a) => '#' + a.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const mix = (a, b, f) => { const x = hex(a), y = hex(b); return toHex(x.map((v, i) => v + (y[i] - v) * f)); };
const mixP = (p, q, f) => p.map((c, i) => mix(c, q[i], f));
const lum = (c) => { const [r, g, b] = hex(c); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; };

// Clear-sky palettes (top, middle, bottom) and their overcast counterparts.
const CLEAR = {
  night: ['#0A1130', '#18275A', '#2C3D6E'],
  dawn: ['#27306A', '#7576AE', '#F0B49A'],
  day: ['#3A72BA', '#7AA6D8', '#C4DAEE'],
  golden: ['#3C5C9C', '#B38E92', '#F2BE7C'],
  dusk: ['#1C2156', '#5F4486', '#E0845E'],
};
const GREY = {
  night: ['#10141E', '#1C2230', '#2A3140'],
  dawn: ['#434A62', '#6F7086', '#9C949A'],
  day: ['#56616F', '#808B98', '#AAB3BE'],
  golden: ['#555869', '#837C86', '#AE9C90'],
  dusk: ['#2C2C42', '#4D4659', '#7A6468'],
};
// Cloud colours in fair weather, by phase.
const PUFF = { night: '#3A4672', dawn: '#F4D2CC', day: '#FFFFFF', golden: '#FFE6CC', dusk: '#E7A9A2' };

// What each kind of weather does to the sky.
const WX = {
  clear: { mix: 0, sun: 1 },
  mostly: { mix: 0.05, sun: 1, wisps: 2 },
  partly: { mix: 0.12, sun: 1, puffs: 3 },
  cloudy: { mix: 0.72, sun: 0.18, puffs: 4, deck: 1, grey: 0.25 },
  fog: { mix: 0.7, sun: 0.3, fog: 1, light: 0.1 },
  drizzle: { mix: 0.78, sun: 0, puffs: 4, deck: 1, grey: 0.1, rain: 0.5 },
  rain: { mix: 0.88, sun: 0, puffs: 4, deck: 1, grey: 0, rain: 1 },
  storm: { mix: 1, dark: 0.32, sun: 0, puffs: 4, deck: 1, grey: -0.12, rain: 1, storm: 1 },
  snow: { mix: 0.66, light: 0.1, sun: 0, puffs: 3, deck: 1, grey: 0.3, snow: 1 },
};

function weatherKind() {
  if (FORCED) return FORCED;
  const w = state.weather;
  return w && w.current ? describeWeather(w.current.code).kind : 'mostly';
}

// The time of day as a blend of palettes, from the timetable: night until Fajr, dawn at sunrise,
// day an hour later, golden before sunset, dusk just after, night again by Isha.
function timeOfDay(t) {
  const d = prayerDay(t);
  if (!d) {
    const w = state.weather;
    const day = !(w && w.current && w.current.isDay === false);
    return { pal: CLEAR[day ? 'day' : 'night'], grey: GREY[day ? 'day' : 'night'], puff: PUFF[day ? 'day' : 'night'], phase: day ? 'day' : 'night', sunF: day ? 0.5 : -1, step: 0 };
  }
  const sunset = d.sunset || d.maghrib;
  const kf = [
    [d.fajr - 30 * M, 'night'], [d.sunrise, 'dawn'], [d.sunrise + 70 * M, 'day'],
    [sunset - 100 * M, 'day'], [sunset - 15 * M, 'golden'], [sunset + 12 * M, 'dusk'], [d.isha + 25 * M, 'night'],
  ];
  let a = kf[0], b = kf[0], f = 0;
  if (t >= kf[kf.length - 1][0]) a = b = kf[kf.length - 1];
  else if (t > kf[0][0]) {
    for (let i = 1; i < kf.length; i++) {
      if (t <= kf[i][0]) { a = kf[i - 1]; b = kf[i]; f = (t - a[0]) / (b[0] - a[0]); break; }
    }
  }
  f = Math.round(f * 8) / 8; // eight steps between keyframes: the sky changes every few minutes
  const phase = f < 0.5 ? a[1] : b[1];
  const sunF = (t - d.sunrise) / (sunset - d.sunrise);
  return {
    pal: mixP(CLEAR[a[1]], CLEAR[b[1]], f),
    grey: mixP(GREY[a[1]], GREY[b[1]], f),
    puff: mix(PUFF[a[1]], PUFF[b[1]], f),
    phase,
    sunF: t >= d.sunrise - 8 * M && t <= sunset + 4 * M ? Math.max(0, Math.min(1, sunF)) : -1,
    step: a[1] + b[1] + f,
  };
}

// The moon's phase (0 new, 0.5 full) from a known new moon.
const moonPhase = (t) => { const p = ((t - Date.UTC(2000, 0, 6, 18, 14)) / 86400000 / 29.530588853) % 1; return p < 0 ? p + 1 : p; };
// The lit part of a moon of radius r centred at 0,0 (waxing lit on the right).
function moonPath(p, r) {
  const k = Math.cos(2 * Math.PI * p); // 1 new, -1 full
  const rx = Math.abs(k) * r;
  const waxing = p < 0.5;
  const s1 = waxing ? 1 : 0;
  const s2 = (k > 0) === waxing ? 0 : 1;
  return `M0 ${-r} A${r} ${r} 0 0 ${s1} 0 ${r} A${rx.toFixed(1)} ${r} 0 0 ${s2} 0 ${-r} Z`;
}

// Everything that decides how the sky looks right now.
function skyState(t) {
  const kind = weatherKind();
  const w = WX[kind] || WX.mostly;
  const tod = timeOfDay(t);
  let pal = mixP(tod.pal, tod.grey, w.mix);
  if (w.dark) pal = pal.map((c) => mix(c, '#0A0E16', w.dark));
  if (w.light) pal = pal.map((c) => mix(c, '#E4E8EE', w.light));
  const night = tod.phase === 'night';
  const overcast = !!w.deck;
  const cloud = overcast ? mix(pal[1], w.grey >= 0 ? '#FFFFFF' : '#000000', Math.abs(w.grey)) : tod.puff;
  const darkSky = lum(pal[0]);
  const stars = Math.max(0, Math.min(1, (0.13 - darkSky) / 0.08)) * (overcast || w.fog ? 0 : kind === 'partly' ? 0.6 : 1);
  const mp = moonPhase(t);
  return {
    kind, w, pal, night, phase: tod.phase, sunF: tod.sunF, cloud, stars, overcast, mp,
    key: kind + '|' + tod.step + '|' + (tod.sunF < 0 ? -1 : Math.round(tod.sunF * 40)) + '|' + Math.round(mp * 30),
  };
}

// ---------- building blocks ----------
function svgEl(markup, attrs) {
  const el = document.createElementNS(NS, 'svg');
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  el.innerHTML = markup;
  return el;
}
function div(cls, html) {
  const el = document.createElement('div');
  el.className = cls;
  if (html) el.innerHTML = html;
  return el;
}

// Soft clouds: overlapping discs whose radial gradient fades out, so the shape has a solid core
// and a blurred edge with no filter. The colour is the layer's `color` (stop-color: currentColor).
const SOFT = (id) => `<radialGradient id="${id}"><stop offset="0" stop-color="currentColor" stop-opacity="0.95"/><stop offset="0.5" stop-color="currentColor" stop-opacity="0.85"/><stop offset="0.78" stop-color="currentColor" stop-opacity="0.35"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></radialGradient>`;
const CUMULUS = [[96, 150, 74], [176, 110, 94], [272, 128, 80], [340, 158, 58], [206, 166, 86], [124, 176, 58], [298, 178, 58], [60, 182, 40], [380, 186, 36]];
const WISP = [[200, 60, 200, 24], [110, 72, 110, 16], [310, 50, 120, 15], [240, 80, 130, 12]];
function cloudSvg(uid, type) {
  const g = `url(#${uid})`;
  if (type === 'wisp') {
    return svgEl(`<defs>${SOFT(uid)}</defs>` + WISP.map(([x, y, rx, ry]) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${g}"/>`).join(''), { width: 420, height: 130, viewBox: '0 0 420 130' });
  }
  if (type === 'deck') {
    let c = '';
    for (let i = 0; i < 12; i++) {
      const x = -40 + i * 130 + ((i * 37) % 50);
      const y = 120 + ((i * 53) % 70) - 30;
      const r = 120 + ((i * 29) % 60);
      c += `<circle cx="${x}" cy="${y}" r="${r}" fill="${g}"/>`;
    }
    return svgEl(`<defs>${SOFT(uid)}</defs>${c}<rect x="-60" y="-40" width="1640" height="130" fill="currentColor" opacity="0.9"/>`, { width: 1520, height: 300, viewBox: '0 0 1520 300' });
  }
  return svgEl(`<defs>${SOFT(uid)}</defs>` + CUMULUS.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${g}"/>`).join(''), { width: 440, height: 260, viewBox: '0 0 440 260' });
}

// Repeating tiles for rain and snow (one layer each, slid down by a whole tile in a loop).
const url = (svg) => 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")';
function rainTile(n, seed) {
  let p = '';
  for (let i = 0; i < n; i++) {
    const x = (i * 67 + seed * 31) % 220;
    const y = (i * 113 + seed * 17) % 240;
    p += `M${x} ${y}l-7 30`;
  }
  return url(`<svg xmlns="${NS}" width="220" height="240"><path d="${p}" stroke="#E6EEF8" stroke-width="1.6" stroke-linecap="round" fill="none" opacity="0.75"/></svg>`);
}
function snowTile() {
  let c = '';
  for (let i = 0; i < 22; i++) c += `<circle cx="${(i * 71) % 260}" cy="${(i * 113) % 260}" r="${1.6 + (i % 4) * 0.7}" fill="#FFFFFF" opacity="${0.6 + (i % 3) * 0.15}"/>`;
  return url(`<svg xmlns="${NS}" width="260" height="260">${c}</svg>`);
}
const RAIN = { light: rainTile(9, 1), heavy: rainTile(22, 2) };
const SNOW = snowTile();

// Star field: fixed spots, a little brighter towards the top.
const STARS = (() => {
  let s = '';
  for (let i = 0; i < 46; i++) {
    const x = (i * 283 + 71) % 1280;
    const y = ((i * 157 + 43) % 470) + 8;
    const r = 0.8 + ((i * 7) % 5) * 0.28;
    s += `<circle cx="${x}" cy="${y}" r="${r.toFixed(1)}" opacity="${(0.45 + ((i * 3) % 6) * 0.1).toFixed(2)}"/>`;
  }
  return s;
})();

let uidN = 0;

// One sky in a screen's art layer. `o`: { clouds: [{x, y, s, type?}] slots, sun(f) → [x, y, r],
// moon: [x, y], hills: bool, noSun: bool }.
function makeSky(layer, o) {
  const id = 'sk' + ++uidN;
  const svg = svgEl(`
    <defs>
      <linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1"><stop class="s0" offset="0"/><stop class="s1" offset="0.55"/><stop class="s2" offset="1"/></linearGradient>
      <radialGradient id="${id}sun"><stop class="sg0" offset="0" stop-color="#FFF6DC"/><stop class="sg1" offset="0.3" stop-color="#FFF1C8" stop-opacity="0.75"/><stop class="sg2" offset="1" stop-color="#FFF1C8" stop-opacity="0"/></radialGradient>
      <radialGradient id="${id}moon"><stop offset="0" stop-color="#F3EBD2" stop-opacity="0.32"/><stop offset="1" stop-color="#F3EBD2" stop-opacity="0"/></radialGradient>
      <radialGradient id="${id}hz" cx="0.5" cy="1" r="0.7"><stop class="h0" offset="0" stop-opacity="0.55"/><stop class="h1" offset="1" stop-opacity="0"/></radialGradient>
    </defs>
    <rect width="1280" height="800" fill="url(#${id}g)"/>
    <ellipse class="sk-hz" cx="640" cy="760" rx="900" ry="420" fill="url(#${id}hz)"/>
    <radialGradient id="${id}scr"><stop offset="0" stop-color="#0B1E46" stop-opacity="1"/><stop offset="0.6" stop-color="#0B1E46" stop-opacity="0.55"/><stop offset="1" stop-color="#0B1E46" stop-opacity="0"/></radialGradient>
    <g class="sk-scrims">${(o.scrims || []).map(([x, y, rx, ry]) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="url(#${id}scr)"/>`).join('')}</g>
    <g class="sk-stars" fill="#FFFFFF">${STARS}</g>
    <g class="sk-moon"><circle r="190" fill="url(#${id}moon)"/><circle class="sk-moon-dim" r="40" fill="#F3EBD2" opacity="0.1"/><path class="sk-moon-lit" fill="#F3EBD2"/></g>
    <g class="sk-sun"><circle class="sk-sun-glow" r="230" fill="url(#${id}sun)"/><circle class="sk-sun-disc" r="46" fill="#FFF8E6"/></g>`,
  { width: 1280, height: 800, class: 'sk-sky' });
  layer.appendChild(svg);
  const q = (c) => svg.querySelector(c);
  const st = [q('.s0'), q('.s1'), q('.s2')];
  const hz = [q('.h0'), q('.h1')];
  const sun = q('.sk-sun'), sunGlow = q('.sk-sun-glow'), sunDisc = q('.sk-sun-disc');
  const sg = [q('.sg0'), q('.sg1'), q('.sg2')];
  const moon = q('.sk-moon'), moonLit = q('.sk-moon-lit'), stars = q('.sk-stars'), scrims = q('.sk-scrims');
  if (o.moon) moon.setAttribute('transform', `translate(${o.moon[0]} ${o.moon[1]})`);

  // Clouds: one layer per slot; a slot holds a puff, a wisp, or both are hidden.
  const clouds = div('sk-clouds');
  const slots = (o.clouds || []).map((c, i) => {
    const puff = div('sk-cloud sk-anim d' + (i % 3));
    puff.style.cssText = `left:${c.x}px;top:${c.y}px;width:440px;height:260px;transform-origin:0 0;`;
    const inner = div('sk-cloud-in');
    inner.style.transform = `scale(${c.s})`;
    inner.appendChild(cloudSvg(id + 'c' + i, 'puff'));
    puff.appendChild(inner);
    const wisp = div('sk-cloud sk-anim d' + ((i + 1) % 3));
    wisp.style.cssText = `left:${c.x}px;top:${c.y + 60}px;width:420px;height:130px;`;
    const winner = div('sk-cloud-in');
    winner.style.transform = `scale(${c.s})`;
    winner.appendChild(cloudSvg(id + 'w' + i, 'wisp'));
    wisp.appendChild(winner);
    clouds.append(puff, wisp);
    return { puff, wisp, c };
  });
  const deck = div('sk-deck sk-anim d1');
  deck.appendChild(cloudSvg(id + 'd', 'deck'));
  clouds.insertBefore(deck, clouds.firstChild);
  layer.appendChild(clouds);

  // Hills along the bottom (clock screen).
  let hill = null, ground = null;
  if (o.hills) {
    const hs = svgEl(`<path class="sk-hill" d="M0 668 C 200 640, 420 676, 640 654 S 1060 640, 1280 660 L1280 800 L0 800 Z"/>
      <path class="sk-ground" d="M0 708 C 300 690, 760 716, 1280 698 L1280 800 L0 800 Z"/>`, { width: 1280, height: 800, class: 'sk-hills' });
    hill = hs.querySelector('.sk-hill');
    ground = hs.querySelector('.sk-ground');
    o.hillsEl = hs;
  }

  // Weather in motion: fog bands, rain, snow and the storm's flash.
  const fx = div('sk-fx');
  const fog = div('sk-fog', '<i class="sk-anim d0"></i><i class="sk-anim d2"></i><i class="sk-anim d1"></i>');
  const rain = div('sk-rain sk-anim');
  const snow = div('sk-snow sk-anim');
  snow.style.backgroundImage = SNOW;
  const flash = div('sk-flash sk-anim');
  fx.append(fog, rain, snow, flash);
  layer.appendChild(fx);
  if (o.hillsEl) layer.appendChild(o.hillsEl);

  const show = (el, on) => { el.style.display = on ? '' : 'none'; };
  let last = '';
  return {
    svg,
    update(s) {
      if (s.key === last) return;
      last = s.key;
      const { pal, w } = s;
      st.forEach((e, i) => e.setAttribute('stop-color', pal[i]));
      // A warm glow on the horizon at dawn, golden hour and dusk.
      const warm = s.phase === 'dawn' || s.phase === 'golden' || s.phase === 'dusk';
      hz[0].setAttribute('stop-color', s.phase === 'dusk' ? '#F08A5C' : s.phase === 'dawn' ? '#F6B39A' : '#FFC27A');
      hz[1].setAttribute('stop-color', s.phase === 'dusk' ? '#F08A5C' : '#FFC27A');
      hz[0].setAttribute('stop-opacity', String(warm ? 0.5 * (1 - w.mix * 0.8) : 0));

      // The sun by day (along a low arc on the left, so it stays clear of the time), the moon by night.
      const sunOn = !o.noSun && s.sunF >= 0 && w.sun > 0;
      show(sun, sunOn);
      if (sunOn) {
        const [x, y, low] = o.sun(s.sunF);
        sun.setAttribute('transform', `translate(${x.toFixed(0)} ${y.toFixed(0)})`);
        sun.setAttribute('opacity', String(w.sun));
        // Low sun: warmer and with a smaller halo.
        sunDisc.setAttribute('fill', mix('#FFF8E6', '#FFC07A', low));
        sunGlow.setAttribute('r', String(Math.round(230 - 80 * low)));
        sg[0].setAttribute('stop-color', mix('#FFF6DC', '#FFD08A', low));
        sg[1].setAttribute('stop-color', mix('#FFF1C8', '#FFA868', low));
        sg[2].setAttribute('stop-color', mix('#FFF1C8', '#FFA868', low));
      }
      const moonOn = !!o.moon && s.sunF < 0 && (s.phase === 'night' || s.phase === 'dusk' || s.phase === 'dawn') && !w.rain && !w.snow;
      show(moon, moonOn);
      if (moonOn) {
        moonLit.setAttribute('d', moonPath(s.mp, 40));
        moon.setAttribute('opacity', String(s.overcast || w.fog ? 0.35 : 1));
      }
      // A soft shade behind the text where the sky is pale (none at night).
      scrims.setAttribute('opacity', Math.max(0, Math.min(0.42, (lum(pal[1]) - 0.2) * 1.1)).toFixed(2));
      stars.setAttribute('opacity', s.stars.toFixed(2));
      show(stars, s.stars > 0.02);

      // Clouds.
      const n = w.puffs || 0, nw = w.wisps || 0;
      const op = s.night ? (s.overcast ? 0.85 : 0.55) : s.overcast ? 0.9 : 0.92;
      slots.forEach((sl, i) => {
        const puffOn = i < n && !sl.c.wispOnly;
        const wispOn = !puffOn && i < nw;
        show(sl.puff, puffOn);
        show(sl.wisp, wispOn);
        sl.puff.style.color = sl.wisp.style.color = s.cloud;
        sl.puff.style.opacity = String(op * (sl.c.o || 1));
        sl.wisp.style.opacity = String((s.night ? 0.4 : 0.7) * (sl.c.o || 1));
      });
      show(deck, !!w.deck);
      deck.style.color = mix(s.cloud, '#000000', 0.06);
      deck.style.opacity = s.night ? '0.8' : '0.92';

      show(fog, !!w.fog);
      show(rain, !!w.rain);
      if (w.rain) {
        rain.style.backgroundImage = w.rain < 1 ? RAIN.light : RAIN.heavy;
        rain.className = 'sk-rain sk-anim' + (w.rain < 1 ? ' is-light' : '') + (w.storm ? ' is-storm' : '');
      }
      show(snow, !!w.snow);
      show(flash, !!w.storm);

      if (hill) {
        hill.setAttribute('fill', mix(pal[1], '#1A2A50', 0.52));
        ground.setAttribute('fill', mix(pal[1], '#0E1A38', 0.7));
      }
    },
  };
}

// The sun's way across the clock screen's sky: rising low in the middle, high over the weather
// at noon, setting on the far left. Returns [x, y, lowness 0..1].
// For most of the day it rides high over the weather; only in the first and last hour or so does
// it come down to the hills (where there is no text).
function homeSun(f) {
  let a = Math.max(0, Math.min(1, Math.min(f, 1 - f) / 0.14));
  a = a * a * (3 - 2 * a);
  return [560 - 420 * f, 600 - 440 * a - 30 * Math.sin(Math.PI * f), 1 - a];
}

// ---------- clock screen: the horizon line under the hills ----------
const HX = [1150, 890, 630, 370, 110];
function horizon(sky) {
  const svg = svgEl(`
    <line x1="80" y1="724" x2="1200" y2="724" stroke="#FFFFFF" stroke-opacity="0.35" stroke-width="2"/>
    <line class="sk-hz-done" x1="1200" y1="724" x2="1200" y2="724" stroke="#FFFFFF" stroke-opacity="0.85" stroke-width="3"/>
    <g class="sk-ticks">${HX.map((x) => `<circle cx="${x}" cy="724" r="5" stroke="#FFFFFF" stroke-width="2"/>`).join('')}</g>
    <circle class="sk-now" cx="1200" cy="724" r="10" fill="#FFE7A3" stroke="#FFFFFF" stroke-width="3"/>`,
  { width: 1280, height: 800, class: 'sk-horizon' });
  sky.layer.appendChild(svg);
  const done = svg.querySelector('.sk-hz-done');
  const ticks = svg.querySelectorAll('.sk-ticks circle');
  const dot = svg.querySelector('.sk-now');
  let last = '';
  return function tick(t) {
    const dd = displayDay(t);
    const key = Math.floor(t / M) + ':' + (dd ? dd.times.fajr : '');
    if (key === last) return;
    last = key;
    svg.style.visibility = dd ? '' : 'hidden';
    if (!dd) return;
    const T = dd.times;
    const at = PRAYERS.filter((p) => !p.minor).map((p) => T[p.k]);
    // "Now" between the marks, in proportion to the time between the two prayers around it.
    let x;
    if (t < at[0]) x = 1150 + 50 * Math.min(1, (at[0] - t) / (5 * 3600000));
    else if (t >= at[4]) x = 110 - 30 * Math.min(1, (t - at[4]) / (3 * 3600000));
    else {
      for (let i = 1; i < 5; i++) {
        if (t < at[i]) { x = HX[i - 1] + (HX[i] - HX[i - 1]) * (t - at[i - 1]) / (at[i] - at[i - 1]); break; }
      }
    }
    done.setAttribute('x1', x.toFixed(0));
    dot.setAttribute('cx', x.toFixed(0));
    ticks.forEach((c, i) => c.setAttribute('fill', at[i] <= t ? '#FFFFFF' : 'none'));
  };
}

// ---------- prayer screen: the day from dawn (right) to night (left) ----------
const PX0 = 1179, PX1 = 154; // Fajr and Isha
function dayStrip(layer) {
  const svg = svgEl(`
    <defs>
      <linearGradient id="spDay" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="1280" y2="0"></linearGradient>
      <linearGradient id="spShade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0E1C40" stop-opacity="0.5"/><stop offset="0.45" stop-color="#0E1C40" stop-opacity="0"/></linearGradient>
      <radialGradient id="spSun"><stop offset="0" stop-color="#FFF6DC"/><stop offset="0.3" stop-color="#FFF1C8" stop-opacity="0.75"/><stop offset="1" stop-color="#FFF1C8" stop-opacity="0"/></radialGradient>
      <radialGradient id="spMoon"><stop offset="0" stop-color="#F3EBD2" stop-opacity="0.3"/><stop offset="1" stop-color="#F3EBD2" stop-opacity="0"/></radialGradient>
    </defs>
    <rect width="1280" height="800" fill="url(#spDay)"/>
    <rect class="sp-tint" width="1280" height="800"/>
    <rect width="1280" height="800" fill="url(#spShade)"/>
    <path class="sp-arc" fill="none" stroke="#FFFFFF" stroke-opacity="0.45" stroke-width="2" stroke-dasharray="2 10" stroke-linecap="round"/>
    <g class="sp-lines" stroke="#FFFFFF" stroke-width="1.5" stroke-opacity="0.5"></g>
    <line class="sp-next" y1="230" y2="600" stroke="#FFE7A3" stroke-width="3"/>
    <g class="sp-sun"><circle r="130" fill="url(#spSun)"/><circle r="30" fill="#FFF8E6"/></g>
    <g class="sp-moon"><circle r="110" fill="url(#spMoon)"/><circle r="26" fill="#F3EBD2" opacity="0.1"/><path class="sp-moon-lit" fill="#F3EBD2"/></g>
    <line class="sp-now" y2="600" stroke="#FFFFFF" stroke-width="2" stroke-dasharray="3 5"/>
    <path class="sp-hill" d="M0 610 C 220 584, 460 622, 700 598 S 1080 588, 1280 606 L1280 800 L0 800 Z" fill="#20325A"/>
    <path class="sp-ground" d="M0 662 C 320 646, 760 676, 1280 652 L1280 800 L0 800 Z" fill="#15223F"/>
    <g class="sp-dots"></g>`, { width: 1280, height: 800, class: 'sk-strip' });
  layer.appendChild(svg);
  const labels = div('sp-labels');
  const nowLabel = div('sp-now-label');
  nowLabel.textContent = 'الآن';
  const foot = div('sp-foot');
  foot.textContent = 'من الفجر إلى العشاء، كما تمضي السماء اليوم';
  layer.append(labels, nowLabel, foot);
  const q = (c) => svg.querySelector(c);
  const grad = q('#spDay'), tint = q('.sp-tint'), arc = q('.sp-arc'), lines = q('.sp-lines'), nextLine = q('.sp-next');
  const sun = q('.sp-sun'), moon = q('.sp-moon'), moonLit = q('.sp-moon-lit'), nowLine = q('.sp-now'), dots = q('.sp-dots');
  const hill = q('.sp-hill'), groundEl = q('.sp-ground');
  let last = '', lastWx = '';

  return function tick(t, s) {
    // The weather greys the day a little (the strip itself stays readable as a timeline).
    const wxKey = s.kind + s.night;
    if (wxKey !== lastWx) {
      lastWx = wxKey;
      tint.setAttribute('fill', s.w.dark ? '#1A2130' : '#7D8894');
      tint.setAttribute('opacity', (s.w.mix * (s.w.dark ? 0.62 : 0.5)).toFixed(2));
      hill.setAttribute('fill', s.w.mix > 0.5 ? '#2A3448' : '#20325A');
      groundEl.setAttribute('fill', s.w.mix > 0.5 ? '#1A2130' : '#15223F');
    }
    const dd = displayDay(t);
    const np = nextPrayer(t);
    const key = Math.floor(t / M) + ':' + (dd ? dd.times.fajr : '') + ':' + (np ? np.at : '') + ':' + s.kind;
    if (key === last) return;
    last = key;
    svg.style.visibility = labels.style.visibility = nowLabel.style.visibility = dd ? '' : 'hidden';
    if (!dd) return;
    const T = dd.times;
    const span = T.isha - T.fajr;
    const X = (at) => PX0 - ((at - T.fajr) / span) * (PX0 - PX1);
    const sunset = T.sunset || T.maghrib;

    // The day's colours, placed at the real times: night, dawn at Fajr, sunrise, blue day, golden
    // afternoon, sunset at Maghrib, dusk and night after Isha.
    const stops = [
      [1280, '#2A3466'], [X(T.fajr) + 10, '#C98DA6'], [X(T.sunrise), '#F2B9A0'], [X(T.sunrise + 100 * M), '#8DC0EA'],
      [X(T.dhuhr), '#5A98DB'], [X(T.asr + (sunset - T.asr) * 0.45), '#7DB1E4'], [X(T.maghrib) - 14, '#F2A26A'],
      [X(T.isha) - 26, '#9C5F8E'], [0, '#1E2756'],
    ];
    grad.innerHTML = stops.map(([x, c]) => `<stop offset="${(Math.max(0, Math.min(1280, x)) / 1280).toFixed(4)}" stop-color="${c}"/>`).reverse().join('');

    // The sun's arc from sunrise to Maghrib, and the sun on it now.
    const xs = X(T.sunrise), xm = X(T.maghrib);
    arc.setAttribute('d', `M${xs.toFixed(0)} 600 Q ${((xs + xm) / 2).toFixed(0)} 0 ${xm.toFixed(0)} 600`);
    let nx, ny;
    const f = (t - T.sunrise) / (T.maghrib - T.sunrise);
    const day = f >= 0 && f <= 1;
    if (day) { nx = X(t); ny = 600 * (1 - 2 * f + 2 * f * f); } else {
      // Before Fajr the night sits on the right edge, after Isha on the left; the moon is up.
      if (t < T.fajr) nx = PX0 + 56 * Math.min(1, (T.fajr - t) / (3 * 3600000));
      else if (t > T.isha) nx = PX1 - 110 * Math.min(1, (t - T.isha) / (3 * 3600000));
      else nx = X(t);
      ny = 300;
    }
    sun.style.display = day ? '' : 'none';
    moon.style.display = day ? 'none' : '';
    sun.setAttribute('transform', `translate(${nx.toFixed(0)} ${ny.toFixed(0)})`);
    sun.setAttribute('opacity', String(Math.max(0.35, s.w.sun || 0.35)));
    moon.setAttribute('transform', `translate(${nx.toFixed(0)} ${ny.toFixed(0)})`);
    moonLit.setAttribute('d', moonPath(s.mp, 26));
    nowLine.setAttribute('x1', nx.toFixed(0));
    nowLine.setAttribute('x2', nx.toFixed(0));
    nowLine.setAttribute('y1', String(Math.round(ny + 48)));
    nowLabel.style.left = (nx + 14).toFixed(0) + 'px';
    nowLabel.classList.toggle('is-end', nx > 1150);
    nowLabel.style.top = Math.round(ny + 66) + 'px';

    // A thin line per prayer (dashed for sunrise), a dot on the ground, the name and time below.
    const list = PRAYERS.filter((p) => T[p.k]);
    const xsAll = list.map((p) => X(T[p.k]));
    let ls = '', ds = '', hs = '';
    let prevUpperX = -9999;
    // From Isha (left) to Fajr (right), so it is Maghrib that drops below Isha, as in the design.
    list.slice().reverse().forEach((p) => {
      const i = list.indexOf(p);
      const at = T[p.k], x = xsAll[i];
      const next = !p.minor && !!(np && np.k === p.k && np.at === at);
      const past = !next && at <= t;
      if (next) { nextLine.setAttribute('x1', x.toFixed(0)); nextLine.setAttribute('x2', x.toFixed(0)); }
      else ls += `<line x1="${x.toFixed(0)}" y1="250" x2="${x.toFixed(0)}" y2="600"${p.minor ? ' stroke-dasharray="4 6"' : ''}/>`;
      ds += p.minor ? `<circle cx="${x.toFixed(0)}" cy="604" r="5" fill="#FFFFFF" opacity="0.7"/>`
        : next ? `<circle cx="${x.toFixed(0)}" cy="604" r="11" fill="#FFE7A3" stroke="#FFFFFF" stroke-width="3"/>`
          : past ? `<circle cx="${x.toFixed(0)}" cy="605" r="7" fill="#FFFFFF"/>`
            : `<circle cx="${x.toFixed(0)}" cy="605" r="7" fill="none" stroke="#FFFFFF" stroke-width="3"/>`;
      // Labels drop to a second row when they would touch the one before (Maghrib after Isha…).
      const low = p.minor || x - prevUpperX < 150;
      if (!low) prevUpperX = x;
      hs += `<div class="sp-mark${next ? ' is-next' : ''}${past ? ' is-past' : ''}${p.minor ? ' is-minor' : ''}${low ? ' is-low' : ''}" style="left:${(x - 80).toFixed(0)}px"><span class="sp-name">${prayerName(p.k, at)}</span><bdi class="sp-time" dir="ltr">${hhmm(at)}</bdi></div>`;
    });
    // Second pass from the left: a low label too close to another low one goes back up if free.
    nextLine.style.display = list.some((p) => np && np.k === p.k && np.at === T[p.k]) ? '' : 'none';
    lines.innerHTML = ls;
    dots.innerHTML = ds;
    labels.innerHTML = hs;
  };
}

// ---------- screens ----------
const CLOUDS = {
  home: [{ x: 150, y: 80, s: 0.95 }, { x: 520, y: 470, s: 1.05, o: 0.85 }, { x: 520, y: 20, s: 0.5, o: 0.6 }, { x: -150, y: 520, s: 0.8, o: 0.7 }],
  lists: [{ x: 60, y: 60, s: 1.2, o: 0.62 }, { x: 760, y: 430, s: 1.4, o: 0.58 }, { x: 430, y: -10, s: 0.7, o: 0.6 }, { x: 980, y: 0, s: 0.6, o: 0.6 }],
  other: [{ x: -80, y: -60, s: 0.9, o: 0.6 }, { x: 960, y: 600, s: 0.9, o: 0.45 }, { x: 520, y: -80, s: 0.6, o: 0.5 }, { x: 40, y: 620, s: 0.7, o: 0.45 }],
};
const SKY_SCREENS = ['home', 'lists', 'calendar', 'adhkar', 'prayer'];

export function mount({ screens, stage }) {
  const skies = {};
  const extras = [];
  for (const name of SKY_SCREENS) {
    const sc = screens[name];
    if (!sc) continue;
    const opts = {
      clouds: CLOUDS[name] || CLOUDS.other,
      sun: name === 'home' ? homeSun : (f) => { const h = Math.sin(Math.PI * f); return [1040 - 800 * f, 560 - 430 * h, Math.max(0, 1 - h * 2.2)]; },
      // the moon only where it has open sky (the lists and the calendar are covered by panels)
      moon: name === 'home' ? [112, 178] : name === 'adhkar' ? [300, 86] : null,
      hills: name === 'home',
      scrims: name === 'home' ? [[900, 340, 600, 260], [290, 440, 360, 180]] : null,
      noSun: name !== 'home',
    };
    skies[name] = Object.assign(makeSky(sc.art, opts), { layer: sc.art });
  }
  if (skies.home) extras.push(horizon(skies.home));
  // On the prayer screen the general sky only shows in Ramadan; the day strip covers it otherwise.
  const strip = screens.prayer ? dayStrip(screens.prayer.art) : null;
  // The rain, snow and fog fall over the day strip too.
  if (strip) { const fx = screens.prayer.art.querySelector('.sk-fx'); if (fx) screens.prayer.art.appendChild(fx); }

  let lastWx = '';
  let liveName = '';
  return {
    tick(t, name) {
      const s = skyState(t);
      for (const k in skies) skies[k].update(s);
      for (const f of extras) f(t);
      if (strip) strip(t, s);
      // Only the screen on show animates its clouds and rain.
      if (name !== liveName) {
        liveName = name;
        for (const k in screens) screens[k].art.classList.toggle('sk-live', k === name);
      }
      // The temperature and condition for lines that have no place for them in the DOM
      // (the date on the prayer screen, the time under the tasks).
      const w = state.weather;
      const wx = w && w.current && typeof w.current.temp === 'number' ? Math.round(w.current.temp) + '° ' + (FORCED ? KIND_AR[FORCED] : describeWeather(w.current.code).ar) : '';
      if (wx !== lastWx && stage) {
        lastWx = wx;
        stage.style.setProperty('--sk-wx', wx ? JSON.stringify(' · ' + wx) : '""');
      }
    },
    unmount() {
      if (stage) stage.style.removeProperty('--sk-wx');
      for (const k in screens) screens[k].art.classList.remove('sk-live');
    },
  };
}
const KIND_AR = { clear: 'صحو', mostly: 'صحو غالباً', partly: 'غائم جزئياً', cloudy: 'غائم', fog: 'ضباب', drizzle: 'رذاذ', rain: 'أمطار', storm: 'عواصف رعدية', snow: 'ثلوج' };
