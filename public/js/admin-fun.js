// «مرح» in the control panel: match mode (the score live, cheers to the frame), the secret knock
// (tap a rhythm, the frame plays it on its door; knocks from home make this phone buzz) and the
// wheel (spin it here, it spins on the frame too).
import { store } from './util.js';
import * as demo from './demo.js';
import { wheelSvg, landingAngle, choiceAt, WHEEL_TEMPLATES, doorSvg, flagSvg, teamBadge, CHEERS, cheerOf, rhythmRecorder, playRhythm, rhythmVibration, rhythmDots } from './fun-common.js';
import { tvLine, TV_SRC_AR } from './match-common.js';
import { unlockAudio, tick, fanfare, roar, whistle, plip } from './sound.js';
import { zelligeSvg, GLAZE, GLAZE_NAMES, EMPTY, pattern } from './zellige.js';

const words = (r) => r.map((t, i) => (i ? (t - r[i - 1] > 450 ? ' … ' : ' ') : '') + 'طق').join('');

export function initFun({ api, send, toast, el, $, DEMO, me, needName, showView, onSent }) {
  let visible = false;
  const sentText = (r) => (r && r.live ? 'وصلت إلى الإطار الآن.' : DEMO ? 'أُرسلت (نسخة تجريبية).' : 'أُرسلت. تظهر على الإطار حين يتصل.');
  document.addEventListener('pointerdown', unlockAudio, { capture: true, passive: true });

  // ================= match mode =================
  let view = null, known = null, mTimer = 0;
  const DAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  const hm = (t) => { const d = new Date(t); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
  function when(t) {
    const d = new Date(t), n = new Date();
    const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = Math.round((day(d) - day(n)) / 86400000);
    return (diff === 0 ? (d.getHours() >= 17 ? 'الليلة' : 'اليوم') : diff === 1 ? 'غداً' : DAYS[d.getDay()]) + ' على ' + hm(t);
  }
  const banner = el('button', { type: 'button', class: 'match-banner', hidden: true });
  banner.addEventListener('click', () => showView('fun'));
  document.querySelector('header.top').after(banner);

  function scoreRow(m) {
    const pre = m.state === 'pre';
    return el('div', { class: 'mc-score' },
      el('div', { class: 'mc-team' }, el('span', { class: 'mc-badge', html: flagSvg(46) }), el('b', null, 'المغرب')),
      el('div', { class: 'mc-num' }, pre ? '×' : m.mar.score + ' – ' + m.opp.score),
      el('div', { class: 'mc-team' }, el('span', { class: 'mc-badge', html: teamBadge(m.opp, 46, false) }), el('b', null, m.opp.name)));
  }
  function renderMatch() {
    const body = $('matchBody');
    body.textContent = '';
    const v = view;
    $('matchOn').checked = !!(v && (v.cfg ? v.cfg.on : v.on));
    $('matchPush').checked = !!(v && v.cfg && v.cfg.push);
    $('matchPush').closest('label').hidden = !(v && v.on);
    const m = v && v.match;
    const tvIn = $('matchTv');
    $('matchTvEdit').hidden = !(v && v.on && m && !m.preview && m.state !== 'post');
    const live = !!(v && v.on && v.mode === 'live' && m);
    $('cheers').hidden = !live;
    $('matchPreview').textContent = m && m.preview ? 'إيقاف المعاينة' : 'معاينة على الإطار (3 دقائق)';
    if (!v) { body.append(el('p', { class: 'hint' }, 'جاري التحميل…')); return; }
    if (!v.on) { body.append(el('p', { class: 'mc-line' }, 'وضع الماتش متوقف.')); banner.hidden = true; return; }
    if (!m) { body.append(el('p', { class: 'mc-line' }, 'لا مباراة للمنتخب في اليومين القادمين. حين تكون، يتحوّل الإطار وحده إلى شاشة الملعب قبل البداية بربع ساعة.')); banner.hidden = true; return; }
    body.append(scoreRow(m));
    const meta = m.state === 'in' ? [m.phase, m.clock].filter(Boolean).join(' · ') : m.state === 'pre' ? (m.comp ? m.comp + ' · ' : '') + when(m.kickoff) : m.phase || 'انتهت';
    body.append(el('p', { class: 'mc-meta' + (m.state === 'in' ? ' is-live' : '') }, meta));
    if (v.tv && m.state !== 'post') {
      body.append(el('p', { class: 'mc-tv' }, tvLine(v.tv)), el('p', { class: 'hint mc-tv-src' }, TV_SRC_AR[v.tv.src] || ''));
      // Not while someone is typing (this card redraws every few seconds).
      if (document.activeElement !== tvIn) tvIn.value = v.tv.src === 'manual' ? v.tv.names[0] : '';
    }
    if (m.goals && m.goals.length) {
      body.append(el('ul', { class: 'mc-goals' }, m.goals.map((g) => el('li', { class: g.side === 'mar' ? 'is-mar' : '' }, '⚽ ' + (g.who || 'هدف') + ' ' + (g.min || '') + (g.side === 'mar' ? '' : ' (' + m.opp.name + ')')))));
    }
    if (live) body.append(el('p', { class: 'hint' }, 'الإطار الآن شاشة ملعب. شجّع من هنا فيظهر تشجيعك عليه:'));
    banner.hidden = !live || visible;
    if (!banner.hidden) banner.textContent = '⚽ ' + (m.state === 'pre' ? 'المغرب × ' + m.opp.name + ' · ' + hm(m.kickoff) : 'المغرب ' + m.mar.score + ' – ' + m.opp.score + ' ' + m.opp.name + (m.clock ? ' · ' + m.clock : '')) + ' — شجّع';
  }
  function applyMatch(v) {
    const m = v && v.match, prev = known;
    if (m && prev && prev.id === m.id && document.visibilityState === 'visible') {
      if (m.mar.score > prev.mar) { toast('⚽ هدف للمغرب! ' + m.mar.score + ' – ' + m.opp.score); try { navigator.vibrate && navigator.vibrate([200, 80, 200, 80, 400]); } catch (e) { /* no */ } if (visible) roar(3); }
      else if (m.opp.score > prev.opp) toast('هدف لـ' + m.opp.name + ' · ' + m.mar.score + ' – ' + m.opp.score);
      if (prev.state === 'pre' && m.state === 'in' && visible) whistle(1);
    }
    known = m ? { id: m.id, state: m.state, mar: m.mar.score, opp: m.opp.score } : null;
    view = v;
    renderMatch();
    clearTimeout(mTimer);
    const live = v && v.mode === 'live';
    mTimer = setTimeout(loadMatch, live && (visible || document.visibilityState === 'visible') ? (DEMO ? 2000 : 10000) : 60000);
  }
  async function loadMatch() {
    try { applyMatch(DEMO ? demo.match() : await api('/api/pulse/match')); } catch (e) { clearTimeout(mTimer); mTimer = setTimeout(loadMatch, 60000); }
  }
  $('matchOn').addEventListener('change', async () => {
    try { applyMatch(DEMO ? demo.matchCfg({ on: $('matchOn').checked }) : await send('/api/pulse/match', 'PUT', { on: $('matchOn').checked })); } catch (e) { toast(e.message); }
  });
  $('matchPush').addEventListener('change', async () => {
    try { applyMatch(DEMO ? demo.matchCfg({ push: $('matchPush').checked }) : await send('/api/pulse/match', 'PUT', { push: $('matchPush').checked })); toast('حُفظ.'); } catch (e) { toast(e.message); }
  });
  // «القناة الناقلة» for this match only; empty = automatic again.
  async function saveTv() {
    const m = view && view.match;
    if (!m) return;
    const tv = { id: m.id, text: $('matchTv').value.trim() };
    try {
      applyMatch(DEMO ? demo.matchCfg({ tv: tv.text ? tv : null }) : await send('/api/pulse/match', 'PUT', { tv }));
      $('matchTv').blur();
      toast(tv.text ? 'حُفظت القناة لهذه المباراة.' : 'رجعت القناة إلى التلقائي.');
    } catch (e) { toast(e.message); }
  }
  $('matchTvSave').addEventListener('click', saveTv);
  $('matchTv').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); saveTv(); } });
  $('matchPreview').addEventListener('click', async () => {
    const stop = !!(view && view.match && view.match.preview);
    try {
      applyMatch(DEMO ? demo.matchPreview(stop) : await send('/api/pulse/match/preview', 'POST', stop ? { stop: true } : {}));
      if (!stop) toast('الإطار الآن في معاينة ماتش لمدة 3 دقائق: هدف للمغرب بعد 20 ثانية.');
    } catch (e) { toast(e.message); }
  });
  // Cheers
  for (const c of CHEERS) {
    const b = el('button', { type: 'button', class: 'cheer' }, el('span', { class: 'cheer-icon', html: c.icon(34) }), el('span', null, c.label));
    b.addEventListener('click', async () => {
      if (needName()) return;
      b.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.15)' }, { transform: 'scale(1)' }], { duration: 300 });
      try {
        const r = DEMO ? demo.cheer(me(), c.key) : await send('/api/pulse/match/cheer', 'POST', { from: me(), cheer: c.key });
        if (!store.get('cheered', false)) { store.set('cheered', true); toast('«' + c.label + '» — ' + sentText(r)); }
      } catch (e) { if (!/لحظة/.test(e.message)) toast(e.message); }
    });
    $('cheers').append(b);
  }

  // ================= the secret knock =================
  const pad = $('knockPad');
  pad.innerHTML = '';
  const door = el('span', { class: 'knock-door', html: doorSvg(110) });
  pad.append(door, el('span', { class: 'knock-pad-text' }, el('b', null, 'دقّ هنا بإيقاعك'), el('small', null, 'مثل: طق طق … طق')));
  let rhythm = null;
  const jolt = () => door.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-4px) rotate(-1deg)' }, { transform: 'translateX(2px)' }, { transform: 'translateX(0)' }], { duration: 150 });
  const rec = rhythmRecorder({
    onTap: (n) => { jolt(); $('knockDots').innerHTML = ''; $('knockState').textContent = 'طق ' + '•'.repeat(n); $('knockSend').disabled = true; $('knockSave').disabled = true; },
    onDone: (r) => {
      rhythm = r;
      $('knockState').textContent = 'إيقاعك: ' + words(r);
      $('knockDots').innerHTML = rhythmDots(r, 240);
      $('knockSend').disabled = false;
      $('knockSave').disabled = false;
    },
  });
  pad.addEventListener('pointerdown', (e) => { e.preventDefault(); unlockAudio(); rec.tap(); });
  async function sendKnock(r) {
    if (needName() || !r) return;
    try {
      const res = DEMO ? demo.pulseAdd({ kind: 'knock', from: me(), rhythm: r }) : await send('/api/pulse', 'POST', { kind: 'knock', from: me(), rhythm: r });
      toast('الدقّة — ' + sentText(res));
      if (onSent) onSent();
    } catch (e) { toast(e.message); }
  }
  $('knockSend').addEventListener('click', () => sendKnock(rhythm));
  $('knockSave').addEventListener('click', () => { if (!rhythm) return; store.set('my-knock', rhythm); renderMine(); toast('حُفظت دقّتك. أرسلها بضغطة من زر «دقّتي».'); });
  function renderMine() {
    const r = store.get('my-knock', null);
    $('myKnock').hidden = !r;
    if (r) $('myKnockDots').innerHTML = rhythmDots(r, 140);
  }
  $('myKnockSend').addEventListener('click', () => { const r = store.get('my-knock', null); if (r) { playRhythm(r, jolt); sendKnock(r); } });
  renderMine();

  // A knock for this phone (from home): buzz and knock in its rhythm.
  function playKnock(p) {
    const r = Array.isArray(p.rhythm) ? p.rhythm : [0];
    try { if (navigator.vibrate) navigator.vibrate(rhythmVibration(r)); } catch (e) { /* not allowed */ }
    playRhythm(r, jolt);
  }

  // ================= the wheel =================
  let wheels = [], cur = null, rot = 0, spinning = false, editing = null;
  const rotor = $('wheelRotor');
  function drawWheel() {
    rotor.innerHTML = cur ? wheelSvg(cur.items, 300) : '';
    rotor.style.transform = 'rotate(' + rot + 'deg)';
  }
  function renderWheels() {
    const chips = $('wheelChips');
    chips.textContent = '';
    if (!wheels.length) {
      $('wheelBox').hidden = true;
      $('wheelEmpty').hidden = false;
      return;
    }
    $('wheelBox').hidden = false;
    $('wheelEmpty').hidden = true;
    if (!cur || !wheels.some((w) => w.id === cur.id)) cur = wheels[0];
    else cur = wheels.find((w) => w.id === cur.id);
    for (const w of wheels) {
      const b = el('button', { type: 'button', class: 'wheel-chip' + (w.id === cur.id ? ' is-on' : '') }, w.name);
      b.addEventListener('click', () => { if (spinning) return; cur = w; $('wheelResult').textContent = ''; renderWheels(); });
      chips.append(b);
    }
    drawWheel();
  }
  function renderTemplates() {
    const box = $('wheelTemplates');
    box.textContent = '';
    for (const t of WHEEL_TEMPLATES) box.append(el('button', { type: 'button', class: 'chip', onclick: () => openForm(null, t) }, t.name));
  }
  async function loadWheels() {
    try { wheels = DEMO ? demo.wheels() : (await api('/api/pulse/wheels')).wheels; } catch (e) { /* keep */ }
    renderWheels();
  }
  async function saveWheels(list) {
    const r = DEMO ? { wheels: demo.saveWheels(list) } : await send('/api/pulse/wheels', 'PUT', { wheels: list });
    wheels = r.wheels;
    renderWheels();
  }
  $('wheelSpin').addEventListener('click', async () => {
    if (needName() || !cur || spinning) return;
    spinning = true;
    $('wheelSpin').disabled = true;
    $('wheelResult').textContent = '';
    unlockAudio();
    try {
      const r = DEMO ? demo.spin(cur.id, me()) : await send('/api/pulse/spin', 'POST', { wheel: cur.id, from: me() });
      const p = r.pulse;
      if (p.items.join('|') !== cur.items.join('|')) { cur = Object.assign({}, cur, { items: p.items }); drawWheel(); }
      // Turn 4–5 times, slowing down onto the result.
      const n = p.items.length;
      const target = landingAngle(p.idx, n, (Math.random() - 0.5));
      const D = (((target - rot) % 360) + 360) % 360 + 360 * 4;
      const start = rot, t0 = performance.now(), dur = 4800;
      let last = choiceAt(rot, n);
      await new Promise((done) => {
        const step = (t) => {
          const u = Math.min(1, (t - t0) / dur);
          rot = start + D * (1 - Math.pow(1 - u, 4));
          rotor.style.transform = 'rotate(' + rot.toFixed(2) + 'deg)';
          const i = choiceAt(rot, n);
          if (i !== last) { last = i; tick(0.25); }
          if (u < 1) requestAnimationFrame(step); else done();
        };
        requestAnimationFrame(step);
      });
      rot %= 360;
      fanfare(0.12);
      $('wheelResult').textContent = '';
      $('wheelResult').append(el('span', null, 'النتيجة: '), el('b', null, p.result));
      $('wheelResult').animate([{ transform: 'scale(.7)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: 400, easing: 'cubic-bezier(.2,.9,.3,1.3)' });
      if (r.live) toast('دارت على الإطار أيضاً.');
      if (onSent) onSent();
    } catch (e) { toast(e.message); }
    spinning = false;
    $('wheelSpin').disabled = false;
  });

  // ----- adding and changing wheels -----
  function openForm(w, template) {
    editing = w ? w.id : null;
    const src = w || template || { name: '', items: [] };
    $('wheelName').value = src.name;
    $('wheelItems').value = src.items.join('\n');
    $('wheelDelete').hidden = !w;
    $('wheelForm').hidden = false;
    $('wheelName').focus();
  }
  $('wheelNew').addEventListener('click', () => openForm(null));
  $('wheelNew2').addEventListener('click', () => openForm(null));
  $('wheelEdit').addEventListener('click', () => { if (cur) openForm(cur); });
  $('wheelCancel').addEventListener('click', () => { $('wheelForm').hidden = true; });
  $('wheelForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('wheelName').value.trim();
    const items = [...new Set($('wheelItems').value.split(/\n|،|,/).map((x) => x.trim()).filter(Boolean))];
    if (!name) { toast('اكتب اسماً للعجلة، مثل «من يغسل الصحون؟».'); return; }
    if (items.length < 2) { toast('اكتب خيارين على الأقل، كل خيار في سطر.'); return; }
    if (items.length > 12) { toast('12 خياراً على الأكثر.'); return; }
    const list = wheels.slice();
    if (editing) { const i = list.findIndex((x) => x.id === editing); if (i >= 0) list[i] = { id: editing, name, items }; }
    else list.push({ name, items });
    try {
      await saveWheels(list);
      cur = editing ? wheels.find((x) => x.id === editing) : wheels[wheels.length - 1];
      rot = 0;
      renderWheels();
      $('wheelForm').hidden = true;
      toast('حُفظت العجلة. تجدها أيضاً على الإطار (زر «العجلة»).');
    } catch (err) { toast(err.message); }
  });
  $('wheelDelete').addEventListener('click', async () => {
    const b = $('wheelDelete');
    if (!b.classList.contains('is-confirm')) { b.classList.add('is-confirm'); b.textContent = 'اضغط مرة أخرى للحذف'; setTimeout(() => { b.classList.remove('is-confirm'); b.textContent = 'حذف العجلة'; }, 3000); return; }
    try { await saveWheels(wheels.filter((x) => x.id !== editing)); $('wheelForm').hidden = true; cur = null; renderWheels(); } catch (err) { toast(err.message); }
  });
  renderTemplates();
  if (DEMO) window.addEventListener('storage', (e) => { if (e.key === 'fd:demo-wheels') loadWheels(); if (e.key === 'fd:demo-match-start') loadMatch(); if (e.key === 'fd:demo-coloring') loadColor(); });

  // ================= zellige colouring =================
  let cstate = null, ccolor = 0, cTimer = 0, cpid = null;
  const cpal = $('colorPalette');
  GLAZE.forEach((c, i) => cpal.append(el('button', { type: 'button', class: 'zc-sw', 'aria-label': GLAZE_NAMES[i], style: 'background:' + c, onclick: () => { ccolor = i; renderPal(); } })));
  cpal.append(el('button', { type: 'button', class: 'zc-sw zc-er', 'aria-label': 'ممحاة', onclick: () => { ccolor = -1; renderPal(); } }, '⌫'));
  function renderPal() { [...cpal.children].forEach((b, i) => b.classList.toggle('is-on', (i === GLAZE.length ? -1 : i) === ccolor)); }
  renderPal();
  function renderColorInfo() {
    if (!cstate) return;
    const n = Object.keys(cstate.page.fills).length;
    const names = Object.keys(cstate.page.who || {}).filter((x) => x !== 'البيت');
    $('colorInfo').textContent = pattern(cstate.page.pid).name + ' · لُوّن ' + n + ' من ' + cstate.tiles + (cstate.page.doneAt ? ' ✨ اكتملت!' : '') + (names.length ? ' · مع: ' + names.slice(0, 4).join('، ') : '');
  }
  function renderColor(full) {
    if (!cstate) return;
    const art = $('colorArt');
    if (full || cpid !== cstate.page.pid || !art.firstChild) {
      art.innerHTML = zelligeSvg(cstate.page.pid, cstate.page.fills, 300, 'zl-svg');
      cpid = cstate.page.pid;
    } else {
      for (const pth of art.querySelectorAll('path[data-t]')) {
        const f = cstate.page.fills[pth.getAttribute('data-t')];
        const c = f != null && f >= 0 ? GLAZE[f] : EMPTY;
        if (pth.getAttribute('fill') !== c) pth.setAttribute('fill', c);
      }
    }
    renderColorInfo();
  }
  let lastTap = 0;
  async function loadColor() {
    if (Date.now() - lastTap < 2500) return; // (don't undo a tap the server hasn't counted yet)
    try { cstate = DEMO ? demo.coloring() : await api('/api/pulse/coloring'); renderColor(); } catch (e) { /* later */ }
  }
  $('colorArt').addEventListener('click', async (e) => {
    const pth = e.target.closest && e.target.closest('path[data-t]');
    if (!pth || !cstate || needName()) return;
    unlockAudio();
    const tile = Number(pth.getAttribute('data-t'));
    lastTap = Date.now();
    if (ccolor < 0) delete cstate.page.fills[tile]; else cstate.page.fills[tile] = ccolor;
    pth.setAttribute('fill', ccolor >= 0 ? GLAZE[ccolor] : EMPTY);
    plip(0.12);
    renderColorInfo();
    try {
      const r = DEMO ? demo.colorFill(tile, ccolor, me()) : await send('/api/pulse/coloring/fill', 'POST', { tile, color: ccolor, from: me() });
      if (r.done && !cstate.page.doneAt) { cstate.page.doneAt = Date.now(); fanfare(0.12); toast('اكتملت اللوحة! ✨ تُحفظ في صور الإطار.'); renderColorInfo(); }
    } catch (err) { toast(err.message); loadColor(); }
  });
  $('colorNew').addEventListener('click', async () => {
    const b = $('colorNew');
    if (!b.classList.contains('is-confirm')) { b.classList.add('is-confirm'); b.textContent = 'اضغط مرة أخرى: لوحة جديدة للجميع'; setTimeout(() => { b.classList.remove('is-confirm'); b.textContent = 'لوحة جديدة'; }, 3000); return; }
    b.classList.remove('is-confirm');
    b.textContent = 'لوحة جديدة';
    try { cstate = DEMO ? demo.colorNew() : await send('/api/pulse/coloring/new', 'POST', { from: me() || '' }); renderColor(true); } catch (e) { toast(e.message); }
  });
  function colorLoop() { clearTimeout(cTimer); if (visible && document.visibilityState === 'visible') { loadColor(); cTimer = setTimeout(colorLoop, 4000); } }

  loadMatch();
  loadWheels();
  return {
    playKnock,
    shown(on) {
      visible = on;
      if (on) { loadMatch(); loadWheels(); colorLoop(); }
      renderMatch();
    },
  };
}
