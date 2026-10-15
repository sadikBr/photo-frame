import config from '../config.js';
import { h, setText, now, hhmm, parts, WEEKDAYS, MONTHS } from '../util.js';
import { state, on, photoUrl, DEMO } from '../data.js';
import { ICON, weatherIcon, describeWeather } from '../icons.js';

export function createPhotos() {
  const layers = [h('div', { class: 'ph-layer' }), h('div', { class: 'ph-layer' })];
  const time = h('bdi', { class: 'ph-time', dir: 'ltr' });
  const date = h('div', { class: 'ph-date' });
  const wx = h('div', { class: 'ph-wx' });
  const phoneUrl = h('bdi', { class: 'ph-url', dir: 'ltr' });
  const empty = h('div', { class: 'ph-empty' },
    h('span', { class: 'ph-empty-icon', html: ICON.image }),
    h('strong', null, 'لا توجد صور بعد'),
    h('p', null, 'أضف صور العائلة من لوحة التحكم على هاتفك:'),
    phoneUrl,
  );
  const caption = h('div', { class: 'ph-caption' }, h('div', { class: 'ph-clock' }, time, wx), date);

  const el = h('section', { class: 'screen s-photos', 'data-screen': 'photos', style: '--ground:#0E0E10' },
    layers[0], layers[1], h('div', { class: 'ph-scrim' }), caption, empty,
  );

  let order = [], pos = 0, front = 0, timer = null, visible = false;

  function list() { return (state.photos && state.photos.photos) || []; }

  function shuffle() {
    order = list().slice();
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = order[i]; order[i] = order[j]; order[j] = tmp;
    }
    pos = 0;
  }

  function showNext() {
    if (!order.length || pos >= order.length) shuffle();
    if (!order.length) return;
    const photo = order[pos++];
    const img = new Image();
    img.decoding = 'async';
    img.draggable = false;
    img.alt = '';
    img.onload = () => {
      const back = layers[1 - front];
      back.textContent = '';
      img.className = 'ph-img' + (pos % 2 ? ' kb-a' : ' kb-b');
      back.appendChild(img);
      // Force a style flush so the transition runs, then swap.
      void back.offsetWidth;
      back.classList.add('is-on');
      layers[front].classList.remove('is-on');
      front = 1 - front;
    };
    img.onerror = () => { if (visible) setTimeout(showNext, 1500); };
    img.src = photoUrl(photo);
  }

  function update() {
    const has = list().length > 0;
    el.classList.toggle('is-empty', !has);
    setText(phoneUrl, DEMO ? 'frame.example/admin' : location.host + '/admin');
    if (has && visible && !timer) { showNext(); timer = setInterval(showNext, config.photoSeconds * 1000); }
    if (!has && timer) { clearInterval(timer); timer = null; }
  }

  let lastMin = -1;
  function tick(t) {
    const p = parts(t);
    if (p.mi === lastMin) return;
    lastMin = p.mi;
    setText(time, hhmm(t));
    setText(date, WEEKDAYS[p.wd] + ' ' + p.d + ' ' + MONTHS[p.m - 1]);
    const w = state.weather;
    wx.textContent = '';
    if (w) {
      const d = describeWeather(w.current.code);
      wx.appendChild(h('span', { html: weatherIcon(d.kind, w.current.isDay, 44) }));
      wx.appendChild(h('bdi', { dir: 'ltr' }, Math.round(w.current.temp) + '°'));
    }
  }

  on('photos', () => { shuffle(); update(); });
  on('weather', () => { lastMin = -1; if (visible) tick(now()); });

  return {
    name: 'photos', label: 'الصور', el, tick,
    hasPhotos: () => list().length > 0,
    show() { visible = true; lastMin = -1; tick(now()); update(); },
    hide() { visible = false; if (timer) { clearInterval(timer); timer = null; } },
  };
}
