// Guest Wi-Fi card on the frame: a round Wi-Fi button in the tab row (only once a network is set
// in the control panel) opens the network as a big QR code. Guests point their phone's camera at
// it to join; the name and password are written beside it for phones that can't scan.
import config from './config.js';
import { h } from './util.js';
import { on } from './data.js';
import { wifiString, qrSvg } from './wifi-common.js';

export const WIFI_ICON = (s) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M2.5 9a14 14 0 0 1 19 0"/><path d="M5.8 12.6a9.2 9.2 0 0 1 12.4 0"/><path d="M9.1 16.1a4.6 4.6 0 0 1 5.8 0"/><circle cx="12" cy="19.6" r="1.3" fill="currentColor" stroke="none"/></svg>`;

export function createWifi({ stage, tab }) {
  const qr = h('div', { class: 'wf-qr' });
  const name = h('div', { class: 'wf-value' });
  const pass = h('div', { class: 'wf-value wf-pass' });
  const passRow = h('div', { class: 'wf-row' }, h('div', { class: 'wf-label' }, 'كلمة السر'), pass);
  const note = h('div', { class: 'wf-note' });
  const closeBtn = h('button', { class: 'fun-close', type: 'button', 'aria-label': 'إغلاق' }, '×');
  const modal = h('div', { class: 'fun-modal wf', hidden: true },
    h('div', { class: 'fun-scrim' }),
    h('div', { class: 'wf-panel' },
      qr,
      h('div', { class: 'wf-text' },
        h('div', { class: 'wf-icon', html: WIFI_ICON(44) }),
        h('div', { class: 'fun-title' }, 'الواي فاي للضيوف'),
        h('div', { class: 'fun-sub' }, 'افتحوا كاميرا الهاتف ووجّهوها إلى الرمز، ثم المسوا الإشعار للاتصال.'),
        // Theme-only (hidden in the original look): a welcome and the steps, one per line.
        h('div', { class: 'wf-hello' }, 'أهلاً بضيوفنا'),
        h('div', { class: 'wf-lead' }, 'اتصلوا بشبكة البيت بمسح الرمز'),
        h('ol', { class: 'wf-steps' },
          h('li', null, h('span', null, '1'), 'افتحوا كاميرا الهاتف'),
          h('li', null, h('span', null, '2'), 'وجّهوها إلى الرمز المربع'),
          h('li', null, h('span', null, '3'), 'المسوا «الاتصال بالشبكة»')),
        h('div', { class: 'wf-row' }, h('div', { class: 'wf-label' }, 'الشبكة'), name),
        passRow,
        note)),
    closeBtn);
  stage.append(modal);

  let open = false, timer = 0;
  function close() { open = false; modal.hidden = true; clearTimeout(timer); }
  function show() {
    const w = config.wifi;
    if (!w) return;
    qr.innerHTML = qrSvg(wifiString(w), 420);
    name.textContent = w.ssid;
    const hasPass = w.security !== 'nopass' && w.password;
    passRow.hidden = !hasPass || w.showPassword === false;
    pass.textContent = w.password || '';
    note.textContent = w.security === 'nopass' ? 'شبكة مفتوحة بلا كلمة سر.' : !passRow.hidden ? '' : 'كلمة السر داخل الرمز.';
    open = true;
    modal.hidden = false;
    modal.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 250 });
    clearTimeout(timer);
    timer = setTimeout(close, 3 * 60000); // guests have had time to scan
  }
  closeBtn.addEventListener('click', close);
  modal.querySelector('.fun-scrim').addEventListener('click', close);
  // The button shows only once a network is set; a change while open redraws the card.
  function refresh() {
    tab.hidden = !config.wifi;
    if (!config.wifi) close(); else if (open) show();
  }
  on('settings', refresh);
  refresh();
  return { open: show, busy: () => open };
}
