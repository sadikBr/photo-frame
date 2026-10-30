// «الدقّة السرية» on the frame: a Moroccan door. Knock on it with your own rhythm and the phones
// buzz with that rhythm (Android); a knock sent from a phone plays here as real knocks on the
// door, and only then says who it was.
import { h } from './util.js';
import { frameFetch, DEMO } from './data.js';
import * as demo from './demo.js';
import { doorSvg, rhythmRecorder, playRhythm, rhythmDots } from './fun-common.js';
import { unlockAudio } from './sound.js';

const words = (r) => r.map((t, i) => (i ? (t - r[i - 1] > 450 ? ' … ' : ' ') : '') + 'طق').join('');

export function createKnock({ stage }) {
  let mode = null; // null | 'record' | 'ready' | 'sending' | 'play'
  let rhythm = null, closeTimer = 0, playing = null;

  const door = h('button', { class: 'fk-door', type: 'button', 'aria-label': 'الباب: دقّ عليه', html: doorSvg(330) });
  const title = h('div', { class: 'fun-title' }, 'الدقّة السرية');
  const sub = h('div', { class: 'fun-sub' });
  const dots = h('div', { class: 'fk-dots' });
  const who = h('div', { class: 'fk-who' });
  const again = h('button', { class: 'fun-btn ghost', type: 'button', hidden: true }, 'دقّة جديدة');
  const extra = h('div', { class: 'fk-extra' });
  const closeBtn = h('button', { class: 'fun-close', type: 'button', 'aria-label': 'إغلاق' }, '×');
  const modal = h('div', { class: 'fun-modal fk', hidden: true },
    h('div', { class: 'fun-scrim' }),
    h('div', { class: 'fk-panel' }, door, h('div', { class: 'fk-side' }, title, sub, dots, who, again, extra)),
    closeBtn);
  stage.append(modal);

  function jolt() {
    door.animate([{ transform: 'translateX(0) rotate(0)' }, { transform: 'translateX(-5px) rotate(-.6deg)' }, { transform: 'translateX(3px) rotate(.3deg)' }, { transform: 'translateX(0) rotate(0)' }], { duration: 160 });
    const k = door.querySelector('.door-knocker');
    if (k) k.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-10px)' }, { transform: 'translateY(0)' }], { duration: 140 });
    const ring = h('span', { class: 'fk-ring' });
    door.appendChild(ring);
    ring.animate([{ transform: 'translate(-50%,-50%) scale(.3)', opacity: 0.8 }, { transform: 'translate(-50%,-50%) scale(2.2)', opacity: 0 }], { duration: 600, easing: 'ease-out' }).finished.then(() => ring.remove());
  }

  const rec = rhythmRecorder({
    onTap: (n) => {
      jolt();
      if (mode !== 'record') { mode = 'record'; who.textContent = ''; again.hidden = true; }
      sub.textContent = n === 1 ? 'طق… أكمل إيقاعك' : 'طق ' + '•'.repeat(Math.min(n, 16));
      armClose(60000);
    },
    onDone: (r) => { rhythm = r; ready(); },
  });
  door.addEventListener('pointerdown', (e) => {
    if (mode === 'play' || mode === 'sending') return;
    e.preventDefault();
    unlockAudio();
    rec.tap();
  });

  // The rhythm is in: who should feel it?
  async function ready() {
    mode = 'ready';
    sub.textContent = 'إيقاعك: ' + words(rhythm);
    dots.innerHTML = rhythmDots(rhythm, 360);
    who.textContent = '';
    who.append(h('div', { class: 'fk-label' }, 'إلى من؟'));
    const row = h('div', { class: 'fk-chips' });
    const add = (label, to) => {
      const b = h('button', { class: 'fw-chip' + (to ? '' : ' is-on'), type: 'button' }, label);
      b.addEventListener('click', () => send(to));
      row.appendChild(b);
    };
    add('الجميع', '');
    who.appendChild(row);
    again.hidden = false;
    armClose(60000);
    let names = [];
    try { names = DEMO ? demo.phones() : (await frameFetch('/api/pulse/phones')).names; } catch (e) { names = []; }
    if (mode !== 'ready') return;
    for (const n of names) add(n, n);
    if (!names.length) who.appendChild(h('div', { class: 'fk-note' }, 'لم يفعّل أحد الإشعارات على هاتفه بعد: تظهر الدقّة في التطبيق فقط.'));
  }
  async function send(to) {
    if (mode !== 'ready' || !rhythm) return;
    mode = 'sending';
    sub.textContent = 'تُرسل…';
    try {
      if (DEMO) demo.pulseAdd({ kind: 'knock', from: 'البيت', rhythm, toName: to || undefined });
      else await frameFetch('/api/pulse', 'POST', { kind: 'knock', rhythm, to: to || undefined });
      who.textContent = '';
      sub.textContent = (to ? 'وصلت دقّتك إلى ' + to : 'وصلت دقّتك إلى الجميع') + ' ✓';
      dots.textContent = '';
      rhythm = null;
      mode = 'record';
      again.hidden = true;
      armClose(6000);
    } catch (e) {
      mode = 'ready';
      sub.textContent = 'تعذّر الإرسال. حاول مرة أخرى.';
    }
  }
  again.addEventListener('click', () => { rec.reset(); rhythm = null; dots.textContent = ''; who.textContent = ''; again.hidden = true; mode = 'record'; sub.textContent = 'دقّ على الباب بإيقاعك.'; });

  function open() {
    unlockAudio();
    rec.reset();
    rhythm = null;
    mode = 'record';
    modal.hidden = false;
    title.textContent = 'الدقّة السرية';
    sub.textContent = 'دقّ على الباب بإيقاعك. سيهتزّ الهاتف بالإيقاع نفسه.';
    dots.textContent = '';
    who.textContent = '';
    extra.textContent = '';
    again.hidden = true;
    modal.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300 });
    armClose(60000);
  }
  function close() {
    if (mode === 'sending') return;
    rec.reset();
    clearTimeout(closeTimer);
    modal.hidden = true;
    mode = null;
    if (playing) { const p = playing; playing = null; p(); }
  }
  function armClose(ms) { clearTimeout(closeTimer); closeTimer = setTimeout(close, ms); }
  closeBtn.addEventListener('click', close);
  modal.querySelector('.fun-scrim').addEventListener('click', close);

  // A knock from a phone: the knocks first, then who it was.
  async function play(p, replyBtn) {
    mode = 'play';
    modal.hidden = false;
    title.textContent = 'طق طق…';
    sub.textContent = 'أحدٌ ما على الباب';
    dots.textContent = '';
    who.textContent = '';
    extra.textContent = '';
    again.hidden = true;
    modal.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300 });
    await new Promise((ok) => setTimeout(ok, 900));
    const r = Array.isArray(p.rhythm) ? p.rhythm : [0];
    await playRhythm(r, jolt).done;
    await new Promise((ok) => setTimeout(ok, 500));
    // Twice, so the rhythm is recognised.
    await playRhythm(r, jolt).done;
    await new Promise((ok) => setTimeout(ok, 600));
    // (Two spans, so a theme can set the name on a line of its own.)
    title.textContent = '';
    title.append(h('span', { class: 'fk-t1' }, 'دقّة من '), h('span', { class: 'fk-t2' }, p.from));
    sub.textContent = words(r);
    dots.innerHTML = rhythmDots(r, 360);
    if (replyBtn) extra.appendChild(replyBtn);
    title.animate([{ transform: 'scale(.7)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: 500, easing: 'cubic-bezier(.2,.9,.3,1.3)' });
    await new Promise((ok) => { playing = ok; closeTimer = setTimeout(close, 9000); });
  }

  return { open, play, busy: () => mode !== null };
}
