// Hand-drawn SVG icons. Geometry echoes the zellige khatam (8-point star).
// Icons use currentColor for line work and var(--accent) for the one warm detail.

export function starPoints(cx, cy, R, r, n = 8, rot = -Math.PI / 2) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const rad = i % 2 ? r : R;
    const a = rot + (i * Math.PI) / n;
    pts.push((cx + rad * Math.cos(a)).toFixed(2) + ',' + (cy + rad * Math.sin(a)).toFixed(2));
  }
  return pts.join(' ');
}

export function khatam(size = 20, cls = '') {
  return `<svg class="${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><polygon points="${starPoints(12, 12, 11, 7.6)}" /></svg>`;
}

const svg = (body, size) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

const SUN = (cx, cy, s = 1) =>
  `<polygon points="${starPoints(cx, cy, 17 * s, 12.5 * s)}" stroke="var(--accent)"/><circle cx="${cx}" cy="${cy}" r="${7.5 * s}" fill="var(--accent)" stroke="none"/>`;
const MOON = (cx, cy, s = 1) =>
  `<path d="M${cx + 6 * s} ${cy - 14 * s}a15 15 0 1 0 9 22 a12 12 0 1 1 -9 -22z" fill="var(--accent)" stroke="none"/>`;
const CLOUD = 'M19 49h27a10 10 0 0 0 1.4-19.9A14 14 0 0 0 20.5 27 a11 11 0 0 0 -1.5 22z';
const CLOUD_HI = 'M19 41h27a10 10 0 0 0 1.4-19.9A14 14 0 0 0 20.5 19 a11 11 0 0 0 -1.5 22z';

export function weatherIcon(kind, isDay = true, size = 64) {
  const sky = isDay ? SUN(24, 24, 0.8) : MOON(22, 24, 0.8);
  switch (kind) {
    case 'clear': return svg(isDay ? SUN(32, 32, 1.35) : MOON(30, 32, 1.35), size);
    case 'mostly': return svg(sky + `<path d="${CLOUD}" fill="var(--ground)" transform="translate(6 2) scale(.85)"/>`, size);
    case 'partly': return svg(sky + `<path d="${CLOUD}" fill="var(--ground)" transform="translate(4 0)"/>`, size);
    case 'cloudy': return svg(`<path d="M30 26a12 12 0 0 1 21 4" opacity=".5"/><path d="${CLOUD}" fill="var(--ground)"/>`, size);
    case 'fog': return svg(`<path d="${CLOUD_HI}"/><path d="M14 50h36M20 57h26" stroke="var(--accent)"/>`, size);
    case 'drizzle': return svg(`<path d="${CLOUD_HI}"/><path d="M24 50v.5M34 53v.5M44 50v.5M29 59v.5M39 59v.5" stroke="var(--accent)" stroke-width="4"/>`, size);
    case 'rain': return svg(`<path d="${CLOUD_HI}"/><path d="M25 48l-3 9M35 48l-3 9M45 48l-3 9" stroke="var(--accent)"/>`, size);
    case 'storm': return svg(`<path d="${CLOUD_HI}"/><path d="M35 44l-7 10h8l-5 9" stroke="var(--accent)" stroke-width="3"/>`, size);
    case 'snow': return svg(`<path d="${CLOUD_HI}"/><g stroke="var(--accent)"><path d="M24 50v8M20.5 52l7 4M20.5 56l7-4"/><path d="M40 50v8M36.5 52l7 4M36.5 56l7-4"/></g>`, size);
  }
  return svg(sky, size);
}

// WMO weather codes (Open-Meteo) -> icon + Arabic description.
export function describeWeather(code) {
  const c = Number(code);
  if (c === 0) return { kind: 'clear', ar: 'صحو' };
  if (c === 1) return { kind: 'mostly', ar: 'صحو غالباً' };
  if (c === 2) return { kind: 'partly', ar: 'غائم جزئياً' };
  if (c === 3) return { kind: 'cloudy', ar: 'غائم' };
  if (c === 45 || c === 48) return { kind: 'fog', ar: 'ضباب' };
  if (c >= 51 && c <= 57) return { kind: 'drizzle', ar: 'رذاذ' };
  if (c === 61 || c === 80) return { kind: 'rain', ar: 'زخات خفيفة' };
  if (c === 63 || c === 81 || c === 66) return { kind: 'rain', ar: 'أمطار' };
  if (c === 65 || c === 82 || c === 67) return { kind: 'rain', ar: 'أمطار غزيرة' };
  if ((c >= 71 && c <= 77) || c === 85 || c === 86) return { kind: 'snow', ar: 'ثلوج' };
  if (c >= 95) return { kind: 'storm', ar: 'عواصف رعدية' };
  return { kind: 'partly', ar: '' };
}

// Small line icons for the weather tip on the clock screen.
export function nudgeIcon(kind) {
  const s = (body) => `<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  switch (kind) {
    case 'rain': case 'storm': return s('<path d="M3 12a9 9 0 0 1 18 0z"/><path d="M12 12v7a2 2 0 0 1-4 0"/>');
    case 'cold': return s('<path d="M12 2v20M4.5 6.5l15 11M19.5 6.5l-15 11"/><path d="M9.5 3.5L12 6l2.5-2.5M9.5 20.5L12 18l2.5 2.5"/>');
    case 'hot': return s('<circle cx="12" cy="12" r="4.5"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/>');
    case 'wind': return s('<path d="M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h8"/>');
    case 'fog': return s('<path d="M4 9h16M2 13h20M5 17h14"/>');
    case 'info': return s('<path d="M10 14.5V5a2 2 0 0 1 4 0v9.5a4 4 0 1 1-4 0z"/><path d="M12 9v7"/>');
    default: return s('<path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z"/>');
  }
}

export const ICON = {
  repeat: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/></svg>',
  check: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7"/></svg>',
  plus: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  close: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  trash: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>',
  image: '<svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/></svg>',
  crescent: '<svg width="30" height="30" viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 3.2a9 9 0 1 0 6.3 13.3 7.2 7.2 0 1 1-6.3-13.3z" fill="currentColor"/></svg>',
};
