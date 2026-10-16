// What the frame and the phones share for «الدقّة السرية», «عجلة الحظ» and «وضع الماتش»:
// the drawings (door, wheel, flag, ball), the wheel's geometry and the rhythm recorder.
import { knock } from './sound.js';

// ================= the wheel =================
const SLICE = ['#F2AE3D', '#E8657A', '#7FD3B5', '#9DB9F5', '#F3EDE2', '#E0915A', '#B9A2E8', '#6FBF8E'];
const pt = (deg, r) => { const a = (deg * Math.PI) / 180; return [(r * Math.sin(a)).toFixed(2), (-r * Math.cos(a)).toFixed(2)]; };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// The turning part of the wheel (centre 0,0, radius 100), choice 0 starting at the top and going
// clockwise. The pointer and the hub are drawn on top by whoever shows it.
export function wheelSvg(items, size) {
  const n = Math.max(1, items.length), seg = 360 / n;
  let body = '';
  const fill = (i) => { let k = i % SLICE.length; if (i === n - 1 && n > 1 && k === 0) k = 2; return SLICE[k]; };
  for (let i = 0; i < n; i++) {
    const a0 = i * seg, a1 = (i + 1) * seg;
    const [x0, y0] = pt(a0, 100), [x1, y1] = pt(a1, 100);
    body += `<path d="M0 0L${x0} ${y0}A100 100 0 ${seg > 180 ? 1 : 0} 1 ${x1} ${y1}Z" fill="${fill(i)}"/>`;
  }
  // Pegs on the rim, between the slices.
  for (let i = 0; i < n; i++) { const [x, y] = pt(i * seg, 93); body += `<circle cx="${x}" cy="${y}" r="2.6" fill="#241707" fill-opacity=".55"/>`; }
  for (let i = 0; i < n; i++) {
    const mid = (i + 0.5) * seg;
    const label = String(items[i] || '');
    const len = Math.max(2, label.length);
    const fs = Math.max(7, Math.min(17, 62 / (len * 0.55), seg * 0.9));
    // Along the radius, all the same way round (like a real wheel: the one under the pointer
    // reads from the rim inwards).
    const rot = mid + 90;
    const [x, y] = pt(mid, 57);
    body += `<text x="${x}" y="${y}" transform="rotate(${rot.toFixed(2)} ${x} ${y})" text-anchor="middle" dominant-baseline="central" direction="rtl" font-size="${fs.toFixed(1)}" font-weight="600" fill="#241707">${esc(label)}</text>`;
  }
  return `<svg class="wheel-svg" width="${size}" height="${size}" viewBox="-104 -104 208 208" aria-hidden="true"><circle r="103" fill="#241707"/>${body}<circle r="100" fill="none" stroke="#241707" stroke-opacity=".35" stroke-width="2"/></svg>`;
}

// How far to turn the wheel so choice `idx` stops under the pointer at the top: it ends at
// (whole turns) - the middle of that slice, give or take a little so it doesn't look staged.
export function landingAngle(idx, n, jitter = 0) {
  const seg = 360 / n;
  return -((idx + 0.5) * seg + jitter * seg * 0.7);
}
// Which choice is under the pointer when the wheel has turned `rot` degrees.
export function choiceAt(rot, n) {
  const seg = 360 / n;
  const a = (((-rot) % 360) + 360) % 360;
  return Math.floor(a / seg) % n;
}

// Wheels to start from (the control panel offers them).
export const WHEEL_TEMPLATES = [
  { name: 'من يغسل الصحون؟', items: ['ماما', 'بابا', 'سارة', 'يوسف'] },
  { name: 'من يختار الفيلم؟', items: ['ماما', 'بابا', 'سارة', 'يوسف'] },
  { name: 'أين نخرج يوم الأحد؟', items: ['البحر', 'الغابة', 'عند الجدة', 'المدينة القديمة', 'السينما', 'الحديقة'] },
  { name: 'ماذا نأكل الليلة؟', items: ['طاجين', 'كسكس', 'بيتزا', 'حريرة', 'سمك', 'شوارما'] },
  { name: 'من يجلس في الأمام؟', items: ['سارة', 'يوسف'] },
];

// ================= the door =================
// A Moroccan door: a horseshoe arch in zellige, studded wood and a brass ring to knock with.
export function doorSvg(width) {
  let studs = '';
  for (let r = 0; r < 7; r++) for (let c = 0; c < 4; c++) {
    const x = 92 + c * 39, y = 168 + r * 34;
    if (r === 3 && (c === 1 || c === 2)) continue; // the knocker's place
    studs += `<circle cx="${x}" cy="${y}" r="4.2" fill="#E3B866"/><circle cx="${x - 1}" cy="${y - 1.2}" r="1.6" fill="#FFF1C9" fill-opacity=".8"/>`;
  }
  let tiles = '';
  for (let i = 0; i < 18; i++) {
    const a = Math.PI + (i / 17) * Math.PI;
    const x = 150 + 132 * Math.cos(a), y = 150 + 132 * Math.sin(a) * 1.05;
    tiles += `<rect x="${(x - 7).toFixed(1)}" y="${(y - 7).toFixed(1)}" width="14" height="14" rx="2" transform="rotate(45 ${x.toFixed(1)} ${y.toFixed(1)})" fill="${['#2C7A6B', '#F2AE3D', '#1F4E8C'][i % 3]}"/>`;
  }
  return `<svg class="door-svg" width="${width}" height="${(width * 1.36).toFixed(0)}" viewBox="0 0 300 408" aria-hidden="true">
  <defs><linearGradient id="dw" x1="0" x2="1"><stop offset="0" stop-color="#5A2A14"/><stop offset=".5" stop-color="#7E3F1D"/><stop offset="1" stop-color="#5A2A14"/></linearGradient></defs>
  <path d="M6 408V150C6 66 72 4 150 4s144 62 144 146v258z" fill="#F3EDE2"/>
  <path d="M18 408V152C18 78 76 18 150 18s132 60 132 134v256z" fill="#1A6C5E"/>${tiles}
  <path d="M40 408V156C40 92 90 44 150 44s110 48 110 112v252z" fill="url(#dw)" stroke="#3B1A0B" stroke-width="4"/>
  <path d="M150 48v360" stroke="#3B1A0B" stroke-width="3"/>
  <path d="M62 160c0-50 40-90 88-90s88 40 88 90" fill="none" stroke="#3B1A0B" stroke-opacity=".55" stroke-width="3"/>
  ${studs}
  <g class="door-knocker"><circle cx="150" cy="258" r="11" fill="#C99A3B"/><circle cx="150" cy="292" r="26" fill="none" stroke="#D9A441" stroke-width="8"/><circle cx="150" cy="292" r="26" fill="none" stroke="#FFE7A8" stroke-opacity=".5" stroke-width="2"/></g>
</svg>`;
}

// ================= match mode =================
// The Moroccan flag: red, with the green five-pointed star.
export function flagSvg(width) {
  const pts = [];
  for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i * 4 * Math.PI) / 5; pts.push((45 + 17 * Math.cos(a)).toFixed(2) + ',' + (30 + 17 * Math.sin(a)).toFixed(2)); }
  return `<svg width="${width}" height="${(width * 2) / 3}" viewBox="0 0 90 60" aria-hidden="true"><rect width="90" height="60" fill="#C1272D"/><polygon points="${pts.join(' ')}" fill="none" stroke="#006233" stroke-width="3.2" stroke-linejoin="miter"/></svg>`;
}
export function ballSvg(size) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="29" fill="#F8F5EE" stroke="#241707" stroke-width="2.5"/><polygon points="32,20 43,28 39,41 25,41 21,28" fill="#241707"/><path d="M32 20V6M43 28l13-4M39 41l8 12M25 41l-8 12M21 28L8 24" stroke="#241707" stroke-width="2.5"/></svg>`;
}
// The cheers a phone can send to the frame during a match.
export const CHEERS = [
  { key: 'flag', label: 'ديما مغرب', icon: (s) => flagSvg(s) },
  { key: 'horn', label: 'سير سير', icon: (s) => `<span class="emoji" style="font-size:${Math.round(s * 0.8)}px">📣</span>` },
  { key: 'ball', label: 'هيا!', icon: (s) => ballSvg(s * 0.85) },
  { key: 'clap', label: 'برافو', icon: (s) => `<span class="emoji" style="font-size:${Math.round(s * 0.8)}px">👏</span>` },
  { key: 'fire', label: 'نار!', icon: (s) => `<span class="emoji" style="font-size:${Math.round(s * 0.8)}px">🔥</span>` },
];
export const cheerOf = (k) => CHEERS.find((c) => c.key === k) || CHEERS[0];

// A team's badge: ESPN's picture when there is one (Morocco: our flag).
export function teamBadge(side, size, isMar) {
  if (isMar) return flagSvg(size);
  if (side.logo) return `<img src="${esc(side.logo)}" width="${size}" height="${size}" alt="" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'team-abbr',textContent:'${esc(side.abbr || '')}'}))">`;
  return `<span class="team-abbr">${esc(side.abbr || side.name || '')}</span>`;
}

// ================= knocks =================
// Records taps: call tap() on each; onDone(rhythm) once the taps stop for `idle` ms.
export function rhythmRecorder({ onTap, onDone, idle = 1600, max = 16 }) {
  let t0 = 0, times = [], timer = 0;
  return {
    tap() {
      const t = performance.now();
      if (!times.length) t0 = t;
      if (times.length >= max) return;
      const v = Math.round(t - t0);
      if (times.length && v - times[times.length - 1] < 70) return;
      if (v > 8000) return;
      times.push(v);
      knock(0, 1);
      if (onTap) onTap(times.length, v);
      clearTimeout(timer);
      timer = setTimeout(() => { const r = times; times = []; if (r.length && onDone) onDone(r); }, times.length >= max ? 300 : idle);
    },
    reset() { clearTimeout(timer); times = []; },
    get count() { return times.length; },
  };
}
// Plays a knock: the sounds now, and onBeat(i) at each one (to move the door).
export function playRhythm(rhythm, onBeat) {
  const timers = [];
  rhythm.forEach((t, i) => {
    knock(t / 1000, 1);
    if (onBeat) timers.push(setTimeout(() => onBeat(i), t));
  });
  const total = rhythm.length ? rhythm[rhythm.length - 1] : 0;
  return { done: new Promise((ok) => setTimeout(ok, total + 350)), stop: () => timers.forEach(clearTimeout) };
}
// For the vibration motor (Android): buzz, pause, buzz…
export function rhythmVibration(r) {
  const out = [];
  r.forEach((t, i) => { if (i) out.push(Math.max(40, t - r[i - 1] - 70)); out.push(70); });
  return out;
}
// A picture of the rhythm: dots in time.
export function rhythmDots(r, width = 220) {
  if (!r || !r.length) return '';
  const total = Math.max(600, r[r.length - 1]);
  let dots = '';
  // Right to left, like the writing.
  for (const t of r) dots += `<circle cx="${(width - 10 - (t / total) * (width - 20)).toFixed(1)}" cy="10" r="6" fill="#F2AE3D"/>`;
  return `<svg class="rhythm-dots" width="${width}" height="20" viewBox="0 0 ${width} 20" aria-hidden="true"><path d="M4 10H${width - 4}" stroke="currentColor" stroke-opacity=".25" stroke-width="2"/>${dots}</svg>`;
}
