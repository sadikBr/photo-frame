// Control panel: everything shown on the frame is managed here (phone or computer).
import config from './config.js';
import { store, hijri, durationAr, MONTHS, HIJRI_MONTHS, WEEKDAYS, DAY } from './util.js';
import * as demo from './demo.js';
import { importICS } from './ics-import.js';
import { dueFrom } from './routines.js';
import { initPulse } from './admin-pulse.js';
import { initFun } from './admin-fun.js';
import { initQuran } from './admin-quran.js';
import { wifiString, qrSvg } from './wifi-common.js';

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
// Five tabs. «البيت» holds four views (lists, dates, photos, message) under one switcher;
// «مرح» opens from «نبضة»; the settings are a menu of short pages.
const VIEWS = ['home', 'pulse', 'quran', 'fun', 'message', 'lists', 'photos', 'dates', 'settings'];
const HOUSE = ['lists', 'dates', 'photos', 'message'];
const TAB_OF = { fun: 'pulse', lists: 'house', dates: 'house', photos: 'house', message: 'house' };
function showView(v, page) {
  if (!VIEWS.includes(v)) v = 'home';
  const tab = TAB_OF[v] || v;
  for (const b of document.querySelectorAll('#tabs button')) {
    const on = b.dataset.view === tab;
    b.classList.toggle('is-on', on);
    b.setAttribute('aria-selected', String(on));
  }
  for (const name of VIEWS) $('v-' + name).hidden = name !== v;
  const house = HOUSE.includes(v);
  $('houseSeg').hidden = !house;
  $('houseTitle').hidden = !house;
  for (const b of $('houseSeg').children) b.classList.toggle('is-on', b.dataset.view === v);
  if (house) store.set('house-view', v);
  store.set('admin-view', v);
  document.body.dataset.view = v;
  if (v === 'photos') loadPhotos();
  if (v === 'settings') showSetPage(page || null);
  if (v === 'home') renderHome();
  if (v === 'quran' && $('v-quran').dataset.qMode !== 'main') showQ('main');
  if (v === 'pulse' && tab === 'pulse' && $('v-pulse').dataset.ppMode && !['send', 'feed'].includes($('v-pulse').dataset.ppMode)) showPP('send');
  pulse.shown(v === 'pulse');
  fun.shown(v === 'fun');
  quran.shown(v === 'quran');
  pulse.watch(v === 'fun');
  window.scrollTo(0, 0);
}
for (const b of document.querySelectorAll('#tabs button')) {
  b.addEventListener('click', () => showView(b.dataset.view === 'house' ? store.get('house-view', 'lists') : b.dataset.view));
}
for (const b of $('houseSeg').children) b.addEventListener('click', () => showView(b.dataset.view));
// Shortcuts anywhere: data-go="view" (and data-list="tasks"), data-page="settings page".
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-go], [data-page]');
  if (!t || t.closest('#v-settings')) return;
  if (t.dataset.page) { showView('settings', t.dataset.page); return; }
  showView(t.dataset.go);
  if (t.dataset.list) { list = t.dataset.list; renderLists(); }
});

// ================= frame status =================
function renderStatus() {
  const box = $('frameStatus');
  const seen = board.frameSeen;
  const age = seen ? Date.now() - seen : Infinity;
  const online = age < 15 * 60000;
  box.classList.toggle('is-online', online);
  box.classList.toggle('is-offline', !online);
  const long = !seen
    ? 'لم يتصل الإطار بعد. افتح رابط الإطار مع المفتاح على الجهاز.'
    : online
      ? 'الإطار متصل. يأخذ التغييرات خلال 30 ثانية.'
      : 'الإطار غير متصل منذ ' + durationAr(age) + '. تحقق من الكهرباء أو الويفي.';
  $('frameStatusText').textContent = !seen ? 'لم يتصل بعد' : online ? 'الإطار متصل' : 'الإطار غير متصل';
  box.title = long;
  box.setAttribute('aria-label', long);
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
  for (const b of document.querySelectorAll('#v-lists .seg button')) b.classList.toggle('is-on', b.dataset.list === list);
  $('addInput').placeholder = list === 'shopping' ? 'أضف شيئاً للشراء…' : 'أضف مهمة…';

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
        it.rid ? el('span', { class: 'rep', title: 'مهمة متكررة', html: REPEAT_SVG }) : null,
        it.by && !it.done ? el('span', { class: 'by' }, it.by) : null),
      el('button', { type: 'button', class: 'del', 'aria-label': 'حذف ' + it.text, onclick: () => op({ op: 'remove', list, id: it.id }),
        html: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>' })));
  }
  const done = items.filter((x) => x.done).length;
  $('clearDone').hidden = !done;
  $('clearDone').textContent = list === 'shopping' ? 'مسح المشترى' : 'حذف المنجزة';
  if (done) ul.append(el('li', { class: 'clear-row' }, $('clearDone')));
  else $('items').after($('clearDone'));
  renderRoutines();
}
onBoard(renderLists);

async function op(body) {
  if (body.op === 'add' && pulse.me && pulse.me()) body.by = pulse.me(); // the frame shows who asked
  try {
    board.lists = DEMO ? demo.listOp(body) : await send('/api/lists', 'POST', body);
    renderLists();
    if (body.op === 'add') toast('أُضيف إلى ' + NAMES[body.list]);
  } catch (e) { toast(e.message); }
}
for (const b of document.querySelectorAll('#v-lists .seg button')) b.addEventListener('click', () => { list = b.dataset.list; renderLists(); });
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

let rtOpen = false;
$('rtLink').addEventListener('click', () => { rtOpen = true; renderRoutines(); window.scrollTo(0, 0); });
$('rtBack').addEventListener('click', () => { rtOpen = false; renderRoutines(); });
function renderRoutines() {
  $('v-lists').classList.toggle('is-rt', rtOpen);
  $('routinesCard').hidden = !rtOpen;
  $('rtBack').hidden = !rtOpen;
  $('rtLink').hidden = rtOpen;
  const rs0 = board.routines || [];
  $('rtSum').textContent = rs0.length ? rs0.map((r) => r.text + ' ' + ruleAr(r)).join(' · ') : 'لا مهام تتكرر بعد';
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
  try { photos = (DEMO ? demo.photos() : await api('/api/photos')).photos; renderPhotos(); if (!$('v-home').hidden) renderHome(); } catch (e) { toast(e.message); }
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
  $('sNightOff').checked = !!night.off;
  const wf = s.wifi || {};
  $('sWifiSsid').value = wf.ssid || '';
  $('sWifiPass').value = wf.password || '';
  $('sWifiSec').value = wf.security || 'WPA';
  $('sWifiShow').checked = wf.showPassword !== false;
  $('sWifiHidden').checked = !!wf.hidden;
  renderWifi();
  renderNightOff();

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
  currentTheme = THEME_IDS.includes(s.theme) ? s.theme : 'original';
  renderThemes();
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
    night: { enabled: $('sNight').checked, start: $('sNightStart').value || '23:00', end: $('sNightEnd').value || '06:00', dim: Number($('sNightDim').value), off: $('sNightOff').checked },
    wifi: { ssid: $('sWifiSsid').value, password: $('sWifiPass').value, security: $('sWifiSec').value, hidden: $('sWifiHidden').checked, showPassword: $('sWifiShow').checked },
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
    theme: currentTheme,
  };
}

function markDirty(e) {
  clearTimeout(saveTimer);
  // typing waits a little longer than a tap
  const typing = e && e.target && /^(text|password|number|textarea|time|date)$/.test(e.target.type || e.target.tagName.toLowerCase());
  saveTimer = setTimeout(saveSettingsNow, typing ? 1400 : 600);
}
$('v-settings').addEventListener('input', (e) => {
  if (e.target.id === 'sNightDim') $('sNightDimOut').textContent = Math.round(Number(e.target.value) * 100) + '%';
  if (e.target.id === 'sAdhanVol') $('sAdhanVolOut').textContent = Math.round(Number(e.target.value) * 100) + '%';
  if (e.target.id === 'sAdhkarVol') $('sAdhkarVolOut').textContent = Math.round(Number(e.target.value) * 100) + '%';
  if (e.target.type === 'file') return; // audio uploads save on their own
  if (e.target.id && e.target.id.startsWith('sWifi')) renderWifi();
  if (e.target.id === 'sNightOff' || e.target.id === 'sNight' || e.target.id === 'sNightDim') renderNightOff();
  markDirty(e);
});

// ================= night: fully off =================
for (const [id, off] of [['howDim', false], ['howOff', true]]) {
  $(id).addEventListener('click', () => {
    $('sNightOff').checked = off;
    $('sNightOff').dispatchEvent(new Event('input', { bubbles: true }));
  });
}
function renderNightPreview() {
  const off = $('sNightOff').checked, dim = Number($('sNightDim').value) || 0;
  $('howDim').setAttribute('aria-checked', String(!off));
  $('howOff').setAttribute('aria-checked', String(off));
  const d = new Date();
  $('npTime').textContent = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  $('npDate').textContent = WEEKDAYS[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()];
  const op = off ? 0 : Math.max(0.08, 1 - dim);
  $('npTime').style.opacity = op.toFixed(2);
  $('npDate').style.opacity = (op * 0.95).toFixed(2);
  $('npNote').textContent = !$('sNight').checked ? 'معاينة: الوضع الليلي متوقف' : off ? 'معاينة: الشاشة مطفأة' : 'معاينة: تعتيم ' + Math.round(dim * 100) + '%';
  $('sNightDimOut').textContent = Math.round(dim * 100) + '%';
}
function renderNightOff() {
  renderNightPreview();
  const off = $('sNightOff').checked;
  $('sNightDim').disabled = off;
  const note = $('nightOffNote');
  const fs = board.frameScreen;
  note.hidden = !off;
  note.textContent = fs === 'backlight' ? 'الإطار يطفئ ضوء الشاشة كلياً في الليل.'
    : fs === 'dim' ? 'تطبيق الإطار لا يصل إلى مفتاح ضوء الشاشة، فتصير سوداء بأدنى إضاءة ممكنة.'
      : 'ليُطفأ ضوء الشاشة نفسه يحتاج تطبيق الإطار (Home HQ) إلى التحديث. حتى ذلك تصير الشاشة سوداء فقط.';
}
onBoard(renderNightOff);

// ================= guest Wi-Fi =================
function renderWifi() {
  const sec = $('sWifiSec').value;
  $('sWifiPass').disabled = sec === 'nopass';
  const w = { ssid: $('sWifiSsid').value, password: $('sWifiPass').value, security: sec, hidden: $('sWifiHidden').checked };
  const ok = !!w.ssid.trim();
  $('wifiPreview').hidden = !ok;
  $('wifiQr').innerHTML = ok ? qrSvg(wifiString(w), 168) : '';
}
$('sWifiPassShow').addEventListener('click', () => {
  const p = $('sWifiPass');
  p.type = p.type === 'password' ? 'text' : 'password';
  $('sWifiPassShow').textContent = p.type === 'password' ? 'إظهار' : 'إخفاء';
});
$('previewWifi').addEventListener('click', () => {
  if (!$('saveBar').hidden) { toast('احفظ الإعدادات أولاً، ثم اعرض الرمز.'); return; }
  if (!(settings.wifi && settings.wifi.ssid)) { toast('اكتب اسم الشبكة واحفظ أولاً.'); return; }
  preview('wifi', 3);
});
// Settings save themselves a moment after each change (the save button stays as a fallback).
let saveTimer = 0;
async function saveSettingsNow() {
  clearTimeout(saveTimer);
  const s = collectSettings();
  if (!Object.values(s.screens).some((x) => x.on)) { toast('اختر شاشة واحدة على الأقل.'); return; }
  if (!isFinite(s.latitude) || !isFinite(s.longitude)) { toast('أدخل خط العرض وخط الطول للمدينة.'); return; }
  if (s.adhan.enabled && !(board.audio && board.audio.adhan) && !DEMO) toast('ارفع ملف الأذان ليُسمع على الإطار.');
  try {
    settings = DEMO ? demo.saveSettings(s) : await send('/api/settings', 'PUT', s);
    board.settings = settings;
    $('saveBar').hidden = true;
    renderLists();
    $('setNoteText').textContent = 'حُفظ. يأخذه الإطار خلال 30 ثانية.';
    clearTimeout(saveSettingsNow.t);
    saveSettingsNow.t = setTimeout(() => { $('setNoteText').textContent = 'تُحفظ التغييرات وحدها، ويأخذها الإطار خلال 30 ثانية.'; }, 4000);
  } catch (e) { toast(e.message); $('saveBar').hidden = false; }
}
$('saveSettings').addEventListener('click', saveSettingsNow);

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
const PREVIEW_AR = { ramadan: 'وضع رمضان', adhkar: 'الأذكار', adhan: 'الأذان', wifi: 'رمز الواي فاي' };
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


// ================= settings: a menu of short pages =================
const PAGES = [
  { group: 'الإطار', items: [
    { id: 'theme', title: 'المظهر', icon: '<path d="M5 20V11a7 7 0 0 1 14 0v9z"/><path d="M9 20v-6a3 3 0 0 1 6 0v6"/>', tone: 'gold', sub: () => themeName(currentTheme) },
    { id: 'screens', title: 'الشاشات', icon: '<rect x="3" y="4" width="18" height="14" rx="2.5"/><path d="M8 21h8"/>', tone: 'gold', sub: (st) => { const sc = st.screens; const n = sc ? Object.values(sc).filter((x) => x.on).length : 5; return n + ' شاشات تتناوب · اللمس ' + (st.touchNavigation === false ? 'متوقف' : 'مفعّل'); } },
    { id: 'night', title: 'الوضع الليلي', icon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>', tone: 'blue', sub: (st) => { const n = Object.assign({}, config.night, st.night); return !n.enabled ? 'متوقف' : n.start + ' – ' + n.end + ' · ' + (n.off ? 'إطفاء كلي' : 'تعتيم ' + Math.round(n.dim * 100) + '%'); } },
    { id: 'wifi', title: 'الواي فاي للضيوف', icon: '<path d="M2.5 9a14 14 0 0 1 19 0"/><path d="M5.8 12.6a9.2 9.2 0 0 1 12.4 0"/><path d="M9.1 16.1a4.6 4.6 0 0 1 5.8 0"/>', tone: 'green', sub: (st) => (st.wifi && st.wifi.ssid ? st.wifi.ssid : 'لم تُضف شبكة') },
    { id: 'clock', title: 'شاشة الساعة', icon: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>', tone: 'gold', sub: (st) => (st.dailyVerse === false ? 'بلا آية اليوم' : 'آية أو حديث كل يوم') },
    { id: 'city', title: 'المدينة والتاريخ', icon: '<path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>', tone: 'gold', sub: (st) => (st.city || config.city) + ' · ' + (st.hijriAdjust ? 'الهجري معدَّل' : 'الهجري كما هو') },
  ] },
  { group: 'الصلاة والذكر', items: [
    { id: 'prayer', title: 'المواقيت والأذان', icon: '<path d="M5 20V11a7 7 0 0 1 14 0v9M3 20h18M12 4V2"/>', tone: 'green', sub: (st) => (st.adhan && st.adhan.enabled ? 'الأذان مفعّل' : 'الأذان متوقف') + (st.prayerFocus === false ? '' : ' · شاشة الصلاة قبل الأذان') },
    { id: 'adhkar', title: 'الأذكار', icon: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2"/>', tone: 'blue', sub: (st) => (st.adhkar && st.adhkar.auto === false ? 'لا تظهر وحدها' : 'بعد الفجر والعصر') },
    { id: 'ramadan', title: 'رمضان', icon: '<path d="M17 4a8 8 0 1 0 3 12A7 7 0 0 1 17 4z"/>', tone: 'gold', sub: () => $('ramadanWhen').textContent || 'يبدأ وحده' },
  ] },
  { group: 'أخرى', items: [
    { id: 'pulse', title: 'نبضة', icon: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>', tone: 'rose', sub: (st) => (st.pulseSound === false ? 'بلا رنّة' : 'رنّة خفيفة حين تصل') },
    { id: 'quick', title: 'الإضافة السريعة', icon: '<path d="M12 5v14M5 12h14"/>', tone: 'rose', sub: () => 'أزرار جاهزة للقوائم' },
  ] },
];
const PAGE_TITLE = { theme: 'مظهر الإطار' };
let setPage = null;
function renderSetMenu() {
  const box = $('setMenu');
  box.textContent = '';
  for (const g of PAGES) {
    const card = el('div', { class: 'set-card' });
    for (const it of g.items) {
      let sub = '';
      try { sub = it.sub(settings || {}); } catch (e) { sub = ''; }
      card.append(el('button', { type: 'button', class: 'set-row', onclick: () => showSetPage(it.id) },
        el('span', { class: 'set-ic t-' + it.tone, html: '<svg viewBox="0 0 24 24" aria-hidden="true">' + it.icon + '</svg>' }),
        el('span', { class: 'set-txt' }, el('span', { class: 'set-name' }, it.title), sub ? el('span', { class: 'set-sub' }, sub) : null),
        el('span', { class: 'set-chev', html: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>' })));
    }
    box.append(el('section', { class: 'set-group' }, el('h3', null, g.group), card));
  }
}
function showSetPage(id) {
  setPage = id;
  $('setMenu').hidden = !!id;
  $('setBack').hidden = !id;
  let title = 'الإعدادات';
  for (const g of PAGES) for (const it of g.items) if (it.id === id) title = PAGE_TITLE[id] || it.title;
  $('setTitle').textContent = title;
  for (const f of document.querySelectorAll('#v-settings [data-page]')) if (f.closest('#v-settings')) f.hidden = f.dataset.page !== id;
  const SUB = { night: 'في الليل يعرض الإطار الساعة فقط، بإضاءة خافتة.' };
  $('setSub').hidden = !SUB[id];
  $('setSub').textContent = SUB[id] || '';
  $('setTry').hidden = id !== 'theme';
  $('setNote').hidden = !id || id === 'theme';
  if (id === 'night') renderNightPreview();
  if (!id) renderSetMenu();
  window.scrollTo(0, 0);
}
$('setBack').addEventListener('click', () => showSetPage(null));
$('setTry').addEventListener('click', () => $('tryTheme').click());
onBoard(() => { if (!setPage) renderSetMenu(); });

// ================= the frame's look =================
const THEMES = [
  { id: 'original', name: 'الأصلي', sub: 'التصميم الذي بدأ به الإطار' },
  { id: 'riad', name: 'رياض', sub: 'نافذة مغربية وزليج' },
  { id: 'bright', name: 'فاتح', sub: 'أبيض وأزرق فاسي' },
  { id: 'andalus', name: 'أندلسي', sub: 'جص وأقواس وخط الرقعة' },
  { id: 'kids', name: 'للأطفال', sub: 'ألوان مرحة ونجوم' },
  { id: 'sahara', name: 'صحراء', sub: 'كثبان عند الغروب' },
  { id: 'majorelle', name: 'ماجوريل', sub: 'أزرق ماجوريل وصبّار' },
  { id: 'album', name: 'ألبوم العائلة', sub: 'كل شيء فوق صوركم' },
  { id: 'atlas', name: 'الأطلس', sub: 'جبال تتبدّل مع الفصول' },
  { id: 'sky', name: 'السماء الحيّة', sub: 'سماء اليوم كما هي في الخارج' },
  { id: 'flip', name: 'اللوحة القلّابة', sub: 'لوحة محطة بحروف تنقلب' },
  { id: 'hilal', name: 'الهلال', sub: 'قمر الليلة والشهر الهجري' },
];
const THEME_IDS = THEMES.map((t) => t.id);
const themeName = (id) => (THEMES.find((t) => t.id === id) || THEMES[0]).name;
let currentTheme = 'original';
function renderThemes() {
  const box = $('themes');
  if (!box.children.length) {
    for (const t of THEMES) {
      box.append(el('button', { type: 'button', role: 'radio', class: 'theme', 'data-theme': t.id, 'aria-checked': 'false', onclick: () => pickTheme(t.id) },
        el('span', { class: 'theme-art', html: THEME_ART[t.id] }),
        el('span', { class: 'theme-name' }, el('span', null, el('b', null, t.name), el('small', null, t.sub)), el('i', { class: 'radio', 'aria-hidden': 'true' }))));
    }
  }
  for (const b of box.children) b.setAttribute('aria-checked', String(b.dataset.theme === currentTheme));
}
async function pickTheme(id) {
  if (id === currentTheme) return;
  const was = currentTheme;
  currentTheme = id;
  renderThemes();
  try {
    const next = Object.assign({}, settings, { theme: id });
    settings = DEMO ? demo.saveSettings(next) : await send('/api/settings', 'PUT', next);
    board.settings = settings;
    toast('اخترت «' + themeName(id) + '». يتغيّر الإطار خلال 30 ثانية.');
  } catch (e) { currentTheme = was; renderThemes(); toast(e.message); }
}
$('tryTheme').addEventListener('click', async () => {
  try {
    board.preview = DEMO ? null : await send('/api/preview', 'POST', { what: 'theme', theme: currentTheme, minutes: 1 });
    toast('يظهر «' + themeName(currentTheme) + '» على الإطار لدقيقة، خلال 30 ثانية.');
  } catch (e) { toast(e.message); }
});
const THEME_ART = {
  "original": "<svg viewBox=\"0 0 112 70\" direction=\"ltr\" aria-hidden=\"true\"> <rect width=\"154\" height=\"96\" fill=\"#1C1A26\"></rect> <text x=\"56\" y=\"34\" text-anchor=\"middle\" font-family=\"Readex Pro, sans-serif\" font-size=\"22\" font-weight=\"600\" fill=\"#FFFFFF\">14:40</text> <rect x=\"22\" y=\"44\" width=\"68\" height=\"4\" rx=\"2\" fill=\"#5E5A70\"></rect> <g fill=\"#2E2B3C\"><rect x=\"10\" y=\"54\" width=\"26\" height=\"10\" rx=\"3\"></rect><rect x=\"43\" y=\"54\" width=\"26\" height=\"10\" rx=\"3\"></rect><rect x=\"76\" y=\"54\" width=\"26\" height=\"10\" rx=\"3\"></rect></g> <rect x=\"43\" y=\"54\" width=\"26\" height=\"10\" rx=\"3\" fill=\"#F2AE3D\"></rect> </svg>",
  "riad": "<svg viewBox=\"0 0 112 70\" direction=\"ltr\" aria-hidden=\"true\"> <defs><linearGradient id=\"thR2\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#F6B76A\"></stop><stop offset=\"1\" stop-color=\"#7FA9D9\"></stop></linearGradient></defs> <rect width=\"154\" height=\"96\" fill=\"#142060\"></rect> <path d=\"M8 58 V22 A12 12 0 0 1 20 10 H48 A12 12 0 0 1 60 22 V58 Z\" fill=\"none\" stroke=\"#C9A45A\" stroke-width=\"1.2\"></path> <path d=\"M12 58 V24 Q12 13 34 12 Q56 13 56 24 V58 Z\" fill=\"url(#thR2)\"></path> <text x=\"34\" y=\"44\" text-anchor=\"middle\" font-family=\"Readex Pro, sans-serif\" font-size=\"13\" font-weight=\"600\" fill=\"#142060\">14:40</text> <g fill=\"#E9DFC8\"><rect x=\"68\" y=\"16\" width=\"34\" height=\"5\" rx=\"2\"></rect><rect x=\"68\" y=\"26\" width=\"26\" height=\"4\" rx=\"2\" opacity=\"0.6\"></rect><rect x=\"68\" y=\"34\" width=\"30\" height=\"4\" rx=\"2\" opacity=\"0.6\"></rect></g> <rect y=\"58\" width=\"112\" height=\"12\" fill=\"#0E1748\"></rect> <g fill=\"#C9A45A\"><path d=\"M0 58 H112 V59.5 H0 Z\"></path><path d=\"M6 64 l3-3 3 3-3 3z M22 64 l3-3 3 3-3 3z M38 64 l3-3 3 3-3 3z M54 64 l3-3 3 3-3 3z M70 64 l3-3 3 3-3 3z M86 64 l3-3 3 3-3 3z M102 64 l3-3 3 3-3 3z\"></path></g> </svg>",
  "bright": "<svg viewBox=\"0 0 112 70\" direction=\"ltr\" aria-hidden=\"true\"> <rect width=\"154\" height=\"96\" fill=\"#F3F6FB\"></rect> <circle cx=\"34\" cy=\"32\" r=\"22\" fill=\"#FFFFFF\" stroke=\"#1F48A8\" stroke-width=\"3\"></circle> <path d=\"M14 26 A22 22 0 0 1 52 20\" fill=\"none\" stroke=\"#F2B84B\" stroke-width=\"3\"></path> <text x=\"34\" y=\"37\" text-anchor=\"middle\" font-family=\"Readex Pro, sans-serif\" font-size=\"12\" font-weight=\"600\" fill=\"#12205C\">14:40</text> <g fill=\"#C9D4EC\"><rect x=\"66\" y=\"14\" width=\"36\" height=\"9\" rx=\"3\"></rect><rect x=\"66\" y=\"27\" width=\"36\" height=\"9\" rx=\"3\"></rect></g> <rect x=\"66\" y=\"40\" width=\"36\" height=\"9\" rx=\"3\" fill=\"#1F48A8\"></rect> <rect y=\"59\" width=\"112\" height=\"11\" fill=\"#1F48A8\"></rect> <g fill=\"none\" stroke=\"#F3F6FB\" stroke-width=\"1\"><path d=\"M0 70 A8 8 0 0 1 16 70 M16 70 A8 8 0 0 1 32 70 M32 70 A8 8 0 0 1 48 70 M48 70 A8 8 0 0 1 64 70 M64 70 A8 8 0 0 1 80 70 M80 70 A8 8 0 0 1 96 70 M96 70 A8 8 0 0 1 112 70\"></path></g> </svg>",
  "andalus": "<svg viewBox=\"0 0 112 70\" direction=\"ltr\" aria-hidden=\"true\"> <rect width=\"154\" height=\"96\" fill=\"#EEE5D3\"></rect> <rect x=\"30\" y=\"4\" width=\"52\" height=\"50\" fill=\"#1E4A3B\"></rect> <path d=\"M34 54 V22 A4 4 0 0 1 38 17 A5 5 0 0 1 45 12 A6 6 0 0 1 56 9 A6 6 0 0 1 67 12 A5 5 0 0 1 74 17 A4 4 0 0 1 78 22 V54 Z\" fill=\"#F7F1E4\" stroke=\"#C9A45A\" stroke-width=\"0.8\"></path> <text x=\"56\" y=\"40\" text-anchor=\"middle\" font-family=\"Amiri, serif\" font-size=\"13\" font-weight=\"700\" fill=\"#2B2118\">14:40</text> <g fill=\"#D2C09A\"><rect x=\"6\" y=\"14\" width=\"18\" height=\"3\" rx=\"1.5\"></rect><rect x=\"6\" y=\"22\" width=\"18\" height=\"3\" rx=\"1.5\"></rect><rect x=\"88\" y=\"14\" width=\"18\" height=\"3\" rx=\"1.5\"></rect><rect x=\"88\" y=\"22\" width=\"18\" height=\"3\" rx=\"1.5\"></rect></g> <rect y=\"54\" width=\"112\" height=\"8\" fill=\"#1E4A3B\"></rect> <rect y=\"62\" width=\"112\" height=\"8\" fill=\"#EEE5D3\"></rect> <g fill=\"#1E4A3B\"><path d=\"M4 66 l4-4 4 4-4 4z M20 66 l4-4 4 4-4 4z M36 66 l4-4 4 4-4 4z M52 66 l4-4 4 4-4 4z M68 66 l4-4 4 4-4 4z M84 66 l4-4 4 4-4 4z M100 66 l4-4 4 4-4 4z\"></path></g> </svg>",
  "kids": "<svg viewBox=\"0 0 112 70\" direction=\"ltr\" aria-hidden=\"true\"> <rect width=\"154\" height=\"96\" fill=\"#A9DCFF\"></rect> <circle cx=\"96\" cy=\"12\" r=\"7\" fill=\"#FFD23F\"></circle> <path d=\"M0 52 C 30 42, 60 46, 112 48 V70 H0 Z\" fill=\"#7ED07A\"></path> <path d=\"M0 58 C 40 54, 70 62, 112 56 V70 H0 Z\" fill=\"#5BBE6A\"></path> <circle cx=\"30\" cy=\"30\" r=\"20\" fill=\"#FF6B57\"></circle> <circle cx=\"30\" cy=\"30\" r=\"16\" fill=\"#FFFFFF\"></circle> <line x1=\"30\" y1=\"30\" x2=\"40\" y2=\"28\" stroke=\"#7B6CF6\" stroke-width=\"3\" stroke-linecap=\"round\"></line> <line x1=\"30\" y1=\"30\" x2=\"20\" y2=\"36\" stroke=\"#FF9F1C\" stroke-width=\"2.4\" stroke-linecap=\"round\"></line> <g><circle cx=\"62\" cy=\"62\" r=\"4\" fill=\"#7B6CF6\"></circle><circle cx=\"76\" cy=\"60\" r=\"4\" fill=\"#FF9F1C\"></circle><circle cx=\"90\" cy=\"62\" r=\"5\" fill=\"#FF6B57\" stroke=\"#FFD23F\" stroke-width=\"1.5\"></circle></g> <rect x=\"58\" y=\"22\" width=\"40\" height=\"12\" rx=\"6\" fill=\"#1F2A44\"></rect> </svg>",
  "sahara": "<svg viewBox=\"0 0 112 70\" direction=\"ltr\" aria-hidden=\"true\"> <rect width=\"112\" height=\"70\" fill=\"#F8E2C2\"></rect> <circle cx=\"30\" cy=\"30\" r=\"12\" fill=\"#FBD08C\"></circle> <text x=\"96\" y=\"30\" text-anchor=\"end\" font-family=\"Rakkas, serif\" font-size=\"18\" fill=\"#4A2414\">14:40</text> <path d=\"M0 46 C 20 38, 40 42, 56 44 S 90 36, 112 40 V70 H0 Z\" fill=\"#E7B074\"></path> <path d=\"M0 54 C 30 50, 60 56, 112 52 V70 H0 Z\" fill=\"#A9622F\"></path> <rect y=\"62\" width=\"112\" height=\"8\" fill=\"#A8322A\"></rect> <g fill=\"none\" stroke=\"#F6DDB8\" stroke-width=\"1\"><path d=\"M8 66 l4 -3 4 3 -4 3z M28 66 l4 -3 4 3 -4 3z M48 66 l4 -3 4 3 -4 3z M68 66 l4 -3 4 3 -4 3z M88 66 l4 -3 4 3 -4 3z\"></path></g> </svg>",
  "majorelle": "<svg viewBox=\"0 0 112 70\" direction=\"ltr\" aria-hidden=\"true\"> <rect width=\"112\" height=\"70\" fill=\"#4537C8\"></rect> <rect x=\"8\" y=\"6\" width=\"30\" height=\"38\" fill=\"#5E9E6E\"></rect> <path d=\"M8 6 H38 V44 H8 Z M23 6 V44 M8 25 H38\" fill=\"none\" stroke=\"#F4C430\" stroke-width=\"2\"></path> <g fill=\"#D9418C\"><circle cx=\"6\" cy=\"6\" r=\"3\"></circle><circle cx=\"12\" cy=\"3\" r=\"3\"></circle><circle cx=\"4\" cy=\"12\" r=\"2.5\"></circle></g> <text x=\"104\" y=\"28\" text-anchor=\"end\" font-family=\"El Messiri, serif\" font-size=\"17\" font-weight=\"700\" fill=\"#FFFFFF\">14:40</text> <g fill=\"#2F6B4F\"><rect x=\"20\" y=\"44\" width=\"6\" height=\"12\" rx=\"3\"></rect><ellipse cx=\"56\" cy=\"52\" rx=\"6\" ry=\"5\"></ellipse><rect x=\"88\" y=\"44\" width=\"6\" height=\"12\" rx=\"3\"></rect></g> <g fill=\"#F4C430\"><path d=\"M14 56 H32 L30 64 H16 Z M47 56 H65 L63 64 H49 Z M82 56 H100 L98 64 H84 Z\"></path></g> <rect x=\"47\" y=\"55\" width=\"18\" height=\"2.5\" fill=\"#D9418C\"></rect> <rect y=\"65\" width=\"112\" height=\"5\" fill=\"#2E2490\"></rect> </svg>",
  "album": "<svg viewBox=\"0 0 112 70\" direction=\"ltr\" aria-hidden=\"true\"> <defs><linearGradient id=\"thA2\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#2E3A6B\"></stop><stop offset=\"0.5\" stop-color=\"#C8687A\"></stop><stop offset=\"0.7\" stop-color=\"#F6B26B\"></stop></linearGradient></defs> <rect width=\"112\" height=\"70\" fill=\"url(#thA2)\"></rect> <circle cx=\"72\" cy=\"40\" r=\"6\" fill=\"#FFD9A0\"></circle> <rect y=\"42\" width=\"112\" height=\"14\" fill=\"#3B4C7A\"></rect> <path d=\"M0 56 C 30 52, 70 55, 112 53 V70 H0 Z\" fill=\"#B98457\"></path> <path d=\"M14 70 C 15 56, 18 46, 22 38 L23 38 C 20 48, 17 58, 17 70 Z M22 38 C 16 34, 10 34, 5 36 C 12 36, 17 37, 22 40 Z M22 38 C 27 33, 33 33, 38 35 C 32 36, 27 37, 23 40 Z\" fill=\"#1B1530\"></path> <rect x=\"60\" y=\"54\" width=\"46\" height=\"12\" rx=\"6\" fill=\"#FFFFFF\" opacity=\"0.85\"></rect> <text x=\"104\" y=\"30\" text-anchor=\"end\" font-family=\"Almarai, sans-serif\" font-size=\"15\" font-weight=\"800\" fill=\"#FFFFFF\">14:40</text> </svg>",
  "atlas": "<svg viewBox=\"0 0 112 70\" direction=\"ltr\" aria-hidden=\"true\"> <defs><linearGradient id=\"thT1\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#F4E6CC\"></stop><stop offset=\"1\" stop-color=\"#E6C69C\"></stop></linearGradient></defs> <rect width=\"112\" height=\"70\" fill=\"url(#thT1)\"></rect> <path d=\"M0 40 L14 32 L28 22 L40 30 L52 24 L66 36 L80 34 L112 40 V70 H0 Z\" fill=\"#BCC2CC\"></path> <path d=\"M28 22 L24 26 L28 25.5 L30 27 L33 25 Z M52 24 L49 27 L52 26.5 L54 28 L56 26 Z\" fill=\"#FBF8F1\"></path> <path d=\"M0 50 L20 44 L44 48 L70 42 L112 48 V70 H0 Z\" fill=\"#8E98A6\"></path> <path d=\"M0 58 C 30 54, 70 58, 112 55 V70 H0 Z\" fill=\"#C98B3F\"></path> <g fill=\"#DFA23A\"><ellipse cx=\"12\" cy=\"52\" rx=\"2\" ry=\"6\"></ellipse><ellipse cx=\"17\" cy=\"51\" rx=\"2\" ry=\"6\"></ellipse><ellipse cx=\"98\" cy=\"52\" rx=\"2\" ry=\"6\"></ellipse></g> <rect y=\"64\" width=\"112\" height=\"6\" fill=\"#2F3B2C\"></rect> <text x=\"104\" y=\"20\" text-anchor=\"end\" font-family=\"Noto Kufi Arabic, sans-serif\" font-size=\"14\" font-weight=\"600\" fill=\"#1F2A26\">14:40</text> </svg>",
  "sky": "<svg viewBox=\"0 0 112 70\" direction=\"ltr\" aria-hidden=\"true\"> <defs><linearGradient id=\"thS1\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#3F78BE\"></stop><stop offset=\"0.6\" stop-color=\"#86B2DF\"></stop><stop offset=\"1\" stop-color=\"#D6E6F2\"></stop></linearGradient></defs> <rect width=\"112\" height=\"70\" fill=\"url(#thS1)\"></rect> <circle cx=\"26\" cy=\"16\" r=\"6\" fill=\"#FFF8E6\"></circle> <g fill=\"#FFFFFF\" opacity=\"0.92\"><circle cx=\"24\" cy=\"26\" r=\"6\"></circle><circle cx=\"32\" cy=\"22\" r=\"8\"></circle><circle cx=\"41\" cy=\"26\" r=\"6\"></circle><rect x=\"20\" y=\"26\" width=\"26\" height=\"6\" rx=\"3\"></rect></g> <text x=\"104\" y=\"34\" text-anchor=\"end\" font-family=\"Readex Pro, sans-serif\" font-size=\"18\" font-weight=\"200\" fill=\"#FFFFFF\">14:40</text> <path d=\"M0 56 C 30 52, 70 56, 112 53 V70 H0 Z\" fill=\"#34507A\"></path> <line x1=\"8\" y1=\"61\" x2=\"104\" y2=\"61\" stroke=\"#FFFFFF\" stroke-opacity=\"0.5\"></line> <circle cx=\"58\" cy=\"61\" r=\"2.4\" fill=\"#FFE7A3\"></circle> </svg>",
  "flip": "<svg viewBox=\"0 0 112 70\" direction=\"ltr\" aria-hidden=\"true\"> <rect width=\"112\" height=\"70\" fill=\"#141416\"></rect> <g fill=\"#2C2C31\"><rect x=\"10\" y=\"14\" width=\"20\" height=\"30\" rx=\"3\"></rect><rect x=\"33\" y=\"14\" width=\"20\" height=\"30\" rx=\"3\"></rect><rect x=\"60\" y=\"14\" width=\"20\" height=\"30\" rx=\"3\"></rect><rect x=\"83\" y=\"14\" width=\"20\" height=\"30\" rx=\"3\"></rect></g> <g font-family=\"Changa, sans-serif\" font-size=\"24\" font-weight=\"700\" fill=\"#F1EDE4\" text-anchor=\"middle\"><text x=\"20\" y=\"38\">1</text><text x=\"43\" y=\"38\">4</text><text x=\"70\" y=\"38\">4</text><text x=\"93\" y=\"38\">0</text></g> <g fill=\"#0C0C0E\"><rect x=\"10\" y=\"28.5\" width=\"20\" height=\"1.2\"></rect><rect x=\"33\" y=\"28.5\" width=\"20\" height=\"1.2\"></rect><rect x=\"60\" y=\"28.5\" width=\"20\" height=\"1.2\"></rect><rect x=\"83\" y=\"28.5\" width=\"20\" height=\"1.2\"></rect></g> <g fill=\"#F1EDE4\"><rect x=\"55\" y=\"23\" width=\"2.6\" height=\"2.6\" rx=\"0.6\"></rect><rect x=\"55\" y=\"32\" width=\"2.6\" height=\"2.6\" rx=\"0.6\"></rect></g> <g fill=\"#2C2C31\"><rect x=\"10\" y=\"52\" width=\"26\" height=\"8\" rx=\"2\"></rect><rect x=\"39\" y=\"52\" width=\"16\" height=\"8\" rx=\"2\"></rect></g> <rect x=\"58\" y=\"52\" width=\"30\" height=\"8\" rx=\"2\" fill=\"#4A3A16\"></rect> </svg>",
  "hilal": "<svg viewBox=\"0 0 112 70\" direction=\"ltr\" aria-hidden=\"true\"> <defs><radialGradient id=\"thH1\" cx=\"0.3\" cy=\"0.5\" r=\"0.8\"><stop offset=\"0\" stop-color=\"#1A2350\"></stop><stop offset=\"1\" stop-color=\"#0A0F27\"></stop></radialGradient></defs> <rect width=\"112\" height=\"70\" fill=\"url(#thH1)\"></rect> <circle cx=\"30\" cy=\"35\" r=\"24\" fill=\"none\" stroke=\"#5A6396\" stroke-width=\"1\" stroke-dasharray=\"1.5 3\"></circle> <circle cx=\"30\" cy=\"35\" r=\"15\" fill=\"#E8E4D5\"></circle> <path d=\"M30 20 A15 15 0 0 1 30 50 A10 15 0 0 0 30 20 Z\" fill=\"#0F1638\"></path> <circle cx=\"44\" cy=\"52\" r=\"2.6\" fill=\"#E9C46A\"></circle> <text x=\"104\" y=\"30\" text-anchor=\"end\" font-family=\"Readex Pro, sans-serif\" font-size=\"16\" font-weight=\"300\" fill=\"#FFFFFF\">14:40</text> <rect x=\"66\" y=\"38\" width=\"38\" height=\"4\" rx=\"2\" fill=\"#E9C46A\"></rect> <rect x=\"74\" y=\"46\" width=\"30\" height=\"3\" rx=\"1.5\" fill=\"#5A6396\"></rect> </svg>"
};

// ================= home: today at a glance =================
const HQ_PLAY = '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5l11 7-11 7z" fill="currentColor"/></svg>';
const HQ_PAUSE = '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor"/><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor"/></svg>';
function renderHomeQuran() {
  const n = quran.nowInfo && quran.nowInfo();
  $('homeQuran').hidden = !n;
  if (!n) return;
  $('hqName').textContent = n.name;
  $('hqSub').textContent = n.reciter + (n.paused ? ' · متوقفة مؤقتاً' : '');
  $('hqTime').textContent = n.dur ? n.mmss(n.pos) + ' / ' + n.mmss(n.dur) : '';
  $('hqTime').dir = 'ltr';
  $('hqBar').style.width = n.dur ? Math.min(100, (100 * n.pos) / n.dur).toFixed(1) + '%' : '0';
  $('hqPlay').innerHTML = n.paused ? HQ_PLAY : HQ_PAUSE;
  $('hqPlay').setAttribute('aria-label', n.paused ? 'متابعة' : 'إيقاف مؤقت');
}
$('hqPlay').addEventListener('click', async () => { await quran.toggle(); renderHomeQuran(); });
$('hqStop').addEventListener('click', async () => { await quran.stop(); renderHomeQuran(); });
setInterval(() => { if (!$('v-home').hidden) renderHomeQuran(); }, 1000);
setInterval(() => { if (!$('v-home').hidden && document.visibilityState === 'visible') quran.load(); }, 8000);
// The three quick taps send at once, like on the «نبضة» page.
for (const b of document.querySelectorAll('[data-send-tap]')) {
  b.addEventListener('click', () => { const t = $('taps').querySelector('[data-tap="' + b.dataset.sendTap + '"]'); if (t) t.click(); });
}
$('homeWifi').addEventListener('click', () => {
  if (!(settings.wifi && settings.wifi.ssid)) { showView('settings', 'wifi'); return; }
  preview('wifi', 3);
});
function renderHome() {
  const h = new Date().getHours();
  const me = (pulse.me && pulse.me()) || '';
  $('homeHello').textContent = (h < 12 ? 'صباح الخير' : 'مساء الخير') + (me ? ' يا ' + me : '');
  const d = new Date();
  const hj = hijri(Date.now() + (config.hijriAdjust || 0) * DAY);
  $('homeDate').textContent = WEEKDAYS[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()] + (hj ? ' · ' + hj.d + ' ' + HIJRI_MONTHS[hj.m - 1] : '');
  const m = board.message;
  const active = m && m.text && (!m.until || m.until > Date.now());
  $('homeMsg').textContent = active ? m.text : 'لا رسالة الآن';
  const np = photos ? photos.length : null;
  if (typeof np === 'number') $('homePhotos').textContent = np ? np + ' صورة' : 'لا صور بعد';
  $('homeWifiSub').textContent = settings.wifi && settings.wifi.ssid ? 'اعرض الرمز للضيوف' : 'أضف شبكة الضيوف';
  const lists = board.lists || { tasks: [], shopping: [] };
  const shop = (lists.shopping || []).filter((x) => !x.done);
  $('homeShop').textContent = '';
  if (shop.length) {
    $('homeShop').append(shop.slice(0, 3).map((x) => x.text).join('، '));
    if (shop.length > 3) $('homeShop').append(' ', el('span', { class: 'ht-more' }, 'و' + (shop.length - 3) + ' أخرى'));
  } else $('homeShop').append('لا شيء ينقص البيت');
  const today = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const evs = (board.events || []).filter((e) => !e.src).map((e) => ({ e, at: nextOccurrence(e, today) })).filter((x) => x.at >= today).sort((a, b) => a.at - b.at);
  $('homeNext').textContent = '';
  if (evs.length) $('homeNext').append(evs[0].e.name + ' ', el('span', { class: 'ht-more' }, '· ' + daysAway(Math.round((evs[0].at - today) / DAY))));
  else $('homeNext').append('لا مناسبات قريبة');
  renderThemes();
  renderHomeQuran();
}
onBoard(() => { if (!$('v-home').hidden) renderHome(); });


// ================= «نبضة»: send, the latest, and a page for each kind =================
function showPP(mode) {
  const v = $('v-pulse');
  v.dataset.ppMode = mode;
  for (const b of v.querySelectorAll('.pp-seg [data-pp-go]')) b.setAttribute('aria-selected', String(b.dataset.ppGo === mode));
  $('ppBack').hidden = mode === 'send' || mode === 'feed';
  window.scrollTo(0, 0);
}
$('v-pulse').addEventListener('click', (e) => {
  const b = e.target.closest('[data-pp-go]');
  if (b) showPP(b.dataset.ppGo);
});
$('ppBack').addEventListener('click', () => showPP('send'));
$('ppLater').addEventListener('change', () => { $($('ppLater').checked ? 'whenLater' : 'whenNow').click(); });
new MutationObserver(() => { $('ppLater').checked = $('whenLater').classList.contains('is-on'); }).observe($('whenLater'), { attributes: true, attributeFilter: ['class'] });
function renderPulseHead() {
  const me = pulse.me && pulse.me();
  $('pulseSub').textContent = 'تصل إلى الإطار خلال ثانيتين' + (me ? ' · باسم «' + me + '»' : '');
  // how many moments today
  let n = 0, today = false;
  for (const li of $('pulseFeed').children) {
    if (li.classList.contains('feed-day')) { today = li.textContent === 'اليوم'; continue; }
    if (today) n++;
  }
  $('ppBadge').hidden = !n;
  $('ppBadge').textContent = n;
  const st = $('statusNow');
  $('ppStatusSub').textContent = st && !st.hidden && st.textContent.trim() ? st.textContent.trim().slice(0, 40) : 'شارك ما تفعله الآن';
}
new MutationObserver(renderPulseHead).observe($('pulseFeed'), { childList: true });
new MutationObserver(renderPulseHead).observe($('statusNow'), { childList: true, attributes: true, subtree: true });
showPP('send');
renderPulseHead();


// ================= «القرآن»: the main page, the whole list, set times =================
function showQ(mode) {
  const v = $('v-quran');
  v.dataset.qMode = mode;
  window.scrollTo(0, 0);
}
$('v-quran').addEventListener('click', (e) => { const b = e.target.closest('[data-q-go]'); if (b) showQ(b.dataset.qGo); });
$('qnPlayAll2').addEventListener('click', () => $('qnPlayAll').click());
function renderQuranExtras() {
  const n = $('qnFavs').children.length;
  $('qnMore').textContent = n > 3 ? 'عرض ' + (n <= 10 ? ['', '', '', '', 'الأربع', 'الخمس', 'الست', 'السبع', 'الثماني', 'التسع', 'العشر'][n] + ' كلها' : 'القائمة كلها') + ' وإضافة سورة' : 'إضافة سورة';
  const rows = [...$('qnSched').children].filter((li) => !li.classList.contains('empty'));
  $('qnSchedSum').textContent = rows.length ? rows.map((li) => (li.querySelector('.qn-sw span') || li).textContent.trim().replace(' · ', ' ')).join(' · ').slice(0, 60) : 'لا أوقات بعد';
}
new MutationObserver(renderQuranExtras).observe($('qnFavs'), { childList: true });
new MutationObserver(renderQuranExtras).observe($('qnSched'), { childList: true, subtree: true });
showQ('main');

// ================= start =================
const fromHash = (location.hash || '').slice(1);
showView(VIEWS.includes(fromHash) ? fromHash : store.get('admin-view', 'home'));
window.addEventListener('hashchange', () => { const v = location.hash.slice(1); if (VIEWS.includes(v)) showView(v); });
loadBoard();
loadPhotos();
takeShared();
setInterval(() => { if (document.visibilityState === 'visible') loadBoard(); }, 15000);
setInterval(() => { renderStatus(); renderMessage(); }, 60000);
