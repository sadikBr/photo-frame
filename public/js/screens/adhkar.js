// Morning and evening adhkar, one card at a time. Tap the card to count; when the count is done
// it moves to the next one. Comes forward on its own after Fajr and Asr (see main.js).
import config from '../config.js';
import { h, setText, now, parts, dayKey, MINUTE, store } from '../util.js';
import { prayerDay } from '../data.js';
import { adhkarFor, timesAr } from '../adhkar-data.js';

const GROUND = { m: '#173A4A', e: '#2B1B3D' };
const ARROW_PREV = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
const ARROW_NEXT = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>';
const CLOSE = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
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

export function createAdhkar() {
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

  const el = h('section', { class: 'screen s-adhkar', 'data-screen': 'adhkar', style: '--ground:' + GROUND.m },
    h('div', { class: 'a-head' }, h('div', null, title, sub), close),
    h('div', { class: 'a-body' }, prev, card, next, done),
    dots,
    h('div', { class: 'band' }),
  );

  let set = null, list = [], key = '', pos = 0, remaining = 0, finished = false;
  let forceUntil = 0;

  function load(t) {
    const s = setAt(t);
    const k = sessionKey(t, s);
    if (k === key) return;
    set = s; key = k; list = adhkarFor(s);
    const saved = store.get('adhkar', null);
    if (saved && saved.key === k) { pos = Math.min(saved.pos, list.length - 1); remaining = saved.left; finished = !!saved.done; }
    else { pos = 0; remaining = list[0].n; finished = false; }
    el.style.setProperty('--ground', GROUND[s]);
    render();
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
    finished = true;
    forceUntil = 0;
    save();
    render();
    window.dispatchEvent(new CustomEvent('frame:go', { detail: 'home' }));
  });

  // Should the frame bring this screen forward now? After Fajr and after Asr (once the prayer
  // screen's time is over), for config.adhkar.minutes, until the adhkar are done or closed.
  function wantsFocus(t) {
    load(t);
    if (finished) return false;
    if (now() < forceUntil) return true;
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

  return {
    name: 'adhkar', label: 'الأذكار', el,
    tick(t) { load(t); },
    show() { load(now()); render(); },
    wantsFocus,
    forced: () => !finished && now() < forceUntil,
    // Control panel preview: show the adhkar now (starting again if they were finished).
    force(until) {
      forceUntil = until || 0;
      if (forceUntil && finished) { finished = false; go(0); }
    },
  };
}
