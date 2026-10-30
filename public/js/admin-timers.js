// «مؤقّت» in the control panel: start a timer that rings on the frame (with a name if you like),
// see the ones running there, add a minute, pause, cancel, or silence and snooze one that rings.
// Whoever starts a timer here gets a notification when it rings (if notifications are on).
import * as demo from './demo.js';
import { cleanTimers, timerEnded, timerLeft, fmtTimer, minutesAr, timerName, TIMER_LABELS, TIMER_PRESETS, SNOOZES, MAX_TIMERS } from './timers-common.js';

export function initTimers({ api, send, toast, el, $, DEMO, me }) {
  let list = [], skew = 0, label = '', custom = 25, visible = false, onHome = false, busy = false;
  const now = () => Date.now() + skew; // the server's clock (the frame counts with it too)

  function take(r) {
    if (!r) return;
    if (r.now) skew = r.now - Date.now();
    list = cleanTimers(r.timers, now());
    render();
  }
  async function load() {
    try { take(DEMO ? { timers: demo.timers(), now: Date.now() } : await api('/api/pulse/timers')); } catch (e) { /* later */ }
  }
  async function op(body, okText) {
    if (busy) return;
    busy = true;
    try {
      take(DEMO ? demo.timerOp(body) : await send('/api/pulse/timers', 'POST', body));
      if (okText) toast(okText);
    } catch (e) { toast(e.message); } finally { busy = false; }
  }

  // ----- a new timer -----
  function renderPicker() {
    const box = $('tmrLabels');
    box.textContent = '';
    for (const l of TIMER_LABELS) {
      box.append(el('button', { type: 'button', class: 'wheel-chip' + (l === label ? ' is-on' : ''), 'aria-pressed': String(l === label), onclick: () => { label = label === l ? '' : l; renderPicker(); } }, l));
    }
    const pre = $('tmrPresets');
    if (!pre.children.length) {
      for (const m of TIMER_PRESETS) {
        pre.append(el('button', { type: 'button', class: 'tmr-preset', onclick: () => start(m) },
          el('bdi', { class: 'tmr-preset-n' }, String(m)), el('span', { class: 'tmr-preset-u' }, m === 1 ? 'دقيقة' : m <= 10 ? 'دقائق' : 'دقيقة')));
      }
    }
    $('tmrCustom').textContent = minutesAr(custom);
    $('tmrGo').textContent = 'ابدأ ' + minutesAr(custom) + ' على الإطار';
  }
  async function start(minutes) {
    if (list.length >= MAX_TIMERS) { toast('يكفي ' + MAX_TIMERS + ' مؤقّتات في وقت واحد. أوقف واحداً أولاً.'); return; }
    const l = label;
    await op({ op: 'add', minutes, label: l, by: me() || '' }, 'بدأ ' + (l ? '«' + l + '» ' : 'المؤقّت ') + '(' + minutesAr(minutes) + ') على الإطار.');
    label = '';
    renderPicker();
  }
  for (const b of document.querySelectorAll('.tmr-step')) {
    b.addEventListener('click', () => { custom = Math.max(1, Math.min(240, custom + Number(b.dataset.step))); renderPicker(); });
  }
  $('tmrGo').addEventListener('click', () => start(custom));

  // ----- the ones on the frame -----
  let shownKey = '';
  function render() {
    const t = now();
    const items = list.slice().sort((a, b) => timerLeft(a, t) - timerLeft(b, t));
    const key = items.map((x) => x.id + (x.end ? (timerEnded(x, t) ? 'r' : '') : 'p')).join(',');
    const ul = $('tmrList');
    if (key !== shownKey) {
      shownKey = key;
      ul.textContent = '';
      for (const x of items) {
        const ringing = timerEnded(x, t);
        const actions = ringing
          ? [el('button', { type: 'button', class: 'primary small', onclick: () => op({ op: 'stop', ids: [x.id] }) }, 'إيقاف'),
            ...SNOOZES.map((m) => el('button', { type: 'button', class: 'ghost small', onclick: () => op({ op: 'snooze', minutes: m, ids: [x.id] }, 'يرنّ مرة أخرى بعد ' + minutesAr(m) + '.') }, 'غفوة ' + m))]
          : [el('button', { type: 'button', class: 'ghost small', onclick: () => op({ op: 'more', id: x.id, minutes: 1 }) }, '+ دقيقة'),
            el('button', { type: 'button', class: 'ghost small', onclick: () => op({ op: x.end ? 'pause' : 'resume', id: x.id }) }, x.end ? 'إيقاف مؤقت' : 'استئناف'),
            el('button', { type: 'button', class: 'ghost small tmr-cancel', 'aria-label': 'إلغاء ' + timerName(x), onclick: () => op({ op: 'cancel', id: x.id }) }, 'إلغاء')];
        ul.append(el('li', { class: 'tmr-item' + (ringing ? ' is-ringing' : x.end ? '' : ' is-paused'), 'data-id': x.id },
          el('div', { class: 'tmr-top' },
            el('span', { class: 'tmr-name' }, (x.snoozed ? 'غفوة · ' : '') + timerName(x), el('small', null, x.by ? ' · من ' + x.by : ' · من الإطار')),
            el('bdi', { class: 'tmr-time', dir: 'ltr' })),
          el('div', { class: 'tmr-bar' }, el('i')),
          el('div', { class: 'tmr-actions' }, ...actions)));
      }
    }
    for (const li of ul.children) {
      const x = items.find((y) => y.id === li.dataset.id);
      if (!x) continue;
      const ringing = timerEnded(x, t);
      li.querySelector('.tmr-time').textContent = ringing ? 'يرنّ الآن' : fmtTimer(timerLeft(x, t));
      li.querySelector('.tmr-bar i').style.transform = 'scaleX(' + (ringing ? 0 : Math.max(0, Math.min(1, timerLeft(x, t) / x.total))).toFixed(4) + ')';
    }
    $('tmrNow').hidden = !items.length;
    // The card on the home page: the soonest one, or that one rings.
    const sub = $('homeTimersSub');
    const ring = items.find((x) => timerEnded(x, t));
    const first = items.find((x) => !timerEnded(x, t));
    sub.textContent = ring ? '«' + timerName(ring) + '» يرنّ الآن' : first ? timerName(first) + ' · ' + fmtTimer(timerLeft(first, t)) + (items.length > 1 ? ' · و' + (items.length - 1) + ' غيره' : '') : 'يرنّ في البيت بصوت عالٍ';
    $('homeTimers').classList.toggle('is-running', !!first || !!ring);
  }

  renderPicker();
  load();
  setInterval(() => { if (visible || onHome) render(); }, 1000);
  setInterval(() => { if ((visible || onHome) && document.visibilityState === 'visible') load(); }, visible ? 5000 : 5000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') load(); });
  if (DEMO) window.addEventListener('storage', (e) => { if (e.key === 'fd:demo-timers') load(); });
  return {
    load,
    shown(v) {
      const was = visible || onHome;
      visible = v && !$('v-timers').hidden;
      onHome = v && !$('v-home').hidden;
      if ((visible || onHome) && !was) load();
    },
  };
}
