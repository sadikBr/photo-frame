// «القرآن» on the frame: recitations by Sheikh Ahmad Al-Nufais, streamed from mp3quran.net.
// Started from a phone (the control panel's «القرآن»), from the frame («القرآن» button), or at a
// set time (al-Kahf on Friday…). A small card at the top shows what is playing, with pause and
// stop. The adhan pauses it and it carries on afterwards; a moment from a phone turns it down
// while it plays.
import { h, now, parts, dayKey, store } from './util.js';
import { frameFetch, DEMO } from './data.js';
import * as demo from './demo.js';
import { SURAHS, surahName, surahUrl, RECITERS, DEFAULT_RECITER, BOOK, mmss } from './quran-common.js';

const PAUSE = '<svg width="22" height="22" viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1.2" fill="currentColor"/><rect x="14" y="5" width="4" height="14" rx="1.2" fill="currentColor"/></svg>';
const PLAY = '<svg width="22" height="22" viewBox="0 0 24 24"><path d="M8 5l11 7-11 7z" fill="currentColor"/></svg>';
const STOP = '<svg width="20" height="20" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor"/></svg>';
// RTL: "next" points left.
const NEXT = '<svg width="22" height="22" viewBox="0 0 24 24"><path d="M17 6v12L9 12zM7 6h2v12H7z" fill="currentColor"/></svg>';
const PREV = '<svg width="22" height="22" viewBox="0 0 24 24"><path d="M7 6v12l8-6zM15 6h2v12h-2z" fill="currentColor"/></svg>';

export function createQuran({ stage, chipBox, held, duck, onStart }) {
  let q = { cfg: { favs: [], volume: 0.8, mode: 'list', schedules: [] }, play: null, status: null };
  let cur = null; // what the audio element has loaded: {key, id, idx}
  let want = false, holding = false, ducking = false, blocked = false, lastReport = 0, retries = 0, modalOpen = false, closeTimer = 0;
  const audio = new Audio();
  audio.preload = 'auto';

  // ---------- the card at the top ----------
  const cTitle = h('span', { class: 'qr-title' });
  const cBar = h('span', { class: 'qr-bar' }, h('i'));
  const cPlay = h('button', { class: 'qr-btn', type: 'button', 'aria-label': 'إيقاف مؤقت' });
  const cStop = h('button', { class: 'qr-btn', type: 'button', 'aria-label': 'إيقاف', html: STOP });
  const chip = h('div', { class: 'qr-chip', hidden: true },
    h('button', { class: 'qr-open', type: 'button', 'aria-label': 'القرآن' }, h('span', { class: 'qr-icon', html: BOOK(24) }), cTitle, cBar),
    cPlay, cStop);
  chipBox.insertBefore(chip, chipBox.firstChild);
  chip.querySelector('.qr-open').addEventListener('click', () => open());
  cPlay.addEventListener('click', () => { if (blocked) { blocked = false; sync(); return; } cmd(q.play && q.play.paused ? 'resume' : 'pause'); });
  cStop.addEventListener('click', () => cmd('stop'));

  // ---------- the picker (the «القرآن» button) ----------
  const favBox = h('div', { class: 'qr-favs' });
  const allBox = h('div', { class: 'qr-all', hidden: true });
  const mName = h('div', { class: 'qr-np-name' });
  const mTime = h('div', { class: 'qr-np-time' });
  const mBar = h('div', { class: 'qr-np-bar' }, h('i'));
  const mPlay = h('button', { class: 'qr-big', type: 'button' });
  const mPrev = h('button', { class: 'qr-mid', type: 'button', 'aria-label': 'السابقة', html: PREV });
  const mNext = h('button', { class: 'qr-mid', type: 'button', 'aria-label': 'التالية', html: NEXT });
  const mStop = h('button', { class: 'qr-mid', type: 'button', 'aria-label': 'إيقاف', html: STOP });
  const vDown = h('button', { class: 'qr-mid', type: 'button', 'aria-label': 'أخفض' }, '−');
  const vUp = h('button', { class: 'qr-mid', type: 'button', 'aria-label': 'أعلى' }, '+');
  const vText = h('span', { class: 'qr-vol' });
  const allBtn = h('button', { class: 'fun-btn ghost', type: 'button' }, 'كل السور');
  const listBtn = h('button', { class: 'fun-btn', type: 'button' }, 'تشغيل القائمة كلها');
  const np = h('div', { class: 'qr-np' }, h('div', { class: 'qr-np-text' }, mName, mTime, mBar),
    h('div', { class: 'qr-np-btns' }, mPrev, mPlay, mNext, mStop), h('div', { class: 'qr-np-vol' }, vDown, vText, vUp));
  const closeBtn = h('button', { class: 'fun-close', type: 'button', 'aria-label': 'إغلاق' }, '×');
  const modal = h('div', { class: 'fun-modal qr', hidden: true },
    h('div', { class: 'fun-scrim' }),
    h('div', { class: 'qr-panel' },
      h('div', { class: 'qr-head' }, h('div', null, h('div', { class: 'fun-title' }, 'القرآن الكريم'), h('div', { class: 'fun-sub' }, 'بصوت الشيخ ' + (RECITERS[DEFAULT_RECITER] || {}).name)),
        h('div', { class: 'qr-head-btns' }, listBtn, allBtn)),
      favBox, allBox, np),
    closeBtn);
  stage.append(modal);
  for (let n = 1; n <= 114; n++) {
    const b = h('button', { class: 'qr-s', type: 'button' }, h('small', null, String(n)), SURAHS[n - 1]);
    b.addEventListener('click', () => { cmd('play', { surah: n, mode: 'one' }); allBox.hidden = true; favBox.hidden = false; allBtn.textContent = 'كل السور'; });
    allBox.appendChild(b);
  }
  allBtn.addEventListener('click', () => { allBox.hidden = !allBox.hidden; favBox.hidden = !allBox.hidden; allBtn.textContent = allBox.hidden ? 'كل السور' : 'المفضلة'; armClose(); });
  listBtn.addEventListener('click', () => { if (q.cfg.favs.length) cmd('play', { list: q.cfg.favs, idx: 0 }); });
  mPlay.addEventListener('click', () => { if (blocked) { blocked = false; sync(); return; } if (!q.play) return; cmd(q.play.paused ? 'resume' : 'pause'); });
  mPrev.addEventListener('click', () => cmd('prev'));
  mNext.addEventListener('click', () => cmd('next'));
  mStop.addEventListener('click', () => cmd('stop'));
  vDown.addEventListener('click', () => cmd('volume', { volume: Math.max(0, Math.round((q.cfg.volume - 0.1) * 10) / 10) }));
  vUp.addEventListener('click', () => cmd('volume', { volume: Math.min(1, Math.round((q.cfg.volume + 0.1) * 10) / 10) }));
  closeBtn.addEventListener('click', close);
  modal.querySelector('.fun-scrim').addEventListener('click', close);
  modal.addEventListener('pointerdown', () => armClose());

  function renderFavs() {
    favBox.textContent = '';
    for (const n of q.cfg.favs) {
      const on = q.play && q.play.list[q.play.idx] === n;
      const b = h('button', { class: 'qr-fav' + (on ? ' is-on' : ''), type: 'button' }, h('span', { class: 'qr-fav-n' }, String(n)), surahName(n));
      b.addEventListener('click', () => cmd('play', { surah: n, mode: 'one' }));
      favBox.appendChild(b);
    }
  }
  function open() {
    modalOpen = true;
    modal.hidden = false;
    allBox.hidden = true;
    favBox.hidden = false;
    allBtn.textContent = 'كل السور';
    renderFavs();
    render();
    modal.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300 });
    armClose();
  }
  function close() { modalOpen = false; modal.hidden = true; clearTimeout(closeTimer); }
  function armClose() { clearTimeout(closeTimer); closeTimer = setTimeout(close, 90000); }

  // ---------- commands (the server keeps the truth, so phones see the same) ----------
  async function cmd(action, extra) {
    const body = Object.assign({ action }, extra || {});
    try { apply(DEMO ? demo.quranCmd(body) : await frameFetch('/api/pulse/quran/cmd', 'POST', body)); } catch (e) { /* the server will say */ }
  }
  function report(state) {
    const p = q.play;
    if (!p || DEMO) { if (DEMO && p) demo.quranStatus({ id: p.id, idx: cur ? cur.idx : p.idx, state, pos: audio.currentTime || 0, dur: isFinite(audio.duration) ? audio.duration : 0 }); return; }
    lastReport = Date.now();
    frameFetch('/api/pulse/quran/status', 'POST', { id: p.id, idx: cur ? cur.idx : p.idx, state, pos: audio.currentTime || 0, dur: isFinite(audio.duration) ? audio.duration : 0 }).catch(() => {});
  }

  // ---------- playing ----------
  function load(n, idx) {
    cur = { key: q.play.id + ':' + idx, id: q.play.id, idx };
    retries = 0;
    audio.src = surahUrl(n);
    try { audio.load(); } catch (e) { /* old WebView */ }
    report('loading');
  }
  function apply(nq) {
    if (!nq || !nq.cfg) return;
    const was = q.play && !q.play.paused ? q.play.id : null;
    q = nq;
    const p = q.play;
    // Starting (or resuming) a recitation stops the adhkar recording.
    if (p && !p.paused && p.id !== was && onStart) onStart();
    if (!p) {
      want = false;
      if (cur) { audio.pause(); audio.removeAttribute('src'); try { audio.load(); } catch (e) { /* none */ } cur = null; }
    } else {
      if (!cur || cur.key !== p.id + ':' + p.idx) load(p.list[p.idx], p.idx);
      want = !p.paused;
    }
    sync();
    if (modalOpen) renderFavs();
    render();
  }
  function setVolume() { audio.volume = Math.max(0, Math.min(1, (q.cfg.volume == null ? 0.8 : q.cfg.volume) * (ducking ? 0.2 : 1))); }
  function sync() {
    setVolume();
    const should = want && !holding && cur;
    if (should && audio.paused && !blocked) {
      const pr = audio.play();
      if (pr && pr.catch) pr.catch((e) => { if (e && e.name === 'NotAllowedError') { blocked = true; render(); } });
    }
    if (!should && !audio.paused) audio.pause();
  }
  audio.addEventListener('playing', () => { blocked = false; retries = 0; report('playing'); render(); });
  audio.addEventListener('pause', () => { if (q.play && !audio.ended) report(holding ? 'playing' : 'paused'); render(); });
  audio.addEventListener('timeupdate', () => { if (Date.now() - lastReport > 30000) report('playing'); });
  audio.addEventListener('ended', () => {
    const p = q.play;
    if (!p || !cur) return;
    let i = cur.idx + 1;
    if (p.mode === 'one') i = -1;
    else if (i >= p.list.length) i = p.mode === 'repeat' ? 0 : -1;
    if (i < 0) { report('ended'); q = Object.assign({}, q, { play: null }); apply(q); return; }
    p.idx = i;
    load(p.list[i], i);
    sync();
    render();
  });
  audio.addEventListener('error', () => {
    if (!cur) return;
    // The network: try again a few times, then give up on this one.
    if (retries++ < 4) { setTimeout(() => { if (cur && q.play && cur.id === q.play.id) { audio.load(); sync(); } }, 5000 * retries); return; }
    report('error');
    render();
  });

  // ---------- what's shown ----------
  function render() {
    const p = q.play;
    chip.hidden = !p;
    if (p) {
      const n = p.list[cur ? cur.idx : p.idx];
      cTitle.textContent = 'سورة ' + surahName(n);
      cPlay.innerHTML = p.paused || blocked ? PLAY : PAUSE;
      cPlay.setAttribute('aria-label', p.paused ? 'تشغيل' : 'إيقاف مؤقت');
      chip.classList.toggle('is-paused', !!p.paused);
    }
    if (!modalOpen) return;
    np.classList.toggle('is-idle', !p);
    if (!p) {
      mName.textContent = 'اختر سورة';
      mTime.textContent = q.cfg.schedules.length ? 'أوقات التشغيل التلقائي تُضبط من الهاتف' : '';
      mBar.firstChild.style.width = '0';
    } else {
      const idx = cur ? cur.idx : p.idx;
      mName.textContent = 'سورة ' + surahName(p.list[idx]);
      if (p.list.length > 1) mName.append(h('span', { class: 'qr-np-pos' }, (idx + 1) + ' من ' + p.list.length));
      const d = isFinite(audio.duration) ? audio.duration : 0;
      mTime.textContent = blocked ? 'المس الشاشة للتشغيل' : audio.readyState < 2 && !audio.currentTime ? 'جاري التحميل…' : mmss(audio.currentTime) + (d ? ' / ' + mmss(d) : '');
      mBar.firstChild.style.width = d ? Math.min(100, (100 * audio.currentTime) / d).toFixed(1) + '%' : '0';
    }
    mPlay.innerHTML = !p || p.paused || blocked ? PLAY : PAUSE;
    vText.textContent = Math.round((q.cfg.volume == null ? 0.8 : q.cfg.volume) * 100) + '%';
  }

  // ---------- set times (al-Kahf on Friday…): the frame starts them ----------
  const FIRED = (DEMO ? 'demo-' : '') + 'quran-fired';
  function checkSchedules(t) {
    const pt = parts(t);
    const hm = String(pt.h).padStart(2, '0') + ':' + String(pt.mi).padStart(2, '0');
    const today = dayKey(t);
    for (const s of q.cfg.schedules || []) {
      if (s.on === false || s.time !== hm || !s.days.includes(pt.wd)) continue;
      const fired = store.get(FIRED, {});
      if (fired[s.id] === today) continue;
      fired[s.id] = today;
      store.set(FIRED, fired);
      if (!q.play && !(held && held())) cmd('play', { surah: s.surah, mode: 'one' }); // (not over something already playing)
    }
  }

  async function loadState() {
    try { apply(DEMO ? demo.quran() : await frameFetch('/api/pulse/quran')); } catch (e) { /* next time */ }
  }
  loadState();
  setInterval(loadState, 5 * 60000);
  if (DEMO) window.addEventListener('storage', (e) => { if (e.key === 'fd:demo-quran') loadState(); });

  let lastMinute = '';
  return {
    open,
    busy: () => modalOpen,
    playing: () => !!(q.play && !q.play.paused),
    tick(t) {
      const hold = !!(held && held()), dk = !!(duck && duck());
      if (hold !== holding || dk !== ducking) { holding = hold; ducking = dk; sync(); }
      const m = Math.floor(t / 60000);
      if (String(m) !== lastMinute) { lastMinute = String(m); checkSchedules(t); }
      if (modalOpen || (q.play && !chip.hidden)) {
        const d = isFinite(audio.duration) ? audio.duration : 0;
        cBar.firstChild.style.width = d ? Math.min(100, (100 * audio.currentTime) / d).toFixed(1) + '%' : '0';
        if (modalOpen) render();
      }
    },
    unlock() { if (blocked) { blocked = false; sync(); } },
    socket(m) { if (m.type === 'quran') apply(m.quran); },
  };
}
