// «تلوين الزليج»: colouring pages drawn from geometry — 8-pointed khatam stars, a rosette, and
// a terrace of triangles. Every page is a list of tiles (polygons in a 1000×1000 box); the
// gaps between them are the white plaster lines. The server, the frame and the phones all use
// this file, so a tile's number means the same tile everywhere.

// The glaze colours (index 0–9).
export const GLAZE = ['#1F4E8C', '#1A6C5E', '#F2AE3D', '#C2502D', '#F3EDE2', '#241707', '#2BA3A0', '#E8657A', '#9DB9F5', '#7FD3B5'];
export const GLAZE_NAMES = ['أزرق فاسي', 'أخضر', 'زعفراني', 'أحمر ترابي', 'أبيض', 'أسود', 'فيروزي', 'وردي', 'سماوي', 'نعناعي'];
export const EMPTY = '#FFFDF8';
export const LINES = '#E7DFD0';

const P = (cx, cy, r, deg) => [cx + r * Math.cos((deg * Math.PI) / 180), cy + r * Math.sin((deg * Math.PI) / 180)];
const round = (pts) => pts.map((v) => Math.round(v * 10) / 10);

// An 8-pointed star as 9 tiles: the octagon in the middle and its eight points.
function star8(tiles, cx, cy, R, rot = 0, ratio = 0.54) {
  const r = R * ratio;
  const inner = [];
  for (let k = 0; k < 8; k++) inner.push(P(cx, cy, r, rot + 22.5 + k * 45));
  tiles.push(round(inner.flat()));
  for (let k = 0; k < 8; k++) {
    const a = inner[(k + 7) % 8], b = inner[k];
    tiles.push(round([...a, ...P(cx, cy, R, rot + k * 45), ...b]));
  }
}
// A ring segment between radii r0 and r1, angles a0 to a1 (degrees), with curved sides.
function sector(cx, cy, r0, r1, a0, a1) {
  const pts = [];
  const n = Math.max(2, Math.round((a1 - a0) / 6));
  for (let i = 0; i <= n; i++) pts.push(...P(cx, cy, r1, a0 + ((a1 - a0) * i) / n));
  for (let i = n; i >= 0; i--) pts.push(...P(cx, cy, r0, a0 + ((a1 - a0) * i) / n));
  return round(pts);
}

const PATTERNS = [
  {
    name: 'نجوم الخاتم',
    build() {
      const tiles = [];
      const L = 1000 / 3;
      for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) star8(tiles, L / 2 + i * L, L / 2 + j * L, 162, 0, 0.62);
      // Small stars where four big ones meet.
      for (let j = 1; j < 3; j++) for (let i = 1; i < 3; i++) star8(tiles, i * L, j * L, 64, 22.5, 0.6);
      return tiles;
    },
  },
  {
    name: 'الوردة',
    build() {
      const tiles = [];
      const c = 500;
      // The 12-pointed star in the middle: a dodecagon and twelve points.
      const inner = [];
      for (let k = 0; k < 12; k++) inner.push(P(c, c, 92, 15 + k * 30 - 90));
      tiles.push(round(inner.flat()));
      for (let k = 0; k < 12; k++) tiles.push(round([...inner[(k + 11) % 12], ...P(c, c, 172, k * 30 - 90), ...inner[k]]));
      // Two rings of petals.
      for (let k = 0; k < 12; k++) {
        tiles.push(sector(c, c, 188, 246, k * 30 - 90 + 2, k * 30 - 60 - 2));
        tiles.push(sector(c, c, 254, 312, k * 30 - 90 + 2, k * 30 - 60 - 2));
      }
      for (let k = 0; k < 24; k++) tiles.push(sector(c, c, 328, 440, k * 15 - 90 + 1.5, k * 15 - 75 - 1.5));
      // A small star in each corner.
      for (const [x, y] of [[92, 92], [908, 92], [92, 908], [908, 908]]) star8(tiles, x, y, 78, 22.5);
      return tiles;
    },
  },
  {
    name: 'مربعات التراس',
    build() {
      const tiles = [];
      const n = 5, s = 1000 / n, g = 7;
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const x0 = i * s + g, y0 = j * s + g, x1 = (i + 1) * s - g, y1 = (j + 1) * s - g, mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
        // A diamond in the middle and four corner triangles.
        const d = (x1 - x0) * 0.3;
        tiles.push(round([mx, my - d, mx + d, my, mx, my + d, mx - d, my]));
        tiles.push(round([x0, y0, x1, y0, mx, my - d - 6]));
        tiles.push(round([x1, y0, x1, y1, mx + d + 6, my]));
        tiles.push(round([x1, y1, x0, y1, mx, my + d + 6]));
        tiles.push(round([x0, y1, x0, y0, mx - d - 6, my]));
      }
      return tiles;
    },
  },
];
const cache = [];
export const PATTERN_COUNT = PATTERNS.length;
export function pattern(pid) {
  const i = ((pid % PATTERNS.length) + PATTERNS.length) % PATTERNS.length;
  if (!cache[i]) cache[i] = { name: PATTERNS[i].name, tiles: PATTERNS[i].build() };
  return cache[i];
}
export const tileCount = (pid) => pattern(pid).tiles.length;

// Monday-to-Sunday weeks, in the frame's time zone (offset in minutes).
export const weekIndex = (ms, offsetMin = 0) => Math.floor((ms + offsetMin * 60000 + 3 * 86400000) / (7 * 86400000));

// The page as SVG: one <path> per tile with data-t = its number.
export function zelligeSvg(pid, fills, size, cls = 'zl-svg') {
  const pat = pattern(pid);
  let body = '';
  pat.tiles.forEach((t, i) => {
    let d = 'M' + t[0] + ' ' + t[1];
    for (let k = 2; k < t.length; k += 2) d += 'L' + t[k] + ' ' + t[k + 1];
    const c = fills && fills[i] != null && fills[i] >= 0 ? GLAZE[fills[i]] : EMPTY;
    body += '<path data-t="' + i + '" d="' + d + 'Z" fill="' + c + '"/>';
  });
  return '<svg class="' + cls + '" width="' + size + '" height="' + size + '" viewBox="-8 -8 1016 1016"><rect x="-8" y="-8" width="1016" height="1016" fill="' + LINES + '"/><g stroke="#8C7B63" stroke-width="3" stroke-linejoin="round">' + body + '</g></svg>';
}

// Draw it on a canvas (for saving a finished page as a photo).
export function drawZellige(ctx, pid, fills, x, y, size) {
  const pat = pattern(pid);
  const k = size / 1016;
  ctx.save();
  ctx.translate(x + 8 * k, y + 8 * k);
  ctx.scale(k, k);
  ctx.fillStyle = LINES;
  ctx.fillRect(-8, -8, 1016, 1016);
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#8C7B63';
  pat.tiles.forEach((t, i) => {
    ctx.beginPath();
    ctx.moveTo(t[0], t[1]);
    for (let j = 2; j < t.length; j += 2) ctx.lineTo(t[j], t[j + 1]);
    ctx.closePath();
    ctx.fillStyle = fills && fills[i] != null && fills[i] >= 0 ? GLAZE[fills[i]] : EMPTY;
    ctx.fill();
    ctx.stroke();
  });
  ctx.restore();
}
