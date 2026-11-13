// «وضع الماتش» on the frame: when Morocco plays, the frame becomes a stadium screen — the score,
// the minute and the goals — from 15 minutes before kick-off to 15 minutes after the end. A goal
// for Morocco: a roar, fireworks and «هدااااف!». Cheers sent from the phones fly across the screen.
// Earlier in the day, a small line on the clock screen says when the match is.
import { h, hhmm, parts, startOfDay, now, WEEKDAYS, DAY, MINUTE } from './util.js';
import { frameFetch, DEMO } from './data.js';
import * as demo from './demo.js';
import { flagSvg, teamBadge, cheerOf, ballSvg } from './fun-common.js';
import { roar, sigh, whistle } from './sound.js';
import { tvLine } from './match-common.js';

export function createMatch({ stage, held, chipBox }) {
  let view = null, known = null, hiddenUntil = 0, cheerSince = 0, timer = 0;
  const shownCheers = new Set();

  const comp = h('div', { class: 'mt-comp' });
  const phase = h('div', { class: 'mt-phase' });
  const tv = h('div', { class: 'mt-tv' });
  const clock = h('div', { class: 'mt-clock' });
  const teamA = h('div', { class: 'mt-team' });
  const teamB = h('div', { class: 'mt-team' });
  const score = h('div', { class: 'mt-score' });
  const goalsA = h('ul', { class: 'mt-goals' });
  const goalsB = h('ul', { class: 'mt-goals' });
  const count = h('div', { class: 'mt-count' });
  const cheers = h('div', { class: 'mt-cheers' });
  const fx = h('div', { class: 'mt-fx' });
  const hide = h('button', { class: 'mt-hide', type: 'button' }, 'إخفاء 10 دقائق');
  const el = h('div', { class: 'match', hidden: true },
    h('div', { class: 'mt-pitch' }),
    h('div', { class: 'mt-head' }, comp, phase, tv),
    h('div', { class: 'mt-board' }, teamA, h('div', { class: 'mt-mid' }, score, clock), teamB),
    h('div', { class: 'mt-lists' }, goalsA, goalsB),
    count, cheers, fx, hide);
  const chip = h('div', { class: 'match-chip', hidden: true });
  stage.append(el);
  (chipBox || stage).appendChild(chip);
  hide.addEventListener('click', () => { hiddenUntil = Date.now() + 10 * MINUTE; render(); });

  const m = () => view && view.match;
  function team(box, side, isMar) {
    box.innerHTML = '';
    box.append(h('div', { class: 'mt-badge', html: teamBadge(side, 132, isMar) }), h('div', { class: 'mt-name' }, side.name));
  }
  function goalsList(ul, list) {
    ul.textContent = '';
    for (const g of list) ul.appendChild(h('li', null, h('span', { class: 'mt-ball', html: ballSvg(22) }), h('span', null, (g.who || 'هدف') + (g.pen ? ' (ج)' : '') + (g.og ? ' (ضد مرماه)' : '')), h('b', null, g.min || '')));
  }

  function render() {
    const x = m();
    const live = active();
    el.hidden = !live;
    if (x && live) {
      comp.textContent = x.comp || '';
      phase.textContent = x.state === 'pre' ? 'قبل البداية' : x.phase || '';
      tv.textContent = x.state === 'post' ? '' : tvLine(view.tv);
      team(teamA, x.mar, true);
      team(teamB, x.opp, false);
      const pens = x.mar.pens != null && x.opp.pens != null ? ' (' + x.mar.pens + '–' + x.opp.pens + ')' : '';
      // Morocco's number on the right, next to Morocco (the row runs right to left).
      score.textContent = '';
      if (x.state === 'pre') score.append(h('span', { class: 'mt-dash' }, '–'));
      else score.append(h('span', null, String(x.mar.score)), h('span', { class: 'mt-dash' }, '–'), h('span', null, String(x.opp.score)));
      if (pens) score.append(h('small', { class: 'mt-pens' }, pens));
      clock.textContent = x.state === 'in' ? (x.clock || '') : x.state === 'post' ? 'النهاية' : hhmm(x.kickoff);
      clock.classList.toggle('is-live', x.state === 'in' && !/HALFTIME/.test(x.status || ''));
      goalsList(goalsA, x.goals.filter((g) => g.side === 'mar'));
      goalsList(goalsB, x.goals.filter((g) => g.side === 'opp'));
    }
    renderCount();
  }
  function renderCount() {
    const x = m();
    if (!x || !active() || x.state !== 'pre') { count.hidden = true; return; }
    const left = x.kickoff - now();
    count.hidden = false;
    count.textContent = left > 0 ? 'تنطلق بعد ' + Math.floor(left / 60000) + ':' + String(Math.floor((left % 60000) / 1000)).padStart(2, '0') : 'تنطلق الآن…';
  }
  // The line on the clock screen: «⚽ الليلة 20:00 · المغرب × مالي · 📺 الرياضية · الأولى».
  function renderChip(screen) {
    const x = m();
    const show = !!x && view.on && (view.mode === 'today' || view.mode === 'next') && screen === 'home' && !active();
    chip.hidden = !show;
    if (!show) return;
    const day = Math.round((startOfDay(x.kickoff) - startOfDay(now())) / DAY);
    const when = (day === 0 ? (parts(x.kickoff).h >= 17 ? 'الليلة' : 'اليوم') : day === 1 ? 'غداً' : WEEKDAYS[new Date(x.kickoff).getDay()]) + ' ' + hhmm(x.kickoff);
    const ch = tvLine(view.tv);
    const text = when + ' · المغرب × ' + x.opp.name + (ch ? ' · ' + ch : '');
    if (chip.dataset.t !== text) {
      chip.dataset.t = text;
      chip.innerHTML = '';
      chip.append(h('span', { class: 'mc-flag', html: flagSvg(30) }), h('span', null, text));
    }
  }

  // ---------- what changed ----------
  function apply(v) {
    if (!v) return;
    const prev = known, x = v.match;
    view = v;
    if (x && prev && prev.id === x.id) {
      if (prev.state === 'pre' && x.state === 'in') whistle(1);
      if (x.mar.score > prev.mar.score) celebrate('mar');
      else if (x.opp.score > prev.opp.score) celebrate('opp');
      if (prev.state !== 'post' && x.state === 'post') { whistle(3); if (x.mar.score > x.opp.score) setTimeout(() => celebrate('win'), 2200); }
    }
    known = x ? { id: x.id, state: x.state, mar: { score: x.mar.score }, opp: { score: x.opp.score } } : null;
    for (const c of v.cheers || []) showCheer(c);
    render();
    schedulePoll();
  }

  function celebrate(kind) {
    hiddenUntil = 0;
    render();
    if (kind === 'opp') {
      sigh();
      el.animate([{ filter: 'saturate(1)' }, { filter: 'saturate(.3) brightness(.8)' }, { filter: 'saturate(1)' }], { duration: 2600 });
      return;
    }
    roar(kind === 'win' ? 3.5 : 5);
    const big = h('div', { class: 'mt-goal' }, kind === 'win' ? 'مبروك!' : 'هدااااف!');
    fx.appendChild(big);
    big.animate([{ transform: 'translate(-50%,-50%) scale(.2)', opacity: 0 }, { transform: 'translate(-50%,-50%) scale(1.15)', opacity: 1, offset: 0.25 },
      { transform: 'translate(-50%,-50%) scale(1)', opacity: 1, offset: 0.8 }, { transform: 'translate(-50%,-50%) scale(1.05)', opacity: 0 }], { duration: 4200, easing: 'ease-out', fill: 'both' }).finished.then(() => big.remove());
    // Fireworks in red and green (and gold).
    const cols = ['#C1272D', '#E8505B', '#0A8F55', '#F2AE3D', '#F3EDE2'];
    for (let b = 0; b < 6; b++) {
      const cx = 160 + Math.random() * 960, cy = 120 + Math.random() * 300, delay = b * 450 + Math.random() * 200;
      for (let i = 0; i < 26; i++) {
        const a = (i / 26) * Math.PI * 2, d = 90 + Math.random() * 90;
        const p = h('i');
        p.style.cssText = 'left:' + cx.toFixed(0) + 'px;top:' + cy.toFixed(0) + 'px;background:' + cols[(b + i) % cols.length];
        fx.appendChild(p);
        p.animate([{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: 'translate(' + (Math.cos(a) * d).toFixed(0) + 'px,' + (Math.sin(a) * d + 40).toFixed(0) + 'px) scale(.4)', opacity: 0 }],
          { duration: 1300 + Math.random() * 500, delay, easing: 'cubic-bezier(.1,.7,.3,1)', fill: 'both' }).finished.then(() => p.remove());
      }
    }
    el.animate([{ transform: 'translate(0,0)' }, { transform: 'translate(-6px,3px)' }, { transform: 'translate(5px,-3px)' }, { transform: 'translate(0,0)' }], { duration: 300, iterations: 3 });
  }

  function showCheer(c) {
    if (!c || shownCheers.has(c.id)) return;
    shownCheers.add(c.id);
    if (c.at > cheerSince) cheerSince = c.at;
    if (now() - c.at > 30000 || !active()) return;
    const ch = cheerOf(c.cheer);
    const y = 160 + Math.random() * 380;
    const el2 = h('div', { class: 'mt-cheer' }, h('span', { class: 'mt-cheer-icon', html: ch.icon(54) }), h('span', null, h('b', null, c.from), ' ' + ch.label));
    el2.style.top = y.toFixed(0) + 'px';
    cheers.appendChild(el2);
    el2.animate([{ transform: 'translateX(-260px)', opacity: 0 }, { opacity: 1, offset: 0.1 }, { opacity: 1, offset: 0.85 }, { transform: 'translateX(1500px)', opacity: 0 }],
      { duration: 6500, easing: 'cubic-bezier(.3,.1,.5,1)', fill: 'both' }).finished.then(() => el2.remove());
    if (shownCheers.size > 300) shownCheers.clear();
  }

  // ---------- asking ----------
  async function poll() {
    try {
      apply(DEMO ? demo.match() : await frameFetch('/api/pulse/match?since=' + cheerSince));
    } catch (e) { schedulePoll(); }
  }
  function schedulePoll() {
    clearTimeout(timer);
    const live = view && view.mode === 'live';
    timer = setTimeout(poll, live ? (DEMO ? 2000 : 8000) : 60000);
  }
  function active() {
    return !!(view && view.on && view.mode === 'live' && m() && Date.now() > hiddenUntil && !(held && held()));
  }
  poll();
  if (DEMO) window.addEventListener('storage', (e) => { if (e.key === 'fd:demo-match-start' || e.key === 'fd:demo-match-cfg') poll(); if (e.key === 'fd:demo-cheers') poll(); });

  let wasActive = false;
  return {
    active,
    tick(screen) {
      const a = active();
      if (a !== wasActive) { wasActive = a; render(); }
      if (a) renderCount();
      renderChip(screen);
    },
    socket(msg) {
      if (msg.type === 'match') apply(Object.assign({}, msg.view, { cheers: [] }));
      if (msg.type === 'cheer') showCheer(msg.cheer);
    },
    poke: poll,
  };
}
