// Control panel: everything shown on the frame is managed here (phone or computer).
import config from './config.js';
import { store, hijri, durationAr, MONTHS, HIJRI_MONTHS, WEEKDAYS, DAY } from './util.js';
import * as demo from './demo.js';
import { importICS } from './ics-import.js';
import { dueFrom } from './routines.js';
import { initPulse } from './admin-pulse.js';
import { initFun } from './admin-fun.js';
import { initQuran } from './admin-quran.js';

const DEMO = !!(window.FRAME_DEMO || /[?&]demo\b/.test(location.search));
(function captureKey() {
  try {
    const u = new URL(location.href);
    const k = u.searchParams.get('key');
    if (k) { store.set('key', k); u.searchParams.delete('key'); history.replaceState(null, '', u.pathname + u.search + u.hash); }
  } catch (e) { /* ignore */ }
})();
const key = () => store.get('key', '');

const $ = (id) => document.getElementById(id);
function el(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const k in attrs || {}) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : String(c));
  return e;
}

let toastTimer;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('is-on'), 3400);
}

async function api(path, opts) {
  opts = opts || {};
  const headers = Object.assign({}, opts.headers);
  if (key()) headers['x-key'] = key();
  const res = await fetch(path, Object.assign({}, opts, { headers, cache: 'no-store' }));
  if (!res.ok) {
    let msg = 'HTTP ' + res.status;
    try { msg = (await res.json()).error || msg; } catch (e) { /* not json */ }
    if (res.status === 401) msg = 'مفتاح الدخول غير صحيح. افتح الرابط الكامل مع ?key= مرة واحدة.';
    throw new Error(msg);
  }
  return res.json();
}
const send = (path, method, body) => api(path, { method, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });

// «نبضة» lives in its own file.
let fun = null;
const pulse = initPulse({ api, send, toast, el, $, key, DEMO, showView: (v) => showView(v), playKnock: (p) => fun && fun.playKnock(p),
  offset: () => { try { return (board && board.utcOffset) || 0; } catch (e) { return 0; } } });
// «مرح»: match mode, the secret knock, the wheel.
const quran = initQuran({ api, send, toast, el, $, DEMO, me: pulse.me });
fun = initFun({ api, send, toast, el, $, DEMO, me: pulse.me, needName: pulse.needName, showView: (v) => showView(v), onSent: () => pulse.refresh() });

// ================= shared state =================
let board = { lists: { tasks: [], shopping: [] }, settings: {}, events: [], message: null, frameSeen: null, routines: [], audio: {}, preview: null };
let settings = {}; // what is saved on the server
const listeners = [];
const onBoard = (fn) => listeners.push(fn);

async function loadBoard() {
  try {
    board = DEMO ? demo.board() : await api('/api/board');
    for (const fn of listeners) fn();
  } catch (e) { toast(e.message); }
}

// ================= tabs =================
const VIEWS = ['pulse', 'quran', 'fun', 'message', 'lists', 'photos', 'dates', 'settings'];
function showView(v) {
  if (!VIEWS.includes(v)) v = 'pulse';
  for (const b of document.querySelectorAll('#tabs button')) {
    const on = b.dataset.view === v;
    b.classList.toggle('is-on', on);
    b.setAttribute('aria-selected', String(on));
  }
  for (const name of VIEWS) $('v-' + name).hidden = name !== v;
  store.set('admin-view', v);
  if (v === 'photos') loadPhotos();
  pulse.shown(v === 'pulse');
  fun.shown(v === 'fun');
  quran.shown(v === 'quran');
  pulse.watch(v === 'fun');
  window.scrollTo(0, 0);
}
for (const b of document.querySelectorAll('#tabs button')) b.addEventListener('click', () => showView(b.dataset.view));

// ================= frame status =================
function renderStatus() {
  const box = $('frameStatus');
  const seen = board.frameSeen;
  const age = seen ? Date.now() - seen : Infinity;
  const online = age < 15 * 60000;
  box.classList.toggle('is-online', online);
  box.classList.toggle('is-offline', !online);
  $('frameStatusText').textContent = !seen
    ? 'لم يتصل الإطار بعد. افتح رابط الإطار مع المفتاح على الجهاز.'
    : online
      ? 'الإطار متصل. يأخذ التغييرات خلال 30 ثانية.'
      : 'الإطار غير متصل منذ ' + durationAr(age) + '. تحقق من الكهرباء أو الويفي.';
}
onBoard(renderStatus);
const keyQuery = () => (key() ? '?key=' + encodeURIComponent(key()) : '');
$('viewFrame').href = DEMO ? '#' : '/' + keyQuery();

// ================= message =================
function renderMessage() {
  const m = board.message;
  const active = m && m.text && (!m.until || m.until > Date.now());
  $('msgPreview').classList.toggle('is-empty', !active);
  $('msgPreviewText').textContent = active ? m.text : 'لا توجد رسالة على الإطار الآن.';
  $('msgUntil').textContent = !active ? '' : m.until ? 'تختفي بعد ' + durationAr(m.until - Date.now()) + '.' : 'تبقى حتى تزيلها.';
  $('msgClear').hidden = !active;
}
onBoard(renderMessage);
$('msgText').addEventListener('input', () => { $('msgCount').textContent = $('msgText').value.length + ' / 200'; });
$('msgForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = $('msgText').value.trim();
  if (!text) { toast('اكتب الرسالة أولاً.'); return; }
  const hours = Number($('msgHours').value) || null;
  try {
    board.message = DEMO ? demo.setMessage(text, hours) : await send('/api/message', 'PUT', { text, hours });
    $('msgText').value = '';
    $('msgCount').textContent = '0 / 200';
    renderMessage();
    toast('ظهرت الرسالة على الإطار.');
  } catch (err) { toast(err.message); }
});
$('msgClear').addEventListener('click', async () => {
  try {
    board.message = DEMO ? demo.clearMessage() : await api('/api/message', { method: 'DELETE' });
    renderMessage();
    toast('أُزيلت الرسالة.');
  } catch (err) { toast(err.message); }
});

// ================= lists =================
let list = 'shopping';
const NAMES = { shopping: 'التسوق', tasks: 'المهام' };
const quickFor = (l) => (l === 'shopping' ? settings.quickShopping || config.quickShopping : settings.quickTasks || config.quickTasks);

function renderLists() {
  const lists = board.lists || { tasks: [], shopping: [] };
  $('nShopping').textContent = (lists.shopping || []).filter((x) => !x.done).length || '';
  $('nTasks').textContent = (lists.tasks || []).filter((x) => !x.done).length || '';
  for (const b of document.querySelectorAll('.seg button')) b.classList.toggle('is-on', b.dataset.list === list);
  $('addInput').placeholder = list === 'shopping' ? 'ماذا ينقص البيت؟' : 'مهمة جديدة';

  const items = (lists[list] || []).slice().sort((a, b) => a.done - b.done);
  const open = new Set(items.filter((x) => !x.done).map((x) => x.text));
  const quick = $('quick');
  quick.textContent = '';
  for (const q of quickFor(list).filter((x) => !open.has(x))) {
    quick.append(el('button', { type: 'button', class: 'chip', onclick: () => op({ op: 'add', list, text: q }) }, '+ ' + q));
  }

  const ul = $('items');
  ul.textContent = '';
  if (!items.length) ul.append(el('li', { class: 'empty' }, list === 'shopping' ? 'القائمة فارغة.' : 'لا مهام حالياً.'));
  for (const it of items) {
    ul.append(el('li', { class: it.done ? 'is-done' : '' },
      el('button', { type: 'button', class: 'toggle', 'aria-pressed': String(it.done), onclick: () => op({ op: 'toggle', list, id: it.id }) },
        el('span', { class: 'box', html: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.2 4.2L19 7"/></svg>' }),
        el('span', { class: 'text' }, it.text),
        it.rid ? el('span', { class: 'rep', title: 'مهمة متكررة', html: REPEAT_SVG }) : null),
      el('button', { type: 'button', class: 'del', 'aria-label': 'حذف ' + it.text, onclick: () => op({ op: 'remove', list, id: it.id }),
        html: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>' })));
  }
  const done = items.filter((x) => x.done).length;
  $('clearDone').hidden = !done;
  $('clearDone').textContent = (list === 'shopping' ? 'إزالة المشترى' : 'حذف المنجزة') + ' (' + done + ')';
  renderRoutines();
}
onBoard(renderLists);

async function op(body) {
  try {
    board.lists = DEMO ? demo.listOp(body) : await send('/api/lists', 'POST', body);
    renderLists();
    if (body.op === 'add') toast('أُضيف إلى ' + NAMES[body.list]);
  } catch (e) { toast(e.message); }
}
for (const b of document.querySelectorAll('.seg button')) b.addEventListener('click', () => { list = b.dataset.list; renderLists(); });
$('addForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = $('addInput').value.trim();
  if (!text) return;
  $('addInput').value = '';
  op({ op: 'add', list, text });
});
$('clearDone').addEventListener('click', () => op({ op: 'clearDone', list }));

// ================= repeating tasks =================
const REPEAT_SVG = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/></svg>';
const two = (n) => String(n).padStart(2, '0');
// Today as the server sees it (Morocco is on GMT; some phones still think GMT+1).
const isoToday = () => { if (board.today) return board.today; const d = new Date(); return d.getFullYear() + '-' + two(d.getMonth() + 1) + '-' + two(d.getDate()); };
const isoDiff = (a, b) => Math.round((Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10)) - Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10))) / DAY);
function ruleAr(r) {
  if (r.kind === 'days') return r.every === 1 ? 'كل يوم' : r.every === 2 ? 'كل يومين' : r.every <= 10 ? 'كل ' + r.every + ' أيام' : 'كل ' + r.every + ' يوماً';
  if (r.kind === 'weekly') return 'كل أسبوع يوم ' + WEEKDAYS[r.weekday];
  return 'كل شهر في اليوم ' + r.day + (r.day >= 29 ? ' (أو آخر يوم من الشهر)' : '');
}
// "يوم الأحد 1 نونبر", or "اليوم" / "غداً".
function dueAr(iso) {
  const n = isoDiff(iso, isoToday());
  const [y, m, d] = iso.split('-').map(Number);
  const wd = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return n === 0 ? 'اليوم' : n === 1 ? 'غداً، ' + wd + ' ' + d + ' ' + MONTHS[m - 1] : 'يوم ' + wd + ' ' + d + ' ' + MONTHS[m - 1];
}

function renderRoutines() {
  $('routinesCard').hidden = list !== 'tasks';
  if (!rtStartTouched || $('rtStart').value < isoToday()) $('rtStart').value = isoToday();
  rtFormUpdate();
  const ul = $('routineList');
  ul.textContent = '';
  const rs = board.routines || [];
  if (!rs.length) ul.append(el('li', { class: 'empty' }, 'لا مهام متكررة بعد.'));
  for (const r of rs) {
    ul.append(el('li', null,
      el('span', { class: 'imp-icon', html: REPEAT_SVG }),
      el('span', { class: 'what' }, el('span', { class: 'name' }, r.text),
        el('span', { class: 'meta' }, ruleAr(r)),
        r.next ? el('span', { class: 'meta' }, 'تعود إلى قائمة المهام ' + dueAr(r.next)) : null),
      el('button', { type: 'button', class: 'del', 'aria-label': 'حذف ' + r.text, onclick: () => routineOp({ op: 'remove', id: r.id }),
        html: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>' })));
  }
  // Ready-made suggestions fill in the form.
  const quick = $('routineQuick');
  quick.textContent = '';
  const have = new Set(rs.map((r) => r.text));
  const SUGGEST = [
    ['أداء الكراء', 'monthly', 1], ['سقي النباتات', 'days', 3], ['أداء فاتورة الكهرباء', 'monthly', 5], ['أداء فاتورة الماء', 'monthly', 5],
    ['تغيير أغطية الأسرّة', 'weekly', 0], ['تعبئة الإنترنت', 'monthly', 1],
  ];
  for (const [text, kind, v] of SUGGEST.filter((x) => !have.has(x[0]))) {
    quick.append(el('button', { type: 'button', class: 'chip', onclick: () => {
      $('rtText').value = text;
      $('rtKind').value = kind;
      if (kind === 'days') $('rtEvery').value = v;
      if (kind === 'monthly') $('rtDay').value = v;
      if (kind === 'weekly') $('rtWeekday').value = String(v);
      rtFormUpdate();
      $('rtText').focus();
    } }, text));
  }
}

for (let i = 0; i < 7; i++) $('rtWeekday').append(el('option', { value: String((i + 1) % 7) }, WEEKDAYS[(i + 1) % 7]));
$('rtWeekday').value = '5';
$('rtStart').value = isoToday();
function rtValue() {
  const kind = $('rtKind').value;
  const r = { op: 'add', text: $('rtText').value.trim(), kind, start: $('rtStart').value || isoToday() };
  if (kind === 'days') r.every = Number($('rtEvery').value) || 0;
  if (kind === 'weekly') r.weekday = Number($('rtWeekday').value);
  if (kind === 'monthly') r.day = Number($('rtDay').value) || 0;
  return r;
}
function rtFormUpdate() {
  const kind = $('rtKind').value;
  $('rtEveryBox').hidden = kind !== 'days';
  $('rtWeekdayBox').hidden = kind !== 'weekly';
  $('rtDayBox').hidden = kind !== 'monthly';
  const r = rtValue();
  const ok = (kind === 'days' && r.every >= 1 && r.every <= 90) || kind === 'weekly' || (kind === 'monthly' && r.day >= 1 && r.day <= 31);
  const start = r.start < isoToday() ? isoToday() : r.start;
  $('rtPreview').textContent = ok ? 'تُضاف إلى قائمة المهام ' + ruleAr(r) + '. أول مرة: ' + dueAr(dueFrom(r, start)) + '.' : '';
}
let rtStartTouched = false;
$('rtStart').addEventListener('input', () => { rtStartTouched = true; });
for (const id of ['rtKind', 'rtEvery', 'rtWeekday', 'rtDay', 'rtStart']) $(id).addEventListener('input', rtFormUpdate);
rtFormUpdate();

async function routineOp(body) {
  try {
    const res = DEMO ? demo.routinesOp(body) : await send('/api/routines', 'POST', body);
    board.routines = res.routines;
    board.lists = res.lists;
    renderLists();
    if (body.op === 'add') toast('أُضيفت المهمة المتكررة.');
    if (body.op === 'remove') toast('حُذفت المهمة المتكررة. ما على القائمة الآن يبقى حتى تحذفه.');
    return true;
  } catch (e) { toast(e.message); return false; }
}
$('rtForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const r = rtValue();
  if (!r.text) { toast('اكتب المهمة.'); return; }
  if (await routineOp(r)) { $('rtText').value = ''; rtFormUpdate(); }
});

// ================= photos =================
let photos = [];
const photoSrc = (p) => p.src || '/api/photos/' + p.id + keyQuery();

function renderPhotos() {
  const grid = $('grid');
  grid.textContent = '';
  if (!photos.length) { grid.append(el('p', { class: 'empty' }, 'لا توجد صور بعد. أضف صوراً لتظهر على الإطار.')); return; }
  for (const ph of photos.slice().reverse()) {
    let confirmTimer;
    const del = el('button', { type: 'button', class: 'del', 'aria-label': 'حذف الصورة', html: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>' });
    // Two taps to delete: the first asks, the second deletes.
    del.addEventListener('click', async () => {
      if (!del.classList.contains('is-confirm')) {
        del.classList.add('is-confirm');
        del.textContent = 'حذف؟';
        confirmTimer = setTimeout(() => { del.classList.remove('is-confirm'); del.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>'; }, 3000);
        return;
      }
      clearTimeout(confirmTimer);
      if (DEMO) { toast('المعاينة لا تحذف الصور.'); return; }
      try { await api('/api/photos/' + ph.id, { method: 'DELETE' }); await loadPhotos(); toast('حُذفت الصورة'); } catch (e) { toast(e.message); }
    });
    grid.append(el('figure', null, el('img', { src: photoSrc(ph), alt: '', loading: 'lazy' }), del));
  }
}

async function loadPhotos() {
  try { photos = (DEMO ? demo.photos() : await api('/api/photos')).photos; renderPhotos(); } catch (e) { toast(e.message); }
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('تعذّرت قراءة الصورة ' + file.name)); };
    img.src = url;
  });
}

// Render to exactly 1280×800. Landscape photos fill the frame; portrait and square ones are
// shown whole over a soft, darkened copy of themselves (done here, not on the frame's slow GPU).
async function toFrameJpeg(file) {
  const img = await loadImage(file);
  const W = 1280, H = 800;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const iw = img.naturalWidth, ih = img.naturalHeight;
  if (iw / ih >= 1.3) {
    const s = Math.max(W / iw, H / ih);
    ctx.drawImage(img, (W - iw * s) / 2, (H - ih * s) / 2, iw * s, ih * s);
  } else {
    const t = document.createElement('canvas');
    t.width = 32; t.height = 20;
    const ts = Math.max(32 / iw, 20 / ih);
    t.getContext('2d').drawImage(img, (32 - iw * ts) / 2, (20 - ih * ts) / 2, iw * ts, ih * ts);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(t, 0, 0, W, H);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 0, W, H);
    const s = Math.min(W / iw, H / ih);
    ctx.drawImage(img, (W - iw * s) / 2, (H - ih * s) / 2, iw * s, ih * s);
  }
  return new Promise((resolve) => c.toBlob(resolve, 'image/jpeg', 0.84));
}

$('fileInput').addEventListener('change', (e) => {
  const files = Array.from(e.target.files || []);
  e.target.value = '';
  uploadFiles(files);
});

async function uploadFiles(files) {
  if (!files.length) return;
  if (DEMO) { toast('المعاينة لا ترفع الصور.'); return; }
  const status = $('uploadStatus');
  let ok = 0;
  for (let i = 0; i < files.length; i++) {
    status.textContent = 'جاري رفع الصورة ' + (i + 1) + ' من ' + files.length + '…';
    try {
      const blob = await toFrameJpeg(files[i]);
      await api('/api/photos', { method: 'POST', body: blob, headers: { 'content-type': 'image/jpeg' } });
      ok++;
    } catch (err) { toast(err.message); }
  }
  const n = (k) => (k === 1 ? 'صورة واحدة' : k === 2 ? 'صورتان' : k <= 10 ? k + ' صور' : k + ' صورة');
  status.textContent = ok === files.length
    ? 'أُضيفت ' + n(ok) + '. ستظهر على الإطار خلال دقائق.'
    : 'أُضيفت ' + ok + ' من أصل ' + files.length + '. حاول رفع الباقي مرة أخرى.';
  loadPhotos();
}

// ----- photos shared from the phone's share menu (Android) -----
// The service worker (sw.js) keeps the shared photos and opens /admin?shared=N#photos.
if ('serviceWorker' in navigator && !DEMO) navigator.serviceWorker.register('/sw.js').catch(() => {});
async function takeShared() {
  if (!/[?&]shared=/.test(location.search)) return;
  history.replaceState(null, '', location.pathname + location.hash);
  if (!('caches' in window)) return;
  const cache = await caches.open('shared-photos');
  const files = [];
  for (const req of await cache.keys()) {
    const res = await cache.match(req);
    const blob = await res.blob();
    files.push(new File([blob], decodeURIComponent(res.headers.get('x-name') || 'photo'), { type: blob.type || 'image/jpeg' }));
    await cache.delete(req);
  }
  showView('photos');
  if (!files.length) { toast('لم تصل أي صورة. جرّب المشاركة مرة أخرى.'); return; }
  toast(files.length === 1 ? 'وصلت صورة، جاري رفعها إلى الإطار…' : 'وصلت ' + files.length + ' صور، جاري رفعها إلى الإطار…');
  await uploadFiles(files);
}

// ================= family dates =================
const pad = (n) => String(n).padStart(2, '0');
function nextOccurrence(ev, today) {
  const b = ev.date.split('-').map(Number);
  if (b.length === 3) return Date.UTC(b[0], b[1] - 1, b[2]);
  let t = Date.UTC(new Date(today).getUTCFullYear(), b[0] - 1, b[1]);
  if (t < today) t = Date.UTC(new Date(today).getUTCFullYear() + 1, b[0] - 1, b[1]);
  return t;
}
const daysAway = (n) => (n < 0 ? 'مضت' : n === 0 ? 'اليوم' : n === 1 ? 'غداً' : n === 2 ? 'بعد يومين' : n <= 10 ? 'بعد ' + n + ' أيام' : 'بعد ' + n + ' يوماً');

function renderEvents() {
  const ul = $('evList');
  ul.textContent = '';
  const d = new Date();
  const today = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  renderImports();
  const evs = (board.events || []).filter((e) => !e.src).map((e) => ({ e, at: nextOccurrence(e, today) }))
    .sort((a, b) => (a.at < today) - (b.at < today) || a.at - b.at);
  if (!evs.length) { ul.append(el('li', { class: 'empty' }, 'لا مناسبات مضافة يدوياً بعد. أضف أعياد الميلاد والذكريات المهمة.')); return; }
  for (const { e, at } of evs) {
    const dt = new Date(at);
    const away = Math.round((at - today) / DAY);
    ul.append(el('li', { class: away < 0 ? 'is-past' : '' },
      el('span', { class: 'when' }, el('b', null, String(dt.getUTCDate())), MONTHS[dt.getUTCMonth()]),
      el('span', { class: 'what' }, el('span', { class: 'name' }, e.name),
        el('span', { class: 'meta' }, (e.date.length === 5 ? 'كل سنة' : 'مرة واحدة ' + dt.getUTCFullYear()) + '، ' + daysAway(away))),
      el('button', { type: 'button', class: 'del', 'aria-label': 'حذف ' + e.name, onclick: () => evOp({ op: 'remove', id: e.id }),
        html: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>' })));
  }
}
onBoard(renderEvents);

const EV_TOASTS = { add: 'أُضيفت المناسبة إلى التقويم.', remove: 'حُذفت المناسبة.', removeSource: 'حُذف التقويم المستورد من الإطار.' };
async function evOp(body) {
  try {
    board.events = DEMO ? demo.eventsOp(body) : await send('/api/events', 'POST', body);
    renderEvents();
    if (EV_TOASTS[body.op]) toast(EV_TOASTS[body.op]);
    return true;
  } catch (e) { toast(e.message); return false; }
}

// ----- importing an .ics file -----
const countEntries = (n) => (n === 1 ? 'موعد واحد' : n === 2 ? 'موعدان' : n <= 10 ? n + ' مواعيد' : n + ' موعداً');
const dateAr = (iso) => { const [y, m, d] = iso.split('-').map(Number); return d + ' ' + MONTHS[m - 1] + ' ' + y; };
let pendingImport = null;

function renderImports() {
  const ul = $('importList');
  ul.textContent = '';
  const groups = new Map();
  for (const e of board.events || []) {
    if (!e.src) continue;
    if (!groups.has(e.src)) groups.set(e.src, []);
    groups.get(e.src).push(e);
  }
  for (const [src, list] of groups) {
    const dated = list.filter((e) => e.date.length === 10).map((e) => e.date).sort();
    const range = dated.length ? 'حتى ' + dateAr(dated[dated.length - 1]) : 'مناسبات سنوية';
    let armed = false, timer;
    const del = el('button', { type: 'button', class: 'ghost small' }, 'حذف');
    del.addEventListener('click', () => {
      if (!armed) {
        armed = true; del.textContent = 'تأكيد الحذف'; del.classList.add('is-confirm');
        timer = setTimeout(() => { armed = false; del.textContent = 'حذف'; del.classList.remove('is-confirm'); }, 4000);
        return;
      }
      clearTimeout(timer);
      evOp({ op: 'removeSource', source: src });
    });
    ul.append(el('li', null,
      el('span', { class: 'imp-icon', html: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>' }),
      el('span', { class: 'what' }, el('span', { class: 'name' }, src), el('span', { class: 'meta' }, countEntries(list.length) + '، ' + range)),
      del));
  }
}

function resetImport() {
  pendingImport = null;
  $('icsPreview').hidden = true;
  $('icsInput').value = '';
}

$('icsInput').addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  try {
    if (file.size > 5 * 1024 * 1024) throw new Error('الملف أكبر من 5 ميغابايت. صدّر تقويماً واحداً فقط.');
    const { entries, stats } = importICS(await file.text());
    if (!entries.length) throw new Error('لا توجد مواعيد في هذا الملف بين الشهر الماضي والسنة القادمة.');
    pendingImport = entries;
    let summary = 'وجدنا ' + countEntries(stats.total);
    if (stats.first) summary += ' من ' + dateAr(stats.first) + ' إلى ' + dateAr(stats.last);
    if (stats.yearly) summary += '، منها ' + (stats.yearly === 1 ? 'مناسبة سنوية واحدة' : stats.yearly + ' مناسبات سنوية');
    summary += '.';
    if (stats.holidays) {
      const n = stats.holidays;
      summary += ' تجاهلنا ' + (n === 1 ? 'عطلة رسمية واحدة' : n === 2 ? 'عطلتين رسميتين' : n <= 10 ? n + ' عطل رسمية' : n + ' عطلة رسمية')
        + ' لأنها تظهر أصلاً في تقويم الإطار.';
    }
    if (stats.dropped) summary += ' لن يُستورد ' + countEntries(stats.dropped) + ' لأن الحد 500 لكل ملف.';
    $('icsSummary').textContent = summary;
    $('icsName').value = file.name.replace(/\.ics$/i, '').replace(/[_-]+/g, ' ').slice(0, 60);
    $('icsPreview').hidden = false;
  } catch (err) {
    resetImport();
    toast(err.message || 'تعذّرت قراءة الملف.');
  }
});
$('icsCancel').addEventListener('click', resetImport);
$('icsImport').addEventListener('click', async () => {
  if (!pendingImport) return;
  const source = $('icsName').value.trim();
  if (!source) { toast('أعطِ هذا التقويم اسماً.'); return; }
  const n = pendingImport.length;
  if (await evOp({ op: 'import', source, events: pendingImport })) {
    resetImport();
    toast('أُضيف ' + countEntries(n) + ' إلى تقويم الإطار.');
  }
});
$('evForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('evName').value.trim();
  const date = $('evDate').value; // YYYY-MM-DD
  if (!name) { toast('اكتب اسم المناسبة.'); return; }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { toast('اختر التاريخ.'); return; }
  const value = $('evRepeat').value === 'yearly' ? date.slice(5) : date;
  if (await evOp({ op: 'add', name, date: value })) { $('evName').value = ''; $('evDate').value = ''; }
});

// ================= settings =================
const CITIES = [
  ['الرباط', 34.0209, -6.8416], ['سلا', 34.0531, -6.7985], ['تمارة', 33.9287, -6.9063], ['القنيطرة', 34.261, -6.5802],
  ['الدار البيضاء', 33.5731, -7.5898], ['المحمدية', 33.6866, -7.383], ['الجديدة', 33.2316, -8.5007], ['سطات', 33.001, -7.6166],
  ['فاس', 34.0181, -5.0078], ['مكناس', 33.8935, -5.5473], ['إفران', 33.5228, -5.1106], ['تازة', 34.21, -4.01],
  ['مراكش', 31.6295, -7.9811], ['آسفي', 32.2994, -9.2372], ['الصويرة', 31.5085, -9.7595], ['بني ملال', 32.3373, -6.3498],
  ['خريبكة', 32.8811, -6.9063], ['طنجة', 35.7595, -5.834], ['تطوان', 35.5889, -5.3626], ['العرائش', 35.1932, -6.1557],
  ['الحسيمة', 35.2517, -3.9372], ['الناظور', 35.1681, -2.9335], ['وجدة', 34.6814, -1.9086], ['أكادير', 30.4278, -9.5981],
  ['تارودانت', 30.4703, -8.877], ['ورزازات', 30.9189, -6.8934], ['الرشيدية', 31.9314, -4.4245], ['العيون', 27.1253, -13.1625],
  ['الداخلة', 23.6848, -15.958],
];
const PRAYER_LABELS = [['fajr', 'الفجر'], ['sunrise', 'الشروق'], ['dhuhr', 'الظهر'], ['asr', 'العصر'], ['maghrib', 'المغرب'], ['isha', 'العشاء']];
const SCREEN_LABELS = [['home', 'الساعة والطقس'], ['photos', 'الصور'], ['prayer', 'الصلاة'], ['calendar', 'التقويم'], ['lists', 'القوائم']];

const citySel = $('sCity');
for (const [name] of CITIES) citySel.append(el('option', { value: name }, name));
citySel.append(el('option', { value: '__other' }, 'مدينة أخرى…'));
citySel.addEventListener('change', () => { $('customCity').hidden = citySel.value !== '__other'; markDirty(); });

const adjust = {}; // prayer minute adjustments in the form
let hijriAdj = 0;
function stepper(container, value, min, max, fmt, onChange) {
  container.textContent = '';
  const out = el('output', null, fmt(value));
  const set = (v) => { value = Math.max(min, Math.min(max, v)); out.textContent = fmt(value); onChange(value); };
  container.append(
    el('button', { type: 'button', 'aria-label': 'إنقاص', onclick: () => set(value - 1) }, '−'),
    out,
    el('button', { type: 'button', 'aria-label': 'زيادة', onclick: () => set(value + 1) }, '+'));
  return set;
}
const minutesFmt = (v) => (v === 0 ? 'بدون تغيير' : (v > 0 ? '+' : '−') + Math.abs(v) + ' د');
function hijriPreview() {
  const h = hijri(Date.now() + (hijriAdj - config.hijriAdjust) * DAY);
  $('hijriToday').textContent = h ? 'اليوم على الإطار: ' + h.d + ' ' + HIJRI_MONTHS[h.m - 1] + ' ' + h.y : '';
}

function fillSettings(s) {
  const city = CITIES.find((c) => c[0] === (s.city || config.city));
  const lat = typeof s.latitude === 'number' ? s.latitude : config.latitude;
  const lon = typeof s.longitude === 'number' ? s.longitude : config.longitude;
  if (city && Math.abs(city[1] - lat) < 0.01 && Math.abs(city[2] - lon) < 0.01) {
    citySel.value = city[0];
    $('customCity').hidden = true;
  } else {
    citySel.value = '__other';
    $('customCity').hidden = false;
  }
  $('sCityName').value = s.city || config.city;
  $('sLat').value = lat;
  $('sLon').value = lon;

  const box = $('prayerAdjust');
  box.textContent = '';
  const pa = Object.assign({}, config.prayerAdjust, s.prayerAdjust);
  for (const [k, label] of PRAYER_LABELS) {
    adjust[k] = pa[k] || 0;
    const st = el('div', { class: 'stepper' });
    box.append(el('div', { class: 'step-row' }, el('span', null, label), st));
    stepper(st, adjust[k], -30, 30, minutesFmt, (v) => { adjust[k] = v; markDirty(); });
  }
  $('sPrayerFocus').checked = typeof s.prayerFocus === 'boolean' ? s.prayerFocus : config.prayerFocus.enabled;

  hijriAdj = typeof s.hijriAdjust === 'number' ? s.hijriAdjust : config.hijriAdjust;
  stepper($('hijriStepper'), hijriAdj, -2, 2, (v) => (v === 0 ? 'بدون تعديل' : (v > 0 ? '+' : '−') + Math.abs(v) + ' يوم'), (v) => { hijriAdj = v; hijriPreview(); markDirty(); });
  hijriPreview();

  const rot = Object.fromEntries(config.rotation);
  const list = $('screensList');
  list.textContent = '';
  for (const [k, label] of SCREEN_LABELS) {
    const cur = (s.screens && s.screens[k]) || { on: k in rot, seconds: rot[k] || 30 };
    list.append(el('div', { class: 'screen-row' },
      el('label', { class: 'switch' }, el('input', { type: 'checkbox', id: 'scr-' + k, checked: cur.on }), el('span', null, label)),
      el('label', { class: 'secs' }, el('input', { type: 'number', id: 'sec-' + k, min: '5', max: '600', value: String(cur.seconds), dir: 'ltr' }), el('span', null, 'ث'))));
  }
  $('sTouch').checked = typeof s.touchNavigation === 'boolean' ? s.touchNavigation : config.touchNavigation;
  $('sPhotoSeconds').value = s.photoSeconds || config.photoSeconds;

  const night = Object.assign({}, config.night, s.night);
  $('sNight').checked = night.enabled !== false;
  $('sNightStart').value = night.start;
  $('sNightEnd').value = night.end;
  $('sNightDim').value = night.dim;
  $('sNightDimOut').textContent = Math.round(night.dim * 100) + '%';

  const ad = Object.assign({}, config.adhan, s.adhan);
  const adPrayers = Object.assign({}, config.adhan.prayers, ad.prayers);
  $('sAdhan').checked = !!ad.enabled;
  const chips = $('adhanPrayers');
  chips.textContent = '';
  for (const [k, label] of PRAYER_LABELS.filter((x) => x[0] !== 'sunrise')) {
    chips.append(el('label', { class: 'chip-check' }, el('input', { type: 'checkbox', id: 'ad-' + k, checked: adPrayers[k] !== false }), el('span', null, label)));
  }
  $('sAdhanVol').value = ad.volume;
  $('sAdhanVolOut').textContent = Math.round(ad.volume * 100) + '%';
  const rm = Object.assign({}, config.ramadan, s.ramadan);
  $('sRamadan').checked = rm.enabled !== false;
  $('sQuran').checked = rm.quran !== false;
  const ak = Object.assign({}, config.adhkar, s.adhkar);
  $('sAdhkar').checked = ak.auto !== false;
  $('sAdhkarMin').value = ak.minutes;
  $('sAdhkarAudio').checked = ak.audioAuto !== false;
  $('sAdhkarVol').value = ak.volume == null ? 0.8 : ak.volume;
  $('sAdhkarVolOut').textContent = Math.round(Number($('sAdhkarVol').value) * 100) + '%';
  $('sVerse').checked = typeof s.dailyVerse === 'boolean' ? s.dailyVerse : config.dailyVerse;
  $('sNudge').checked = typeof s.weatherNudge === 'boolean' ? s.weatherNudge : config.weatherNudge;
  $('sPulseSound').checked = typeof s.pulseSound === 'boolean' ? s.pulseSound : config.pulseSound;

  $('sQuickShopping').value = (s.quickShopping || config.quickShopping).join('، ');
  $('sQuickTasks').value = (s.quickTasks || config.quickTasks).join('، ');
  $('saveBar').hidden = true;
}

function collectSettings() {
  let city, latitude, longitude;
  if (citySel.value === '__other') {
    city = $('sCityName').value.trim() || config.city;
    latitude = Number($('sLat').value);
    longitude = Number($('sLon').value);
  } else {
    const c = CITIES.find((x) => x[0] === citySel.value);
    city = c[0]; latitude = c[1]; longitude = c[2];
  }
  const screens = {};
  for (const [k] of SCREEN_LABELS) screens[k] = { on: $('scr-' + k).checked, seconds: Number($('sec-' + k).value) || 30 };
  const split = (v) => v.split(/[,،\n]+/).map((x) => x.trim()).filter(Boolean);
  return {
    city, latitude, longitude,
    prayerAdjust: Object.assign({}, adjust),
    prayerFocus: $('sPrayerFocus').checked,
    hijriAdjust: hijriAdj,
    screens,
    touchNavigation: $('sTouch').checked,
    photoSeconds: Number($('sPhotoSeconds').value) || config.photoSeconds,
    night: { enabled: $('sNight').checked, start: $('sNightStart').value || '23:00', end: $('sNightEnd').value || '06:00', dim: Number($('sNightDim').value) },
    quickShopping: split($('sQuickShopping').value),
    quickTasks: split($('sQuickTasks').value),
    adhan: {
      enabled: $('sAdhan').checked,
      volume: Number($('sAdhanVol').value),
      prayers: Object.fromEntries(['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'].map((k) => [k, $('ad-' + k).checked])),
    },
    ramadan: { enabled: $('sRamadan').checked, quran: $('sQuran').checked },
    adhkar: { auto: $('sAdhkar').checked, minutes: Number($('sAdhkarMin').value) || 30, audioAuto: $('sAdhkarAudio').checked, volume: Number($('sAdhkarVol').value) },
    dailyVerse: $('sVerse').checked,
    weatherNudge: $('sNudge').checked,
    pulseSound: $('sPulseSound').checked,
  };
}

function markDirty() { $('saveBar').hidden = false; }
$('v-settings').addEventListener('input', (e) => {
  if (e.target.id === 'sNightDim') $('sNightDimOut').textContent = Math.round(Number(e.target.value) * 100) + '%';
  if (e.target.id === 'sAdhanVol') $('sAdhanVolOut').textContent = Math.round(Number(e.target.value) * 100) + '%';
  if (e.target.id === 'sAdhkarVol') $('sAdhkarVolOut').textContent = Math.round(Number(e.target.value) * 100) + '%';
  if (e.target.type === 'file') return; // audio uploads save on their own
  markDirty();
});
$('saveSettings').addEventListener('click', async () => {
  const s = collectSettings();
  if (!Object.values(s.screens).some((x) => x.on)) { toast('اختر شاشة واحدة على الأقل.'); return; }
  if (!isFinite(s.latitude) || !isFinite(s.longitude)) { toast('أدخل خط العرض وخط الطول للمدينة.'); return; }
  if (s.adhan.enabled && !(board.audio && board.audio.adhan) && !DEMO) toast('ارفع ملف الأذان ليُسمع على الإطار.');
  try {
    settings = DEMO ? demo.saveSettings(s) : await send('/api/settings', 'PUT', s);
    board.settings = settings;
    fillSettings(settings);
    renderLists();
    toast('حُفظت الإعدادات. يأخذها الإطار خلال 30 ثانية.');
  } catch (e) { toast(e.message); }
});

let settingsLoaded = false;
onBoard(() => {
  // Load settings into the form once; later polls don't overwrite what someone is editing.
  if (settingsLoaded) return;
  settingsLoaded = true;
  settings = board.settings || {};
  fillSettings(settings);
});

// ================= recordings: adhan, morning and evening adhkar =================
const sizeMB = (b) => (b < 1048576 ? Math.max(1, Math.round(b / 1024)) + ' كيلوبايت' : (b / 1048576).toFixed(1).replace('.0', '') + ' ميغابايت');
function renderAudio() {
  for (const row of document.querySelectorAll('.audio-row')) {
    const name = row.dataset.audio;
    const a = (board.audio || {})[name];
    const player = row.querySelector('audio');
    const info = row.querySelector('.audio-info');
    const del = row.querySelector('.audio-del');
    info.textContent = a ? 'مرفوع، ' + sizeMB(a.size) : 'لم يُرفع بعد';
    del.hidden = !a;
    player.hidden = !a;
    const src = a ? '/api/audio/' + name + '?v=' + a.at + (key() ? '&key=' + encodeURIComponent(key()) : '') : '';
    if (a && player.getAttribute('src') !== src) player.setAttribute('src', src);
    if (!a) player.removeAttribute('src');
  }
  const fa = board.frameAudio;
  const box = $('frameAudio');
  box.className = 'frame-audio' + (fa ? ' is-' + fa : '');
  box.textContent = !board.frameSeen ? ''
    : fa === 'ok' ? 'الإطار يستطيع تشغيل الصوت.'
      : fa === 'blocked' ? 'متصفح الإطار يمنع الصوت حتى يلمس أحد الشاشة مرة واحدة. تظهر رسالة بذلك أسفل الإطار؛ بعد لمسة واحدة يعمل الأذان ما دام الإطار مشغلاً.'
        : '';
}
onBoard(renderAudio);
for (const row of document.querySelectorAll('.audio-row')) {
  const name = row.dataset.audio;
  row.querySelector('input[type=file]').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (DEMO) { toast('المعاينة لا ترفع الملفات.'); return; }
    const maxMB = Number(row.dataset.max) || 10;
    if (file.size > maxMB * 1024 * 1024) { toast('الملف أكبر من ' + maxMB + ' ميغابايت.'); return; }
    toast('جاري رفع الملف…');
    try {
      board.audio = await api('/api/audio/' + name, { method: 'PUT', body: file, headers: { 'content-type': file.type || 'audio/mpeg' } });
      renderAudio();
      toast(row.dataset.done || 'رُفع الأذان. يأخذه الإطار خلال 30 ثانية.');
    } catch (err) { toast(err.message); }
  });
  let armed = false, timer;
  const del = row.querySelector('.audio-del');
  del.addEventListener('click', async () => {
    if (!armed) {
      armed = true; del.textContent = 'تأكيد الحذف'; del.classList.add('is-confirm');
      timer = setTimeout(() => { armed = false; del.textContent = 'حذف'; del.classList.remove('is-confirm'); }, 4000);
      return;
    }
    clearTimeout(timer); armed = false; del.textContent = 'حذف'; del.classList.remove('is-confirm');
    try { board.audio = await api('/api/audio/' + name, { method: 'DELETE' }); renderAudio(); toast('حُذف الملف.'); } catch (err) { toast(err.message); }
  });
}

// ================= previews on the frame =================
const PREVIEW_AR = { ramadan: 'وضع رمضان', adhkar: 'الأذكار', adhan: 'الأذان' };
function renderPreview() {
  const p = board.preview && board.preview.until > Date.now() ? board.preview : null;
  $('previewStop').hidden = !p || p.what !== 'ramadan';
  $('previewNote').textContent = p && p.what === 'ramadan'
    ? 'الإطار يعرض الآن معاينة ' + PREVIEW_AR[p.what] + ' (اليوم 12 من رمضان بمواقيت اليوم) حتى تنتهي بعد ' + durationAr(p.until - Date.now()) + '. عدّاد الختمة في المعاينة لا يُحفظ.'
    : '';
  // When the next Ramadan starts, by the Hijri calendar the frame uses.
  const t0 = Date.now();
  const h0 = hijri(t0 + (hijriAdj - config.hijriAdjust) * DAY);
  if (h0 && h0.m === 9) { $('ramadanWhen').textContent = 'نحن في رمضان (' + h0.d + ' رمضان): وضع رمضان يعمل الآن على الإطار.'; return; }
  for (let i = 1; i < 400; i++) {
    const t = t0 + i * DAY;
    const h = hijri(t + (hijriAdj - config.hijriAdjust) * DAY);
    if (h && h.m === 9 && h.d === 1) {
      const d = new Date(t);
      $('ramadanWhen').textContent = 'رمضان ' + h.y + ' يبدأ تقريباً يوم ' + WEEKDAYS[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear()
        + ' (بعد ' + i + ' يوماً). الإعلان الرسمي بعد رؤية الهلال؛ إن اختلف، عدّل التاريخ الهجري أسفله.';
      return;
    }
  }
}
onBoard(renderPreview);
async function preview(what, minutes) {
  if (DEMO) {
    // The demo frame (/?demo) open in another tab of this browser shows it at once.
    if (what === 'adhan') { toast('تجربة الأذان تحتاج ملف أذان مرفوعاً، ولا رفع في النسخة التجريبية. جرّبها في /admin بدون ?demo.'); return; }
    board.preview = demo.setPreview(what, minutes);
    renderPreview();
    toast(what === 'none' ? 'أوقفت المعاينة.' : 'يظهر ' + PREVIEW_AR[what] + ' الآن على الإطار التجريبي (/?demo) المفتوح في هذا المتصفح.');
    return;
  }
  try {
    board.preview = await send('/api/preview', 'POST', { what, minutes });
    renderPreview();
    toast(what === 'none' ? 'أوقفت المعاينة.' : what === 'adhan' ? 'يُرفع الأذان على الإطار خلال 30 ثانية.' : 'يظهر ' + PREVIEW_AR[what] + ' على الإطار خلال 30 ثانية.');
  } catch (e) { toast(e.message); }
}
$('previewRamadan').addEventListener('click', () => preview('ramadan', 10));
$('previewStop').addEventListener('click', () => preview('none'));
$('previewAdhkar').addEventListener('click', () => preview('adhkar', 10));
$('testAdhan').addEventListener('click', () => {
  if (!(board.audio && board.audio.adhan) && !DEMO) { toast('ارفع ملف الأذان أولاً.'); return; }
  preview('adhan', 2);
});

// ================= start =================
const fromHash = (location.hash || '').slice(1);
showView(VIEWS.includes(fromHash) ? fromHash : store.get('admin-view', 'pulse'));
window.addEventListener('hashchange', () => { const v = location.hash.slice(1); if (VIEWS.includes(v)) showView(v); });
loadBoard();
takeShared();
setInterval(() => { if (document.visibilityState === 'visible') loadBoard(); }, 15000);
setInterval(() => { renderStatus(); renderMessage(); }, 60000);
