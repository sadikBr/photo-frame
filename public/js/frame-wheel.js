// «عجلة الحظ» on the frame: a big zellige-coloured wheel. Tap «أدِر» (or the hub) and it spins
// with a clicking sound; the server picks the result, so a spin from a phone and one on the frame
// are equally fair, and a spin from a phone plays here too, live.
import { h } from './util.js';
import { frameFetch, DEMO } from './data.js';
import * as demo from './demo.js';
import { wheelSvg, landingAngle, choiceAt } from './fun-common.js';
import { tick, fanfare, unlockAudio } from './sound.js';

const SIZE = 600;
const POINTER = '<svg width="58" height="70" viewBox="0 0 58 70" aria-hidden="true"><path d="M29 68L4 18A26 26 0 1 1 54 18z" fill="#F3EDE2" stroke="#241707" stroke-width="4"/><circle cx="29" cy="24" r="9" fill="#E8657A"/></svg>';

export function createWheel({ stage, onChange }) {
  let wheels = [];
  let cur = null; // the wheel shown
  let items = []; // its choices as drawn
  let rot = 0, vel = 0, raf = 0, lastIdx = -1;
  let mode = null; // null (closed) | 'pick' | 'spin' | 'land' | 'done'
  let awaiting = null; // a spin asked for here, waiting for the server's pick
  let closeTimer = 0, playing = null;
  const mine = new Set(); // spins made here (they come back on the live connection too)

  const rotor = h('div', { class: 'fw-rotor' });
  const hub = h('button', { class: 'fw-hub', type: 'button', 'aria-label': 'أدِر العجلة' }, 'أدِر');
  const wheelBox = h('div', { class: 'fw-wheel' }, rotor, h('div', { class: 'fw-pointer', html: POINTER }), hub);
  const title = h('div', { class: 'fun-title' });
  const sub = h('div', { class: 'fun-sub' });
  const chips = h('div', { class: 'fw-chips' });
  const result = h('div', { class: 'fw-result', hidden: true });
  const spinBtn = h('button', { class: 'fun-btn', type: 'button' }, 'أدِر العجلة');
  const closeBtn = h('button', { class: 'fun-close', type: 'button', 'aria-label': 'إغلاق' }, '×');
  const confetti = h('div', { class: 'fw-confetti' });
  const modal = h('div', { class: 'fun-modal fw', hidden: true },
    h('div', { class: 'fun-scrim' }),
    h('div', { class: 'fw-panel' }, wheelBox, h('div', { class: 'fw-side' }, title, sub, chips, result, spinBtn)),
    confetti, closeBtn);
  stage.append(modal);

  // ---------- drawing ----------
  function setRot(a) {
    rot = a;
    rotor.style.transform = 'rotate(' + a.toFixed(2) + 'deg)';
    const i = choiceAt(a, items.length);
    if (i !== lastIdx) { if (lastIdx >= 0 && mode !== 'pick' && mode !== 'done') tick(); lastIdx = i; }
  }
  function show(w, list) {
    cur = w;
    items = list || w.items;
    rotor.innerHTML = wheelSvg(items, SIZE);
    lastIdx = -1;
    setRot(rot % 360);
    title.textContent = w.name;
  }
  function renderChips() {
    chips.textContent = '';
    if (wheels.length < 2 || mode === 'play') return;
    for (const w of wheels) {
      const b = h('button', { class: 'fw-chip' + (cur && w.id === cur.id ? ' is-on' : ''), type: 'button' }, w.name);
      b.addEventListener('click', () => { if (mode === 'spin' || mode === 'land') return; show(w); result.hidden = true; mode = 'pick'; sub.textContent = 'اضغط «أدِر» لتدور العجلة.'; renderChips(); armClose(40000); });
      chips.appendChild(b);
    }
  }

  // ---------- spinning ----------
  function freeSpin() {
    cancelAnimationFrame(raf);
    let last = performance.now();
    vel = 0;
    const step = (t) => {
      const dt = (t - last) / 1000;
      last = t;
      vel = Math.min(620, vel + 1400 * dt); // speeds up to ~1.7 turns a second
      setRot(rot + vel * dt);
      if (mode === 'spin') raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }
  // Slow down from the current speed to stop on choice idx.
  function land(idx) {
    cancelAnimationFrame(raf);
    mode = 'land';
    const n = items.length;
    const target = landingAngle(idx, n, (Math.random() - 0.5) * 1.0);
    const base = ((target - rot) % 360 + 360) % 360;
    const D = base + 360 * (vel > 200 ? 3 : 4);
    const v0 = Math.max(vel, 300);
    const dur = Math.min(7000, Math.max(3800, (4 * D / v0) * 1000));
    const start = rot, t0 = performance.now();
    return new Promise((done) => {
      const step = (t) => {
        const u = Math.min(1, (t - t0) / dur);
        setRot(start + D * (1 - Math.pow(1 - u, 4)));
        if (u < 1) raf = requestAnimationFrame(step); else { vel = 0; done(); }
      };
      raf = requestAnimationFrame(step);
    });
  }
  function celebrate(text, by) {
    mode = 'done';
    result.hidden = false;
    result.textContent = '';
    result.append(h('div', { class: 'fw-result-label' }, 'النتيجة'), h('div', { class: 'fw-result-text' }, text));
    if (by) result.append(h('div', { class: 'fw-result-by' }, by));
    result.animate([{ transform: 'scale(.6)', opacity: 0 }, { transform: 'scale(1.06)', opacity: 1, offset: 0.7 }, { transform: 'scale(1)' }], { duration: 600, easing: 'cubic-bezier(.2,.9,.3,1.3)' });
    fanfare();
    confetti.textContent = '';
    const cols = ['#F2AE3D', '#E8657A', '#7FD3B5', '#9DB9F5', '#F3EDE2'];
    for (let i = 0; i < 60; i++) {
      const p = h('i');
      p.style.cssText = 'left:' + (300 + Math.random() * 680).toFixed(0) + 'px;background:' + cols[i % 5];
      confetti.appendChild(p);
      p.animate([{ transform: 'translate(0,0) rotate(0)', opacity: 1 }, { transform: 'translate(' + ((Math.random() - 0.5) * 300).toFixed(0) + 'px,' + (600 + Math.random() * 300).toFixed(0) + 'px) rotate(' + (Math.random() * 720).toFixed(0) + 'deg)', opacity: 0.4 }],
        { duration: 2200 + Math.random() * 1600, delay: Math.random() * 500, easing: 'cubic-bezier(.3,.4,.6,1)', fill: 'both' });
    }
  }

  // A spin asked for on the frame.
  async function spinHere() {
    if (!cur || mode === 'spin' || mode === 'land') return;
    unlockAudio();
    result.hidden = true;
    mode = 'spin';
    sub.textContent = 'تدور…';
    spinBtn.disabled = true;
    freeSpin();
    clearTimeout(closeTimer);
    const id = cur.id;
    awaiting = id;
    let p = null;
    try {
      p = DEMO ? demo.spin(id).pulse : (await frameFetch('/api/pulse/spin', 'POST', { wheel: id })).pulse;
    } catch (e) {
      awaiting = null;
      cancelAnimationFrame(raf);
      mode = 'pick';
      sub.textContent = 'تعذّر الاتصال. حاول مرة أخرى.';
      spinBtn.disabled = false;
      return;
    }
    landOn(p);
  }
  async function landOn(p) {
    mine.add(p.id);
    if (!awaiting) return; // already landing (the live connection was first)
    awaiting = null;
    if (p.items && p.items.join('|') !== items.join('|')) show(cur, p.items); // edited meanwhile
    await land(p.idx);
    celebrate(p.result);
    sub.textContent = '';
    spinBtn.disabled = false;
    spinBtn.textContent = 'أدِر مرة أخرى';
    armClose(30000);
  }

  function open(wheelId) {
    if (!wheels.length) return;
    unlockAudio();
    const w = wheels.find((x) => x.id === wheelId) || (cur && wheels.find((x) => x.id === cur.id)) || wheels[0];
    show(w);
    mode = 'pick';
    modal.hidden = false;
    result.hidden = true;
    sub.textContent = 'اضغط «أدِر» لتدور العجلة.';
    spinBtn.hidden = false;
    spinBtn.disabled = false;
    spinBtn.textContent = 'أدِر العجلة';
    renderChips();
    modal.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300 });
    armClose(40000);
  }
  function close() {
    if (mode === 'spin' || mode === 'land') return;
    cancelAnimationFrame(raf);
    clearTimeout(closeTimer);
    modal.hidden = true;
    confetti.textContent = '';
    mode = null;
    if (playing) { const p = playing; playing = null; p(); }
  }
  function armClose(ms) { clearTimeout(closeTimer); closeTimer = setTimeout(close, ms); }
  spinBtn.addEventListener('click', spinHere);
  hub.addEventListener('click', spinHere);
  closeBtn.addEventListener('click', close);
  modal.querySelector('.fun-scrim').addEventListener('click', close);
  modal.addEventListener('pointerdown', () => { if (mode === 'pick' || mode === 'done') armClose(mode === 'done' ? 30000 : 40000); });

  // A spin from a phone (a moment in the queue): show it turning and where it stops.
  async function play(p) {
    const w = { id: p.wheel, name: p.wheelName };
    show(w, p.items);
    mode = 'play';
    modal.hidden = false;
    result.hidden = true;
    chips.textContent = '';
    spinBtn.hidden = true;
    sub.textContent = 'تدور من هاتف ' + p.from + '…';
    modal.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300 });
    await new Promise((ok) => setTimeout(ok, 700));
    vel = 0;
    await land(p.idx);
    celebrate(p.result, 'من ' + p.from);
    sub.textContent = '';
    mode = 'done';
    await new Promise((ok) => { playing = ok; closeTimer = setTimeout(close, 9000); });
    spinBtn.hidden = false;
  }

  // ---------- the list of wheels ----------
  function setWheels(list) {
    wheels = Array.isArray(list) ? list : [];
    if (cur && mode === 'pick') { const w = wheels.find((x) => x.id === cur.id); if (w) show(w); else if (wheels[0]) show(wheels[0]); else close(); }
    renderChips();
    if (onChange) onChange(wheels.length);
  }
  async function load() {
    try { setWheels(DEMO ? demo.wheels() : (await frameFetch('/api/pulse/wheels')).wheels); } catch (e) { /* next time */ }
  }
  load();
  setInterval(load, 10 * 60000);
  if (DEMO) window.addEventListener('storage', (e) => { if (e.key === 'fd:demo-wheels') load(); });

  return {
    open, play,
    busy: () => mode !== null,
    count: () => wheels.length,
    // Our own spin coming back on the live connection before the HTTP answer: land on it.
    claim(p) {
      if (mine.has(p.id)) return true;
      if (!awaiting || p.wheel !== awaiting || p.from !== 'البيت') return false;
      landOn(p);
      return true;
    },
    socket(m) { if (m.type === 'wheels') setWheels(m.wheels); },
  };
}
