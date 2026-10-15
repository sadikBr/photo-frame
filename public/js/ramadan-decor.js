// Ramadan decorations for the prayer screen: hanging brass lanterns (فوانيس), a crescent with
// a star, a garland of small lights, crescents and stars, and twinkling stars at night.
// Plain SVG strings; CSS (app.css, "Ramadan decorations") sways and lights them.
import { starPoints } from './icons.js';

const BRASS = (id) => `<linearGradient id="rb${id}" x1="0" x2="1"><stop offset="0" stop-color="#8A5A1E"/><stop offset=".5" stop-color="#E7BE6A"/><stop offset="1" stop-color="#8A5A1E"/></linearGradient>`;

// A Moroccan brass lantern, side view: dome, pierced glass body, cone and finial.
function lantern(id, w) {
  // Pierced brass: rows of small holes, every other row offset.
  const holes = [];
  [54, 66, 78, 90, 102, 114].forEach((y, row) => {
    for (const x of row % 2 ? [19.5, 30, 40.5] : [24.5, 35.5]) holes.push(`<circle cx="${x}" cy="${y}" r="2"/>`);
  });
  return `<svg class="r-lan" width="${w}" height="${(w * 2.5).toFixed(0)}" viewBox="0 0 60 150" aria-hidden="true">
  <defs>${BRASS(id)}
    <radialGradient id="rg${id}" cx="50%" cy="55%" r="62%"><stop offset="0" stop-color="#FFF0C4"/><stop offset=".5" stop-color="#F6BE55"/><stop offset="1" stop-color="#B0601C"/></radialGradient>
    <radialGradient id="rh${id}"><stop offset="0" stop-color="#F2AE3D" stop-opacity=".55"/><stop offset="1" stop-color="#F2AE3D" stop-opacity="0"/></radialGradient>
  </defs>
  <circle class="r-halo" cx="30" cy="82" r="58" fill="url(#rh${id})"/>
  <circle cx="30" cy="5" r="4" fill="none" stroke="url(#rb${id})" stroke-width="2"/>
  <path d="M30 9V16" stroke="#C9963F" stroke-width="2"/>
  <path d="M15 37C15 24 25 20 30 14C35 20 45 24 45 37Z" fill="url(#rb${id})"/>
  <rect x="12" y="36" width="36" height="7" rx="2" fill="url(#rb${id})"/>
  <path class="r-glass" d="M15 43H45L49 82L45 120H15L11 82Z" fill="url(#rg${id})"/>
  <g class="r-holes" fill="#5A3610">${holes.join('')}</g>
  <path d="M15 43L11 82L15 120M45 43L49 82L45 120M25 43V120M35 43V120" fill="none" stroke="url(#rb${id})" stroke-width="2.4"/>
  <rect x="12" y="119" width="36" height="7" rx="2" fill="url(#rb${id})"/>
  <path d="M17 126H43L30 142Z" fill="url(#rb${id})"/>
  <circle cx="30" cy="145" r="2.6" fill="#C9963F"/>
</svg>`;
}

// A crescent holding a small star.
function crescent(w) {
  return `<svg class="r-moon" width="${w}" height="${w}" viewBox="0 0 60 60" aria-hidden="true">
  <path d="M30 2v6" stroke="#C9963F" stroke-width="2"/>
  <path d="M38 10a24 24 0 1 0 14 34a19 19 0 1 1 -14 -34z" fill="#F2AE3D"/>
  <polygon points="${starPoints(37, 32, 7.5, 3.4, 5)}" fill="#FFE3A3"/>
</svg>`;
}

// Hanging ornaments: [left px, chain px, kind, width]
const HANGING = [
  [515, 34, 'lantern', 44],
  [590, 74, 'lantern', 60],
  [684, 22, 'moon', 54],
  [764, 52, 'lantern', 42],
];

// A few stars for the night sky, [left, top, size, twinkles]
const SKY = [
  [470, 40, 3, 1], [880, 30, 2, 0], [640, 18, 2, 1], [1010, 26, 3, 0], [110, 36, 2, 1], [300, 22, 3, 0],
  [1180, 22, 2, 1], [835, 118, 2, 0], [560, 230, 2, 1], [720, 210, 2, 0], [400, 50, 2, 0],
];

export function decorHTML() {
  let html = '<div class="r-sky">' + SKY.map(([x, y, s, tw], i) =>
    `<i class="${tw ? 'is-tw' : ''}" style="left:${x}px;top:${y}px;width:${s}px;height:${s}px;animation-delay:${(i * 0.7).toFixed(1)}s"></i>`).join('') + '</div>';
  HANGING.forEach(([x, chain, kind, w], i) => {
    const art = kind === 'moon' ? crescent(w) : lantern('h' + i, w);
    html += `<div class="r-hang" style="left:${x}px;animation-delay:-${(i * 1.3).toFixed(1)}s;animation-duration:${(5.5 + i * 0.6).toFixed(1)}s">`
      + `<span class="r-chain" style="height:${chain}px"></span>${art}</div>`;
  });
  return html;
}

// The garland across the empty band above the Quran tracker: a draped string with lights,
// crescents, stars and small lanterns hanging from it.
export function garlandSVG(width) {
  const W = width, H = 92, sag = 28;
  const y = (t) => 6 + 4 * sag * t * (1 - t);
  const n = 13;
  let items = '';
  for (let i = 1; i <= n; i++) {
    const t = i / (n + 1), x = W * t, top = y(t);
    const kind = ['moon', 'star', 'lantern'][i % 3];
    const drop = [12, 18, 8][i % 3];
    items += `<line x1="${x.toFixed(1)}" y1="${top.toFixed(1)}" x2="${x.toFixed(1)}" y2="${(top + drop).toFixed(1)}" stroke="rgba(231,190,106,.6)" stroke-width="1.2"/>`;
    const cy = top + drop;
    if (kind === 'star') items += `<polygon points="${starPoints(x, cy + 13, 13, 6)}" fill="#F2AE3D"/>`;
    if (kind === 'moon') items += `<path transform="translate(${(x - 13).toFixed(1)} ${cy.toFixed(1)}) scale(1.45)" d="M12 0a10 10 0 1 0 6 15a8 8 0 1 1 -6 -15z" fill="#E7BE6A"/>`;
    if (kind === 'lantern') {
      items += `<g transform="translate(${(x - 9).toFixed(1)} ${cy.toFixed(1)}) scale(1.5)"><path d="M2 5C2 1 6 0 6 0C6 0 10 1 10 5Z" fill="#C9963F"/>`
        + `<rect class="r-mini" x="1" y="5" width="10" height="14" rx="2" fill="#F6BE55"/><path d="M1 9H11M1 14H11M6 5V19" stroke="#8A5A1E" stroke-width=".9"/><path d="M2 19H10L6 25Z" fill="#C9963F"/></g>`;
    }
    // little lights between the ornaments
    const t2 = (i + 0.5) / (n + 1);
    if (i < n) items += `<circle class="r-bulb" cx="${(W * t2).toFixed(1)}" cy="${(y(t2) + 4).toFixed(1)}" r="4" style="animation-delay:${(i * 0.45).toFixed(2)}s"/>`;
  }
  const path = `M0 ${y(0)} Q${W / 2} ${6 + 2 * sag} ${W} ${y(1)}`; // the same curve as y(t)
  return `<svg class="r-garland" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true">`
    + `<path d="${path}" fill="none" stroke="rgba(231,190,106,.55)" stroke-width="1.6"/>${items}</svg>`;
}
