// The frame's look ("مظهر الإطار"), picked in the control panel.
// Each theme other than the original is a stylesheet (css/themes/<id>.css: colours, fonts, the band
// along the bottom) and a small module (js/themes/<id>.js) that draws its pictures into a layer
// behind each screen. Only the chosen theme's files and fonts are loaded.
import config from './config.js';

export const THEMES = ['original', 'riad', 'bright', 'andalus', 'kids', 'sahara', 'majorelle', 'album', 'atlas', 'sky', 'flip', 'hilal'];

let screens = {};
let stage = null;
let current = null;
let link = null;
let art = null;
let preview = null; // { id, until } while a theme is being tried from the control panel
let loading = 0;

// Every screen gets an empty layer at the back for the theme's pictures.
export function initTheme(list, stageEl) {
  stage = stageEl;
  screens = {};
  for (const sc of list) {
    let layer = sc.el.querySelector(':scope > .t-art');
    if (!layer) {
      layer = document.createElement('div');
      layer.className = 't-art';
      layer.setAttribute('aria-hidden', 'true');
      sc.el.insertBefore(layer, sc.el.firstChild);
    }
    screens[sc.name] = { el: sc.el, art: layer };
  }
  applyTheme();
}

// Try a theme for a while (from the control panel); null ends the try-out.
export function previewTheme(id, until) {
  preview = id && THEMES.includes(id) ? { id, until } : null;
  applyTheme();
}

export const activeTheme = () => current || 'original';

function wanted() {
  if (preview && preview.until > Date.now()) return preview.id;
  preview = null;
  return THEMES.includes(config.theme) ? config.theme : 'original';
}

function unmountArt() {
  if (art && art.unmount) { try { art.unmount(); } catch (e) { console.error(e); } }
  art = null;
  for (const k in screens) screens[k].art.textContent = '';
}

export function applyTheme() {
  const id = wanted();
  if (id === current) return;
  current = id;
  const html = document.documentElement;
  const ticket = ++loading;
  if (id === 'original') {
    unmountArt();
    html.removeAttribute('data-theme');
    if (link) { link.remove(); link = null; }
    return;
  }
  // The new stylesheet goes in next to the old one and replaces it once loaded, so the screen
  // never shows a half-styled page.
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = 'css/themes/' + id + '.css';
  const done = (ok) => {
    if (ticket !== loading) { l.remove(); return; }
    if (!ok) { l.remove(); current = null; return; }
    unmountArt();
    if (link) link.remove();
    link = l;
    html.setAttribute('data-theme', id);
    import('./themes/' + id + '.js').then((m) => {
      if (ticket !== loading || !m.mount) return;
      art = m.mount({ screens, stage }) || null;
      if (art && art.tick) art.tick(Date.now());
    }).catch((e) => console.error(e));
  };
  l.onload = () => done(true);
  l.onerror = () => done(false);
  document.head.appendChild(l);
}

// Called every second from the main loop: ends a try-out, follows a new setting, and lets the
// theme move its pictures along (the sky, the clock hands…).
export function themeTick(t, screenName) {
  applyTheme();
  if (art && art.tick) { try { art.tick(t, screenName); } catch (e) { console.error(e); } }
}
