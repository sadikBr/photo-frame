// «نبضة» on the frame: moments sent from the family's phones, shown one after the other over
// whatever screen is up — floating hearts, a goodnight moon, a car driving home, confetti, a
// drawing that draws itself, a voice note — with a «ردّ بقلب» button to send a heart back.
// Today's drawings and voice notes stay in a small tray in the bottom corner.
//
// Delivery: a WebSocket to the pulse hub brings each moment at once; if it is down, the frame
// asks every 8 seconds. Moments it has already shown are remembered, so nothing plays twice.
import config from './config.js';
import { h, now, startOfDay, store, hhmm, MINUTE, HOUR } from './util.js';
import { accessKey, DEMO } from './data.js';
import * as demo from './demo.js';
import { starPoints } from './icons.js';
import { HEART, tapOf, tapIcon, MIC, PEN_ICON, HEART_ICON, drawStrokes } from './pulse-common.js';
import { audio, unlockAudio } from './sound.js';

const W = 1280, H = 800;
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const keyName = (k) => (DEMO ? 'demo-' : '') + k;
const withKey = (path) => { const k = accessKey(); return path + (k ? (path.indexOf('?') < 0 ? '?' : '&') + 'key=' + encodeURIComponent(k) : ''); };

// fun: { knock, wheel } play knocks and spins from the phones; onSocket gets the live
// connection's other messages (match, cheers, wheels).
export function createPulse({ stage, isNight, hold, fun, onSocket }) {
  const layer = h('div', { class: 'pl-layer' });
  const tray = h('div', { class: 'pl-tray' });
  // Moments nobody was there for: «3 نبضات جديدة», tap to see them again.
  const badge = h('button', { class: 'pl-badge', type: 'button', hidden: true },
    h('span', { class: 'pl-badge-heart', html: HEART_ICON(30, '#E8657A') }), h('span', { class: 'pl-badge-text' }));
  stage.append(layer, tray, badge);

  const seen = new Set(store.get(keyName('pulse-seen'), []));
  // The newest moment this frame knows about (server time). The very first time the frame
  // starts it knows none: moments sent before then go to the tray without playing.
  let lastAt = store.get(keyName('pulse-last'), 0);
  const firstRun = !lastAt;
  const queue = [];
  let showing = false, held = 0;
  let trayItems = []; // today's drawings and voice notes
  let trayDay = new Date(startOfDay(now())).toISOString().slice(0, 10);

  // ---------- missed moments ----------
  // A moment counts as missed when nobody touched the frame while it played or in the two
  // minutes after (tapping «ردّ بقلب» is a touch). Missed ones wait behind the badge until
  // someone taps it, and are forgotten at midnight.
  const MISSED_KEY = keyName('pulse-missed');
  let missed = (store.get(MISSED_KEY, []) || []).filter((m) => m.at >= startOfDay(now()));
  let lastTouch = 0;
  const saveMissed = () => store.set(MISSED_KEY, missed.map((m) => ({ id: m.id, at: m.at, end: m.end })));
  function renderBadge() {
    const n = missed.length;
    badge.hidden = !n;
    if (!n) return;
    badge.lastChild.textContent = n === 1 ? 'نبضة جديدة' : n === 2 ? 'نبضتان جديدتان' : n <= 10 ? n + ' نبضات جديدة' : n + ' نبضة جديدة';
    badge.setAttribute('aria-label', badge.lastChild.textContent + '، اضغط لرؤيتها');
  }
  function acknowledge(id) {
    const before = missed.length;
    missed = missed.filter((m) => m.id !== id);
    if (missed.length !== before) { saveMissed(); renderBadge(); }
  }
  stage.addEventListener('pointerdown', (e) => {
    if (badge.contains(e.target)) return;
    lastTouch = Date.now();
    // Someone is here: what just played was seen.
    const cut = Date.now() - 2 * MINUTE;
    const before = missed.length;
    missed = missed.filter((m) => !m.end || m.end < cut);
    if (missed.length !== before) { saveMissed(); renderBadge(); }
  }, true);
  badge.addEventListener('click', () => {
    if (showing) return;
    const list = missed.slice();
    missed = [];
    saveMissed();
    renderBadge();
    for (const m of list) {
      const p = byId.get(m.id);
      if (p) queue.push({ p, replay: true });
    }
    pump();
  });
  const byId = new Map(); // today's moments, for replaying from the badge

  function markSeen(p) {
    seen.add(p.id);
    if (p.at > lastAt) lastAt = p.at;
    const arr = Array.from(seen).slice(-200);
    store.set(keyName('pulse-seen'), arr);
    store.set(keyName('pulse-last'), lastAt);
  }

  // ---------- receiving ----------
  function receive(p, quiet) {
    if (!p || !p.id || seen.has(p.id)) return;
    markSeen(p);
    if (p.kind === 'reply') return; // hearts back go to the phones
    // Knocks from here go to the phones; spins from here are already turning.
    if (p.kind === 'knock' && p.from === 'البيت') return;
    if (p.kind === 'spin' && fun && fun.wheel.claim(p)) return;
    if (p.at >= startOfDay(now())) byId.set(p.id, p);
    const age = now() - p.at;
    const keep = (p.kind === 'draw' || p.kind === 'voice') && p.at >= startOfDay(now());
    // Too old to announce (the frame was off for long), or from before it was set up.
    if (age > 12 * HOUR || quiet) { if (keep) addToTray(p, true); return; }
    if (keep) addToTray(p, false); // shown in the tray once it has played
    queue.push({ p });
    pump();
  }

  async function catchUp(since, quiet) {
    let list, serverNow = Date.now();
    if (DEMO) list = demo.pulses(since);
    else {
      const res = await fetch(withKey('/api/pulse?since=' + since), { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const j = await res.json();
      list = j.pulses;
      serverNow = j.now || serverNow;
    }
    for (const p of list) {
      if (seen.has(p.id)) {
        if (p.kind !== 'reply' && p.at >= startOfDay(now())) byId.set(p.id, p);
        if ((p.kind === 'draw' || p.kind === 'voice') && p.at >= startOfDay(now()) && !trayItems.some((x) => x.id === p.id)) addToTray(p, true);
      } else receive(p, quiet);
    }
    if (quiet && !lastAt) { lastAt = serverNow; store.set(keyName('pulse-last'), lastAt); }
  }

  // ---------- connection ----------
  let ready = false; // after the first look at today's moments
  const sync = () => { if (ready) catchUp(lastAt).catch(() => {}); };
  let ws = null, wsOpen = false, retry = 2000;
  function connect() {
    if (DEMO) return;
    try {
      const k = accessKey();
      ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/api/pulse/live' + (k ? '?key=' + encodeURIComponent(k) : ''));
    } catch (e) { setTimeout(connect, retry); return; }
    ws.onopen = () => { wsOpen = true; retry = 2000; sync(); };
    ws.onmessage = (e) => {
      let m;
      try { m = JSON.parse(e.data); } catch (err) { return; }
      if (m && m.type === 'pulse') receive(m.pulse);
      else if (m && onSocket) onSocket(m);
    };
    ws.onclose = () => {
      wsOpen = false;
      setTimeout(connect, retry);
      retry = Math.min(retry * 2, 60000);
    };
    ws.onerror = () => { try { ws.close(); } catch (e) { /* ignore */ } };
  }

  function start() {
    renderBadge();
    // Today's moments: unseen ones play, seen drawings and voice notes go back in the tray.
    // (The first time, everything already there is only put in the tray.)
    const first = () => catchUp(Math.min(lastAt || Infinity, startOfDay(now())), firstRun).then(() => { ready = true; }, () => setTimeout(first, 5000));
    first();
    connect();
    setInterval(() => { if (wsOpen) try { ws.send('ping'); } catch (e) { /* reconnects */ } }, 25000);
    // Without the live connection, ask often; with it, now and then in case one was missed.
    let ticks = 0;
    setInterval(() => {
      ticks++;
      if (!wsOpen || ticks % 8 === 0) sync();
    }, 8000);
    if (DEMO) {
      window.addEventListener('storage', (e) => { if (e.key === 'fd:demo-pulses') sync(); });
      // Lets the demo control panel say "it arrived" only while a demo frame is open.
      const alive = () => store.set('demo-frame-alive', Date.now());
      alive();
      setInterval(alive, 5000);
    }
  }

  // ---------- playing, one at a time ----------
  async function pump() {
    if (showing || !queue.length) return;
    if (hold && hold()) { if (!held) held = setTimeout(() => { held = 0; pump(); }, 2000); return; } // not during the adhan
    showing = true;
    const { p, replay } = queue.shift();
    const started = Date.now();
    try {
      if (!replay && !isNight() && p.kind !== 'knock' && p.kind !== 'spin') chime();
      if (p.kind === 'tap') await playTap(p);
      else if (p.kind === 'knock' && fun) await fun.knock.play(p, replyButton(p));
      else if (p.kind === 'spin' && fun) await fun.wheel.play(p);
      else if (p.kind === 'draw') await playDraw(p, replay);
      else if (p.kind === 'voice') await playVoice(p, replay);
    } catch (e) { console.error(e); }
    if (!replay && p.kind !== 'tap') renderTray(true);
    // Nobody touched the frame while it played: keep it for later (a touch in the next two
    // minutes still counts as seen).
    if (!replay && lastTouch < started && !missed.some((m) => m.id === p.id)) {
      missed.push({ id: p.id, at: p.at, end: Date.now() });
      saveMissed();
      renderBadge();
    }
    layer.textContent = '';
    showing = false;
    pump();
  }

  function fromLine(p) {
    const mins = Math.round((now() - p.at) / MINUTE);
    const when = mins < 1 ? 'الآن' : mins < 60 ? 'قبل ' + (mins === 1 ? 'دقيقة' : mins === 2 ? 'دقيقتين' : mins <= 10 ? mins + ' دقائق' : mins + ' دقيقة') : 'على ' + hhmm(p.at);
    return 'من ' + p.from + (when ? ' · ' + when : '');
  }

  // A heart back to whoever sent it.
  function replyButton(p) {
    const b = h('button', { class: 'pl-reply', type: 'button' }, h('span', { html: HEART_ICON(26, '#241707') }), 'ردّ بقلب');
    b.addEventListener('click', async () => {
      if (b.disabled) return;
      b.disabled = true;
      try {
        if (DEMO) demo.pulseAdd({ kind: 'reply', from: 'البيت', to: p.id, toName: p.from, toKind: p.kind });
        else {
          const k = accessKey();
          const res = await fetch('/api/pulse/reply', { method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, k ? { 'x-key': k } : {}), body: JSON.stringify({ to: p.id }) });
          if (!res.ok) throw new Error('HTTP ' + res.status);
        }
        acknowledge(p.id);
        b.textContent = 'وصل قلبكم إلى ' + p.from + ' ❤';
        b.classList.add('is-sent');
        const r = b.getBoundingClientRect(), s = stage.getBoundingClientRect(), k2 = s.width / W;
        heartPop((r.left + r.width / 2 - s.left) / k2, (r.top - s.top) / k2, 10);
      } catch (e) {
        b.disabled = false;
        b.textContent = 'تعذّر الإرسال، حاول مرة أخرى';
      }
    });
    return b;
  }

  function banner(p, icon, title, extra) {
    const el = h('div', { class: 'pl-banner k-' + (p.tap || p.kind) },
      h('div', { class: 'pl-icon', html: icon }),
      h('div', { class: 'pl-text' }, h('div', { class: 'pl-title' }, title), h('div', { class: 'pl-from' }, fromLine(p)), extra || null),
      replyButton(p));
    layer.appendChild(el);
    el.animate([{ opacity: 0, transform: 'translate(-50%, -24px) scale(.94)' }, { opacity: 1, transform: 'translate(-50%, 0) scale(1)' }],
      { duration: 600, easing: 'cubic-bezier(.2,.9,.3,1.2)', fill: 'both' });
    return el;
  }
  const bannerOut = (el) => el.animate([{ opacity: 1 }, { opacity: 0, transform: 'translate(-50%, -16px)' }], { duration: 500, fill: 'forwards' }).finished;

  function fxBox() { const fx = h('div', { class: 'pl-fx' }); layer.appendChild(fx); return fx; }
  function piece(fx, html, x, y, size, cls) {
    const el = h('div', { class: 'pl-piece' + (cls ? ' ' + cls : ''), html: html || '' });
    el.style.cssText = 'left:' + x.toFixed(0) + 'px;top:' + y.toFixed(0) + 'px;width:' + size.toFixed(0) + 'px;height:' + size.toFixed(0) + 'px';
    fx.appendChild(el);
    return el;
  }
  const heartSvg = (c) => '<svg viewBox="0 0 64 64" width="100%" height="100%"><path d="' + HEART + '" fill="' + c + '"/></svg>';
  const starSvg = (c) => '<svg viewBox="0 0 24 24" width="100%" height="100%"><polygon points="' + starPoints(12, 12, 11, 6.5) + '" fill="' + c + '"/></svg>';

  function heartPop(x, y, n) {
    const fx = fxBox();
    for (let i = 0; i < n; i++) {
      const s = rnd(18, 34);
      const el = piece(fx, heartSvg(pick(['#E8657A', '#EE9AAE', '#F2AE3D'])), x - s / 2, y - s / 2, s);
      el.animate([{ transform: 'translate(0,0) scale(.4)', opacity: 0 }, { opacity: 1, offset: 0.2 },
        { transform: 'translate(' + rnd(-90, 90).toFixed(0) + 'px,' + rnd(-200, -110).toFixed(0) + 'px) scale(1)', opacity: 0 }],
      { duration: rnd(1200, 1900), delay: rnd(0, 250), easing: 'ease-out', fill: 'both' });
    }
  }

  // ----- the six taps -----
  const SCENES = {
    love(fx) {
      for (let i = 0; i < 26; i++) {
        const s = rnd(26, 70), sway = rnd(30, 80) * (Math.random() < 0.5 ? -1 : 1), r = rnd(-20, 20);
        const el = piece(fx, heartSvg(pick(['#E8657A', '#EE9AAE', '#F2AE3D', '#D9445E'])), rnd(30, W - 90), H + 10, s);
        el.animate([
          { transform: 'translate(0,0) rotate(' + r + 'deg)', opacity: 0 },
          { opacity: 0.95, offset: 0.12 },
          { transform: 'translate(' + sway + 'px,-' + rnd(380, 480).toFixed(0) + 'px) rotate(' + -r + 'deg)', offset: 0.55 },
          { transform: 'translate(' + -sway + 'px,-' + rnd(820, 920).toFixed(0) + 'px) rotate(' + r + 'deg)', opacity: 0 },
        ], { duration: rnd(4800, 7000), delay: rnd(0, 2600), easing: 'ease-out', fill: 'both' });
      }
    },
    miss(fx) {
      const petal = (c) => '<svg viewBox="0 0 40 24" width="100%" height="100%"><path d="M2 12C8 2 30 0 38 12 30 24 8 22 2 12z" fill="' + c + '"/><path d="M6 12h26" stroke="#fff" stroke-opacity=".25" stroke-width="1.5"/></svg>';
      for (let i = 0; i < 30; i++) {
        const s = rnd(26, 46);
        const el = piece(fx, petal(pick(['#D9445E', '#E8657A', '#F29BA9', '#C9304E'])), rnd(250, 1450), rnd(-160, -40), s);
        el.animate([
          { transform: 'translate(0,0) rotate(0deg)', opacity: 0 },
          { opacity: 1, offset: 0.1 },
          { transform: 'translate(-' + rnd(200, 360).toFixed(0) + 'px,' + rnd(380, 460).toFixed(0) + 'px) rotate(' + rnd(160, 300).toFixed(0) + 'deg)', offset: 0.5 },
          { transform: 'translate(-' + rnd(450, 750).toFixed(0) + 'px,' + rnd(900, 980).toFixed(0) + 'px) rotate(' + rnd(400, 700).toFixed(0) + 'deg)', opacity: 0.2 },
        ], { duration: rnd(6000, 8000), delay: rnd(0, 3200), easing: 'ease-in-out', fill: 'both' });
      }
    },
    morning(fx) {
      const warm = piece(fx, '', 0, 0, 0, 'pl-warm');
      warm.style.cssText = 'left:0;top:0;width:100%;height:100%';
      warm.animate([{ opacity: 0 }, { opacity: 1, offset: 0.25 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }], { duration: 8200, fill: 'both' });
      let rays = '';
      for (let i = 0; i < 16; i++) {
        const a = (i * Math.PI) / 8, r1 = i % 2 ? 108 : 100, r2 = i % 2 ? 140 : 162;
        rays += '<path d="M' + (170 + r1 * Math.cos(a)).toFixed(1) + ' ' + (170 + r1 * Math.sin(a)).toFixed(1) + 'L' + (170 + r2 * Math.cos(a)).toFixed(1) + ' ' + (170 + r2 * Math.sin(a)).toFixed(1) + '"/>';
      }
      const sun = piece(fx, '<div class="pl-sun-rays"><svg viewBox="0 0 340 340" width="100%" height="100%"><g stroke="#F2AE3D" stroke-width="16" stroke-linecap="round">' + rays + '</g></svg></div>'
        + '<svg class="pl-sun-core" viewBox="0 0 340 340" width="100%" height="100%"><circle cx="170" cy="170" r="78" fill="#FFC85E"/><circle cx="170" cy="170" r="62" fill="#FFD782"/></svg>', 470, H + 40, 340, 'pl-sun');
      sun.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-' + (H - 130) + 'px)', offset: 0.4 }, { transform: 'translateY(-' + (H - 150) + 'px)', opacity: 1, offset: 0.85 }, { transform: 'translateY(-' + (H - 150) + 'px)', opacity: 0 }],
        { duration: 8200, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'both' });
      sun.firstChild.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(40deg)' }], { duration: 8200, fill: 'both' });
    },
    night(fx) {
      const dusk = piece(fx, '', 0, 0, 0, 'pl-dusk');
      dusk.style.cssText = 'left:0;top:0;width:100%;height:100%';
      dusk.animate([{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 1, offset: 0.85 }, { opacity: 0 }], { duration: 8600, fill: 'both' });
      const moon = piece(fx, tapIcon('night', 190), 1050, -240, 190);
      moon.animate([{ transform: 'translateY(0)', opacity: 0 }, { transform: 'translateY(300px)', opacity: 1, offset: 0.35 }, { transform: 'translateY(310px)', opacity: 1, offset: 0.85 }, { transform: 'translateY(310px)', opacity: 0 }],
        { duration: 8600, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'both' });
      for (let i = 0; i < 46; i++) {
        const big = i < 8, s = big ? rnd(14, 24) : rnd(3, 6);
        const el = piece(fx, big ? starSvg('#FFE3A3') : '', rnd(20, W - 30), rnd(20, 470), s, big ? '' : 'pl-dot');
        el.animate([{ opacity: 0 }, { opacity: 1, offset: 0.3 }, { opacity: 0.3, offset: 0.55 }, { opacity: 1, offset: 0.75 }, { opacity: 0 }],
          { duration: rnd(5000, 7600), delay: rnd(300, 1500), fill: 'both' });
      }
    },
    way(fx) {
      const road = piece(fx, '', 0, 0, 0, 'pl-road');
      road.style.cssText = 'left:0;top:672px;width:100%;height:6px';
      const house = piece(fx, '<svg viewBox="0 0 64 64" width="100%" height="100%"><path d="M8 30L32 10l24 20v28H8z" fill="#F3EDE2"/><path d="M4 32L32 8l28 24" stroke="#F2AE3D" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><rect x="26" y="40" width="12" height="18" rx="6" fill="#3A1426"/><rect x="14" y="36" width="9" height="9" rx="2" fill="#F2AE3D"/><rect x="41" y="36" width="9" height="9" rx="2" fill="#F2AE3D"/></svg>', 70, 548, 130);
      for (const el of [road, house]) el.animate([{ opacity: 0 }, { opacity: 1, offset: 0.08 }, { opacity: 1, offset: 0.9 }, { opacity: 0 }], { duration: 8600, fill: 'both' });
      const car = piece(fx, '<div class="pl-car-body">' + tapIcon('way', 210) + '</div>', W + 20, 498, 210, 'pl-car');
      const drive = 5200;
      car.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-' + (W + 20 - 230) + 'px)' }], { duration: drive, easing: 'cubic-bezier(.25,.6,.35,1)', fill: 'both' });
      car.animate([{ opacity: 1 }, { opacity: 1, offset: 0.9 }, { opacity: 0 }], { duration: 8600, fill: 'both' });
      car.firstChild.animate([{ transform: 'scaleX(-1) translateY(0)' }, { transform: 'scaleX(-1) translateY(-4px)' }, { transform: 'scaleX(-1) translateY(0)' }], { duration: 340, iterations: Math.round(drive / 340) });
      // puffs of dust behind the car
      for (let i = 0; i < 16; i++) {
        const t = (i / 16) * drive;
        const prog = 1 - Math.pow(1 - t / drive, 2.2);
        const x = W + 20 - (W + 20 - 230) * prog + 200;
        const el = piece(fx, '', x, rnd(640, 668), rnd(14, 24), 'pl-puff');
        el.animate([{ opacity: 0, transform: 'scale(.5)' }, { opacity: 0.7, offset: 0.1 }, { opacity: 0, transform: 'translate(' + rnd(20, 60).toFixed(0) + 'px,-' + rnd(10, 30).toFixed(0) + 'px) scale(1.6)' }],
          { duration: 1100, delay: t, fill: 'both' });
      }
      setTimeout(() => heartPop(135, 548, 9), drive - 300);
    },
    news(fx) {
      const cols = ['#F2AE3D', '#EE9AAE', '#7FD3B5', '#9DB9F5', '#E8657A', '#F3EDE2'];
      for (let i = 0; i < 72; i++) {
        const star = i % 9 === 0;
        const s = star ? rnd(18, 28) : rnd(10, 16);
        const el = piece(fx, star ? starSvg(pick(cols)) : '', rnd(60, W - 60), rnd(-80, -20), s, star ? '' : 'pl-conf');
        if (!star) { el.style.background = pick(cols); el.style.height = (s * 1.6).toFixed(0) + 'px'; }
        el.animate([
          { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
          { transform: 'translate(' + rnd(-120, 120).toFixed(0) + 'px,' + rnd(380, 460).toFixed(0) + 'px) rotate(' + rnd(200, 400).toFixed(0) + 'deg)', offset: 0.5 },
          { transform: 'translate(' + rnd(-200, 200).toFixed(0) + 'px,' + rnd(840, 920).toFixed(0) + 'px) rotate(' + rnd(500, 900).toFixed(0) + 'deg)', opacity: 0.6 },
        ], { duration: rnd(3800, 6200), delay: rnd(0, 1800), easing: 'cubic-bezier(.3,.4,.6,1)', fill: 'both' });
      }
      for (let i = 0; i < 6; i++) {
        const s = rnd(60, 110);
        const el = piece(fx, starSvg(pick(cols)), rnd(200, W - 300), rnd(220, 520), s);
        el.animate([{ transform: 'scale(0) rotate(0deg)', opacity: 0 }, { transform: 'scale(1) rotate(45deg)', opacity: 1, offset: 0.4 }, { transform: 'scale(1.3) rotate(90deg)', opacity: 0 }],
          { duration: 1600, delay: 300 + i * 260, easing: 'ease-out', fill: 'both' });
      }
    },
  };

  async function playTap(p) {
    const t = tapOf(p.tap);
    if (!t) return;
    const fx = fxBox();
    SCENES[p.tap](fx);
    const b = banner(p, tapIcon(p.tap, 84), t.title);
    await wait(8200);
    await bannerOut(b);
    await wait(400);
  }

  // ----- drawings: drawn again stroke by stroke, then put in the tray -----
  // Replay timing: the drawing's own pace, with pauses between strokes shortened, in at most 5 s.
  function timeline(strokes) {
    const out = [];
    let clock = 0, prevEnd = null;
    for (const s of strokes) {
      const p = s.p.slice();
      const t0 = p[2];
      const gap = prevEnd == null ? 0 : Math.min(250, Math.max(0, t0 - prevEnd));
      const shift = clock + gap - t0;
      for (let i = 2; i < p.length; i += 3) p[i] += shift;
      clock = p[p.length - 1];
      prevEnd = s.p[s.p.length - 1];
      out.push({ c: s.c, w: s.w, p });
    }
    const k = clock > 5000 ? 5000 / clock : 1;
    if (k < 1) for (const s of out) for (let i = 2; i < s.p.length; i += 3) s.p[i] *= k;
    return { strokes: out, total: clock * k };
  }

  async function playDraw(p, replay) {
    let strokes = p.strokes;
    if (!strokes) return;
    const scrim = h('div', { class: 'pl-scrim' });
    const canvas = h('canvas', { width: 720, height: 540, class: 'pl-canvas' });
    const card = h('div', { class: 'pl-card' },
      h('div', { class: 'pl-card-head' }, h('span', { class: 'pl-icon-sm', html: PEN_ICON(40) }),
        h('div', null, h('div', { class: 'pl-card-title' }, 'رسم من ' + p.from), h('div', { class: 'pl-from' }, fromLine(p).replace('من ' + p.from + ' · ', ''))),
        replyButton(p)),
      canvas);
    layer.append(scrim, card);
    scrim.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 500, fill: 'both' });
    card.animate([{ opacity: 0, transform: 'translate(-50%,-50%) scale(.9)' }, { opacity: 1, transform: 'translate(-50%,-50%) scale(1)' }], { duration: 600, easing: 'cubic-bezier(.2,.9,.3,1.15)', fill: 'both' });
    const ctx = canvas.getContext('2d');
    const tl = timeline(strokes);
    await wait(500);
    await new Promise((done) => {
      const t0 = performance.now();
      const frame = () => {
        const e = performance.now() - t0;
        ctx.clearRect(0, 0, 720, 540);
        drawStrokes(ctx, tl.strokes, 720, e);
        if (e < tl.total + 50) requestAnimationFrame(frame); else done();
      };
      requestAnimationFrame(frame);
    });
    ctx.clearRect(0, 0, 720, 540);
    drawStrokes(ctx, strokes, 720);
    await wait(replay ? 5000 : 7000);
    // Shrink into the tray.
    const dx = (W - 24 - 46) - W / 2, dy = (H - 14 - 35) - H / 2;
    scrim.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 700, fill: 'forwards' });
    await card.animate([{ transform: 'translate(-50%,-50%) scale(1)', opacity: 1 }, { transform: 'translate(calc(-50% + ' + dx + 'px), calc(-50% + ' + dy + 'px)) scale(.12)', opacity: 0.2 }],
      { duration: 800, easing: 'cubic-bezier(.5,0,.7,1)', fill: 'forwards' }).finished;
  }

  // ----- voice notes -----
  async function playVoice(p, replay) {
    const bars = h('div', { class: 'pl-bars' });
    for (let i = 0; i < 16; i++) bars.appendChild(h('i', { style: 'animation-delay:' + (i * 0.07).toFixed(2) + 's' }));
    const listen = h('button', { class: 'pl-listen', type: 'button', hidden: true }, '▶ استمع');
    const b = banner(p, MIC(84), 'رسالة صوتية', h('div', { class: 'pl-voice-row' }, bars, listen));
    const src = DEMO ? p.audioData : withKey('/api/pulse/audio/' + p.id);
    const audio = new Audio(src);
    audio.volume = 1;
    let ended = false;
    audio.addEventListener('ended', () => { ended = true; b.classList.remove('is-playing'); });
    const tryPlay = () => audio.play().then(() => { b.classList.add('is-playing'); listen.hidden = true; return true; }, () => false);
    listen.addEventListener('click', () => { tryPlay(); });
    // At night, or when the browser won't play on its own: wait for a tap.
    const played = !isNight() || replay ? await tryPlay() : false;
    if (!played) listen.hidden = false;
    const limit = now() + ((p.audio && p.audio.dur) || 15) * 1000 + (played ? 3000 : 20000);
    while (now() < limit && !ended) await wait(250);
    if (ended) await wait(2500);
    audio.pause();
    await bannerOut(b);
  }

  // ---------- the tray (today's drawings and voice notes) ----------
  function addToTray(p, render) {
    if (trayItems.some((x) => x.id === p.id)) return;
    trayItems.push(p);
    trayItems.sort((a, b) => a.at - b.at);
    if (render) renderTray(false);
  }

  function renderTray(pop) {
    tray.textContent = '';
    const items = trayItems.slice(-3).reverse(); // newest first (on the right)
    tray.classList.toggle('is-empty', !items.length);
    items.forEach((p, i) => {
      let el;
      if (p.kind === 'draw') {
        const c = h('canvas', { width: 184, height: 138 });
        el = h('button', { class: 'pl-thumb', type: 'button', title: 'رسم من ' + p.from }, c);
        drawStrokes(c.getContext('2d'), p.strokes || [], 184);
      } else {
        el = h('button', { class: 'pl-chip', type: 'button', title: 'رسالة صوتية من ' + p.from }, h('span', { html: MIC(30) }), h('span', { class: 'pl-chip-name' }, p.from));
      }
      el.style.transform = 'rotate(' + [-4, 3, -2][i] + 'deg)';
      el.style.zIndex = String(3 - i);
      el.addEventListener('click', () => { if (!showing) { queue.push({ p, replay: true }); pump(); } });
      tray.appendChild(el);
      if (pop && i === 0) el.animate([{ transform: 'scale(.3)', opacity: 0 }, { transform: el.style.transform, opacity: 1 }], { duration: 450, easing: 'cubic-bezier(.2,.9,.3,1.3)' });
    });
  }

  // ---------- a soft two-note chime (no sound file; only once the browser allows sound) ----------
  const actx = audio();
  const unlockSound = unlockAudio;
  function chime() {
    if (!actx || actx.state !== 'running' || config.pulseSound === false) return;
    const t0 = actx.currentTime;
    [[1318.5, 0], [1975.5, 0.16]].forEach(([f, d]) => {
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0, t0 + d);
      g.gain.linearRampToValueAtTime(0.13, t0 + d + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 1.3);
      o.connect(g);
      g.connect(actx.destination);
      o.start(t0 + d);
      o.stop(t0 + d + 1.4);
    });
  }

  function tick() {
    // A new day empties the tray.
    const day = new Date(startOfDay(now())).toISOString().slice(0, 10);
    if (day !== trayDay) { trayDay = day; trayItems = []; renderTray(false); missed = []; saveMissed(); renderBadge(); byId.clear(); }
  }

  return {
    start, tick, unlockSound,
    poke: () => sync(), // (the preview page adds moments in this same tab)
    busy: () => showing || queue.length > 0,
  };
}
