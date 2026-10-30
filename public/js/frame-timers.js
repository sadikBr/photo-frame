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
// Timers live in this browser (localStorage), so a reload or a power cut keeps them; one that
// ended while the frame was off rings when it comes back, if it ended less than 30 minutes ago.
import { h, store } from './util.js';

const PRESETS = [1, 3, 5, 10, 15, 20, 30, 45, 60];
const LABELS = ['أتاي', 'الطبخ', 'الفرن', 'الخبز', 'الغسيل', 'الأطفال'];
const MAX_TIMERS = 6;
const RING_FOR = 10 * 60000; // the sound stops by itself after this (the card stays)
const STALE = 30 * 60000; // a timer that ended longer ago than this (frame off) is dropped
const MIN = 60000;

export const TIMER_ICON = (s) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13.5" r="8"/><path d="M12 9.5v4l2.6 1.6M9.5 2.5h5M12 2.5v3M19 6.2l1.4-1.4"/></svg>`;
const BELL = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.6 2H4.4z"/><path d="M10 21a2 2 0 0 0 4 0"/><path d="M2.5 8.5A9.5 9.5 0 0 1 5 4M21.5 8.5A9.5 9.5 0 0 0 19 4"/></svg>`;

// "4:05", "12:30", "1:05:00" (left to right, with Western digits like the clock).
export function fmt(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
  const p2 = (n) => String(n).padStart(2, '0');
  return hh ? hh + ':' + p2(mm) + ':' + p2(ss) : mm + ':' + p2(ss);
}
const minutesAr = (m) => (m === 1 ? 'دقيقة' : m === 2 ? 'دقيقتان' : m <= 10 ? m + ' دقائق' : m + ' دقيقة');

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
  const valid = (x) => x && typeof x.id === 'string' && x.total > 0 && (x.end > 0 || x.left > 0);
  let timers = (store.get('timers', []) || []).filter(valid);
  timers = timers.filter((x) => !(x.end && Date.now() - x.end > STALE));
  let seq = Date.now();
  const save = () => store.set('timers', timers.map(({ id, label, total, end, left, snoozed }) => ({ id, label, total, end, left, snoozed })));
  const remaining = (x, t) => (x.end ? x.end - t : x.left);
  const ended = (x, t) => !!x.end && x.end <= t;

  // ----- the panel -----
  const list = h('div', { class: 'tm-list' });
  const chips = h('div', { class: 'tm-labels' });
  const presets = h('div', { class: 'tm-presets' });
  const customVal = h('bdi', { class: 'tm-custom-val' });
  const customBox = h('div', { class: 'tm-custom' });
  const full = h('div', { class: 'tm-full', hidden: true }, 'يكفي ' + MAX_TIMERS + ' مؤقّتات في وقت واحد. أوقفوا واحداً أولاً.');
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
      full),
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
  const stopBtn = h('button', { type: 'button', class: 'tm-ring-stop' }, 'إيقاف');
  // Snooze: ring again in 1, 5 or 10 minutes.
  const snoozeBtns = [1, 5, 10].map((m) => {
    const b = h('button', { type: 'button', class: 'tm-ring-snooze' }, h('bdi', null, String(m)), ' ', m === 1 ? 'دقيقة' : m === 10 ? 'دقائق' : 'دقائق');
    b.addEventListener('click', (e) => { e.stopPropagation(); snooze(m * MIN); });
    return b;
  });
  const ring = h('div', { class: 'tm-ring', hidden: true, role: 'alertdialog', 'aria-label': 'انتهى المؤقّت' },
    h('div', { class: 'tm-ring-flash' }),
    h('div', { class: 'tm-ring-card' },
      h('div', { class: 'tm-ring-bell', html: BELL }),
      h('div', { class: 'tm-ring-title' }, 'انتهى الوقت!'),
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
    draw(Date.now(), true);
    modal.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220 });
    poke();
  }
  function close() { open = false; modal.hidden = true; clearTimeout(closeTimer); }
  function poke() { clearTimeout(closeTimer); closeTimer = setTimeout(close, 90000); }
  closeBtn.addEventListener('click', close);
  modal.querySelector('.fun-scrim').addEventListener('click', close);

  function add(minutes) {
    alarm.unlock();
    if (timers.length >= MAX_TIMERS) { full.hidden = false; poke(); return; }
    const t = Date.now();
    timers.push({ id: 't' + (seq++).toString(36), label, total: minutes * MIN, end: t + minutes * MIN, left: 0 });
    save();
    label = '';
    drawChips();
    close();
    draw(t, true);
  }
  function remove(id) { timers = timers.filter((x) => x.id !== id); save(); draw(Date.now(), true); }
  function addTime(id, ms) {
    const t = Date.now();
    const x = timers.find((y) => y.id === id);
    if (!x) return;
    if (x.end) x.end = Math.max(x.end, t) + ms; else x.left += ms;
    x.total = Math.max(x.total, remaining(x, t));
    save();
    draw(t, true);
  }
  function pauseToggle(id) {
    const t = Date.now();
    const x = timers.find((y) => y.id === id);
    if (!x || ended(x, t)) return;
    if (x.end) { x.left = x.end - t; x.end = 0; } else { x.end = t + x.left; x.left = 0; }
    save();
    draw(t, true);
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
      p.querySelector('.tm-pill-name').textContent = (x.snoozed ? 'غفوة · ' : '') + (x.label || (x.total / MIN >= 1 ? minutesAr(Math.round(x.total / MIN)) : 'مؤقّت'));
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
          pause.addEventListener('click', () => { pauseToggle(x.id); poke(); });
          const more = h('button', { type: 'button', class: 'tm-row-btn' }, '+ دقيقة');
          more.addEventListener('click', () => { addTime(x.id, MIN); poke(); });
          const del = h('button', { type: 'button', class: 'tm-row-del', 'aria-label': 'إلغاء المؤقّت' }, '×');
          del.addEventListener('click', () => { remove(x.id); poke(); });
          list.append(h('div', { class: 'tm-row' + (x.end ? '' : ' is-paused'), 'data-id': x.id },
            h('span', { class: 'tm-row-name' }, x.label || minutesAr(Math.round(x.total / MIN))),
            h('bdi', { class: 'tm-row-time', dir: 'ltr' }),
            more, pause, del));
        }
      }
      for (const row of list.children) {
        const x = running.find((y) => y.id === row.dataset.id);
        if (x) row.querySelector('.tm-row-time').textContent = fmt(remaining(x, t));
      }
      list.hidden = !running.length;
    }
    // The ringing card.
    ring.hidden = !ringing.length;
    if (ringing.length) {
      const names = ringing.map((x) => x.label || minutesAr(Math.round(x.total / MIN))).join(' · ');
      if (ringNames.textContent !== names) ringNames.textContent = names;
      const since = t - Math.min(...ringing.map((x) => x.end));
      ringSince.textContent = since < 5000 ? '' : 'منذ ' + fmt(since);
    }
  }

  function stopRinging() {
    const t = Date.now();
    timers = timers.filter((x) => !ended(x, t));
    save();
    alarm.stop();
    draw(t, true);
  }
  function snooze(ms) {
    const t = Date.now();
    for (const x of timers) if (ended(x, t)) { x.end = t + ms; x.total = ms; x.snoozed = true; }
    save();
    alarm.stop();
    draw(t, true);
  }
  stopBtn.addEventListener('click', (e) => { e.stopPropagation(); stopRinging(); });
  // A tap anywhere else on the card also silences it (someone ran to the kitchen).
  ring.addEventListener('click', () => stopRinging());
  tab.addEventListener('click', () => { alarm.unlock(); show(); });
  stage.addEventListener('pointerdown', () => alarm.unlock(), { capture: true });

  function tick() {
    const t = Date.now();
    const ringing = timers.filter((x) => ended(x, t));
    draw(t, false);
    if (!ringing.length) { if (alarm.playing()) alarm.stop(); return; }
    wake(); // keeps a dimmed or dark screen lit while it rings
    const since = t - Math.min(...ringing.map((x) => x.end));
    if (since > RING_FOR || held()) alarm.stop(); else alarm.start();
  }
  draw(Date.now(), true);

  return {
    open: show,
    ringEl: ring,
    tick,
    busy: () => open || timers.some((x) => ended(x, Date.now())),
    ringing: () => timers.some((x) => ended(x, Date.now())),
    // For the preview page: a timer of a few seconds.
    demo(seconds, name) { const t = Date.now(); timers.push({ id: 't' + (seq++).toString(36), label: name || '', total: seconds * 1000, end: t + seconds * 1000, left: 0 }); save(); draw(t, true); },
  };
}
