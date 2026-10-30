// «اللوحة القلّابة» (mockups T9-Flip-*): a split-flap station departures board. Charcoal tiles with
// a hinge across the middle; when a value changes, the top half of the old one folds down over the
// new one. The clock screen gets its own big four-digit flip clock (the original .h-clock is
// hidden) and rows of word tiles mirrored from the real elements (dates, next prayer, weather);
// the prayer screen becomes a departures board built from the real prayer row (.p-tiles).
// Arabic text goes one word per tile, never one letter per tile.
import { hhmm, now } from '../util.js';
import { displayDay } from '../prayer-times.js';

const reduced = (() => {
  let mq = null;
  try { mq = window.matchMedia('(prefers-reduced-motion: reduce)'); } catch (e) { mq = null; }
  return () => !!(mq && mq.matches);
})();

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
const words = (s) => (s || '').trim().split(/\s+/).filter((w) => w && w !== '·');
const txt = (root, sel) => { const e = root.querySelector(sel); return e ? e.textContent.trim() : ''; };

// ---------- a word tile: when its text changes, the old word's top half folds down ----------
function tile(cls) {
  const box = el('span', 'fl-t' + (cls ? ' ' + cls : ''));
  const face = el('span', 'fl-x');
  box.appendChild(face);
  let value = null;
  let fold = null, timer = 0;
  return {
    el: box,
    get value() { return value; },
    set(v, animate) {
      v = v == null ? '' : String(v);
      if (v === value) return;
      const old = value;
      value = v;
      face.textContent = v;
      if (!animate || !old || reduced()) return;
      if (fold) { fold.remove(); clearTimeout(timer); }
      fold = el('span', 'fl-fold');
      fold.appendChild(el('span', 'fl-x', old));
      box.appendChild(fold);
      timer = setTimeout(() => { if (fold) { fold.remove(); fold = null; } }, 520);
    },
  };
}

// A row of word tiles that grows and shrinks with the text.
function wordRow(cls, tileCls) {
  const box = el('span', 'fl-row' + (cls ? ' ' + cls : ''));
  const tiles = [];
  let key = null;
  return {
    el: box,
    tiles,
    set(list, animate) {
      const k = list.join('\u0001');
      if (k === key) return false;
      key = k;
      while (tiles.length > list.length) tiles.pop().el.remove();
      list.forEach((w, i) => {
        if (!tiles[i]) { tiles[i] = tile(typeof tileCls === 'function' ? tileCls(i) : tileCls); box.appendChild(tiles[i].el); tiles[i].set(w, false); }
        else tiles[i].set(w, animate);
      });
      return true;
    },
  };
}

// Steps a row of tiles down in size (classes is-fit1, is-fit2) until it fits its room.
function fitter(row, max) {
  let level = 0;
  const apply = () => { row.classList.toggle('is-fit1', level === 1); row.classList.toggle('is-fit2', level === 2); };
  return function fit(changed) {
    if (changed && level) { level = 0; apply(); }
    while (level < 2 && row.offsetWidth > max) { level++; apply(); }
  };
}

// ---------- a flip digit: two static halves and, while it turns, two moving flaps ----------
function half(pos, v) {
  const h = el('span', 'fl-h fl-h-' + pos);
  h.appendChild(el('b', null, v));
  return h;
}
function digit(cls) {
  const box = el('span', 'fl-d' + (cls ? ' ' + cls : ''));
  const top = half('top', '');
  const bot = half('bot', '');
  box.append(top, bot, el('i', 'fl-hinge'), el('i', 'fl-pin fl-pin-l'), el('i', 'fl-pin fl-pin-r'));
  let value = null, timer = 0, flaps = [];
  const clear = () => { for (const f of flaps) f.remove(); flaps = []; };
  return {
    el: box,
    set(v, animate) {
      if (v === value) return;
      const old = value;
      value = v;
      clearTimeout(timer);
      clear();
      top.firstChild.textContent = v;
      if (!animate || old == null || reduced()) { bot.firstChild.textContent = v; return; }
      // The old top half folds down on its hinge (0 → 90°), then the new bottom half falls
      // into place (−90° → 0) over the old bottom half, which is then swapped.
      bot.firstChild.textContent = old;
      const a = half('top', old); a.classList.add('fl-flap-a'); a.appendChild(el('i', 'fl-sh'));
      const b = half('bot', v); b.classList.add('fl-flap-b'); b.appendChild(el('i', 'fl-sh'));
      flaps = [a, b];
      box.append(a, b);
      timer = setTimeout(() => { bot.firstChild.textContent = v; clear(); }, 520);
    },
  };
}

// HH:MM as four flip digits around a colon.
function flipClock(cls, colon) {
  const box = el('div', cls);
  box.setAttribute('dir', 'ltr');
  const small = /sm/.test(cls);
  const ds = [0, 1, 2, 3].map(() => digit(small ? 'is-sm' : ''));
  box.append(ds[0].el, ds[1].el, colon(), ds[2].el, ds[3].el);
  let last = '';
  return {
    el: box,
    set(hm, animate) {
      if (hm === last) return;
      last = hm;
      const s = hm.replace(':', '');
      ds.forEach((d, i) => d.set(s[i] || '', animate));
    },
  };
}

// ---------- clock screen ----------
function homeBoard(screen, layer) {
  const root = el('div', 'fl-home');
  const day = wordRow('fl-day', (i) => (i === 0 ? 'is-amber' : ''));
  const hij = wordRow('fl-hij', 'is-soft');
  const head = el('div', 'fl-head');
  head.append(day.el, hij.el);
  const clock = flipClock('fl-clock', () => {
    const c = el('span', 'fl-colon');
    c.append(el('i'), el('i'));
    return c;
  });
  const nextLine = el('div', 'fl-line fl-next');
  const next = wordRow('fl-nw', 'is-amber is-lg');
  nextLine.append(el('span', 'fl-lab', 'الصلاة القادمة'), next.el);
  const wxLine = el('div', 'fl-line fl-wx');
  const wx = wordRow('fl-ww');
  wxLine.append(el('span', 'fl-lab', 'الطقس'), wx.el);
  root.append(head, clock.el, nextLine, wxLine, el('div', 'fl-rule'));
  layer.appendChild(root);

  const q = (s) => screen.querySelector(s);
  const nextBox = q('.h-next');
  let tipRight = -1;
  const fitNext = fitter(next.el, 1280 - 2 * 186 - 148);

  return function update(t, animate) {
    clock.set(hhmm(t), animate);
    day.set([txt(screen, '.h-weekday')].concat(words(txt(screen, '.h-greg'))).filter(Boolean), animate);
    hij.set(words(txt(screen, '.h-hijri')), animate);
    // The next prayer (in Ramadan: iftar / imsak), exactly as the real line says it.
    const shown = nextBox && nextBox.style.visibility !== 'hidden';
    const nw = shown ? [txt(screen, '.h-next-name'), txt(screen, '.h-next-time')].concat(words(txt(screen, '.h-next-in'))).filter(Boolean) : [];
    fitNext(next.set(nw, animate));
    nextLine.style.visibility = nw.length ? '' : 'hidden';
    const temp = txt(screen, '.hw-temp');
    wx.set(temp ? [temp].concat(words(txt(screen, '.hw-cond'))) : [], animate);
    wxLine.classList.toggle('is-empty', !temp);
    // The real weather sentence (.hw-tip) sits right after the weather tiles.
    const r = 186 + 140 + 8 + wx.el.offsetWidth + 22;
    if (r !== tipRight) { tipRight = r; screen.style.setProperty('--fl-tip-right', r + 'px'); }
  };
}

// ---------- prayer screen: the departures board ----------
const ROWS = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];

function prayerBoard(screen, layer) {
  const root = el('div', 'fl-pr');
  const title = el('div', 'fl-pr-title');
  const big = wordRow('fl-big', 'is-amber is-xl');
  const head = el('div', 'fl-pr-head');
  head.append(title, big.el);
  const clock = flipClock('fl-pr-now sm', () => el('span', 'fl-colon-sm', ':'));
  const cols = el('div', 'fl-cols');
  cols.append(el('span', null, 'الصلاة'), el('span', null, 'الأذان'), el('span', null, 'الحالة'));
  const list = el('div', 'fl-board');
  const rows = ROWS.map((k) => {
    const row = el('div', 'fl-r k-' + k + (k === 'sunrise' ? ' is-minor' : ''));
    const name = tile('fl-c-name');
    const time = tile('fl-c-time');
    const stat = tile('fl-c-stat');
    stat.el.insertBefore(el('i', 'fl-led'), stat.el.firstChild);
    row.append(name.el, time.el, stat.el);
    list.appendChild(row);
    return { k, row, name, time, stat, state: '' };
  });
  const foot = el('div', 'fl-pr-foot');
  const sun = el('span', 'fl-sun');
  foot.append(el('span', null, '«أرحنا بها يا بلال»'), sun);
  root.append(head, clock.el, cols, list, foot);
  layer.appendChild(root);
  // room for the next prayer's tiles: up to the small clock on the left
  const fitBig = fitter(big.el, 1280 - 80 - 80 - 300 - 30);

  return function update(t, animate) {
    if (screen.classList.contains('is-ramadan')) return;
    // After Isha the board already shows tomorrow's times (displayDay).
    const dd = displayDay(t);
    const T = dd && dd.times;
    const date = txt(screen, '.pc-date');
    const tv = (dd && dd.ref !== t ? 'مواعيد صلاة الغد' : 'مواعيد الصلاة') + (date ? ' · ' + date : '');
    if (title.textContent !== tv) title.textContent = tv;
    clock.set(txt(screen, '.pc-time') || hhmm(t), animate);
    const isNow = screen.classList.contains('is-now');
    fitBig(big.set([txt(screen, '.p-name')].concat(words(txt(screen, '.p-in'))).filter(Boolean), animate));

    // The rows, from the real prayer row (.p-tiles): past ones dim, the next one amber.
    let lastPast = null;
    for (const r of rows) {
      const item = screen.querySelector('.p-tiles .k-' + r.k);
      if (!item) continue;
      r.past = item.classList.contains('is-past');
      r.next = item.classList.contains('is-next');
      r.when = txt(item, '.prow-in');
      r.name.set(txt(item, '.prow-name'), animate);
      r.time.set(txt(item, '.prow-time'), animate);
      if (r.past && r.k !== 'sunrise') lastPast = r;
    }
    for (const r of rows) {
      let st, label;
      if (r.k === 'sunrise') { st = r.past ? 'past' : 'later'; label = r.past ? 'طلعت الشمس' : 'لم تطلع بعد'; }
      else if (r.next) { st = 'next'; label = 'التالية · ' + r.when; }
      else if (isNow && r === lastPast) { st = 'now'; label = 'حان الآن وقتها'; }
      else if (r.past) { st = 'past'; label = 'أُذِّن لها'; }
      else { st = 'later'; label = 'في موعدها'; }
      if (st !== r.state) { r.row.className = 'fl-r k-' + r.k + (r.k === 'sunrise' ? ' is-minor' : '') + ' is-' + st; r.state = st; }
      r.stat.set(label, animate);
    }
    const sv = T && T.sunrise ? 'الشروق ' + hhmm(T.sunrise) + ' · الغروب ' + hhmm(T.sunset || T.maghrib) : '';
    if (sun.textContent !== sv) sun.textContent = sv;
  };
}

export function mount({ screens, stage }) {
  const boards = {};
  if (screens.home) boards.home = homeBoard(screens.home.el, screens.home.art);
  if (screens.prayer) boards.prayer = prayerBoard(screens.prayer.el, screens.prayer.art);
  let current = stage ? stage.getAttribute('data-screen') : null;
  let fresh = true;

  // Fill a board right away (without flips) when its screen comes in, so it never shows old values.
  let obs = null;
  if (stage && window.MutationObserver) {
    obs = new MutationObserver(() => {
      const name = stage.getAttribute('data-screen');
      if (name === current) return;
      current = name;
      if (boards[name]) { try { boards[name](now(), false); } catch (e) { console.error(e); } }
    });
    obs.observe(stage, { attributes: true, attributeFilter: ['data-screen'] });
  }

  return {
    tick(t, name) {
      if (name) current = name;
      for (const k in boards) {
        // Only the screen on show flips; the others are kept up to date quietly.
        boards[k](t, !fresh && k === current);
      }
      fresh = false;
    },
    unmount() {
      if (obs) obs.disconnect();
      if (screens.home) screens.home.el.style.removeProperty('--fl-tip-right');
    },
  };
}
