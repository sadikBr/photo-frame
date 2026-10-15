// «نبضة» in the control panel: send a tap, a finger drawing or a short voice note to the frame,
// and see the hearts sent back from home.
import { store } from './util.js';
import * as demo from './demo.js';
import { PEN, TAPS, tapOf, tapIcon, MIC, PEN_ICON, HEART_ICON, drawStrokes, penWidth, PAD_BG } from './pulse-common.js';

const NAMES = ['ماما', 'بابا', 'جدتي', 'جدي', 'خالتي', 'عمتي'];
const MAX_REC = 15; // seconds
const MAX_POINTS = 7800; // the server keeps 8000

export function initPulse({ api, send, toast, el, $, key, DEMO }) {
  let me = store.get('pulse-from', '');
  let visible = false;

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
    toast('ترسل الآن باسم «' + me + '». هكذا يظهر اسمك على الإطار.');
  }
  $('whoForm').addEventListener('submit', (e) => { e.preventDefault(); setMe($('whoInput').value); $('whoInput').value = ''; });
  $('whoChange').addEventListener('click', () => { $('whoCard').hidden = false; $('whoLine').hidden = true; $('whoInput').focus(); });
  function needName() {
    if (me) return false;
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
  let feed = [], live = null;
  let replySeen = store.get('pulse-reply-seen', 0);
  if (!replySeen) { replySeen = Date.now(); store.set('pulse-reply-seen', replySeen); }

  function ago(at) {
    const m = Math.round((Date.now() - at) / 60000);
    if (m < 1) return 'الآن';
    if (m < 60) return 'قبل ' + (m === 1 ? 'دقيقة' : m === 2 ? 'دقيقتين' : m <= 10 ? m + ' دقائق' : m + ' دقيقة');
    const h = Math.round(m / 60);
    if (h < 24) return 'قبل ' + (h === 1 ? 'ساعة' : h === 2 ? 'ساعتين' : h <= 10 ? h + ' ساعات' : h + ' ساعة');
    const d = Math.round(h / 24);
    return d === 1 ? 'أمس' : 'قبل ' + (d === 2 ? 'يومين' : d + ' أيام');
  }
  const kindAr = (k, tap) => (k === 'tap' ? '«' + ((tapOf(tap) || {}).title || '') + '»' : k === 'draw' ? 'رسمتك' : 'رسالتك الصوتية');
  function line(p) {
    const mine = p.from === me;
    if (p.kind === 'reply') {
      const toMe = p.toName === me;
      return { icon: HEART_ICON(30), cls: 'is-reply' + (toMe ? ' is-mine' : ''),
        text: toMe ? 'البيت ردّ عليك بقلب' : 'البيت ردّ على ' + p.toName + ' بقلب',
        sub: toMe ? 'على ' + kindAr(p.toKind, null) : '' };
    }
    // No verbs: they'd need to know if the sender is a man or a woman.
    const who = mine ? 'منك' : 'من ' + p.from;
    if (p.kind === 'tap') return { icon: tapIcon(p.tap, 30), cls: mine ? 'is-mine' : '', text: '«' + ((tapOf(p.tap) || {}).title || '') + '» ' + who };
    if (p.kind === 'draw') return { icon: PEN_ICON(30), cls: mine ? 'is-mine' : '', text: 'رسمة ' + who };
    return { icon: MIC(30), cls: mine ? 'is-mine' : '', text: 'رسالة صوتية ' + who + (p.audio && p.audio.dur ? ' (' + Math.round(p.audio.dur) + ' ث)' : '') };
  }
  function renderFeed() {
    const ul = $('pulseFeed');
    ul.textContent = '';
    // A reply right under what it answers would be nice, but newest first is easier to read.
    const items = feed.slice(-14).reverse();
    if (!items.length) { ul.append(el('li', { class: 'feed-empty' }, 'لا شيء بعد. ابدأ بـ«أفكر فيكم» ❤')); }
    for (const p of items) {
      const l = line(p);
      ul.append(el('li', { class: l.cls },
        el('span', { class: 'feed-icon', html: l.icon }),
        el('span', { class: 'feed-text' }, l.text, l.sub ? el('small', null, ' ' + l.sub) : null),
        el('time', null, ago(p.at))));
    }
    // Only the good news: "is the frame off?" is the status line at the top.
    $('pulseLive').classList.toggle('is-online', !!live);
    $('pulseLive').hidden = !live;
    $('pulseLiveText').textContent = 'الإطار يستقبل الآن';
  }

  // Hearts from home addressed to me: a little celebration, once.
  function celebrate(r) {
    toast('❤ البيت ردّ عليك بقلب' + (r.toKind ? ' على ' + kindAr(r.toKind, null) : ''));
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
      const fresh = feed.filter((p) => p.kind === 'reply' && p.toName === me && me && p.at > replySeen);
      if (fresh.length) {
        replySeen = Math.max(...fresh.map((p) => p.at));
        store.set('pulse-reply-seen', replySeen);
        if (document.visibilityState === 'visible') celebrate(fresh[fresh.length - 1]);
      }
      renderFeed();
    } catch (e) { /* the status line says it if the server is away */ }
    loading = false;
  }
  // Quick while this tab is open, slower otherwise (still catching hearts for the toast).
  let ticks = 0;
  setInterval(() => {
    ticks++;
    if (document.visibilityState !== 'visible') return;
    if (visible || ticks % 5 === 0) refresh();
  }, 4000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });
  if (DEMO) window.addEventListener('storage', (e) => { if (e.key === 'fd:demo-pulses') refresh(); });

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

  return {
    shown(on) {
      visible = on;
      if (on) { requestAnimationFrame(() => { sizePad(); redraw(); }); refresh(); }
    },
  };
}
