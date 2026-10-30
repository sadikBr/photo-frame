// «ألبوم العائلة»: every screen sits on one of the family's own photos. The clock screen shows it
// full-bleed; the other screens show it blurred behind frosted-glass panels. The photo changes
// every few minutes. To stay cheap on the frame, the blurred copy is drawn once per photo into a
// small canvas that the screens stretch, instead of a live CSS blur.
import { state, photoUrl } from '../data.js';

const PERIOD = 4 * 60000;          // a new photo every four minutes
const BW = 160, BH = 100;          // the blurred copy (stretched to the screen)
const BLURRED = ['prayer', 'lists', 'calendar', 'adhkar'];
const HEART = '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" fill="#FF8FA3"/></svg>';

const el = (tag, cls) => { const e = document.createElement(tag); if (cls) e.className = cls; return e; };

// Draws the photo, cover-cropped and blurred, into the canvas.
function drawBlurred(c, im) {
  const ctx = c.getContext('2d');
  const iw = im.naturalWidth || im.width, ih = im.naturalHeight || im.height;
  if (!iw || !ih) return;
  const pad = 10; // bleed past the edges so the blur doesn't fade to transparent there
  const s = Math.max((BW + 2 * pad) / iw, (BH + 2 * pad) / ih);
  const w = iw * s, h = ih * s;
  ctx.clearRect(0, 0, BW, BH);
  const hasFilter = typeof ctx.filter === 'string';
  if (hasFilter) ctx.filter = 'blur(3px) saturate(1.12)';
  ctx.drawImage(im, (BW - w) / 2, (BH - h) / 2, w, h);
  if (hasFilter) {
    ctx.filter = 'none';
  } else {
    // No canvas filter: shrink and grow back a couple of times, which softens it almost as well.
    const t = el('canvas');
    t.width = BW / 8; t.height = BH / 8;
    t.getContext('2d').drawImage(c, 0, 0, t.width, t.height);
    ctx.clearRect(0, 0, BW, BH);
    ctx.drawImage(t, 0, 0, BW, BH);
  }
}

export function mount({ screens }) {
  let alive = true;

  // Clock screen: two photo layers that cross-fade, a scrim, and the album's name.
  const imgs = [];
  let front = 0;
  let chip = null, dots = null;
  if (screens.home) {
    const box = el('div', 'al-photo');
    for (let i = 0; i < 2; i++) {
      const im = el('img', 'al-img');
      im.alt = '';
      im.decoding = 'async';
      im.draggable = false;
      imgs.push(im);
      box.appendChild(im);
    }
    chip = el('div', 'al-chip al-fam');
    chip.innerHTML = HEART + '<span><b>ألبوم العائلة</b><i class="al-count"></i></span>';
    dots = el('div', 'al-dots');
    screens.home.art.append(box, el('div', 'al-scrim'), chip, dots);
  }

  // The other screens: the same photo, blurred.
  const layers = [];
  const canvases = [];
  for (const n of BLURRED) {
    if (!screens[n]) continue;
    const c = el('canvas', 'al-blur');
    c.width = BW;
    c.height = BH;
    screens[n].art.appendChild(c);
    canvases.push(c);
    layers.push(screens[n].art);
  }
  if (screens.home) layers.push(screens.home.art);

  const setOn = (on) => { for (const l of layers) l.classList.toggle('al-on', on); };

  let key = '';
  let ticket = 0;
  let lastTry = 0;
  function show(photo) {
    const my = ++ticket;
    const im = new Image();
    im.decoding = 'async';
    im.onload = () => {
      if (!alive || my !== ticket) return;
      if (imgs.length) {
        const back = imgs[1 - front];
        back.src = im.src;
        back.classList.add('is-on');
        imgs[front].classList.remove('is-on');
        front = 1 - front;
      }
      if (canvases.length) {
        try {
          drawBlurred(canvases[0], im);
          for (let i = 1; i < canvases.length; i++) {
            const ctx = canvases[i].getContext('2d');
            ctx.clearRect(0, 0, BW, BH);
            ctx.drawImage(canvases[0], 0, 0);
          }
        } catch (e) { console.error(e); }
      }
      setOn(true);
    };
    im.onerror = () => { if (my === ticket) key = ''; }; // try again on the next tick
    im.src = photoUrl(photo);
  }

  return {
    tick(t) {
      const list = (state.photos && state.photos.photos) || [];
      if (!list.length) {
        if (key !== 'none') {
          key = 'none';
          ticket++;
          for (const im of imgs) { im.classList.remove('is-on'); im.removeAttribute('src'); }
          if (chip) { chip.querySelector('.al-count').textContent = ''; dots.textContent = ''; dots.removeAttribute('data-k'); }
          setOn(false);
        }
        return;
      }
      const slot = Math.floor(t / PERIOD);
      const index = slot % list.length;
      const photo = list[index];
      if (chip) {
        // «· 3 من 24» after the album's name, and up to five dots under the photo
        const c = chip.querySelector('.al-count');
        const txt = list.length > 1 ? ' · ' + (index + 1) + ' من ' + list.length : '';
        if (c.textContent !== txt) c.textContent = txt;
        const n = Math.min(5, list.length);
        const on = Math.floor((index * n) / list.length);
        const dk = n + ':' + on;
        if (dots.getAttribute('data-k') !== dk) {
          dots.setAttribute('data-k', dk);
          dots.innerHTML = n > 1 ? Array.from({ length: n }, (_, i) => '<i' + (i === on ? ' class="is-on"' : '') + '></i>').join('') : '';
        }
      }
      const k = String(photo.id || photo.src);
      if (k === key) return;
      // A photo that fails to load is retried at most every few seconds.
      if (key === '' && t - lastTry < 5000) return;
      lastTry = t;
      key = k;
      show(photo);
    },
    unmount() { alive = false; ticket++; },
  };
}
