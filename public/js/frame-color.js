// «تلوين الزليج» on the frame: a big zellige page to colour with a finger, tile by tile. Phones
// colour the same page at the same time. A finished page (and, at the end of the week, a page at
// least half coloured) is saved by the frame into the slideshow's photos.
import { h } from './util.js';
import { frameFetch, accessKey, DEMO } from './data.js';
import * as demo from './demo.js';
import { zelligeSvg, drawZellige, GLAZE, GLAZE_NAMES, EMPTY, pattern } from './zellige.js';
import { plip, fanfare, unlockAudio } from './sound.js';

const SIZE = 720;

export function createColoring({ stage }) {
  let state = null; // {page: {pid, fills, who, v, doneAt, savedAt}, archive: [...], tiles}
  let color = 0, mode = null, closeTimer = 0, saving = false;

  const art = h('div', { class: 'zc-art' });
  const title = h('div', { class: 'fun-title' }, 'تلوين الزليج');
  const sub = h('div', { class: 'fun-sub' });
  const progress = h('div', { class: 'zc-progress' }, h('i'));
  const palette = h('div', { class: 'zc-palette' });
  const who = h('div', { class: 'zc-who' });
  const done = h('div', { class: 'zc-done', hidden: true });
  const closeBtn = h('button', { class: 'fun-close', type: 'button', 'aria-label': 'إغلاق' }, '×');
  const confetti = h('div', { class: 'fw-confetti' });
  const modal = h('div', { class: 'fun-modal zc', hidden: true },
    h('div', { class: 'fun-scrim' }),
    h('div', { class: 'zc-panel' }, art, h('div', { class: 'zc-side' }, title, sub, progress, palette, who, done)),
    confetti, closeBtn);
  stage.append(modal);

  GLAZE.forEach((c, i) => {
    const b = h('button', { class: 'zc-swatch', type: 'button', 'aria-label': GLAZE_NAMES[i], style: 'background:' + c });
    b.addEventListener('click', () => { color = i; renderPalette(); });
    palette.appendChild(b);
  });
  const eraser = h('button', { class: 'zc-swatch zc-eraser', type: 'button', 'aria-label': 'ممحاة', html: '<svg width="30" height="30" viewBox="0 0 24 24"><path d="M4 16l8-8 6 6-6 6H8z" fill="#F3EDE2" stroke="#241707" stroke-width="1.6"/><path d="M8 20h12" stroke="#F3EDE2" stroke-width="1.6"/></svg>' });
  eraser.addEventListener('click', () => { color = -1; renderPalette(); });
  palette.appendChild(eraser);
  function renderPalette() { [...palette.children].forEach((b, i) => b.classList.toggle('is-on', (i === GLAZE.length ? -1 : i) === color)); }
  renderPalette();

  const filled = () => (state ? Object.keys(state.page.fills).length : 0);
  function renderInfo() {
    if (!state) return;
    const n = filled(), total = state.tiles;
    sub.textContent = pattern(state.page.pid).name + ' · ' + n + ' من ' + total;
    progress.firstChild.style.width = Math.round((100 * n) / total) + '%';
    const names = Object.keys(state.page.who || {}).filter((x) => x !== 'البيت').sort((a, b) => state.page.who[b] - state.page.who[a]);
    who.textContent = names.length ? 'يلوّن معكم: ' + names.slice(0, 5).join('، ') : 'الهواتف تلوّن هذه اللوحة نفسها من «مرح».';
  }
  function renderArt() {
    if (!state) return;
    art.innerHTML = zelligeSvg(state.page.pid, state.page.fills, SIZE);
    renderInfo();
  }
  function paint(tile, c) {
    const el = art.querySelector('path[data-t="' + tile + '"]');
    if (el) el.setAttribute('fill', c >= 0 ? GLAZE[c] : EMPTY);
  }

  art.addEventListener('pointerdown', async (e) => {
    const p = e.target.closest && e.target.closest('path[data-t]');
    if (!p || !state || mode !== 'open') return;
    e.preventDefault();
    unlockAudio();
    const tile = Number(p.getAttribute('data-t'));
    if ((state.page.fills[tile] == null ? -1 : state.page.fills[tile]) === color) return;
    if (color < 0) delete state.page.fills[tile]; else state.page.fills[tile] = color;
    paint(tile, color);
    plip();
    renderInfo();
    armClose();
    try {
      const r = DEMO ? demo.colorFill(tile, color, 'البيت') : await frameFetch('/api/pulse/coloring/fill', 'POST', { tile, color });
      if (r.done) finished();
    } catch (err) { /* the next load puts it right */ }
  });

  function finished() {
    if (!state || done.hidden === false) return;
    done.hidden = false;
    done.textContent = 'اكتملت اللوحة! ✨ تُحفظ في صور الإطار.';
    fanfare();
    confetti.textContent = '';
    for (let i = 0; i < 70; i++) {
      const p = h('i');
      p.style.cssText = 'left:' + (Math.random() * 1280).toFixed(0) + 'px;background:' + GLAZE[i % GLAZE.length];
      confetti.appendChild(p);
      p.animate([{ transform: 'translate(0,0) rotate(0)', opacity: 1 }, { transform: 'translate(' + ((Math.random() - 0.5) * 200).toFixed(0) + 'px,' + (700 + Math.random() * 200).toFixed(0) + 'px) rotate(' + (Math.random() * 720).toFixed(0) + 'deg)', opacity: 0.5 }],
        { duration: 2500 + Math.random() * 1500, delay: Math.random() * 600, fill: 'both' });
    }
    saveWaiting();
  }

  // ---------- saving finished pages into the photos ----------
  async function savePage(pid, fills, which) {
    const cv = document.createElement('canvas');
    cv.width = 1280; cv.height = 800;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#2A0D1B';
    ctx.fillRect(0, 0, 1280, 800);
    drawZellige(ctx, pid, fills, 280, 30, 720);
    ctx.fillStyle = 'rgba(243,237,226,.75)';
    ctx.font = '26px "Reem Kufi", "Readex Pro", sans-serif';
    ctx.textAlign = 'right';
    ctx.direction = 'rtl';
    ctx.fillText('لوحة العائلة · ' + pattern(pid).name, 1250, 780);
    const blob = await new Promise((ok) => cv.toBlob(ok, 'image/jpeg', 0.9));
    if (!blob) throw new Error('no image');
    const k = accessKey();
    const res = await fetch('/api/photos', { method: 'POST', body: blob, headers: Object.assign({ 'content-type': 'image/jpeg' }, k ? { 'x-key': k } : {}) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    await frameFetch('/api/pulse/coloring/saved', 'POST', { which });
  }
  async function saveWaiting() {
    if (DEMO || saving || !state) return;
    saving = true;
    try {
      if (state.page.doneAt && !state.page.savedAt) { await savePage(state.page.pid, state.page.fills, 'current'); state.page.savedAt = Date.now(); }
      for (const a of state.archive || []) await savePage(a.pid, a.fills, a.id);
      state.archive = [];
    } catch (e) { /* try again later */ }
    saving = false;
  }

  async function load() {
    try {
      state = DEMO ? demo.coloring() : await frameFetch('/api/pulse/coloring');
      if (mode === 'open') renderArt();
      saveWaiting();
    } catch (e) { /* next time */ }
  }
  load();
  setInterval(load, 15 * 60000);
  if (DEMO) window.addEventListener('storage', (e) => { if (e.key === 'fd:demo-coloring' && mode === 'open') load(); });

  function open() {
    unlockAudio();
    mode = 'open';
    modal.hidden = false;
    done.hidden = true;
    confetti.textContent = '';
    renderArt();
    load();
    modal.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300 });
    armClose();
  }
  function close() {
    clearTimeout(closeTimer);
    modal.hidden = true;
    mode = null;
  }
  function armClose() { clearTimeout(closeTimer); closeTimer = setTimeout(close, 3 * 60000); }
  closeBtn.addEventListener('click', close);
  modal.querySelector('.fun-scrim').addEventListener('click', close);

  return {
    open,
    busy: () => mode !== null,
    socket(m) {
      if (m.type === 'coloring') { state = m.coloring; if (mode === 'open') renderArt(); saveWaiting(); }
      if (m.type === 'color' && state) {
        if (m.pid !== state.page.pid) { load(); return; }
        if (m.color < 0) delete state.page.fills[m.tile]; else state.page.fills[m.tile] = m.color;
        state.page.who[m.from] = (state.page.who[m.from] || 0) + 1;
        if (mode === 'open') { paint(m.tile, m.color); renderInfo(); }
        if (m.done) { state.page.doneAt = state.page.doneAt || Date.now(); if (mode === 'open') finished(); else saveWaiting(); }
      }
    },
  };
}
