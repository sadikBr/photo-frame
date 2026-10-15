// «نبضة»: what the phone and the frame share — the six taps (words and icons) and the colours
// of the drawing pen.

// Pen colours: plaster, saffron, rose, mint, sky, red. Stored in a drawing as 0–5.
export const PEN = ['#F3EDE2', '#F2AE3D', '#EE9AAE', '#7FD3B5', '#9DB9F5', '#E8657A'];

const svg = (body, size, vb = 64) => `<svg width="${size}" height="${size}" viewBox="0 0 ${vb} ${vb}" aria-hidden="true">${body}</svg>`;
export const HEART = 'M32 56S8 41.5 4.6 26.6C2.4 16.9 9 8 18.6 8c6.4 0 10.6 3.6 13.4 7.6C34.8 11.6 39 8 45.4 8 55 8 61.6 16.9 59.4 26.6 56 41.5 32 56 32 56z';
const CRESCENT = 'M40 6a26 26 0 1 0 18 40A21 21 0 1 1 40 6z';

const ICONS = {
  love: (s) => svg(`<path d="${HEART}" fill="#E8657A"/><path d="M18 18c-4 0-7 3-7.5 7" stroke="#FFD2DA" stroke-width="3" fill="none" stroke-linecap="round"/>`, s),
  miss: (s) => svg('<path d="M32 60V34" stroke="#5FA77F" stroke-width="3.5" stroke-linecap="round"/><path d="M32 46c-8-1-13-6-14-12 7 0 12 4 14 12zM32 50c7-1 12-5 13-11-6 0-11 4-13 11z" fill="#5FA77F"/>'
    + '<path d="M32 36c-10 0-15-7-15-15 0-7 5-13 15-13s15 6 15 13c0 8-5 15-15 15z" fill="#D9445E"/><path d="M25 20c2-5 12-6 15 0-3 4-11 6-15 0zM24 26c4 4 12 4 16 0" stroke="#F69AAB" stroke-width="2.4" fill="none" stroke-linecap="round"/>', s),
  morning: (s) => {
    let rays = '';
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 6;
      rays += `<path d="M${(32 + 19 * Math.cos(a)).toFixed(1)} ${(36 + 19 * Math.sin(a)).toFixed(1)}L${(32 + 27 * Math.cos(a)).toFixed(1)} ${(36 + 27 * Math.sin(a)).toFixed(1)}" stroke="#F2AE3D" stroke-width="3.6" stroke-linecap="round"/>`;
    }
    return svg(rays + '<circle cx="32" cy="36" r="13" fill="#FFC85E"/><path d="M4 52h56" stroke="#F3EDE2" stroke-opacity=".5" stroke-width="3" stroke-linecap="round"/>', s);
  },
  night: (s) => svg(`<path d="${CRESCENT}" fill="#FFE3A3"/><circle cx="50" cy="16" r="2.6" fill="#FFE3A3"/><circle cx="56" cy="30" r="1.8" fill="#FFE3A3"/><circle cx="44" cy="8" r="1.6" fill="#FFE3A3"/>`, s),
  way: (s) => svg('<path d="M6 40l5-13c1-3 3-5 7-5h22c3 0 5 1 7 4l7 10 5 1c2 1 3 2 3 4v6H6z" fill="#F2AE3D"/><path d="M15 34l3-8h10v8zM31 34v-8h8l5 8z" fill="#2A3A6A"/>'
    + '<circle cx="18" cy="48" r="6" fill="#241707"/><circle cx="18" cy="48" r="2.4" fill="#F3EDE2"/><circle cx="47" cy="48" r="6" fill="#241707"/><circle cx="47" cy="48" r="2.4" fill="#F3EDE2"/>', s),
  news: (s) => svg('<path d="M8 58l12-34 22 22z" fill="#F2AE3D"/><path d="M14 41l7 7M11 50l4 4" stroke="#B5651D" stroke-width="3" stroke-linecap="round"/>'
    + '<path d="M32 12l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" fill="#9DB9F5"/><path d="M52 26l1.5 4 4 1.5-4 1.5L52 37l-1.5-4-4-1.5 4-1.5z" fill="#EE9AAE"/>'
    + '<path d="M44 6l-3 9M58 14l-8 5M54 46l3 7" stroke="#7FD3B5" stroke-width="3" stroke-linecap="round"/><circle cx="24" cy="8" r="2.6" fill="#E8657A"/>', s),
};

// key: what the frame says (in the sender's voice) and what the phone's button says.
export const TAPS = [
  { key: 'love', title: 'أفكر فيكم', button: 'أفكر فيكم' },
  { key: 'miss', title: 'اشتقت إليكم', button: 'اشتقت إليكم' },
  { key: 'morning', title: 'صباح الخير', button: 'صباح الخير' },
  { key: 'night', title: 'تصبحون على خير', button: 'تصبحون على خير' },
  { key: 'way', title: 'أنا في الطريق إلى البيت', button: 'في الطريق' },
  { key: 'news', title: 'عندي خبر سعيد!', button: 'خبر سعيد' },
];
export const tapOf = (key) => TAPS.find((t) => t.key === key);
export const tapIcon = (key, size) => (ICONS[key] ? ICONS[key](size) : '');
export const MIC = (size) => svg('<rect x="22" y="6" width="20" height="34" rx="10" fill="#F2AE3D"/><path d="M14 30c0 10 8 17 18 17s18-7 18-17M32 47v10M22 58h20" stroke="#F3EDE2" stroke-width="3.6" fill="none" stroke-linecap="round"/>', size);
export const PEN_ICON = (size) => svg('<path d="M10 54l4-14L42 12a5 5 0 0 1 7 0l3 3a5 5 0 0 1 0 7L24 50z" fill="#7FD3B5"/><path d="M10 54l4-14 10 10z" fill="#F3EDE2"/><path d="M38 16l10 10" stroke="#1A2258" stroke-width="3"/>', size);
export const HEART_ICON = (size, color = '#E8657A') => svg(`<path d="${HEART}" fill="${color}"/>`, size);

// Draw strokes on a 4:3 canvas `width` pixels wide (x and y are 0–1000 of the width and height).
// With `upto`, only the points drawn before that many ms (the replay on the frame). The pen is
// the same thickness relative to the picture on the phone, the frame and the tray.
export function drawStrokes(ctx, strokes, width, upto) {
  const kx = width / 1000, ky = (width * 0.75) / 1000;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const s of strokes) {
    const pts = s.p;
    if (upto != null && pts[2] > upto) break;
    ctx.strokeStyle = PEN[s.c] || PEN[0];
    ctx.lineWidth = penWidth(s.w, width);
    ctx.beginPath();
    ctx.moveTo(pts[0] * kx, pts[1] * ky);
    if (pts.length === 3) ctx.lineTo(pts[0] * kx + 0.1, pts[1] * ky); // a dot
    for (let i = 3; i < pts.length; i += 3) {
      if (upto != null && pts[i + 2] > upto) break;
      ctx.lineTo(pts[i] * kx, pts[i + 1] * ky);
    }
    ctx.stroke();
  }
}
export const penWidth = (w, width) => (w === 2 ? 22 : 10) * (width / 720);
export const PAD_BG = '#1A2258';
