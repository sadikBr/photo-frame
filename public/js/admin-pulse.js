// «نبضة» in the control panel: send a tap, a finger drawing or a short voice note to the frame,
// and see the hearts sent back from home.
import { store } from './util.js';
import * as demo from './demo.js';
import { PEN, TAPS, tapOf, tapIcon, MIC, PEN_ICON, HEART_ICON, drawStrokes, penWidth, PAD_BG } from './pulse-common.js';

const NAMES = ['ماما', 'بابا', 'جدتي', 'جدي', 'خالتي', 'عمتي'];
const MAX_REC = 15; // seconds
const MAX_POINTS = 7800; // the server keeps 8000

export function initPulse({ api, send, toast, el, $, key, DEMO, showView, playKnock }) {
  let me = store.get('pulse-from', '');
  let visible = false;
  let watching = false; // the «مرح» tab is open: knocks from home should arrive quickly too

  // ================= who is sending =================
  function renderWho() {
    $('whoCard').hidden = !!me;
    $('whoLine').hidden = !me;
    $('whoName').textContent = me;
    const chips = $('whoChips');
    chips.textContent = '';
    for (const n of NAMES) {
      chips.append(el('button', { type: 'button', class: 'chip who-chip' + (n === me ? ' is-on' : ''), onclick: () => setMe(n) }, n));
    }
  }
  function setMe(n) {
    n = String(n || '').replace(/\s+/g, ' ').trim().slice(0, 24);
    if (!n) return;
    me = n;
    store.set('pulse-from', me);
    renderWho();
    renderFeed();
    if (typeof tellServer === 'function') tellServer().catch(() => {});
    toast('ترسل الآن باسم «' + me + '». هكذا يظهر اسمك على الإطار.');
  }
  $('whoForm').addEventListener('submit', (e) => { e.preventDefault(); setMe($('whoInput').value); $('whoInput').value = ''; });
  $('whoChange').addEventListener('click', () => { $('whoCard').hidden = false; $('whoLine').hidden = true; $('whoInput').focus(); });
  function needName() {
    if (me) return false;
    if ($('v-pulse').hidden) showView('pulse'); // (asked from «مرح»)
    $('whoCard').scrollIntoView({ behavior: 'smooth', block: 'center' });
    $('whoCard').animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(8px)' }, { transform: 'translateX(0)' }], { duration: 320 });
    toast('اختر اسمك أولاً، ليعرف من في البيت من أرسل.');
    return true;
  }

  // ================= sending =================
  async function post(body) {
    if (DEMO) return demo.pulseAdd(body);
    return send('/api/pulse', 'POST', body);
  }
  const sentText = (r) => (r && r.live ? 'وصلت إلى الإطار الآن.' : DEMO ? 'أُرسلت (نسخة تجريبية: تظهر على الإطار التجريبي المفتوح في المتصفح نفسه).' : 'أُرسلت. تظهر على الإطار حين يتصل (خلال ثوانٍ إن كان يعمل).');

  // ----- the six taps -----
  const taps = $('taps');
  for (const t of TAPS) {
    const b = el('button', { type: 'button', class: 'tap', 'data-tap': t.key },
      el('span', { class: 'tap-icon', html: tapIcon(t.key, 46) }),
      el('span', { class: 'tap-label' }, t.button),
      el('span', { class: 'tap-done', html: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>' }));
    b.addEventListener('click', async () => {
      if (needName() || b.classList.contains('is-busy')) return;
      b.classList.add('is-busy');
      b.querySelector('.tap-icon').animate([{ transform: 'scale(1)' }, { transform: 'scale(1.35)' }, { transform: 'scale(.95)' }, { transform: 'scale(1)' }], { duration: 520, easing: 'ease-out' });
      try {
        const r = await post({ kind: 'tap', tap: t.key, from: me });
        b.classList.add('is-sent');
        toast('«' + t.title + '» — ' + sentText(r));
        setTimeout(() => b.classList.remove('is-sent'), 2600);
        refresh();
      } catch (e) { toast(e.message); }
      b.classList.remove('is-busy');
    });
    taps.append(b);
  }

  // ================= drawing =================
  const pad = $('pad');
  const ctx = pad.getContext('2d');
  let strokes = [], cur = null, t0 = 0, color = 1, thick = false;
  const swatches = $('swatches');
  PEN.forEach((c, i) => {
    const s = el('button', { type: 'button', class: 'swatch', role: 'radio', 'aria-label': 'لون ' + (i + 1), style: 'background:' + c });
    s.addEventListener('click', () => { color = i; renderTools(); });
    swatches.append(s);
  });
  $('penSize').addEventListener('click', () => { thick = !thick; renderTools(); });
  function renderTools() {
    [...swatches.children].forEach((s, i) => { s.classList.toggle('is-on', i === color); s.setAttribute('aria-checked', String(i === color)); });
    const dot = $('penSize').firstElementChild;
    dot.style.background = PEN[color];
    dot.style.width = dot.style.height = (thick ? 18 : 9) + 'px';
    $('penSize').setAttribute('aria-label', thick ? 'قلم عريض' : 'قلم رفيع');
  }
  function sizePad() {
    // Draw at the screen's own resolution for crisp lines.
    const w = Math.round(pad.clientWidth * Math.min(window.devicePixelRatio || 1, 3));
    if (w && w !== pad.width) { pad.width = w; pad.height = Math.round(w * 0.75); redraw(); }
  }
  function redraw() {
    ctx.fillStyle = PAD_BG;
    ctx.fillRect(0, 0, pad.width, pad.height);
    drawStrokes(ctx, strokes, pad.width);
    const n = strokes.length;
    $('padEmpty').hidden = n > 0;
    $('padSend').disabled = !n;
    $('padUndo').disabled = !n;
    $('padClear').disabled = !n;
  }
  const points = () => strokes.reduce((n, s) => n + s.p.length / 3, 0);
  function at(e) {
    const r = pad.getBoundingClientRect();
    return [Math.round(Math.min(1000, Math.max(0, ((e.clientX - r.left) / r.width) * 1000))), Math.round(Math.min(1000, Math.max(0, ((e.clientY - r.top) / r.height) * 1000)))];
  }
  pad.addEventListener('pointerdown', (e) => {
    if (cur || e.button > 0) return;
    if (points() > MAX_POINTS) { toast('الرسمة ممتلئة. أرسلها أو امسح جزءاً منها.'); return; }
    e.preventDefault();
    pad.setPointerCapture(e.pointerId);
    if (!strokes.length) t0 = performance.now();
    const [x, y] = at(e);
    cur = { id: e.pointerId, s: { c: color, w: thick ? 2 : 1, p: [x, y, Math.round(performance.now() - t0)] } };
    strokes.push(cur.s);
    redraw();
  });
  pad.addEventListener('pointermove', (e) => {
    if (!cur || e.pointerId !== cur.id) return;
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of evs.length ? evs : [e]) {
      const [x, y] = at(ev);
      const p = cur.s.p;
      const px = p[p.length - 3], py = p[p.length - 2];
      if (Math.abs(x - px) + Math.abs(y - py) < 5) continue;
      if (points() > MAX_POINTS) { end(e); return; }
      p.push(x, y, Math.round(performance.now() - t0));
      // Just the new bit of line.
      const kx = pad.width / 1000, ky = pad.height / 1000;
      ctx.strokeStyle = PEN[cur.s.c];
      ctx.lineWidth = penWidth(cur.s.w, pad.width);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(px * kx, py * ky);
      ctx.lineTo(x * kx, y * ky);
      ctx.stroke();
    }
  });
  function end(e) { if (cur && e.pointerId === cur.id) cur = null; }
  pad.addEventListener('pointerup', end);
  pad.addEventListener('pointercancel', end);
  $('padUndo').addEventListener('click', () => { strokes.pop(); redraw(); });
  $('padClear').addEventListener('click', () => { strokes = []; redraw(); });
  $('padSend').addEventListener('click', async () => {
    if (needName() || !strokes.length) return;
    const b = $('padSend');
    b.disabled = true;
    b.textContent = 'جاري الإرسال…';
    try {
      const r = await post({ kind: 'draw', strokes, from: me });
      pad.animate([{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(.92) translateY(-12px)', opacity: 0.4 }, { transform: 'scale(1)', opacity: 1 }], { duration: 600, easing: 'ease-in-out' });
      strokes = [];
      redraw();
      toast('الرسمة — ' + sentText(r));
      refresh();
    } catch (e) { toast(e.message); b.disabled = false; }
    b.textContent = 'أرسل الرسمة';
  });
  window.addEventListener('resize', sizePad);
  renderTools();

  // ================= voice note =================
  const canRecord = !!(window.isSecureContext && navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
  let rec = null, recStream = null, chunks = [], recStart = 0, recTimer = null, recBlob = null, recDur = 0;
  const STOP = '<svg viewBox="0 0 24 24" width="34" height="34"><rect x="6" y="6" width="12" height="12" rx="2.5" fill="#241707"/></svg>';
  const ringLen = 2 * Math.PI * 56;
  $('recProg').style.strokeDasharray = String(ringLen);
  function recUI(state, sec) {
    const btn = $('recBtn');
    btn.classList.toggle('is-rec', state === 'rec');
    $('recIcon').innerHTML = state === 'rec' ? STOP : MIC(40);
    $('recProg').style.strokeDashoffset = String(ringLen * (1 - (state === 'rec' ? Math.min(1, sec / MAX_REC) : 0)));
    btn.setAttribute('aria-label', state === 'rec' ? 'أوقف التسجيل' : 'ابدأ التسجيل');
    $('recState').textContent = state === 'rec' ? '0:' + String(Math.floor(sec)).padStart(2, '0') + ' — اضغط للإيقاف'
      : state === 'done' ? 'اسمع قبل الإرسال' : state === 'off' ? 'التسجيل غير متاح هنا' : 'اضغط وتكلّم';
  }
  function pickType() {
    for (const t of ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm']) {
      try { if (MediaRecorder.isTypeSupported(t)) return t; } catch (e) { /* old browser */ }
    }
    return '';
  }
  async function startRec() {
    try {
      recStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch (e) {
      toast('لم يُسمح بالميكروفون. اسمح به لهذا الموقع من إعدادات المتصفح ثم حاول مرة أخرى.');
      return;
    }
    const type = pickType();
    try { rec = new MediaRecorder(recStream, Object.assign({ audioBitsPerSecond: 32000 }, type ? { mimeType: type } : {})); } catch (e) { rec = new MediaRecorder(recStream); }
    chunks = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = finishRec;
    rec.start(250);
    recStart = performance.now();
    $('recDone').hidden = true;
    recUI('rec', 0);
    recTimer = setInterval(() => {
      const sec = (performance.now() - recStart) / 1000;
      recUI('rec', sec);
      if (sec >= MAX_REC) stopRec();
    }, 100);
  }
  function stopRec() {
    clearInterval(recTimer);
    if (rec && rec.state !== 'inactive') rec.stop();
  }
  function finishRec() {
    recDur = Math.min(MAX_REC, (performance.now() - recStart) / 1000);
    if (recStream) recStream.getTracks().forEach((t) => t.stop());
    const type = (rec.mimeType || (chunks[0] && chunks[0].type) || 'audio/webm');
    recBlob = new Blob(chunks, { type });
    rec = null;
    if (recDur < 0.8 || !recBlob.size) { recBlob = null; recUI('idle'); toast('قصيرة جداً. اضغط مرة، تكلّم، ثم اضغط مرة أخرى.'); return; }
    $('recAudio').src = URL.createObjectURL(recBlob);
    $('recDone').hidden = false;
    recUI('done');
  }
  if (!canRecord) {
    $('recBtn').disabled = true;
    recUI('off');
    $('recHint').textContent = window.isSecureContext ? 'هذا المتصفح لا يسجّل الصوت. جرّب Chrome أو Safari حديثاً.' : 'التسجيل يعمل فقط على رابط https (أي بعد النشر على Cloudflare).';
  } else recUI('idle');
  $('recBtn').addEventListener('click', () => {
    if (needName()) return;
    if (rec) stopRec(); else startRec();
  });
  $('recAgain').addEventListener('click', () => { recBlob = null; $('recDone').hidden = true; recUI('idle'); });
  $('recSend').addEventListener('click', async () => {
    if (needName() || !recBlob) return;
    const b = $('recSend');
    b.disabled = true;
    b.textContent = 'جاري الإرسال…';
    try {
      if (recBlob.size > 590 * 1024) throw new Error('التسجيل كبير جداً. سجّل رسالة أقصر.');
      const type = recBlob.type.split(';')[0] || 'audio/webm';
      const dur = Math.round(recDur * 10) / 10;
      let r;
      if (DEMO) {
        const audioData = await new Promise((ok, no) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.onerror = no; fr.readAsDataURL(recBlob); });
        r = demo.pulseAdd({ kind: 'voice', from: me, audio: { type, dur }, audioData });
      } else {
        r = await api('/api/pulse/voice?from=' + encodeURIComponent(me) + '&dur=' + dur, { method: 'POST', body: recBlob, headers: { 'content-type': type } });
      }
      recBlob = null;
      $('recDone').hidden = true;
      recUI('idle');
      toast('الرسالة الصوتية — ' + sentText(r));
      refresh();
    } catch (e) { toast(e.message); }
    b.disabled = false;
    b.textContent = 'أرسل الرسالة';
  });

  // ================= what happened (and hearts back) =================
  let feed = [], live = null, shownCount = 12;
  let replySeen = store.get('pulse-reply-seen', 0);
  if (!replySeen) { replySeen = Date.now(); store.set('pulse-reply-seen', replySeen); }
  // Moments from the others that this phone has already shown (as a toast or in the list).
  let feedSeen = store.get('pulse-feed-seen', 0);
  if (!feedSeen) { feedSeen = Date.now(); store.set('pulse-feed-seen', feedSeen); }

  function ago(at) {
    const m = Math.round((Date.now() - at) / 60000);
    if (m < 1) return 'الآن';
    if (m < 60) return 'قبل ' + (m === 1 ? 'دقيقة' : m === 2 ? 'دقيقتين' : m <= 10 ? m + ' دقائق' : m + ' دقيقة');
    const d = new Date(at);
    const hm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    return hm;
  }
  const DAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  function dayLabel(at) {
    const d = new Date(at), t = new Date();
    const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = Math.round((day(t) - day(d)) / 86400000);
    return diff === 0 ? 'اليوم' : diff === 1 ? 'أمس' : DAYS[d.getDay()];
  }
  const tapTitle = (tap) => (tapOf(tap) || {}).title || '';
  const kindAr = (k, tap, mine) => (k === 'tap' ? '«' + tapTitle(tap) + '»' : k === 'draw' ? (mine ? 'رسمتك' : 'رسمة')
    : k === 'knock' ? (mine ? 'دقّتك' : 'دقّة') : (mine ? 'رسالتك الصوتية' : 'رسالة صوتية'));
  const DOOR_ICON = (s) => '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 22V10a7 7 0 0 1 14 0v12z" fill="#7E3F1D" stroke="#1A6C5E" stroke-width="2"/><circle cx="12" cy="15" r="2.6" fill="none" stroke="#D9A441" stroke-width="1.8"/></svg>';
  const WHEEL_ICON = (s) => '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12L12 2A10 10 0 0 1 22 12z" fill="#F2AE3D"/><path d="M12 12L22 12A10 10 0 0 1 12 22z" fill="#E8657A"/><path d="M12 12L12 22A10 10 0 0 1 2 12z" fill="#7FD3B5"/><path d="M12 12L2 12A10 10 0 0 1 12 2z" fill="#9DB9F5"/><circle cx="12" cy="12" r="2.4" fill="#241707"/></svg>';
  // A knock from home for this phone (or for everyone).
  const knockForMe = (p) => p.kind === 'knock' && p.from === 'البيت' && (!p.toName || p.toName === me);
  const heartFrom = (p) => (p.from === me ? 'قلبك' : 'قلب من ' + p.from);
  function line(p) {
    const mine = p.from === me;
    if (p.kind === 'reply') {
      const toMe = p.toName === me;
      return { icon: HEART_ICON(30), cls: 'is-reply' + (toMe ? ' is-mine' : ''),
        text: heartFrom(p) + (toMe ? ' إليك' : ' إلى ' + p.toName),
        sub: toMe ? 'على ' + kindAr(p.toKind, p.toTap, true) : '' };
    }
    // No verbs: they'd need to know if the sender is a man or a woman.
    const who = mine ? 'منك' : 'من ' + p.from;
    if (p.kind === 'knock') {
      if (p.from === 'البيت') return { icon: DOOR_ICON(30), cls: knockForMe(p) ? 'is-reply is-mine' : '', text: 'دقّة من البيت ' + (!p.toName ? 'إلى الجميع' : p.toName === me ? 'إليك' : 'إلى ' + p.toName), play: true };
      return { icon: DOOR_ICON(30), cls: mine ? 'is-mine' : '', text: 'دقّة ' + who + ' على الباب', play: true };
    }
    if (p.kind === 'spin') return { icon: WHEEL_ICON(30), cls: mine ? 'is-mine' : '', text: p.wheelName + ' ← ' + p.result, sub: p.from === 'البيت' ? '(من الإطار)' : '(' + who + ')' };
    if (p.kind === 'tap') return { icon: tapIcon(p.tap, 30), cls: mine ? 'is-mine' : '', text: '«' + tapTitle(p.tap) + '» ' + who };
    if (p.kind === 'draw') return { icon: PEN_ICON(30), cls: mine ? 'is-mine' : '', text: 'رسمة ' + who };
    return { icon: MIC(30), cls: mine ? 'is-mine' : '', text: 'رسالة صوتية ' + who + (p.audio && p.audio.dur ? ' (' + Math.round(p.audio.dur) + ' ث)' : '') };
  }
  const myHeartTo = (id) => feed.some((x) => x.kind === 'reply' && x.to === id && x.from === me);

  // A heart from this phone, to someone else's moment.
  async function sendHeart(p, btn) {
    if (needName()) return;
    if (btn) btn.disabled = true;
    try {
      if (DEMO) demo.pulseAdd({ kind: 'reply', from: me, to: p.id, toName: p.from, toKind: p.kind, toTap: p.tap });
      else await send('/api/pulse/reply', 'POST', { to: p.id, from: me });
      toast('وصل قلبك إلى ' + p.from + ' ❤');
      refresh();
    } catch (e) { toast(e.message); if (btn) btn.disabled = false; }
  }

  function renderFeed() {
    const ul = $('pulseFeed');
    ul.textContent = '';
    const items = feed.slice().reverse();
    if (!items.length) { ul.append(el('li', { class: 'feed-empty' }, 'لا شيء بعد. ابدأ بـ«أفكر فيكم» ❤')); }
    let lastDay = '';
    for (const p of items.slice(0, shownCount)) {
      const dl = dayLabel(p.at);
      if (dl !== lastDay) { ul.append(el('li', { class: 'feed-day' }, dl)); lastDay = dl; }
      const l = line(p);
      const canHeart = p.kind !== 'reply' && p.kind !== 'spin' && p.from !== 'البيت' && p.from !== me && me;
      let heart = null;
      if (canHeart) {
        const sent = myHeartTo(p.id);
        heart = el('button', { type: 'button', class: 'feed-heart' + (sent ? ' is-sent' : ''), 'aria-label': sent ? 'أرسلت قلباً' : 'ردّ بقلب إلى ' + p.from, disabled: sent, html: HEART_ICON(24, sent ? '#E8657A' : '#F3EDE2') });
        heart.addEventListener('click', () => sendHeart(p, heart));
      }
      let icon = el('span', { class: 'feed-icon', html: l.icon });
      if (l.play && playKnock) {
        icon = el('button', { type: 'button', class: 'feed-icon feed-play', 'aria-label': 'اسمع الدقّة', html: l.icon });
        icon.addEventListener('click', () => playKnock(p));
      }
      ul.append(el('li', { class: l.cls },
        icon,
        el('span', { class: 'feed-text' }, l.text, l.sub ? el('small', null, ' ' + l.sub) : null),
        el('time', null, ago(p.at)),
        heart));
    }
    $('feedMore').hidden = items.length <= shownCount;
    // Only the good news: "is the frame off?" is the status line at the top.
    $('pulseLive').classList.toggle('is-online', !!live);
    $('pulseLive').hidden = !live;
    $('pulseLiveText').textContent = 'الإطار يستقبل الآن';
  }
  $('feedMore').addEventListener('click', () => { shownCount += 20; renderFeed(); });

  function heartRain() {
    const box = el('div', { class: 'heart-rain', 'aria-hidden': 'true' });
    document.body.append(box);
    for (let i = 0; i < 16; i++) {
      const hEl = el('span', { html: HEART_ICON(20 + Math.random() * 26, ['#E8657A', '#EE9AAE', '#F2AE3D'][i % 3]) });
      hEl.style.left = (5 + Math.random() * 90) + '%';
      box.append(hEl);
      hEl.animate([{ transform: 'translateY(0) scale(.6)', opacity: 0 }, { opacity: 1, offset: 0.15 }, { transform: 'translateY(-' + (50 + Math.random() * 30) + 'vh) scale(1)', opacity: 0 }],
        { duration: 2200 + Math.random() * 1400, delay: Math.random() * 600, easing: 'ease-out', fill: 'both' });
    }
    setTimeout(() => box.remove(), 4400);
    if (navigator.vibrate) try { navigator.vibrate([30, 60, 30]); } catch (e) { /* not allowed */ }
  }

  // A moment arriving while the app is open: a card at the top, like on the frame.
  let toastBox = null, toastTimer = 0;
  function pulseToast(icon, title, body) {
    if (toastBox) toastBox.remove();
    clearTimeout(toastTimer);
    toastBox = el('button', { type: 'button', class: 'pulse-toast' }, el('span', { html: icon, style: 'flex:none' }), el('span', null, el('b', null, title), el('small', null, body)));
    toastBox.addEventListener('click', () => { toastBox.remove(); toastBox = null; showView('pulse'); });
    document.body.append(toastBox);
    toastBox.animate([{ transform: 'translate(-50%, -30px)', opacity: 0 }, { transform: 'translate(-50%, 0)', opacity: 1 }], { duration: 380, easing: 'cubic-bezier(.2,.9,.3,1.2)' });
    toastTimer = setTimeout(() => { if (toastBox) { toastBox.remove(); toastBox = null; } }, 6000);
  }
  function announce(p, more) {
    const extra = more ? ' (+' + more + ')' : '';
    if (p.kind === 'reply') {
      pulseToast(HEART_ICON(34), '❤ ' + heartFrom(p) + ' إليك' + extra, 'على ' + kindAr(p.toKind, p.toTap, true));
      heartRain();
      return;
    }
    if (p.kind === 'knock') {
      if (p.from === 'البيت' && !knockForMe(p)) return;
      pulseToast(DOOR_ICON(34), '🚪 دقّة من ' + p.from + extra, p.from === 'البيت' ? 'اضغط على الباب في القائمة لتسمعها مرة أخرى' : 'على باب البيت');
      if (knockForMe(p) && playKnock) playKnock(p);
      return;
    }
    if (p.kind === 'spin') { pulseToast(WHEEL_ICON(34), '🎡 ' + p.wheelName + extra, 'النتيجة: ' + p.result + ' · من ' + (p.from === 'البيت' ? 'الإطار' : p.from)); return; }
    const body = p.kind === 'tap' ? '«' + tapTitle(p.tap) + '»' : p.kind === 'draw' ? 'رسمة جديدة على الإطار' : 'رسالة صوتية';
    pulseToast(p.kind === 'tap' ? tapIcon(p.tap, 34) : p.kind === 'draw' ? PEN_ICON(34) : MIC(34), 'نبضة من ' + p.from + extra, body);
    if (p.kind === 'tap' && p.tap === 'love') heartRain();
  }

  // Opened from a knock's notification: play it once the list is in.
  let playId = null;
  try { const u = new URL(location.href); playId = u.searchParams.get('play'); if (playId) { u.searchParams.delete('play'); history.replaceState(null, '', u.pathname + u.search + u.hash); } } catch (e) { /* ignore */ }
  let loading = false;
  async function refresh() {
    if (loading) return;
    loading = true;
    try {
      if (DEMO) { feed = demo.pulses(0); live = Date.now() - store.get('demo-frame-alive', 0) < 12000 ? 1 : 0; } else {
        const j = await api('/api/pulse?light=1');
        feed = j.pulses;
        live = j.live;
      }
      if (me) {
        const replies = feed.filter((p) => ((p.kind === 'reply' && p.toName === me) || knockForMe(p)) && p.from !== me && p.at > replySeen);
        const others = feed.filter((p) => p.kind !== 'reply' && !(p.kind === 'knock' && p.from === 'البيت') && p.from !== me && p.at > feedSeen);
        if (replies.length) { replySeen = Math.max(...replies.map((p) => p.at)); store.set('pulse-reply-seen', replySeen); }
        if (others.length) { feedSeen = Math.max(...others.map((p) => p.at)); store.set('pulse-feed-seen', feedSeen); }
        if (document.visibilityState === 'visible') {
          // Hearts to me first: they are the reason to look.
          if (replies.length) announce(replies[replies.length - 1], replies.length - 1);
          else if (others.length) announce(others[others.length - 1], others.length - 1);
        }
      }
      renderFeed();
      if (playId) { const k = feed.find((x) => x.id === playId && x.kind === 'knock'); playId = null; if (k && playKnock) playKnock(k); }
    } catch (e) { /* the status line says it if the server is away */ }
    loading = false;
  }
  // Quick while this tab is open, slower otherwise (still catching hearts for the toast).
  let ticks = 0;
  setInterval(() => {
    ticks++;
    if (document.visibilityState !== 'visible') return;
    if (visible || watching || ticks % 5 === 0) refresh();
  }, 4000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });
  if (DEMO) window.addEventListener('storage', (e) => { if (e.key === 'fd:demo-pulses') refresh(); });
  // A notification arrived while the app is in front (the service worker passes it here), or
  // one was tapped: look now.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (!e.data) return;
      if (e.data.type === 'pulse-push') refresh();
      if (e.data.type === 'pulse-open') {
        if (e.data.kind === 'knock') { playId = e.data.id; showView('fun'); } else if (e.data.kind === 'match' || /#fun/.test(e.data.url || '')) showView('fun'); else showView('pulse');
        refresh();
      }
    });
  }

  // ================= notifications on this phone =================
  const pushOK = !DEMO && window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  let server = null; // {enabled, publicKey}
  let mySub = null;
  let pushPrefs = store.get('pulse-push', { notify: 'all', quietNight: true });
  const toKey = (s) => { const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)); return Uint8Array.from(b, (c) => c.charCodeAt(0)); };

  // What the service worker needs when the app is closed: the access key and who this is.
  async function saveWorkerConfig() {
    if (!('caches' in window)) return;
    try {
      const c = await caches.open('fd-cfg');
      await c.put('/__cfg', new Response(JSON.stringify({ key: key(), me, notify: pushPrefs.notify, quietNight: pushPrefs.quietNight, publicKey: server && server.publicKey })));
    } catch (e) { /* storage blocked */ }
  }
  async function tellServer() {
    if (!mySub || !me) return;
    await send('/api/pulse/push/subscribe', 'POST', { subscription: mySub.toJSON(), name: me, notify: pushPrefs.notify });
    await saveWorkerConfig();
  }

  function renderNotif(state, text) {
    $('notifState').textContent = text;
    $('notifDot').className = 'notif-dot' + (state === 'on' ? ' is-on' : state === 'blocked' ? ' is-off' : '');
    $('notifOn').hidden = state !== 'on';
    $('notifEnable').hidden = state !== 'ask';
    $('notifBanner').hidden = state !== 'ask' || store.get('pulse-banner-hidden', false);
    $('notifWhat').value = pushPrefs.notify;
    $('notifQuiet').checked = pushPrefs.quietNight !== false;
  }

  async function checkNotif() {
    if (DEMO) return renderNotif('none', 'في النسخة التجريبية لا تُرسل إشعارات. تعمل على الموقع الحقيقي (https).');
    if (!pushOK) {
      if (isIOS && !standalone) return renderNotif('none', 'على iPhone: أضف التطبيق إلى الشاشة الرئيسية أولاً (زر المشاركة ← «إضافة إلى الشاشة الرئيسية»)، ثم افتحه من هناك وفعّل الإشعارات.');
      return renderNotif('none', window.isSecureContext ? 'هذا المتصفح لا يدعم الإشعارات. جرّب Chrome على Android أو Safari على iPhone (iOS 16.4 أو أحدث).' : 'الإشعارات تعمل فقط على رابط https (بعد النشر على Cloudflare).');
    }
    let askErr = '';
    try { server = await api('/api/pulse/push'); } catch (e) { server = null; askErr = e.message || String(e); }
    if (!server) return renderNotif('none', 'تعذّر سؤال الخادم عن الإشعارات (' + askErr + '). أعد تحميل الصفحة؛ وإن تكرّر فتأكّد أن آخر نسخة منشورة (npm run deploy).');
    if (!server.enabled) {
      const miss = server.missing || [];
      if (miss.includes('VAPID_PRIVATE_KEY') && !miss.includes('VAPID_PUBLIC_KEY')) {
        return renderNotif('none', 'ينقص المفتاح السري VAPID_PRIVATE_KEY على Cloudflare. في مجلد المشروع: npx wrangler secret put VAPID_PRIVATE_KEY (القيمة من ملف .dev.vars، بدون «VAPID_PRIVATE_KEY=»)، ثم أعد تحميل هذه الصفحة.');
      }
      if (miss.includes('VAPID_PUBLIC_KEY') && !miss.includes('VAPID_PRIVATE_KEY')) {
        return renderNotif('none', 'ينقص VAPID_PUBLIC_KEY: تأكّد أنه في "vars" داخل wrangler.jsonc، ثم npm run deploy.');
      }
      return renderNotif('none', 'ينقص مفتاحا الإشعارات على الخادم: VAPID_PUBLIC_KEY في wrangler.jsonc ثم npm run deploy، و npx wrangler secret put VAPID_PRIVATE_KEY (انظر README).');
    }
    if (Notification.permission === 'denied') return renderNotif('blocked', 'الإشعارات ممنوعة لهذا الموقع. اسمح بها من إعدادات المتصفح (رمز القفل بجانب العنوان، أو إعدادات التطبيق).');
    const reg = await navigator.serviceWorker.ready;
    mySub = await reg.pushManager.getSubscription();
    if (mySub && Notification.permission === 'granted') {
      // The server may have forgotten this phone (or its name changed): tell it again.
      tellServer().catch(() => {});
      return renderNotif('on', 'مفعّلة: تصلك النبضات حتى والتطبيق مغلق.');
    }
    renderNotif('ask', 'غير مفعّلة على هذا الهاتف.');
  }

  async function enableNotif() {
    if (needName()) return;
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { checkNotif(); return; }
      const reg = await navigator.serviceWorker.ready;
      mySub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(server.publicKey) });
      await tellServer();
      renderNotif('on', 'مفعّلة: تصلك النبضات حتى والتطبيق مغلق.');
      toast('تم. ستصلك النبضات والقلوب على هذا الهاتف.');
    } catch (e) { toast('تعذّر تفعيل الإشعارات: ' + e.message); }
  }
  $('notifEnable').addEventListener('click', enableNotif);
  $('notifBannerOn').addEventListener('click', enableNotif);
  $('notifWhat').addEventListener('change', async () => {
    pushPrefs.notify = $('notifWhat').value;
    store.set('pulse-push', pushPrefs);
    try { await tellServer(); toast('حُفظ.'); } catch (e) { toast(e.message); }
  });
  $('notifQuiet').addEventListener('change', () => {
    pushPrefs.quietNight = $('notifQuiet').checked;
    store.set('pulse-push', pushPrefs);
    saveWorkerConfig();
  });
  $('notifTest').addEventListener('click', async () => {
    if (!mySub) return;
    try {
      const r = await send('/api/pulse/push/test', 'POST', { endpoint: mySub.endpoint });
      toast(r.ok ? 'أُرسل. يجب أن يظهر الإشعار خلال ثوانٍ؛ إن لم يظهر فانظر إعدادات الإشعارات لهذا التطبيق في الهاتف.' : r.status ? 'لم يقبله المتصفح (' + r.status + '). فعّل الإشعارات من جديد.' : 'تعذّر الوصول إلى خدمة الإشعارات. حاول بعد قليل.');
    } catch (e) { toast(e.message); }
  });
  $('notifOff').addEventListener('click', async () => {
    try {
      if (mySub) {
        await send('/api/pulse/push/unsubscribe', 'POST', { endpoint: mySub.endpoint });
        await mySub.unsubscribe();
      }
    } catch (e) { /* already gone */ }
    mySub = null;
    renderNotif('ask', 'أُوقفت على هذا الهاتف.');
  });

  // ================= invite =================
  $('inviteBtn').addEventListener('click', async () => {
    const url = location.origin + '/admin' + (DEMO ? '?demo' : key() ? '?key=' + encodeURIComponent(key()) : '') + '#pulse';
    const text = 'تطبيق «الإطار» لإرسال نبضة إلى البيت: افتح الرابط ثم أضفه إلى الشاشة الرئيسية.';
    try {
      if (navigator.share) { await navigator.share({ title: 'الإطار', text, url }); return; }
      await navigator.clipboard.writeText(url);
      toast('نُسخ الرابط. أرسله في واتساب.');
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      window.prompt('انسخ هذا الرابط:', url);
    }
  });

  renderWho();
  renderFeed();
  refresh();
  checkNotif().catch(() => renderNotif('none', 'تعذّر فحص الإشعارات.'));

  return {
    me: () => me,
    needName,
    refresh: () => refresh(),
    watch(on) { watching = on; if (on) refresh(); },
    shown(on) {
      visible = on;
      if (on) { requestAnimationFrame(() => { sizePad(); redraw(); }); refresh(); }
    },
  };
}
