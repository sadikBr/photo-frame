// Guest Wi-Fi card: the text a phone camera understands (WIFI:T:WPA;S:name;P:password;;) and the
// QR code for it as SVG. Shared by the frame and the control panel (its preview).
import qrcode from './vendor/qrcode.js';

export const WIFI_SECURITY = ['WPA', 'WEP', 'nopass'];

// Backslash before \ ; , : " (the format's special characters).
const esc = (s) => String(s).replace(/([\\;,:"])/g, '\\$1');

export function wifiString(w) {
  if (!w || !w.ssid) return '';
  const t = WIFI_SECURITY.includes(w.security) ? w.security : 'WPA';
  return 'WIFI:T:' + t + ';S:' + esc(w.ssid) + ';' + (t !== 'nopass' && w.password ? 'P:' + esc(w.password) + ';' : '') + (w.hidden ? 'H:true;' : '') + ';';
}

// A QR code as one SVG path: dark modules on a white square with a 4-module quiet zone.
export function qrSvg(text, size) {
  const q = qrcode(0, 'M');
  q.addData(text);
  q.make();
  const n = q.getModuleCount(), m = 4, all = n + 2 * m;
  let d = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!q.isDark(r, c)) continue;
      let run = 1;
      while (c + run < n && q.isDark(r, c + run)) run++;
      d += 'M' + (c + m) + ' ' + (r + m) + 'h' + run + 'v1h-' + run + 'z';
      c += run - 1;
    }
  }
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 ' + all + ' ' + all + '" shape-rendering="crispEdges" role="img" aria-label="QR">'
    + '<rect width="' + all + '" height="' + all + '" fill="#fff"/><path d="' + d + '" fill="#000"/></svg>';
}
