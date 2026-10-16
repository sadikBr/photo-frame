import config from './config.js';
import { h, $, now, parts, minutesOfDay, MINUTE } from './util.js';
import { start, on, connectionProblem, state, DEMO } from './data.js';
import { khatam } from './icons.js';
import { nextPrayer, lastPrayer, prayerName } from './prayer-times.js';
import { createHome } from './screens/home.js';
import { createPrayer } from './screens/prayer.js';
import { createAdhkar } from './screens/adhkar.js';
import { createCalendar } from './screens/calendar.js';
import { createLists } from './screens/lists.js';
import { createPhotos } from './screens/photos.js';
import * as adhan from './adhan.js';
import { setRamadanPreview, ramadanPreviewing } from './ramadan.js';
import { createPulse } from './pulse.js';
import { createWheel } from './frame-wheel.js';
import { createKnock } from './frame-knock.js';
import { createMatch } from './frame-match.js';
import { createStatus } from './frame-status.js';
import { createColoring } from './frame-color.js';
import * as demo from './demo.js';

const SCREEN_W = 1280;
const stage = $('#stage');
const track = h('div', { class: 'track' });
const nav = h('nav', { class: 'nav', 'aria-label': 'الشاشات' });
const status = h('div', { class: 'status', role: 'status' });
const night = h('div', { class: 'night' });
// While the adhan plays: a button to stop it.
const adhanBar = h('button', { class: 'adhan-bar', type: 'button', hidden: true },
  h('span', { class: 'adhan-bar-dot' }), h('span', { class: 'adhan-bar-text' }), h('span', { class: 'adhan-bar-stop' }, 'إيقاف'));

// ---------- screens ----------
const adhkarScreen = createAdhkar();
const screens = [createHome(), createPrayer(), adhkarScreen, createCalendar(), createLists(), createPhotos()];
const byName = Object.fromEntries(screens.map((s) => [s.name, s]));
let index = 0;

for (const sc of screens) {
  track.appendChild(sc.el);
  const tab = h('button', { class: 'tab', type: 'button', 'data-for': sc.name }, h('span', { class: 'tab-star', html: khatam(18) }), sc.label);
  tab.addEventListener('click', () => { if (config.touchNavigation) go(sc.name, true); });
  nav.appendChild(tab);
}
stage.append(track, nav, status, adhanBar, night);

// The door and the wheel open from two buttons at the end of the screen tabs.
const knockTab = h('button', { class: 'tab tab-fun', type: 'button', 'aria-label': 'الدقّة السرية', html: '<svg width="24" height="28" viewBox="0 0 24 28" aria-hidden="true"><path d="M3 28V11a9 9 0 0 1 18 0v17z" fill="none" stroke="currentColor" stroke-width="2.4"/><circle cx="12" cy="17" r="3.4" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>' }, 'دقّة');
const wheelTab = h('button', { class: 'tab tab-fun', type: 'button', hidden: true, 'aria-label': 'عجلة الحظ', html: '<svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true"><circle cx="13" cy="13" r="11" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M13 2v22M2 13h22M5.2 5.2l15.6 15.6M20.8 5.2L5.2 20.8" stroke="currentColor" stroke-width="1.6"/><circle cx="13" cy="13" r="3" fill="currentColor"/></svg>' }, 'العجلة');
const colorTab = h('button', { class: 'tab tab-fun', type: 'button', 'aria-label': 'تلوين الزليج', html: '<svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true"><polygon points="13,1 16.2,7.3 23.4,6.6 19.6,12.6 23.4,18.8 16.2,18.1 13,24.6 9.8,18.1 2.6,18.8 6.4,12.6 2.6,6.6 9.8,7.3" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><circle cx="13" cy="12.8" r="3.4" fill="currentColor"/></svg>' }, 'تلوين');
// One «مرح» button in the tabs; it opens the three above it (the row stays short, clear of the
// corners where the moments' badge and the tray sit).
const funTab = h('button', { class: 'tab tab-fun', type: 'button', 'aria-expanded': 'false', html: '<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l2.2 5.6L20 9l-5.8 1.5L12 16l-2.2-5.5L4 9l5.8-1.4z" fill="currentColor"/><path d="M19 15l.9 2.1 2.1.9-2.1.9L19 21l-.9-2.1-2.1-.9 2.1-.9z" fill="currentColor"/></svg>' }, 'مرح');
const funMenu = h('div', { class: 'fun-menu', hidden: true }, knockTab, wheelTab, colorTab);
const closeMenu = () => { funMenu.hidden = true; funTab.setAttribute('aria-expanded', 'false'); };
funTab.addEventListener('click', (e) => { e.stopPropagation(); touched(); funMenu.hidden = !funMenu.hidden; funTab.setAttribute('aria-expanded', String(!funMenu.hidden)); clearTimeout(funTab.t); if (!funMenu.hidden) funTab.t = setTimeout(closeMenu, 12000); });
knockTab.addEventListener('click', () => { closeMenu(); touched(); knock.open(); });
wheelTab.addEventListener('click', () => { closeMenu(); touched(); wheel.open(); });
colorTab.addEventListener('click', () => { closeMenu(); touched(); coloring.open(); });
stage.addEventListener('pointerdown', (e) => { if (!funMenu.hidden && !funMenu.contains(e.target) && !funTab.contains(e.target)) closeMenu(); });
nav.append(h('span', { class: 'tab-gap' }), funTab);
stage.appendChild(funMenu);
// Small cards at the top of the clock screen: the next match, and what everyone is up to.
const chipBox = h('div', { class: 'top-chips' });
stage.appendChild(chipBox);

// «وضع الماتش»: over the screens while Morocco plays (not during the adhan).
const match = createMatch({ stage, held: () => !!adhan.adhanPlaying(), chipBox });
const statuses = createStatus({ chipBox });
// «نبضة»: moments from the family's phones play over whatever screen is up. At night they play
// under the dimmed layer and without sound.
const knock = createKnock({ stage });
const wheel = createWheel({ stage, onChange: (n) => { wheelTab.hidden = !n; } });
const coloring = createColoring({ stage });
const pulse = createPulse({
  stage,
  isNight: () => isNight(now()) && Date.now() > awakeUntil && !match.active(),
  hold: () => !!adhan.adhanPlaying() || knock.busy() || wheel.busy() || coloring.busy(),
  fun: { knock, wheel },
  onSocket: (m) => { match.socket(m); wheel.socket(m); statuses.socket(m); coloring.socket(m); },
});

stage.insertBefore(night, null); // keep the night layer last

// Screens are stacked; only the one shown and the one sliding in are visible. The order loops:
// after the last screen comes the first. RTL: the next screen comes in from the left.
const ANIM = 'transform 700ms cubic-bezier(.22,.8,.24,1)';
const N = screens.length;
const nextOf = (i) => (i + 1) % N;
const prevOf = (i) => (i - 1 + N) % N;
function place(i, x, animate) {
  const el = screens[i].el;
  el.style.transition = animate ? ANIM : 'none';
  el.style.transform = 'translate3d(' + x + 'px,0,0)';
  el.style.visibility = 'visible';
}
let hideTimer = null;
function hideOthersLater() {
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => { screens.forEach((s, j) => { if (j !== index) s.el.style.visibility = 'hidden'; }); }, 750);
}

let shownAt = Date.now();
// dir: 'next' (comes in from the left) or 'prev' (from the right); by default the shorter way
// round. fromDrag: the screen is already part-way in, so don't reset where it starts.
function go(name, byUser, dir, fromDrag) {
  const i = screens.findIndex((s) => s.name === name);
  if (i < 0) return;
  if (byUser) touched();
  if (i !== index) {
    const from = index;
    if (!dir) dir = (i - from + N) % N <= N / 2 ? 'next' : 'prev';
    const enter = dir === 'next' ? -SCREEN_W : SCREEN_W;
    if (!fromDrag) {
      place(i, enter, false);
      void screens[i].el.offsetWidth; // start from there before animating
    }
    place(from, -enter, true);
    place(i, 0, true);
    if (screens[from].hide) screens[from].hide();
    index = i;
    shownAt = Date.now();
  } else {
    place(i, 0, true);
  }
  hideOthersLater();
  screens[index].show();
  for (const b of nav.children) b.classList.toggle('is-on', b.getAttribute('data-for') === name);
}

// ---------- touch & swipe ----------
let lastTouch = -Infinity, awakeUntil = 0, resumed = true;
function touched() {
  lastTouch = Date.now();
  awakeUntil = lastTouch + config.resumeAfterSeconds * 1000;
  resumed = false;
}

let drag = null, swipedAt = -Infinity;
// A swipe that ends on a button or a calendar day isn't a tap on it.
stage.addEventListener('click', (e) => {
  if (e.timeStamp - swipedAt < 400) { e.stopPropagation(); e.preventDefault(); }
}, true);
stage.addEventListener('pointerdown', (e) => {
  touched(); // any touch also wakes a dimmed screen
  adhan.unlock(); // and lets the page play the adhan from now on, if the browser asked for that
  pulse.unlockSound();
  if (!config.touchNavigation) return;
  drag = { x: e.clientX, y: e.clientY, id: e.pointerId, active: false };
});
stage.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const dx = (e.clientX - drag.x) / scale, dy = (e.clientY - drag.y) / scale;
  if (!drag.active && Math.abs(dx) > 14 && Math.abs(dx) > Math.abs(dy) * 1.4) drag.active = true;
  if (drag.active) {
    // Dragging right pulls in the next screen from the left, dragging left the previous one.
    clearTimeout(hideTimer);
    const nb = dx > 0 ? nextOf(index) : prevOf(index);
    if (drag.nb != null && drag.nb !== nb && drag.nb !== index) screens[drag.nb].el.style.visibility = 'hidden';
    drag.nb = nb;
    place(index, dx, false);
    if (nb !== index) place(nb, dx > 0 ? dx - SCREEN_W : dx + SCREEN_W, false);
  }
});
// Let go without changing screen: slide back.
function snapBack(nb, dx) {
  place(index, 0, true);
  if (nb != null && nb !== index) place(nb, dx > 0 ? -SCREEN_W : SCREEN_W, true);
  hideOthersLater();
}
function endDrag(e) {
  if (!drag || e.pointerId !== drag.id) return;
  const dx = (e.clientX - drag.x) / scale;
  const { active, nb } = drag;
  drag = null;
  if (!active) return;
  swipedAt = e.timeStamp;
  // RTL: the next screen sits to the left, so dragging right reveals it. It loops around.
  if (dx > 110) go(screens[nextOf(index)].name, true, 'next', true);
  else if (dx < -110) go(screens[prevOf(index)].name, true, 'prev', true);
  else { touched(); snapBack(nb, dx); }
}
stage.addEventListener('pointerup', endDrag);
stage.addEventListener('pointercancel', (e) => {
  if (drag && drag.active) snapBack(drag.nb, (e.clientX - drag.x) / scale);
  drag = null;
});
stage.addEventListener('contextmenu', (e) => e.preventDefault());

// ---------- rotation, prayer focus, night ----------
function isNight(t) {
  if (!config.night.enabled) return false;
  const p = parts(t);
  const m = p.h * 60 + p.mi;
  const s = minutesOfDay(config.night.start), e = minutesOfDay(config.night.end);
  return s > e ? m >= s || m < e : m >= s && m < e;
}

function inPrayerWindow(t) {
  if (!config.prayerFocus.enabled) return false;
  const np = nextPrayer(t);
  if (np && np.at - t <= config.prayerFocus.before * MINUTE) return true;
  const lp = lastPrayer(t);
  return !!(lp && t - lp.at < config.prayerFocus.after * MINUTE);
}

let rotIndex = 0;
function schedule(t) {
  const real = Date.now();
  const idle = real - lastTouch;
  // A preview asked for in the control panel shows even at night, with the screen undimmed.
  const previewing = ramadanPreviewing() || adhkarScreen.forced();
  const nightNow = isNight(t) && real > awakeUntil && !previewing && !match.active();
  night.style.opacity = nightNow ? String(config.night.dim) : '0';
  document.documentElement.classList.toggle('is-night', nightNow);

  // The adhan brings the prayer screen forward, even while someone is using the frame.
  if (adhan.adhanPlaying()) { if (screens[index].name !== 'prayer') go('prayer'); shownAt = real; return; }
  // A moment from a phone is playing, the door or the wheel is open, or the match is on: stay.
  if (pulse.busy() || knock.busy() || wheel.busy() || coloring.busy() || match.active()) { shownAt = real; return; }
  if (idle < config.resumeAfterSeconds * 1000) return; // someone is using it
  if (!resumed) { resumed = true; rotIndex = 0; go('home'); return; }
  if (ramadanPreviewing()) { if (screens[index].name !== 'prayer') go('prayer'); shownAt = real; return; }
  if (adhkarScreen.forced()) { if (screens[index].name !== 'adhkar') go('adhkar'); shownAt = real; return; }
  if (nightNow) { if (screens[index].name !== 'home') go('home'); return; }
  if (inPrayerWindow(t)) { if (screens[index].name !== 'prayer') go('prayer'); shownAt = real; return; }
  // Morning adhkar after Fajr, evening adhkar after Asr.
  if (adhkarScreen.wantsFocus(t)) { if (screens[index].name !== 'adhkar') go('adhkar'); shownAt = real; return; }

  const step = config.rotation[rotIndex % config.rotation.length];
  const cur = screens[index].name;
  if (cur !== step[0]) {
    // We were pulled elsewhere (prayer focus or a touch); continue from the clock.
    rotIndex = 0;
    go(config.rotation[0][0]);
    return;
  }
  if (real - shownAt < step[1] * 1000) return;
  for (let n = 1; n <= config.rotation.length; n++) {
    const cand = config.rotation[(rotIndex + n) % config.rotation.length];
    const sc = byName[cand[0]];
    if (!sc || (sc.hasPhotos && !sc.hasPhotos())) continue;
    rotIndex = (rotIndex + n) % config.rotation.length;
    go(cand[0]);
    return;
  }
}

on('settings', () => {
  nav.classList.toggle('is-static', !config.touchNavigation);
  rotIndex = 0;
});
nav.classList.toggle('is-static', !config.touchNavigation);

function updateStatus() {
  const msg = connectionProblem() || (adhan.adhanStatus() === 'blocked' ? 'المس الشاشة مرة واحدة لتفعيل صوت الأذان' : '');
  status.textContent = msg;
  status.classList.toggle('is-on', !!msg);
}
on('status', updateStatus);

function updateAdhanBar() {
  const k = adhan.adhanPlaying();
  adhanBar.hidden = !k;
  if (k) adhanBar.querySelector('.adhan-bar-text').textContent = 'أذان ' + prayerName(k, now());
  updateStatus();
}
adhan.onAdhan(updateAdhanBar);
adhanBar.addEventListener('click', () => adhan.stop());

// ---------- previews from the control panel ----------
let lastPreview = null;
on('preview', () => {
  const p = state.preview;
  if (!p || p.until <= now()) {
    setRamadanPreview(0);
    adhkarScreen.force(0);
    lastPreview = null;
    return;
  }
  if (lastPreview === p.id) return;
  lastPreview = p.id;
  setRamadanPreview(p.what === 'ramadan' ? p.until : 0);
  adhkarScreen.force(p.what === 'adhkar' ? p.until : 0);
  if (p.what === 'ramadan') go('prayer');
  if (p.what === 'adhkar') go('adhkar');
  if (p.what === 'adhan') adhan.play('dhuhr');
});
window.addEventListener('frame:go', (e) => { lastTouch = -Infinity; awakeUntil = 0; resumed = true; rotIndex = 0; go(e.detail || 'home'); });
// The preview page (?demo) has buttons for these.
if (DEMO) {
  window.frameDemo = {
    ramadan(on) { setRamadanPreview(on ? Infinity : 0); go('prayer', true); },
    adhkar() { adhkarScreen.force(now() + 10 * MINUTE); go('adhkar', true); },
    // A moment as if sent from a phone: a tap ('love', 'miss', 'morning', 'night', 'way', 'news')
    // or 'draw'.
    pulse(kind) {
      const from = ['ماما', 'بابا', 'جدتي', 'سلمى'][Math.floor(Math.random() * 4)];
      try {
        demo.pulseAdd(kind === 'draw' ? { kind: 'draw', from, strokes: demo.sampleDrawing() } : { kind: 'tap', tap: kind, from });
      } catch (e) { return; } // the same one twice in two seconds
      pulse.poke();
    },
    knock() { try { demo.pulseAdd({ kind: 'knock', from: 'سلمى', rhythm: [0, 160, 320, 900, 1060] }); } catch (e) { return; } pulse.poke(); },
    spin() { const w = demo.wheels()[0]; try { demo.spin(w.id, 'يوسف'); } catch (e) { return; } pulse.poke(); },
    match(on) { demo.matchPreview(!on); match.poke(); },
    beat() { try { demo.pulseAdd({ kind: 'beat', from: 'ماما', bpm: 74, intervals: [800, 820, 812, 790, 805, 818, 800, 810] }); } catch (e) { return; } pulse.poke(); },
    surprise() { try { demo.pulseAdd({ kind: 'tap', tap: 'news', from: 'بابا', sched: true, sentAt: Date.now() - 20 * 3600000 }); } catch (e) { return; } pulse.poke(); },
  };
}

// ---------- fit the 1280×800 stage to any screen ----------
let scale = 1;
function fit() {
  const g = window.FRAME_GUTTER || 0; // the hosted preview keeps a margin; the frame uses 0
  const sx = (window.innerWidth - 2 * g) / SCREEN_W, sy = (window.innerHeight - 2 * g) / 800;
  scale = Math.min(sx, sy);
  stage.style.transform = 'translate(-50%,-50%) scale(' + scale + ')';
}
window.addEventListener('resize', fit);
fit();

// ---------- main loop ----------
function loop() {
  const t = now();
  const sc = screens[index];
  try { sc.tick(t); } catch (e) { console.error(e); }
  try { adhan.tick(t); } catch (e) { console.error(e); }
  try { pulse.tick(t); } catch (e) { console.error(e); }
  try { match.tick(screens[index].name); } catch (e) { console.error(e); }
  try { statuses.tick(screens[index].name); } catch (e) { console.error(e); }
  try { schedule(t); } catch (e) { console.error(e); }
  setTimeout(loop, 1000 - (Date.now() % 1000) + 5);
}

const startScreen = (location.hash || '').slice(1);
start();
pulse.start();
go(byName[startScreen] ? startScreen : 'home');
if (byName[startScreen]) touched();
updateStatus();
loop();
document.documentElement.classList.add('is-ready');
