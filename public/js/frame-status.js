// «حالتي» on the frame: what each person is up to, as small cards at the top of the clock
// screen («📚 سلمى · في الامتحان · حتى 12:00»). They go away by themselves when the time is up.
import { h, hhmm, startOfDay, now, DAY } from './util.js';
import { frameFetch, DEMO } from './data.js';
import * as demo from './demo.js';

export function createStatus({ chipBox }) {
  let list = [];
  const box = h('div', { class: 'status-chips' });
  chipBox.appendChild(box);
  let shownKey = '';

  function until(t) {
    const d = Math.round((startOfDay(t) - startOfDay(now())) / DAY);
    return d <= 0 ? 'حتى ' + hhmm(t) : d === 1 ? 'حتى الغد ' + hhmm(t) : 'حتى ' + new Date(t).getDate() + '/' + (new Date(t).getMonth() + 1);
  }
  function render(screen) {
    const t = now();
    const live = screen === 'home' ? list.filter((x) => x.until > t).slice(0, 3) : [];
    const key = live.map((x) => x.name + x.text + x.until).join('|') + (live.length ? hhmm(t).slice(0, 4) : '');
    if (key === shownKey) return;
    shownKey = key;
    box.textContent = '';
    for (const x of live) {
      box.appendChild(h('div', { class: 'st-chip' },
        x.emoji ? h('span', { class: 'st-emoji' }, x.emoji) : null,
        h('b', null, x.name), h('span', null, ' · ' + x.text), h('small', null, until(x.until))));
    }
  }
  async function load() {
    try { list = DEMO ? demo.statuses() : (await frameFetch('/api/pulse/status')).statuses; } catch (e) { /* next time */ }
    shownKey = '';
  }
  load();
  setInterval(load, 3 * 60000);
  if (DEMO) window.addEventListener('storage', (e) => { if (e.key === 'fd:demo-statuses') load(); });
  return {
    tick: render,
    socket(m) { if (m.type === 'status') { list = m.statuses || []; shownKey = ''; } },
  };
}
