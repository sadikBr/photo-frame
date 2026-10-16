// «حالتي»: a short status for the frame's clock screen («📚 في الامتحان · حتى 12:00»), and what
// the rest of the family has set.
import * as demo from './demo.js';
import { fromWall, wallDate, whenAr } from './admin-time.js';

const PRESETS = [['📚', 'في الامتحان'], ['💼', 'في الخدمة'], ['😴', 'نايم'], ['🚗', 'في الطريق'], ['✈️', 'مسافر'], ['🏃', 'في الرياضة'], ['🩺', 'عند الطبيب'], ['📵', 'مشغول، أتصل لاحقاً'], ['🕌', 'في المسجد']];

export function initStatus({ api, send, toast, el, $, DEMO, me, needName, offset }) {
  let list = [], pick = null, dur = 'h3';
  const DURS = [
    ['h1', 'ساعة', () => Date.now() + 3600000],
    ['h3', '3 ساعات', () => Date.now() + 3 * 3600000],
    ['eve', 'حتى 20:00', () => { const t = fromWall(wallDate(Date.now(), offset()), '20:00', offset()); return t > Date.now() + 60000 ? t : t + 86400000; }],
    ['morn', 'حتى الغد 08:00', () => fromWall(wallDate(Date.now() + 86400000, offset()), '08:00', offset())],
    ['days', '3 أيام', () => Date.now() + 3 * 86400000],
  ];

  function renderPresets() {
    const box = $('statusPresets');
    box.textContent = '';
    for (const [e, t] of PRESETS) {
      const on = pick && pick[1] === t;
      box.append(el('button', { type: 'button', class: 'chip st-pick' + (on ? ' is-on' : ''), onclick: () => { pick = [e, t]; $('statusText').value = ''; $('statusEmoji').value = ''; renderPresets(); } }, e + ' ' + t));
    }
    const d = $('statusUntil');
    d.textContent = '';
    for (const [k, label] of DURS) d.append(el('button', { type: 'button', class: 'wheel-chip' + (k === dur ? ' is-on' : ''), onclick: () => { dur = k; renderPresets(); } }, label));
  }
  function render() {
    const mine = list.find((x) => x.name === me());
    const now = $('statusNow');
    now.textContent = '';
    if (mine) {
      now.append(el('span', { class: 'st-now' }, (mine.emoji ? mine.emoji + ' ' : '') + mine.text, el('small', null, ' · حتى ' + whenAr(mine.until, offset()).replace(/^(اليوم|الليلة) /, ''))),
        el('button', { type: 'button', class: 'ghost small', onclick: clear }, 'مسح'));
    }
    now.hidden = !mine;
    const fam = $('statusFamily');
    fam.textContent = '';
    for (const x of list.filter((y) => y.name !== me())) {
      fam.append(el('li', null, el('b', null, x.name), ' ' + (x.emoji ? x.emoji + ' ' : '') + x.text, el('small', null, ' · حتى ' + whenAr(x.until, offset()).replace(/^(اليوم|الليلة) /, ''))));
    }
    fam.hidden = !fam.children.length;
  }
  async function load() {
    try { list = DEMO ? demo.statuses() : (await api('/api/pulse/status')).statuses; render(); } catch (e) { /* later */ }
  }
  async function save() {
    if (needName()) return;
    const custom = $('statusText').value.trim();
    const text = custom || (pick && pick[1]);
    const emoji = custom ? $('statusEmoji').value.trim() : pick && pick[0];
    if (!text) { toast('اختر حالة أو اكتب واحدة.'); return; }
    const until = DURS.find((x) => x[0] === dur)[2]();
    try {
      const r = DEMO ? demo.setStatus(me(), text, emoji || '', until) : await send('/api/pulse/status', 'PUT', { from: me(), text, emoji: emoji || '', until });
      list = r.statuses;
      pick = null;
      $('statusText').value = '';
      $('statusEmoji').value = '';
      renderPresets();
      render();
      toast('تظهر حالتك على شاشة الساعة حتى ' + whenAr(until, offset()).replace(/^(اليوم|الليلة) /, '') + '.');
    } catch (e) { toast(e.message); }
  }
  async function clear() {
    try { const r = DEMO ? demo.setStatus(me(), '', '', 0) : await send('/api/pulse/status/clear', 'POST', { from: me() }); list = r.statuses; render(); } catch (e) { toast(e.message); }
  }
  $('statusSave').addEventListener('click', save);
  $('statusText').addEventListener('input', () => { if ($('statusText').value) { pick = null; renderPresets(); } });
  renderPresets();
  load();
  setInterval(() => { if (document.visibilityState === 'visible') load(); }, 60000);
  return { load, render };
}
