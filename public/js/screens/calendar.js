import { h, setText, now, parts, dayKey, startOfDay, hijri, hhmm, MONTHS, HIJRI_MONTHS, WEEKDAYS, DAY } from '../util.js';
import { state, on } from '../data.js';
import { occasions, between, upcoming } from '../holidays.js';

// Monday first, as Moroccan calendars print it.
const WEEK = ['الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد'];
const KIND_LABEL = { national: 'عطلة وطنية', religious: 'عيد ديني', observance: 'مناسبة', family: 'العائلة' };

const ARROW_PREV = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
const ARROW_NEXT = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>';
const CLOSE = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

function daysAway(n) {
  if (n === 0) return 'اليوم';
  if (n === 1) return 'غداً';
  if (n === 2) return 'بعد يومين';
  if (n <= 10) return 'بعد ' + n + ' أيام';
  return 'بعد ' + n + ' يوماً';
}
const spanLabel = (n) => (n === 2 ? 'يومان' : n <= 10 ? n + ' أيام' : n + ' يوماً');
const moreLabel = (n) => (n === 1 ? 'ومناسبة أخرى' : n === 2 ? 'ومناسبتان أخريان' : n <= 10 ? 'و' + n + ' مناسبات أخرى' : 'و' + n + ' مناسبة أخرى');
const isoParts = (iso) => iso.split('-').map(Number);
const dayMonth = (iso) => { const b = isoParts(iso); return b[2] + ' ' + MONTHS[b[1] - 1]; };

// Family dates that last several days are drawn as bars across the days they cover.
const isSpan = (e) => e.kind === 'family' && e.days > 1;
const isDayOff = (e) => e.kind === 'national' || e.kind === 'religious';

// Lays out one week row. Every occasion gets a lane (a line inside the day cells): bars first,
// so a bar keeps one lane all week, then the single-day ones in the free lanes. Only `L`
// lanes fit in a cell; days off always get a visible line, the rest are counted as "+N".
function layoutWeek(days, L) {
  const spans = new Map();
  days.forEach((d, col) => {
    for (const e of d.evs) {
      if (!isSpan(e)) continue;
      const id = e.name + '|' + e.start;
      let s = spans.get(id);
      if (!s) spans.set(id, (s = { ev: e, from: col, to: col }));
      s.to = col;
    }
  });
  const lanes = days.map(() => []);
  const order = [...spans.values()].sort((a, b) =>
    (a.ev.start < b.ev.start ? -1 : a.ev.start > b.ev.start ? 1 : 0)
    || (b.to - b.from) - (a.to - a.from)
    || b.ev.days - a.ev.days);
  for (const s of order) {
    let l = 0;
    for (;;) {
      let ok = true;
      for (let c = s.from; c <= s.to; c++) if (lanes[c][l]) { ok = false; break; }
      if (ok) break;
      l++;
    }
    s.lane = l;
    for (let c = s.from; c <= s.to; c++) lanes[c][l] = s;
  }
  days.forEach((d, col) => {
    for (const e of d.evs) {
      if (isSpan(e)) continue;
      let l = 0;
      while (lanes[col][l]) l++;
      lanes[col][l] = { ev: e, single: true, col };
    }
  });

  // What each day actually shows.
  const shown = days.map(() => new Map()); // item -> lane
  const hidden = days.map(() => 0);
  days.forEach((d, col) => {
    const all = lanes[col];
    const view = [];
    for (let l = 0; l < L; l++) view[l] = all[l];
    let slot = L - 1;
    for (let l = L; l < all.length; l++) {
      const it = all[l];
      if (!it || !it.single || !isDayOff(it.ev)) continue;
      while (slot >= 0 && view[slot] && view[slot].single && isDayOff(view[slot].ev)) slot--;
      if (slot < 0) break;
      view[slot] = it;
      slot--;
    }
    let total = 0, visible = 0;
    for (const it of all) if (it) total++;
    view.forEach((it, l) => { if (it) { visible++; shown[col].set(it, l); } });
    hidden[col] = total - visible;
  });
  return { spans: order, lanes, shown, hidden };
}

export function createCalendar() {
  const title = h('div', { class: 'c-title' });
  const hijriRange = h('div', { class: 'c-hijri' });
  const prev = h('button', { class: 'c-nav', type: 'button', 'aria-label': 'الشهر السابق', html: ARROW_PREV });
  const next = h('button', { class: 'c-nav', type: 'button', 'aria-label': 'الشهر التالي', html: ARROW_NEXT });
  const todayBtn = h('button', { class: 'c-today', type: 'button' }, 'هذا الشهر');
  const grid = h('div', { class: 'c-grid' });
  const upList = h('div', { class: 'c-up' });
  const sideTitle = h('div', { class: 'c-side-title' });
  const sideSub = h('div', { class: 'c-side-sub' });
  const closeDay = h('button', { class: 'c-close', type: 'button', 'aria-label': 'عرض الشهر', html: CLOSE });
  const legend = h('div', { class: 'c-legend' });
  const note = h('p', { class: 'c-note' });
  // Theme-only (hidden in the original look): today on a card, and the next occasions in any month.
  const nowWd = h('span', { class: 'cn-wd' });
  const nowD = h('span', { class: 'cn-d' });
  const nowM = h('span', { class: 'cn-m' });
  const nowSub = h('span', { class: 'cn-sub' });
  const nowCard = h('div', { class: 'c-now' }, nowWd, nowD, nowM, nowSub);
  const soonList = h('div', { class: 'c-soon-list' });
  const soon = h('div', { class: 'c-soon' }, h('div', { class: 'c-soon-title' }, 'القادم'), soonList);

  const el = h('section', { class: 'screen s-calendar', 'data-screen': 'calendar', style: '--ground:var(--g-calendar)' },
    h('div', { class: 'cal-layout' },
      h('div', { class: 'c-main' },
        h('div', { class: 'c-head' },
          h('div', null, title, hijriRange),
          h('div', { class: 'c-navs' }, todayBtn, prev, next),
        ),
        h('div', { class: 'c-week' }, WEEK.map((d, i) => h('span', { class: i >= 5 ? 'is-weekend' : '' }, d))),
        grid,
      ),
      h('div', { class: 'rule' }),
      h('aside', { class: 'c-side' },
        nowCard,
        soon,
        h('div', { class: 'c-side-head' }, h('div', { class: 'c-side-titles' }, sideTitle, sideSub), closeDay),
        upList,
        h('div', { class: 'c-side-foot' }, legend, note),
      ),
    ),
    h('div', { class: 'band' }),
  );

  let offset = 0; // months away from the current month
  let picked = null; // a tapped day ('YYYY-MM-DD'): the side panel then lists that day
  let drawn = '';
  const family = () => state.events || [];

  prev.addEventListener('click', () => { offset--; picked = null; render(true); });
  next.addEventListener('click', () => { offset++; picked = null; render(true); });
  todayBtn.addEventListener('click', () => { offset = 0; picked = null; render(true); });
  closeDay.addEventListener('click', () => { picked = null; render(true); });
  grid.addEventListener('click', (e) => {
    const cell = e.target.closest && e.target.closest('.c-cell');
    if (!cell) return;
    const k = cell.getAttribute('data-day');
    picked = picked === k ? null : k;
    render(true);
  });
  // Text is measured to decide what fits, so measure again once the web fonts are in.
  if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', () => render(true));

  // Fills the side list with rows, keeping only as many as fit and counting the rest.
  function fill(rows, more) {
    upList.textContent = '';
    for (const r of rows) upList.appendChild(r);
    const room = upList.clientHeight;
    if (!room) return;
    let n = rows.length, line = null;
    while (n > 1 && upList.scrollHeight > room + 1) {
      n--;
      rows[n].remove();
      if (!line) { line = h('p', { class: 'c-up-more' }); upList.appendChild(line); }
      setText(line, more(rows.length - n));
    }
  }

  // The theme card: today's date, the Hijri date and the time (once a minute).
  let nowShown = '';
  function renderNow(t) {
    const k = Math.floor(t / 60000);
    if (k === nowShown) return;
    nowShown = k;
    const p = parts(t), hj = hijri(t);
    setText(nowWd, WEEKDAYS[p.wd]);
    setText(nowD, String(p.d));
    setText(nowM, MONTHS[p.m - 1]);
    setText(nowSub, (hj ? hj.d + ' ' + HIJRI_MONTHS[hj.m - 1] + ' · ' : '') + hhmm(t));
  }
  // The theme list: the next occasions, whatever the month.
  function renderSoon(today) {
    soonList.textContent = '';
    for (const ev of upcoming(today, 6, family())) {
      const [ty, tm, td] = isoParts(ev.date);
      const away = Math.round((startOfDay(Date.UTC(ty, tm - 1, td, 12)) - today) / DAY);
      const when = ev.ongoing ? 'جارية' : away <= 2 || away > 30 ? daysAway(away) : dayMonth(ev.date);
      soonList.appendChild(h('div', { class: 'c-soon-row k-' + ev.kind },
        h('span', { class: 'cs-name' }, ev.name), h('span', { class: 'cs-when' }, when)));
    }
    // Only whole rows: drop the ones that don't fit.
    const room = soonList.clientHeight;
    while (room && soonList.childElementCount > 1 && soonList.scrollHeight > room + 1) soonList.lastChild.remove();
  }

  function render(force) {
    const t = now();
    renderNow(t);
    const tp = parts(t);
    let y = tp.y, m = tp.m + offset;
    while (m < 1) { m += 12; y--; }
    while (m > 12) { m -= 12; y++; }
    const key = y + '-' + m + ':' + dayKey(t) + ':' + picked;
    if (!force && key === drawn) return;
    drawn = key;

    // ----- header -----
    title.textContent = '';
    title.append(h('span', { class: 'c-month' }, MONTHS[m - 1]), h('span', { class: 'c-year' }, String(y)));
    const first = Date.UTC(y, m - 1, 1, 12);
    const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const last = first + (dim - 1) * DAY;
    const h1 = hijri(first), h2 = hijri(last);
    if (h1 && h2) {
      const range = h1.m === h2.m ? h1.month + ' ' + h1.y
        : h1.y === h2.y ? h1.month + ' – ' + h2.month + ' ' + h2.y
          : h1.month + ' ' + h1.y + ' – ' + h2.month + ' ' + h2.y;
      setText(hijriRange, range);
    }
    todayBtn.hidden = offset === 0;

    // ----- grid -----
    const lead = (new Date(first).getUTCDay() + 6) % 7; // Monday = 0
    const start = first - lead * DAY;
    const rows = Math.ceil((lead + dim) / 7);
    const occ = occasions(startOfDay(start), startOfDay(start) + rows * 7 * DAY, family());
    const todayKey = dayKey(t);
    if (picked && (picked < dayKey(start) || picked > dayKey(start + (rows * 7 - 1) * DAY))) picked = null;

    // How many lines of events fit under the date in a cell of this height.
    grid.className = 'c-grid rows-' + rows;
    grid.style.gridTemplateRows = 'repeat(' + rows + ', minmax(0, 1fr))';
    const cellH = grid.clientHeight ? grid.clientHeight / rows : { 4: 124, 5: 99, 6: 83 }[rows];
    const top = rows >= 6 ? 36 : 40, GAP = 2;
    const avail = cellH - top - 4;
    const L = Math.max(1, Math.floor((avail + GAP) / (20 + GAP)));
    const laneH = Math.max(18, Math.min(26, Math.floor((avail - (L - 1) * GAP) / L)));
    grid.style.setProperty('--top', top + 'px');
    grid.style.setProperty('--lane-h', laneH + 'px');
    grid.style.setProperty('--lane-gap', GAP + 'px');
    grid.style.setProperty('--lane-font', (laneH >= 24 ? 16 : laneH >= 21 ? 15 : 14) + 'px');

    let approxShown = false;
    grid.textContent = '';
    const cells = [], items = [];
    for (let row = 0; row < rows; row++) {
      const days = [];
      for (let col = 0; col < 7; col++) {
        const ms = start + (row * 7 + col) * DAY;
        const p = parts(ms);
        days.push({ ms, p, k: dayKey(ms), evs: occ.get(dayKey(ms)) || [], inMonth: p.m === m });
      }
      const lay = layoutWeek(days, L);

      days.forEach((d, col) => {
        const hj = hijri(d.ms);
        const main = d.evs.find((e) => !isSpan(e));
        const cls = ['c-cell'];
        if (!d.inMonth) cls.push('is-out');
        if (d.k === todayKey) cls.push('is-today');
        if (d.k === picked) cls.push('is-picked');
        if (col >= 5) cls.push('is-weekend');
        if (main) cls.push('k-' + main.kind);
        if (hj && hj.d === 1) cls.push('is-hstart');
        if (d.inMonth) for (const e of d.evs) if (e.approx) approxShown = true;
        cells.push(h('div', { class: cls.join(' '), 'data-day': d.k, style: 'grid-row:' + (row + 1) + ';grid-column:' + (col + 1) },
          h('div', { class: 'c-top' },
            h('span', { class: 'c-d' }, String(d.p.d)),
            lay.hidden[col] ? h('span', { class: 'c-plus' }, '+' + lay.hidden[col]) : null,
            hj ? h('span', { class: 'c-h', title: hj.d + ' ' + HIJRI_MONTHS[hj.m - 1] }, String(hj.d)) : null,
          ),
        ));
        // Single-day occasions: one line in their own cell.
        for (const [it, lane] of lay.shown[col]) {
          if (!it.single) continue;
          const e = it.ev;
          items.push(h('div', {
            class: 'c-lane c-one k-' + e.kind + (d.inMonth ? '' : ' is-out'),
            style: 'grid-row:' + (row + 1) + ';grid-column:' + (col + 1) + ';--lane:' + lane,
          }, (e.approx ? '≈ ' : '') + (e.short || e.name)));
        }
      });

      // Bars: one piece for each run of days where the bar is visible in its lane.
      for (const s of lay.spans) {
        let runFrom = -1;
        for (let col = s.from; col <= s.to + 1; col++) {
          const on = col <= s.to && lay.shown[col].get(s) === s.lane;
          const sameMonth = runFrom < 0 || col > s.to || days[col].inMonth === days[runFrom].inMonth;
          if (runFrom >= 0 && (!on || !sameMonth)) {
            const runTo = col - 1;
            const dayAt = (c) => s.ev.day + (c - s.from);
            const cls = ['c-lane', 'c-span', 'k-family'];
            if (dayAt(runFrom) === 1) cls.push('is-start');
            if (dayAt(runTo) === s.ev.days) cls.push('is-end');
            if (!days[runFrom].inMonth) cls.push('is-out');
            items.push(h('div', {
              class: cls.join(' '),
              style: 'grid-row:' + (row + 1) + ';grid-column:' + (runFrom + 1) + ' / span ' + (runTo - runFrom + 1) + ';--lane:' + s.lane,
            }, s.ev.short || s.ev.name));
            runFrom = -1;
          }
          if (on && runFrom < 0) runFrom = col;
        }
      }
    }
    for (const c of cells) grid.appendChild(c);
    for (const it of items) grid.appendChild(it);

    // ----- side panel -----
    const today = startOfDay(t);
    if (picked) renderDay(occ.get(picked) || [], today);
    else renderMonth(m, first, last, today);
    renderSoon(today);

    legend.textContent = '';
    for (const kd of ['national', 'religious', 'observance', 'family']) {
      if (kd === 'family' && !family().length) continue;
      legend.appendChild(h('span', { class: 'k-' + kd }, h('i', { class: 'dot' }), KIND_LABEL[kd]));
    }
    setText(note, approxShown ? '≈ تاريخ تقريبي، يُحدَّد برؤية الهلال.' : '');
  }

  // The month's occasions (for the current month, from today on).
  function renderMonth(m, first, last, today) {
    el.classList.remove('is-day');
    closeDay.hidden = true;
    setText(sideTitle, 'مناسبات ' + MONTHS[m - 1]);
    setText(sideSub, '');
    const monthStart = startOfDay(first), monthEnd = startOfDay(last) + DAY;
    const from = Math.max(today, monthStart);
    const inMonth = from < monthEnd ? between(from, monthEnd, family()) : [];
    if (!inMonth.length) {
      fill([h('p', { class: 'c-up-empty' },
        offset === 0 ? 'لا مناسبات أخرى حتى نهاية ' + MONTHS[m - 1] + '.' : offset < 0 ? 'مضى هذا الشهر.' : 'لا مناسبات في ' + MONTHS[m - 1] + '.')], () => '');
      return;
    }
    const rows = inMonth.map((ev) => {
      // The date shown is where the occasion starts (for one under way, its first day).
      const startIso = ev.start || ev.date;
      const [ey, em, ed] = isoParts(startIso);
      const [ty, tm, td] = isoParts(ev.date);
      const away = Math.round((startOfDay(Date.UTC(ty, tm - 1, td, 12)) - today) / DAY);
      // Under the day number: the weekday, or the month when the occasion began in another month.
      const under = em !== m ? MONTHS[em - 1] : WEEKDAYS[new Date(Date.UTC(ey, em - 1, ed)).getUTCDay()];
      const bits = [];
      if (offset === 0) bits.push(ev.ongoing ? 'جارية' : daysAway(away));
      if (ev.time) bits.push(ev.time);
      if (ev.end) bits.push('حتى ' + dayMonth(ev.end));
      if (ev.days > 1) bits.push(spanLabel(ev.days));
      if (ev.approx) bits.push('تقريبي');
      return h('div', { class: 'c-up-row k-' + ev.kind + (offset === 0 && (away === 0 || ev.ongoing) ? ' is-now' : '') },
        h('div', { class: 'c-up-date' }, h('span', { class: 'c-up-d' }, String(ed)), h('span', { class: 'c-up-m' }, under)),
        h('div', { class: 'c-up-body' },
          h('div', { class: 'c-up-name' }, ev.name),
          h('div', { class: 'c-up-when' }, h('i', { class: 'dot' }), h('span', null, bits.join('، '))),
        ),
      );
    });
    fill(rows, (n) => moreLabel(n) + ' في ' + MONTHS[m - 1]);
  }

  // Everything on the tapped day, in full.
  function renderDay(evs, today) {
    el.classList.add('is-day');
    closeDay.hidden = false;
    const [y, mo, d] = isoParts(picked);
    const ms = Date.UTC(y, mo - 1, d, 12);
    setText(sideTitle, WEEKDAYS[new Date(ms).getUTCDay()] + ' ' + d + ' ' + MONTHS[mo - 1]);
    const hj = hijri(ms);
    const away = Math.round((startOfDay(ms) - today) / DAY);
    const rel = away === 0 ? 'اليوم' : away === 1 ? 'غداً' : away === -1 ? 'أمس' : away > 0 ? daysAway(away) : '';
    setText(sideSub, [hj ? hj.d + ' ' + HIJRI_MONTHS[hj.m - 1] + ' ' + hj.y : '', rel].filter(Boolean).join(' · '));
    if (!evs.length) { fill([h('p', { class: 'c-up-empty' }, 'لا مناسبات في هذا اليوم.')], () => ''); return; }
    const rows = evs.map((e) => {
      const bits = [];
      if (e.kind !== 'family') bits.push(KIND_LABEL[e.kind]);
      if (e.time) bits.push(e.time);
      if (e.days > 1) bits.push(e.day === e.days ? 'آخر يوم من ' + spanLabel(e.days) : 'اليوم ' + e.day + ' من ' + e.days);
      if (e.end && e.day < e.days) bits.push('حتى ' + dayMonth(e.end));
      if (e.approx) bits.push('تقريبي');
      return h('div', { class: 'c-day-row k-' + e.kind },
        h('div', { class: 'c-day-name' }, e.name),
        bits.length ? h('div', { class: 'c-day-when' }, bits.join('، ')) : null,
      );
    });
    fill(rows, (n) => moreLabel(n));
  }

  on('events', () => render(true));
  on('settings', () => render(true));

  return {
    name: 'calendar', label: 'التقويم', el,
    tick() { render(false); },
    show() { nowShown = ''; render(true); },
    hide() { offset = 0; picked = null; },
  };
}
