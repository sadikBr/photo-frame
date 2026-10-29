// «القرآن» in the control panel: choose what the frame recites (Sheikh Ahmad Al-Nufais), pause
// or stop it from anywhere, set times (al-Kahf on Friday…), or listen on this phone.
import * as demo from './demo.js';
import { SURAHS, surahName, surahUrl, RECITERS, DEFAULT_RECITER, SCHEDULE_SUGGESTIONS, DAYS_AR, daysLabel, mmss, BOOK } from './quran-common.js';

const PLAY = '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M8 5l11 7-11 7z" fill="currentColor"/></svg>';
const PAUSE = '<svg viewBox="0 0 24 24" width="22" height="22"><rect x="6" y="5" width="4" height="14" rx="1.2" fill="currentColor"/><rect x="14" y="5" width="4" height="14" rx="1.2" fill="currentColor"/></svg>';
const HEADPHONES = '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M4 14v-2a8 8 0 0 1 16 0v2" fill="none" stroke="currentColor" stroke-width="1.9"/><rect x="3" y="14" width="5" height="7" rx="1.5" fill="currentColor"/><rect x="16" y="14" width="5" height="7" rx="1.5" fill="currentColor"/></svg>';

export function initQuran({ api, send, toast, el, $, DEMO, me }) {
  let q = null, visible = false, timer = 0, newDays = [5];

  async function load() {
    try { q = DEMO ? demo.quran() : await api('/api/pulse/quran'); render(); } catch (e) { /* the status line says it */ }
  }
  async function cmd(action, extra) {
    const body = Object.assign({ action, from: me() || '' }, extra || {});
    try { q = DEMO ? demo.quranCmd(body) : await send('/api/pulse/quran/cmd', 'POST', body); render(); return true; } catch (e) { toast(e.message); return false; }
  }
  async function saveCfg(c) {
    try { q = DEMO ? demo.quranCfg(c) : await send('/api/pulse/quran', 'PUT', c); render(); return true; } catch (e) { toast(e.message); return false; }
  }

  // ---------- now playing ----------
  function pos() {
    const s = q && q.status;
    if (!s || !q.play || s.id !== q.play.id) return { pos: 0, dur: 0 };
    const p = s.pos + (s.state === 'playing' && !q.play.paused ? (Date.now() - s.at) / 1000 : 0);
    return { pos: s.dur ? Math.min(s.dur, p) : p, dur: s.dur };
  }
  function renderNow() {
    const p = q.play;
    $('qnNow').classList.toggle('is-idle', !p);
    if (!p) {
      $('qnName').textContent = 'لا شيء يُتلى الآن';
      $('qnSub').textContent = 'اختر سورة من القائمة لتُتلى على الإطار.';
      $('qnBar').style.width = '0';
      $('qnPlay').innerHTML = PLAY;
      return;
    }
    const n = p.list[p.idx];
    $('qnName').textContent = 'سورة ' + surahName(n);
    const st = q.status && q.status.id === p.id ? q.status.state : 'loading';
    const t = pos();
    const where = p.paused ? 'متوقفة مؤقتاً' : st === 'error' ? 'تعذّر تحميلها على الإطار' : st === 'loading' ? 'تُحمَّل على الإطار…' : 'تُتلى الآن على الإطار';
    $('qnSub').textContent = where + (t.dur ? ' · ' + mmss(t.pos) + ' / ' + mmss(t.dur) : '') + (p.list.length > 1 ? ' · ' + (p.idx + 1) + ' من ' + p.list.length : '') + (p.by && p.by !== 'البيت' ? ' · من ' + p.by : '');
    $('qnBar').style.width = t.dur ? Math.min(100, (100 * t.pos) / t.dur).toFixed(1) + '%' : '0';
    $('qnPlay').innerHTML = p.paused ? PLAY : PAUSE;
  }
  $('qnPlay').addEventListener('click', () => { if (q && q.play) cmd(q.play.paused ? 'resume' : 'pause'); });
  $('qnNext').addEventListener('click', () => cmd('next'));
  $('qnPrev').addEventListener('click', () => cmd('prev'));
  $('qnStop').addEventListener('click', () => cmd('stop'));
  let volTimer = 0;
  $('qnVol').addEventListener('input', () => {
    $('qnVolText').textContent = $('qnVol').value + '%';
    clearTimeout(volTimer);
    volTimer = setTimeout(() => cmd('volume', { volume: Number($('qnVol').value) / 100 }), 250);
  });

  // ---------- favourites ----------
  const here = $('qnHere');
  let hereN = 0;
  function renderFavs() {
    const ul = $('qnFavs');
    ul.textContent = '';
    const playing = q.play ? q.play.list[q.play.idx] : 0;
    for (const n of q.cfg.favs) {
      const frameBtn = el('button', { type: 'button', class: 'primary small', onclick: async () => { if (await cmd('play', { surah: n, mode: 'one' })) toast('سورة ' + surahName(n) + ' على الإطار.'); } }, el('span', { html: PLAY }), 'الإطار');
      const hereBtn = el('button', { type: 'button', class: 'ghost small qn-here' + (hereN === n && !here.paused ? ' is-on' : ''), 'aria-label': 'استمع هنا', html: HEADPHONES, onclick: () => listenHere(n) });
      const del = el('button', { type: 'button', class: 'qn-del', 'aria-label': 'أزل', onclick: () => saveCfg({ favs: q.cfg.favs.filter((x) => x !== n) }) }, '×');
      ul.append(el('li', { class: n === playing ? 'is-on' : '' }, el('span', { class: 'qn-n' }, String(n)), el('span', { class: 'qn-name' }, surahName(n)), hereBtn, frameBtn, del));
    }
    $('qnMode').value = q.cfg.mode === 'repeat' ? 'repeat' : 'list';
  }
  $('qnPlayAll').addEventListener('click', async () => {
    if (!q.cfg.favs.length) return;
    if (await cmd('play', { list: q.cfg.favs, idx: 0, mode: $('qnMode').value })) toast('القائمة كلها على الإطار، سورة بعد سورة.');
  });
  $('qnMode').addEventListener('change', () => saveCfg({ mode: $('qnMode').value }));
  const addSel = $('qnAdd');
  SURAHS.forEach((s, i) => addSel.append(el('option', { value: String(i + 1) }, (i + 1) + ' · ' + s)));
  $('qnAddBtn').addEventListener('click', () => {
    const n = Number(addSel.value);
    if (q.cfg.favs.includes(n)) { toast('موجودة في القائمة.'); return; }
    saveCfg({ favs: q.cfg.favs.concat([n]) });
  });
  function listenHere(n) {
    if (hereN === n && !here.paused) { here.pause(); renderFavs(); return; }
    hereN = n;
    here.src = surahUrl(n);
    here.hidden = false;
    $('qnHereName').textContent = 'سورة ' + surahName(n) + ' · على هذا الهاتف';
    $('qnHereBox').hidden = false;
    here.play().catch(() => {});
    renderFavs();
  }
  here.addEventListener('pause', renderFavs);
  here.addEventListener('play', renderFavs);

  // ---------- set times ----------
  function renderSched() {
    const ul = $('qnSched');
    ul.textContent = '';
    for (const s of q.cfg.schedules) {
      const sw = el('input', { type: 'checkbox', 'aria-label': 'مفعّل' });
      sw.checked = s.on !== false;
      sw.addEventListener('change', () => saveCfg({ schedules: q.cfg.schedules.map((x) => (x.id === s.id ? Object.assign({}, x, { on: sw.checked }) : x)) }));
      ul.append(el('li', null, el('label', { class: 'switch qn-sw' }, sw, el('span', null, el('b', null, surahName(s.surah)), ' · ' + daysLabel(s.days) + ' · ' + s.time)),
        el('button', { type: 'button', class: 'qn-del', 'aria-label': 'احذف', onclick: () => saveCfg({ schedules: q.cfg.schedules.filter((x) => x.id !== s.id) }) }, '×')));
    }
    $('qnSchedEmpty').hidden = q.cfg.schedules.length > 0;
    const sug = $('qnSuggest');
    sug.textContent = '';
    for (const x of SCHEDULE_SUGGESTIONS) {
      if (q.cfg.schedules.some((s) => s.surah === x.surah)) continue;
      sug.append(el('button', { type: 'button', class: 'chip', onclick: () => saveCfg({ schedules: q.cfg.schedules.concat([x]) }) }, '+ ' + surahName(x.surah) + ' · ' + daysLabel(x.days) + ' ' + x.time));
    }
  }
  const dayBox = $('qnDays');
  function renderDays() {
    dayBox.textContent = '';
    const all = newDays.length === 7;
    dayBox.append(el('button', { type: 'button', class: 'wheel-chip' + (all ? ' is-on' : ''), onclick: () => { newDays = all ? [5] : [0, 1, 2, 3, 4, 5, 6]; renderDays(); } }, 'كل يوم'));
    DAYS_AR.forEach((d, i) => dayBox.append(el('button', { type: 'button', class: 'wheel-chip' + (!all && newDays.includes(i) ? ' is-on' : ''), onclick: () => {
      newDays = all ? [i] : newDays.includes(i) ? newDays.filter((x) => x !== i) : newDays.concat([i]);
      renderDays();
    } }, d)));
  }
  const schedSel = $('qnSchedSurah');
  SURAHS.forEach((s, i) => schedSel.append(el('option', { value: String(i + 1) }, (i + 1) + ' · ' + s)));
  schedSel.value = '18';
  $('qnSchedAdd').addEventListener('click', async () => {
    const time = $('qnSchedTime').value;
    if (!/^\d\d:\d\d$/.test(time)) { toast('اختر الساعة.'); return; }
    if (!newDays.length) { toast('اختر يوماً واحداً على الأقل.'); return; }
    if (await saveCfg({ schedules: q.cfg.schedules.concat([{ surah: Number(schedSel.value), days: newDays.slice(), time }]) })) toast('ستُتلى ' + surahName(Number(schedSel.value)) + ' على الإطار ' + daysLabel(newDays) + ' على ' + time + '.');
  });
  renderDays();

  function render() {
    if (!q) return;
    renderNow();
    renderFavs();
    renderSched();
    if (document.activeElement !== $('qnVol')) {
      $('qnVol').value = String(Math.round(q.cfg.volume * 100));
      $('qnVolText').textContent = $('qnVol').value + '%';
    }
  }
  $('qnReciter').textContent = 'بصوت الشيخ ' + (RECITERS[DEFAULT_RECITER] || {}).name + '، على سمّاعة الإطار.';
  $('qnIcon').innerHTML = BOOK(26);
  function loop() { clearTimeout(timer); if (visible && document.visibilityState === 'visible') { load(); timer = setTimeout(loop, 4000); } }
  setInterval(() => { if (visible && q) renderNow(); }, 1000);
  if (DEMO) window.addEventListener('storage', (e) => { if (e.key === 'fd:demo-quran') load(); });
  load();
  return { shown(on) { visible = on; if (on) loop(); } };
}
