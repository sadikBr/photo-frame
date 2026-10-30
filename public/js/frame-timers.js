// «المؤقّت»: kitchen timers on the frame. A tab (and a tap on the clock) opens a panel with big
// presets (1–60 minutes), a custom time and an optional name (أتاي، الطبخ…). Running timers show
// as small pills in a corner of every screen (in the original look, in the tab itself). When one
// ends, a full-screen card flashes over everything, wakes a dimmed or dark screen, and a loud
// alarm rings until someone taps «إيقاف» (or after 10 minutes), or «غفوة» 1, 5 or 10 minutes.
//
// The alarm is made for being heard from another room: a two-tone square-wave beep (2–2.6 kHz,
// where small speakers are loudest and the ear most sensitive) at full scale, played through an
// <audio> element at volume 1. If the kiosk app has the volume bridge (ScreenControl.java,
// window.HomeHQ.alarmVolume), the frame's media volume is also raised to the maximum while it
// rings and put back afterwards. During the adhan the alarm waits (the card shows at once).
//
// Daily alarms («منبّه يومي», set in the control panel: the pill at 21:00) ring on the same card when
// the frame's clock reaches their time; «إيقاف» marks them done for the day, «غفوة» turns them
// into a short timer.
//
// The timers live on the server (PulseHub), so the control panel can start, see and stop them
// too: every change goes there and comes back to the frame at once over its live connection.
// If the frame can't reach the server, a timer started on it still runs here on its own. A copy
// is kept in this browser, so a reload or a power cut keeps them.
import { h, store, now, parts, dayKey } from './util.js';
import { frameFetch, DEMO } from './data.js';
import * as demo from './demo.js';
import { timerOp, cleanTimers, timerEnded, timerLeft, fmtTimer as fmt, minutesAr, timerName, MAX_TIMERS, TIMER_LABELS as LABELS, TIMER_PRESETS as PRESETS, SNOOZES, cleanAlarms, alarmRinging, daysAr } from './timers-common.js';

const RING_FOR = 10 * 60000; // the sound stops by itself after this (the card stays)
const MIN = 60000;

export const TIMER_ICON = (s) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13.5" r="8"/><path d="M12 9.5v4l2.6 1.6M9.5 2.5h5M12 2.5v3M19 6.2l1.4-1.4"/></svg>`;
const BELL = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.6 2H4.4z"/><path d="M10 21a2 2 0 0 0 4 0"/><path d="M2.5 8.5A9.5 9.5 0 0 1 5 4M21.5 8.5A9.5 9.5 0 0 0 19 4"/></svg>`;

export { fmt };

// ---------- the alarm sound ----------
// One 1.4 s loop: four short beeps alternating 2000 / 2600 Hz, then a pause. A square wave at
// full scale is as loud as a digital signal gets; 5 ms ramps keep the speaker from clicking.
function alarmWav() {
  const rate = 22050, len = Math.round(rate * 1.4);
  const data = new Int16Array(len);
  const beeps = [[0, 2000], [0.18, 2600], [0.36, 2000], [0.54, 2600]];
  const on = 0.13, ramp = Math.round(rate * 0.005);
  for (const [at, f] of beeps) {
    const s0 = Math.round(at * rate), n = Math.round(on * rate);
    for (let i = 0; i < n; i++) {
      const ph = ((i * f) / rate) % 1;
      const env = Math.min(1, i / ramp, (n - i) / ramp);
      data[s0 + i] = Math.round((ph < 0.5 ? 1 : -1) * 0.97 * env * 32767);
    }
  }
  const buf = new ArrayBuffer(44 + len * 2);
  const v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + len * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, len * 2, true);
  new Int16Array(buf, 44).set(data);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

function createAlarm() {
  let audio = null, unlocked = false, loud = false;
  function el() {
    if (!audio) { audio = new Audio(alarmWav()); audio.loop = true; audio.preload = 'auto'; }
    return audio;
  }
  const bridge = () => (typeof window !== 'undefined' && window.HomeHQ && typeof window.HomeHQ.alarmVolume === 'function' ? window.HomeHQ : null);
  return {
    // Browsers only let sound start after a touch: play silently once on the first touch.
    unlock() {
      if (unlocked) return;
      const a = el();
      a.muted = true;
      const p = a.play();
      const done = () => { a.pause(); a.currentTime = 0; a.muted = false; };
      if (p && p.then) p.then(() => { unlocked = true; done(); }, done); else { unlocked = true; done(); }
    },
    start() {
      const a = el();
      a.muted = false;
      a.volume = 1;
      if (!a.paused) return;
      const b = bridge();
      if (b && !loud) { try { b.alarmVolume(true); loud = true; } catch (e) { /* old app */ } }
      a.currentTime = 0;
      const p = a.play();
      if (p && p.catch) p.catch(() => { /* blocked until a touch; the card still flashes */ });
    },
    stop() {
      if (audio && !audio.paused) { audio.pause(); audio.currentTime = 0; }
      if (loud) { loud = false; const b = bridge(); if (b) { try { b.alarmVolume(false); } catch (e) { /* ignore */ } } }
    },
    playing: () => !!audio && !audio.paused,
  };
}

// ---------- timers ----------
export function createTimers({ stage, tab, wake, held }) {
  const alarm = createAlarm();
  // The server's list, plus any started here while the server couldn't be reached (local: true).
  let timers = cleanTimers(store.get('timers', []), now());
  const save = () => store.set('timers', timers);
  const ended = (x, t) => timerEnded(x, t);
  const remaining = (x, t) => timerLeft(x, t);

  // Daily alarms: the server's list; done-for-today kept here too in case the server can't be told.
  let alarms = cleanAlarms(store.get('alarms', []));
  const localDone = store.get('alarms-done', {}) || {};
  const told = {}; // id → the day the server was told it rings
  const wall = (t) => { const p = parts(t); return { day: dayKey(t), wd: p.wd, minutes: p.h * 60 + p.mi }; };
  const ringingAlarms = (t) => { const w = wall(t); return alarms.filter((a) => alarmRinging(a, w) && localDone[a.id] !== w.day); };
  // When today's ring began (for «منذ …» and the 10 minutes of sound).
  const alarmStart = (a, t) => { const [hh, mm] = a.time.split(':').map(Number); const w = wall(t); return t - ((w.minutes - (hh * 60 + mm)) * 60000) - (parts(t).s * 1000); };
  function alarmsFromServer(list) { alarms = cleanAlarms(list); store.set('alarms', alarms); draw(now(), true); }
  async function alarmOpSend(body) {
    try { const r = DEMO ? demo.alarmOp(body) : await frameFetch('/api/pulse/alarms', 'POST', body); alarmsFromServer(r.alarms); return true; } catch (e) { return false; }
  }

  function fromServer(list) {
    const t = now();
    const local = timers.filter((x) => x.local);
    timers = cleanTimers((list || []).concat(local), t);
    save();
    draw(t, true);
  }
  async function load() {
    try {
      if (DEMO) fromServer(demo.timers());
      else fromServer((await frameFetch('/api/pulse/timers')).timers);
    } catch (e) { /* offline: keep what we have */ }
    try { alarmsFromServer(DEMO ? demo.alarms() : (await frameFetch('/api/pulse/alarms')).alarms); } catch (e) { /* offline */ }
  }
  // Every change: at once here, then on the server (which tells the phones and sends the list back).
  async function op(body) {
    const t = now();
    const target = body.id && timers.find((x) => x.id === body.id);
    const r = timerOp(timers, body, t);
    if (r.error) return r;
    timers = r.list;
    save();
    draw(t, true);
    if (target && target.local) return r; // only here
    try {
      const res = DEMO ? demo.timerOp(body) : await frameFetch('/api/pulse/timers', 'POST', body);
      fromServer(res.timers);
    } catch (e) {
      // No server: a new timer goes on here alone; other changes wait for the next load.
      if (body.op === 'add' && r.timer) { r.timer.local = true; save(); }
    }
    return r;
  }

  // ----- the panel -----
  const list = h('div', { class: 'tm-list' });
  const chips = h('div', { class: 'tm-labels' });
  const presets = h('div', { class: 'tm-presets' });
  const customVal = h('bdi', { class: 'tm-custom-val' });
  const customBox = h('div', { class: 'tm-custom' });
  const full = h('div', { class: 'tm-full', hidden: true }, 'يكفي ' + MAX_TIMERS + ' مؤقّتات في وقت واحد. أوقفوا واحداً أولاً.');
  const alarmLine = h('div', { class: 'tm-alarms', hidden: true });
  const closeBtn = h('button', { class: 'fun-close', type: 'button', 'aria-label': 'إغلاق' }, '×');
  const modal = h('div', { class: 'fun-modal tm', hidden: true },
    h('div', { class: 'fun-scrim' }),
    h('div', { class: 'tm-panel' },
      h('div', { class: 'tm-head' },
        h('span', { class: 'tm-head-icon', html: TIMER_ICON(46) }),
        h('div', null, h('div', { class: 'fun-title' }, 'مؤقّت'), h('div', { class: 'fun-sub' }, 'اختاروا المدة. حين ينتهي يرنّ الإطار بصوت عالٍ.'))),
      list,
      h('div', { class: 'tm-step' }, h('span', { class: 'tm-step-n' }, '1'), 'لماذا؟ (اختياري)'),
      chips,
      h('div', { class: 'tm-step' }, h('span', { class: 'tm-step-n' }, '2'), 'المسوا المدة ليبدأ'),
      presets,
      customBox,
      full,
      alarmLine),
    closeBtn);

  let label = '';
  for (const l of LABELS) {
    const b = h('button', { type: 'button', class: 'tm-chip', 'aria-pressed': 'false' }, l);
    b.addEventListener('click', () => { label = label === l ? '' : l; drawChips(); poke(); });
    chips.append(b);
  }
  function drawChips() { for (const b of chips.children) b.setAttribute('aria-pressed', String(b.textContent === label)); }
  for (const m of PRESETS) {
    const b = h('button', { type: 'button', class: 'tm-preset' }, h('bdi', { class: 'tm-preset-n' }, String(m)), h('span', { class: 'tm-preset-u' }, m === 1 ? 'دقيقة' : m <= 10 ? 'دقائق' : 'دقيقة'));
    b.addEventListener('click', () => add(m));
    presets.append(b);
  }
  let custom = 25;
  const step = (d) => { custom = Math.max(1, Math.min(240, custom + d)); drawCustom(); poke(); };
  const stepBtn = (txt, d) => { const b = h('button', { type: 'button', class: 'tm-stepper' }, txt); b.addEventListener('click', () => step(d)); return b; };
  const goBtn = h('button', { type: 'button', class: 'fun-btn tm-go' }, 'ابدأ');
  goBtn.addEventListener('click', () => add(custom));
  customBox.append(h('span', { class: 'tm-custom-label' }, 'مدة أخرى'), stepBtn('−5', -5), stepBtn('−1', -1), customVal, stepBtn('+1', 1), stepBtn('+5', 5), goBtn);
  function drawCustom() { customVal.textContent = minutesAr(custom); }
  drawCustom();
  stage.append(modal);

  // ----- the pills (themes) and the ringing card -----
  const pills = h('div', { class: 'tm-pills', hidden: true });
  stage.append(pills);
  const ringNames = h('div', { class: 'tm-ring-names' });
  const ringSince = h('div', { class: 'tm-ring-since' });
  const ringTitle = h('div', { class: 'tm-ring-title' }, 'انتهى الوقت!');
  const stopBtn = h('button', { type: 'button', class: 'tm-ring-stop' }, 'إيقاف');
  // Snooze: ring again in 1, 5 or 10 minutes.
  const snoozeBtns = SNOOZES.map((m) => {
    const b = h('button', { type: 'button', class: 'tm-ring-snooze' }, h('bdi', null, String(m)), ' ', m === 1 ? 'دقيقة' : 'دقائق');
    b.addEventListener('click', (e) => { e.stopPropagation(); snooze(m); });
    return b;
  });
  const ring = h('div', { class: 'tm-ring', hidden: true, role: 'alertdialog', 'aria-label': 'انتهى المؤقّت' },
    h('div', { class: 'tm-ring-flash' }),
    h('div', { class: 'tm-ring-card' },
      h('div', { class: 'tm-ring-bell', html: BELL }),
      ringTitle,
      ringNames,
      ringSince,
      h('div', { class: 'tm-ring-actions' }, stopBtn,
        h('div', { class: 'tm-ring-snoozes' }, h('span', { class: 'tm-ring-snooze-label' }, 'غفوة'), ...snoozeBtns))));
  // (appended by main.js after the night layer, so it shows over a dimmed or dark screen)

  let open = false, closeTimer = 0;
  function show() {
    open = true;
    modal.hidden = false;
    full.hidden = timers.length < MAX_TIMERS;
    draw(now(), true);
    modal.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220 });
    poke();
  }
  function close() { open = false; modal.hidden = true; clearTimeout(closeTimer); }
  function poke() { clearTimeout(closeTimer); closeTimer = setTimeout(close, 90000); }
  closeBtn.addEventListener('click', close);
  modal.querySelector('.fun-scrim').addEventListener('click', close);

  async function add(minutes) {
    alarm.unlock();
    if (timers.length >= MAX_TIMERS) { full.hidden = false; poke(); return; }
    const l = label;
    label = '';
    drawChips();
    close();
    await op({ op: 'add', minutes, label: l });
  }

  // ----- drawing (once a second) -----
  let listKey = '';
  function draw(t, force) {
    const running = timers.filter((x) => !ended(x, t)).sort((a, b) => remaining(a, t) - remaining(b, t));
    const ringing = timers.filter((x) => ended(x, t));
    // The tab: «مؤقّت», or the soonest one counting down.
    const first = running[0];
    tab.classList.toggle('is-running', !!first);
    const tabText = tab.querySelector('.tm-tab-text');
    if (tabText) tabText.textContent = first ? fmt(remaining(first, t)) : 'مؤقّت';
    // Pills in the corner (the themes; the original look shows the tab instead).
    pills.hidden = !running.length;
    const want = running.slice(0, 3);
    while (pills.children.length > want.length) pills.lastChild.remove();
    while (pills.children.length < want.length) {
      const p = h('button', { type: 'button', class: 'tm-pill' },
        h('span', { class: 'tm-pill-icon', html: TIMER_ICON(22) }), h('span', { class: 'tm-pill-name' }), h('bdi', { class: 'tm-pill-time', dir: 'ltr' }),
        h('span', { class: 'tm-pill-bar' }, h('i')));
      p.addEventListener('click', (e) => { e.stopPropagation(); show(); });
      pills.append(p);
    }
    want.forEach((x, i) => {
      const p = pills.children[i];
      p.classList.toggle('is-paused', !x.end);
      p.querySelector('.tm-pill-name').textContent = (x.snoozed ? 'غفوة · ' : '') + timerName(x);
      p.querySelector('.tm-pill-time').textContent = fmt(remaining(x, t)) + (running.length > 3 && i === 2 ? '  +' + (running.length - 3) : '');
      p.querySelector('.tm-pill-bar i').style.transform = 'scaleX(' + Math.max(0, Math.min(1, remaining(x, t) / x.total)).toFixed(4) + ')';
    });
    // The list in the panel.
    if (open) {
      const key = running.map((x) => x.id + (x.end ? '' : 'p')).join(',');
      if (force || key !== listKey) {
        listKey = key;
        list.textContent = '';
        for (const x of running) {
          const pause = h('button', { type: 'button', class: 'tm-row-btn' }, x.end ? 'إيقاف مؤقت' : 'استئناف');
          pause.addEventListener('click', () => { op({ op: x.end ? 'pause' : 'resume', id: x.id }); poke(); });
          const more = h('button', { type: 'button', class: 'tm-row-btn' }, '+ دقيقة');
          more.addEventListener('click', () => { op({ op: 'more', id: x.id, minutes: 1 }); poke(); });
          const del = h('button', { type: 'button', class: 'tm-row-del', 'aria-label': 'إلغاء المؤقّت' }, '×');
          del.addEventListener('click', () => { op({ op: 'cancel', id: x.id }); poke(); });
          list.append(h('div', { class: 'tm-row' + (x.end ? '' : ' is-paused'), 'data-id': x.id },
            h('span', { class: 'tm-row-name' }, (x.snoozed ? 'غفوة · ' : '') + timerName(x), x.by ? h('small', { class: 'tm-row-by' }, ' · من ' + x.by) : null),
            h('bdi', { class: 'tm-row-time', dir: 'ltr' }),
            more, pause, del));
        }
      }
      for (const row of list.children) {
        const x = running.find((y) => y.id === row.dataset.id);
        if (x) row.querySelector('.tm-row-time').textContent = fmt(remaining(x, t));
      }
      list.hidden = !running.length;
      full.hidden = timers.length < MAX_TIMERS;
    }
    // Today's daily alarms, in the panel.
    if (open) {
      const w = wall(t);
      const today = alarms.filter((a) => a.on && (!a.days.length || a.days.includes(w.wd)));
      alarmLine.hidden = !today.length;
      const txt = 'المنبّهات اليوم: ' + today.map((a) => a.time + ' ' + a.label + (a.doneDay === w.day || localDone[a.id] === w.day ? ' ✓' : '')).join(' · ');
      if (alarmLine.textContent !== txt) alarmLine.textContent = txt;
    }
    // The ringing card: timers that ended and daily alarms whose time has come.
    const ringAl = ringingAlarms(t);
    ring.hidden = !ringing.length && !ringAl.length;
    if (!ring.hidden) {
      const names = ringAl.map((a) => a.label).concat(ringing.map(timerName)).join(' · ');
      if (ringNames.textContent !== names) ringNames.textContent = names;
      const title = ringAl.length ? 'حان الوقت!' : 'انتهى الوقت!';
      if (ringTitle.textContent !== title) ringTitle.textContent = title;
      const since = t - Math.min(...ringing.map((x) => x.end), ...ringAl.map((a) => alarmStart(a, t)));
      ringSince.textContent = since < 5000 ? '' : 'منذ ' + fmt(since);
    }
  }

  const ringingIds = () => { const t = now(); return timers.filter((x) => ended(x, t)).map((x) => x.id); };
  // Daily alarms: done for today (here at once, and on the server); a snooze becomes a timer.
  function alarmsDone() {
    const t = now();
    const day = wall(t).day;
    const list = ringingAlarms(t);
    for (const a of list) { localDone[a.id] = day; alarmOpSend({ op: 'done', id: a.id, day }); }
    for (const k of Object.keys(localDone)) if (localDone[k] !== day) delete localDone[k];
    store.set('alarms-done', localDone);
    return list;
  }
  function stopRinging() {
    alarm.stop();
    alarmsDone();
    const ids = ringingIds();
    if (ids.length) op({ op: 'stop', ids });
    draw(now(), true);
  }
  function snooze(m) {
    alarm.stop();
    for (const a of alarmsDone()) op({ op: 'add', minutes: m, label: a.label });
    const ids = ringingIds();
    if (ids.length) op({ op: 'snooze', minutes: m, ids });
    draw(now(), true);
  }
  stopBtn.addEventListener('click', (e) => { e.stopPropagation(); stopRinging(); });
  // A tap anywhere else on the card also silences it (someone ran to the kitchen).
  ring.addEventListener('click', () => stopRinging());
  tab.addEventListener('click', () => { alarm.unlock(); show(); });
  stage.addEventListener('pointerdown', () => alarm.unlock(), { capture: true });

  function tick() {
    const t = now();
    const ringing = timers.filter((x) => ended(x, t));
    const ringAl = ringingAlarms(t);
    draw(t, false);
    if (!ringing.length && !ringAl.length) { if (alarm.playing()) alarm.stop(); return; }
    // A daily alarm that starts ringing: the server tells the phone that set it.
    const day = wall(t).day;
    for (const a of ringAl) if (told[a.id] !== day && a.ringDay !== day) { told[a.id] = day; alarmOpSend({ op: 'ring', id: a.id, day }); }
    wake(); // keeps a dimmed or dark screen lit while it rings
    const since = t - Math.min(...ringing.map((x) => x.end), ...ringAl.map((a) => alarmStart(a, t)));
    if (since > RING_FOR || held()) alarm.stop(); else alarm.start();
  }
  draw(now(), true);
  load();
  setInterval(load, 60000);
  if (DEMO) window.addEventListener('storage', (e) => { if (e.key === 'fd:demo-timers' || e.key === 'fd:demo-alarms') load(); });

  return {
    open: show,
    start: (minutes, label) => op({ op: 'add', minutes, label: label || '' }),
    ringEl: ring,
    tick,
    busy: () => open || timers.some((x) => ended(x, now())) || ringingAlarms(now()).length > 0,
    ringing: () => timers.some((x) => ended(x, now())) || ringingAlarms(now()).length > 0,
    // The server's lists, the moment something changes (from a phone too).
    socket(m) { if (m.type === 'timers') fromServer(m.timers); if (m.type === 'alarms') alarmsFromServer(m.alarms); },
    // For the preview page: a timer of a few seconds.
    demo(seconds, name) { const t = now(); timers.push({ id: 'd' + t.toString(36), label: name || '', by: '', total: seconds * 1000, end: t + seconds * 1000, left: 0, local: true }); save(); draw(t, true); },
  };
}
