// Morning and evening adhkar, one card at a time. Tap the card to count; when the count is done
// it moves to the next one. Comes forward on its own after Fajr and Asr (see main.js).
// If a recording was uploaded in the control panel (الإعدادات › الأذكار), a play button in the
// corner plays it, and it can start by itself when the adhkar come up. The adhan pauses it; a
// moment from a phone turns it down; leaving the screen or closing the adhkar stops it.
import config from '../config.js';
import { h, setText, now, parts, dayKey, hhmm, MINUTE, store } from '../util.js';
import { prayerDay, audioUrl } from '../data.js';
import { adhkarFor, timesAr } from '../adhkar-data.js';
import { mmss } from '../quran-common.js';

const GROUND = { m: 'var(--g-adhkar-m)', e: 'var(--g-adhkar-e)' };
const ARROW_PREV = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
const ARROW_NEXT = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>';
const CLOSE = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const PLAY = '<svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5l11 7-11 7z" fill="currentColor"/></svg>';
const PAUSE = '<svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1.2" fill="currentColor"/><rect x="14" y="5" width="4" height="14" rx="1.2" fill="currentColor"/></svg>';
const R = 40, C = 2 * Math.PI * R;

// Morning from Fajr until Asr, evening from Asr until the next Fajr.
function setAt(t) {
  const d = prayerDay(t);
  if (d && d.fajr && d.asr) return t >= d.fajr && t < d.asr ? 'm' : 'e';
  const hr = parts(t).h;
  return hr >= 5 && hr < 15 ? 'm' : 'e';
}
// The day a session belongs to: an evening session after midnight still counts as yesterday's.
function sessionKey(t, set) {
  const d = prayerDay(t);
  const early = set === 'e' && d && d.fajr && t < d.fajr;
  return dayKey(early ? t - 12 * 3600000 : t) + ':' + set;
}
function fontFor(len) {
  if (len <= 40) return 54;
  if (len <= 90) return 44;
  if (len <= 170) return 37;
  if (len <= 260) return 33;
  return 30;
}

// held(): something more important is playing (the adhan); duck(): a moment is showing;
// busyElsewhere(): another recitation is playing, so don't start by ourselves.
export function createAdhkar({ held, duck, busyElsewhere } = {}) {
  const title = h('div', { class: 'a-title' });
  const sub = h('div', { class: 'a-sub' });
  const close = h('button', { class: 'a-close', type: 'button', 'aria-label': 'إنهاء الأذكار', html: CLOSE });
  const cardTitle = h('div', { class: 'a-card-title' });
  const text = h('div', { class: 'a-text' });
  const ref = h('div', { class: 'a-ref' });
  const ring = h('span', { class: 'a-ring', html: `<svg width="104" height="104" viewBox="0 0 104 104" aria-hidden="true"><circle cx="52" cy="52" r="${R}" class="a-ring-bg"/><circle cx="52" cy="52" r="${R}" class="a-ring-fg" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="0" transform="rotate(-90 52 52)"/></svg>` });
  const left = h('span', { class: 'a-left' });
  const times = h('span', { class: 'a-times' });
  const counter = h('div', { class: 'a-counter' }, h('span', { class: 'a-count' }, ring, left), times);
  const card = h('button', { class: 'a-card', type: 'button' }, cardTitle, text, ref, counter);
  const prev = h('button', { class: 'a-nav', type: 'button', 'aria-label': 'السابق', html: ARROW_PREV });
  const next = h('button', { class: 'a-nav', type: 'button', 'aria-label': 'التالي', html: ARROW_NEXT });
  const dots = h('div', { class: 'a-dots' });
  const doneTitle = h('div', { class: 'a-done-title' }, 'تقبّل الله منا ومنكم');
  const doneSub = h('div', { class: 'a-done-sub' });
  const again = h('button', { class: 'a-again', type: 'button' }, 'من البداية');
  const done = h('div', { class: 'a-done', hidden: true }, doneTitle, doneSub, again);

  // The recording, if one was uploaded.
  const aBtn = h('button', { class: 'a-play', type: 'button', 'aria-label': 'تشغيل التسجيل', html: PLAY });
  const aTime = h('span', { class: 'a-atime' });
  const aBar = h('span', { class: 'a-abar' }, h('i'));
  const aBox = h('div', { class: 'a-audio', hidden: true }, aBtn, h('div', { class: 'a-ainfo' }, aTime, aBar));

  // Theme-only (hidden in the original look): the time, with when these adhkar are said.
  const clockTime = h('bdi', { class: 'ac-time', dir: 'ltr' });
  const clockWhen = h('span', { class: 'ac-when' });
  const aClock = h('div', { class: 'a-clock' }, clockTime, clockWhen);

  const el = h('section', { class: 'screen s-adhkar', 'data-screen': 'adhkar', style: '--ground:' + GROUND.m },
    h('div', { class: 'a-head' }, h('div', null, title, sub), h('div', { class: 'a-head-end' }, aBox, close), aClock),
    h('div', { class: 'a-body' }, prev, card, next, done),
    dots,
    h('div', { class: 'band' }),
  );

  let set = null, list = [], key = '', pos = 0, remaining = 0, finished = false;
  let forceUntil = 0;

  // ---------- the recording ----------
  const audio = new Audio();
  audio.preload = 'none';
  let want = false, blocked = false, holding = false, ducking = false, failed = false, visible = false;
  const recName = () => (set === 'm' ? 'adhkar-morning' : 'adhkar-evening');
  const recUrl = () => (set ? audioUrl(recName()) : null);
  function setVolume() {
    const v = config.adhkar.volume == null ? 0.8 : config.adhkar.volume;
    audio.volume = Math.max(0, Math.min(1, v * (ducking ? 0.2 : 1)));
  }
  function sync() {
    setVolume();
    const should = want && !holding;
    if (should && audio.paused && !blocked) {
      const pr = audio.play();
      if (pr && pr.catch) pr.catch((e) => { if (e && e.name === 'NotAllowedError') { blocked = true; renderAudio(); } });
    }
    if (!should && !audio.paused) audio.pause();
  }
  function playAudio() {
    const u = recUrl();
    if (!u) return;
    if (audio.getAttribute('src') !== u) { audio.src = u; failed = false; }
    want = true; blocked = false;
    sync();
    renderAudio();
  }
  function pauseAudio() { want = false; sync(); renderAudio(); }
  function stopAudio() {
    want = false;
    audio.pause();
    try { audio.currentTime = 0; } catch (e) { /* not loaded */ }
    renderAudio();
  }
  function renderAudio() {
    const u = recUrl();
    aBox.hidden = !u;
    if (!u) return;
    const on = want && !blocked;
    aBtn.innerHTML = on ? PAUSE : PLAY;
    aBtn.setAttribute('aria-label', on ? 'إيقاف التسجيل مؤقتاً' : 'تشغيل التسجيل');
    aBox.classList.toggle('is-on', on);
    const d = isFinite(audio.duration) ? audio.duration : 0;
    setText(aTime, failed ? 'تعذّر تشغيل التسجيل'
      : blocked ? 'المس للتشغيل'
        : audio.currentTime > 0 ? mmss(audio.currentTime) + (d ? ' / ' + mmss(d) : '')
          : want ? 'جاري التحميل…' : (set === 'm' ? 'استمع لأذكار الصباح' : 'استمع لأذكار المساء'));
    aBar.firstChild.style.width = d ? Math.min(100, (100 * audio.currentTime) / d).toFixed(1) + '%' : '0';
  }
  aBtn.addEventListener('click', (e) => { e.stopPropagation(); if (want && !blocked) pauseAudio(); else playAudio(); });
  audio.addEventListener('playing', () => { blocked = false; failed = false; renderAudio(); });
  audio.addEventListener('pause', renderAudio);
  audio.addEventListener('ended', () => { want = false; renderAudio(); });
  audio.addEventListener('error', () => { if (audio.getAttribute('src')) { want = false; failed = true; renderAudio(); } });

  // Start by itself once per session, when the adhkar come up by themselves (or are previewed).
  const AUTO = 'adhkar-audio';
  function maybeAuto(t) {
    if (!visible || want || finished || !config.adhkar.audioAuto || !recUrl()) return;
    if (!(now() < forceUntil || inWindow(t))) return;
    if (store.get(AUTO, '') === key) return;
    if ((held && held()) || (busyElsewhere && busyElsewhere())) return;
    store.set(AUTO, key);
    playAudio();
  }

  function load(t) {
    const s = setAt(t);
    const k = sessionKey(t, s);
    if (k === key) return;
    if (set && s !== set) { stopAudio(); audio.removeAttribute('src'); }
    set = s; key = k; list = adhkarFor(s);
    const saved = store.get('adhkar', null);
    if (saved && saved.key === k) { pos = Math.min(saved.pos, list.length - 1); remaining = saved.left; finished = !!saved.done; }
    else { pos = 0; remaining = list[0].n; finished = false; }
    el.style.setProperty('--ground', GROUND[s]);
    render();
    renderAudio();
  }
  const save = () => store.set('adhkar', { key, pos, left: remaining, done: finished });

  function go(i) {
    if (i >= list.length) { finished = true; save(); render(); return; }
    pos = Math.max(0, i);
    remaining = list[pos].n;
    save();
    render();
  }

  function render() {
    setText(title, set === 'm' ? 'أذكار الصباح' : 'أذكار المساء');
    el.classList.toggle('is-done', finished);
    done.hidden = !finished;
    if (finished) {
      setText(sub, set === 'm' ? 'بعد صلاة الفجر' : 'بعد صلاة العصر');
      setText(doneSub, set === 'm' ? 'أتممتم أذكار الصباح' : 'أتممتم أذكار المساء');
      dots.textContent = '';
      return;
    }
    const a = list[pos];
    setText(sub, (set === 'm' ? 'بعد صلاة الفجر' : 'بعد صلاة العصر') + ' · ' + (pos + 1) + ' من ' + list.length);
    setText(cardTitle, a.title);
    cardTitle.hidden = !a.title;
    setText(text, a.t);
    text.style.fontSize = fontFor(a.t.length) + 'px';
    text.setAttribute('data-size', String(fontFor(a.t.length))); // for the themes
    setText(ref, a.ref);
    setText(left, String(remaining));
    setText(times, a.n === 1 ? 'مرة واحدة' : timesAr(a.n) + ' · اضغط للعدّ');
    const fg = ring.querySelector('.a-ring-fg');
    fg.setAttribute('stroke-dashoffset', ((remaining / a.n) * C).toFixed(1));
    prev.disabled = pos === 0;
    dots.textContent = '';
    list.forEach((_, i) => dots.appendChild(h('i', { class: i < pos ? 'is-past' : i === pos ? 'is-on' : '' })));
  }

  let stepTimer = null;
  card.addEventListener('click', () => {
    if (finished || stepTimer) return;
    remaining = Math.max(0, remaining - 1);
    save();
    render();
    card.classList.remove('is-tap');
    void card.offsetWidth; // restart the little pulse
    card.classList.add('is-tap');
    if (remaining === 0) stepTimer = setTimeout(() => { stepTimer = null; go(pos + 1); }, 450);
  });
  prev.addEventListener('click', () => go(pos - 1));
  next.addEventListener('click', () => go(pos + 1));
  again.addEventListener('click', () => { finished = false; go(0); });
  // Closing ends this session's adhkar: the frame goes back to its usual screens.
  close.addEventListener('click', () => {
    stopAudio();
    finished = true;
    forceUntil = 0;
    save();
    render();
    window.dispatchEvent(new CustomEvent('frame:go', { detail: 'home' }));
  });

  // Should the frame bring this screen forward now? After Fajr and after Asr (once the prayer
  // screen's time is over), for config.adhkar.minutes, until the adhkar are done or closed.
  function inWindow(t) {
    if (!config.adhkar.auto) return false;
    const d = prayerDay(t);
    if (!d) return false;
    const after = (config.prayerFocus.enabled ? config.prayerFocus.after : 0) * MINUTE;
    for (const k of ['fajr', 'asr']) {
      const start = d[k] + after;
      if (t >= start && t < start + config.adhkar.minutes * MINUTE) return true;
    }
    return false;
  }
  function wantsFocus(t) {
    load(t);
    if (finished) return false;
    if (now() < forceUntil) return true;
    return inWindow(t);
  }

  return {
    name: 'adhkar', label: 'الأذكار', el,
    tick(t) {
      load(t);
      setText(clockTime, hhmm(t));
      setText(clockWhen, set === 'm' ? 'بعد صلاة الفجر' : 'بعد صلاة العصر');
      const hold = !!(held && held()), dk = !!(duck && duck());
      if (hold !== holding || dk !== ducking) { holding = hold; ducking = dk; sync(); }
      maybeAuto(t);
      renderAudio();
    },
    show() { visible = true; load(now()); render(); renderAudio(); maybeAuto(now()); },
    hide() { visible = false; if (want) pauseAudio(); },
    // The recording is playing (keeps the screen up; the Quran waits for it).
    audioPlaying: () => want && !blocked && !failed,
    stopAudio,
    unlock() { if (blocked) { blocked = false; sync(); } },
    wantsFocus,
    forced: () => !finished && now() < forceUntil,
    // Control panel preview: show the adhkar now (starting again if they were finished).
    force(until) {
      forceUntil = until || 0;
      if (forceUntil && finished) { finished = false; go(0); }
    },
  };
}
