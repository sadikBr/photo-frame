// «مؤقّت ومنبّه» in the control panel: start a timer that rings on the frame (with a name if you like),
// see the ones running there, add a minute, pause, cancel, or silence and snooze one that rings.
// And daily alarms («منبّه يومي»: the pill at 21:00): add, switch off, remove, stop or snooze one
// that rings now.
// Whoever starts a timer here gets a notification when it rings (if notifications are on).
import * as demo from './demo.js';
import { cleanTimers, timerEnded, timerLeft, fmtTimer, minutesAr, timerName, TIMER_LABELS, TIMER_PRESETS, SNOOZES, MAX_TIMERS, cleanAlarms, alarmRinging, daysAr, ALARM_LABELS, DAY_SHORT } from './timers-common.js';
import { wallDate } from './admin-time.js';

export function initTimers({ api, send, toast, el, $, DEMO, me, offset = () => 0 }) {
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
    try { alarms = cleanAlarms(DEMO ? demo.alarms() : (await api('/api/pulse/alarms')).alarms); renderAlarms(); } catch (e) { /* later */ }
  }

  // ----- daily alarms -----
  let alarms = [], days = [], alarmsKey = '';
  // The frame's local day and minute (the frame rings alarms by its own clock).
  const wall = () => {
    const off = offset();
    const d = new Date(now() + off * 60000);
    return { day: wallDate(now(), off), wd: d.getUTCDay(), minutes: d.getUTCHours() * 60 + d.getUTCMinutes() };
  };
  async function alarmOp(body, okText) {
    try {
      const r = DEMO ? demo.alarmOp(body) : await send('/api/pulse/alarms', 'POST', body);
      alarms = cleanAlarms(r.alarms);
      renderAlarms(true);
      if (okText) toast(okText);
      return true;
    } catch (e) { toast(e.message); return false; }
  }
  function renderAlarmForm() {
    const sug = $('almSuggest');
    sug.textContent = '';
    for (const l of ALARM_LABELS) sug.append(el('button', { type: 'button', class: 'wheel-chip', onclick: () => { $('almLabel').value = l; } }, l));
    const box = $('almDays');
    box.textContent = '';
    box.append(el('button', { type: 'button', class: 'wheel-chip' + (!days.length ? ' is-on' : ''), 'aria-pressed': String(!days.length), onclick: () => { days = []; renderAlarmForm(); } }, 'كل يوم'));
    // Saturday … Friday, the Moroccan week
    for (const d of [6, 0, 1, 2, 3, 4, 5]) {
      const on = days.includes(d);
      box.append(el('button', { type: 'button', class: 'wheel-chip alm-day' + (on ? ' is-on' : ''), 'aria-pressed': String(on), 'aria-label': daysAr([d]), onclick: () => { days = on ? days.filter((x) => x !== d) : days.concat(d).sort(); if (days.length === 7) days = []; renderAlarmForm(); } }, DAY_SHORT[d]));
    }
  }
  function renderAlarms(force) {
    const w = wall();
    const key = alarms.map((a) => a.id + a.time + a.on + a.days + a.label + (alarmRinging(a, w) && a.ringDay === w.day ? 'r' : '') + (a.doneDay === w.day ? 'd' : '')).join('|');
    if (!force && key === alarmsKey) return;
    alarmsKey = key;
    const ul = $('almList');
    ul.textContent = '';
    for (const a of alarms) {
      const ringing = alarmRinging(a, w) && a.ringDay === w.day;
      const doneToday = a.doneDay === w.day && (!a.days.length || a.days.includes(w.wd));
      const sw = el('input', { type: 'checkbox', 'aria-label': 'تشغيل المنبّه ' + a.label });
      sw.checked = a.on;
      sw.addEventListener('change', () => alarmOp({ op: 'update', id: a.id, on: sw.checked }, sw.checked ? 'المنبّه يعمل.' : 'أُوقف المنبّه.'));
      const actions = ringing
        ? [el('button', { type: 'button', class: 'primary small', onclick: () => alarmOp({ op: 'done', id: a.id, day: w.day }) }, 'إيقاف'),
          ...SNOOZES.map((m) => el('button', { type: 'button', class: 'ghost small', onclick: async () => {
            if (await alarmOp({ op: 'done', id: a.id, day: w.day })) await op({ op: 'add', minutes: m, label: a.label, by: me() || '' }, 'يرنّ مرة أخرى بعد ' + minutesAr(m) + '.');
          } }, 'غفوة ' + m))]
        : [el('button', { type: 'button', class: 'ghost small tmr-cancel', 'aria-label': 'حذف ' + a.label, onclick: () => { if (confirm('حذف المنبّه «' + a.label + '»؟')) alarmOp({ op: 'remove', id: a.id }, 'حُذف المنبّه.'); } }, 'حذف')];
      ul.append(el('li', { class: 'tmr-item alm-item' + (ringing ? ' is-ringing' : a.on ? '' : ' is-paused') },
        el('div', { class: 'tmr-top' },
          el('span', { class: 'tmr-name' }, a.label, el('small', null, ' · ' + daysAr(a.days) + (a.by ? ' · ' + a.by : '') + (doneToday ? ' · تمّ اليوم ✓' : ''))),
          el('bdi', { class: 'tmr-time', dir: 'ltr' }, ringing ? 'يرنّ الآن' : a.time)),
        el('div', { class: 'tmr-actions' }, el('label', { class: 'switch alm-switch' }, sw, el('span', null, a.on ? 'يعمل' : 'متوقف')), ...actions)));
    }
    ul.hidden = !alarms.length;
  }
  $('almForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const label = $('almLabel').value.trim();
    const time = $('almTime').value;
    if (!label) { toast('اكتب ما يذكّر به المنبّه.'); return; }
    if (await alarmOp({ op: 'add', label, time, days, by: me() || '' }, 'سيرنّ «' + label + '» على الإطار ' + daysAr(days) + ' على الساعة ' + time + '.')) {
      $('almLabel').value = '';
      days = [];
      renderAlarmForm();
    }
  });
  renderAlarmForm();
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
    const w = wall();
    const alRing = alarms.find((a) => alarmRinging(a, w) && a.ringDay === w.day);
    const hm = String(Math.floor(w.minutes / 60)).padStart(2, '0') + ':' + String(w.minutes % 60).padStart(2, '0');
    const nextAl = alarms.filter((a) => a.on && a.doneDay !== w.day && (!a.days.length || a.days.includes(w.wd)) && a.time > hm)[0];
    sub.textContent = alRing ? '«' + alRing.label + '» يرنّ الآن' : ring ? '«' + timerName(ring) + '» يرنّ الآن'
      : first ? timerName(first) + ' · ' + fmtTimer(timerLeft(first, t)) + (items.length > 1 ? ' · و' + (items.length - 1) + ' غيره' : '')
        : nextAl ? 'منبّه ' + nextAl.time + ' · ' + nextAl.label : 'يرنّ في البيت بصوت عالٍ';
    $('homeTimers').classList.toggle('is-running', !!first || !!ring || !!alRing);
    renderAlarms();
  }

  renderPicker();
  load();
  setInterval(() => { if (visible || onHome) render(); }, 1000);
  setInterval(() => { if ((visible || onHome) && document.visibilityState === 'visible') load(); }, visible ? 5000 : 5000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') load(); });
  if (DEMO) window.addEventListener('storage', (e) => { if (e.key === 'fd:demo-timers' || e.key === 'fd:demo-alarms') load(); });
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
