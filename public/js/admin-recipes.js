// «وصفات» in the control panel: browse or search recipes (TheMealDB, put into Arabic by the
// server), read one, and open it on the frame («اعرضها على الإطار»), where it is cooked step by
// step; its ingredients can go to the shopping list.
import * as demo from './demo.js';
import { RECIPE_SHELVES, setThumb, TRANSLATE_POLL, TRANSLATE_TRIES } from './recipes-common.js';
import { minutesAr } from './timers-common.js';

const FAV_SHELF = { kind: 'fav', id: 'favs', ar: '♥ المفضّلة' };
const SHELVES = [FAV_SHELF].concat(RECIPE_SHELVES);

export function initRecipes({ api, send, toast, el, $, DEMO, me, onListsChanged }) {
  let shelf = RECIPE_SHELVES[0], query = '', list = [], recipe = null, loaded = false, ticket = 0;
  let favs = []; // the family's favourites, shared with the frame
  const isFav = (id) => favs.some((f) => f.id === String(id));
  async function loadFavs() {
    try { favs = (DEMO ? demo.recipeFavs() : await api('/api/recipes/favs')).favs || []; } catch (e) { /* keep */ }
  }

  function drawShelves() {
    const box = $('rcpShelves');
    box.textContent = '';
    for (const s of SHELVES) {
      const on = !query && s === shelf;
      const b = el('button', { type: 'button', class: 'wheel-chip' + (on ? ' is-on' : '') + (s === FAV_SHELF ? ' rcp-chip-fav' : ''), 'aria-pressed': String(on), onclick: () => { query = ''; $('rcpQ').value = ''; load(s); } }, s.ar);
      box.append(b);
      if (on && b.scrollIntoView) setTimeout(() => b.scrollIntoView({ inline: 'nearest', block: 'nearest' }), 0);
    }
  }
  function drawGrid(msg) {
    const grid = $('rcpGrid');
    grid.textContent = '';
    $('rcpNote').hidden = !msg;
    $('rcpNote').textContent = msg || '';
    for (const r of list) {
      const img = el('span', { class: 'rcp-card-img' });
      setThumb(img, r.thumb, true);
      grid.append(el('button', { type: 'button', class: 'rcp-card', onclick: () => openOne(r.id) }, img, el('span', { class: 'rcp-card-name' }, el('span', null, r.ar || r.name)),
        isFav(r.id) ? el('span', { class: 'rcp-card-fav', 'aria-label': 'في المفضّلة' }, '♥') : null));
    }
  }
  async function load(s) {
    if (s) shelf = s;
    drawShelves();
    list = [];
    drawGrid('جاري التحميل…');
    const t = ++ticket;
    try {
      const r = await fetchList();
      if (t !== ticket) return;
      list = r.recipes || [];
      drawGrid(r.note || (list.length ? '' : query ? 'لم نجد وصفة بهذا الاسم. جرّب كلمة أخرى (أو بالإنجليزية).' : 'لا وصفات هنا الآن.'));
      if (r.pending) namesLater(t, 0);
    } catch (e) { if (t === ticket) drawGrid(e.message || 'تعذّر الوصول إلى موقع الوصفات.'); }
  }
  async function fetchList() {
    if (!query && shelf === FAV_SHELF) {
      await loadFavs();
      return { recipes: favs, note: favs.length ? '' : 'لا وصفات مفضّلة بعد. افتح وصفة واضغط «♡ أضفها للمفضّلة».' };
    }
    if (DEMO) return demo.recipeList(query ? null : shelf, query);
    return api(query ? '/api/recipes?q=' + encodeURIComponent(query) : '/api/recipes?' + shelf.kind + '=' + encodeURIComponent(shelf.id));
  }
  // English names for now (the Arabic is being written): rename the cards when it is ready.
  function namesLater(t, n) {
    if (n >= TRANSLATE_TRIES / 3) return;
    setTimeout(async () => {
      if (t !== ticket) return;
      try {
        const r = await fetchList();
        if (t !== ticket) return;
        const ar = new Map((r.recipes || []).map((x) => [x.id, x.ar]));
        list.forEach((x, i) => {
          x.ar = ar.get(x.id) || x.ar;
          const name = $('rcpGrid').children[i] && $('rcpGrid').children[i].querySelector('.rcp-card-name');
          if (name) name.textContent = x.ar || x.name;
        });
        if (r.pending) namesLater(t, n + 1);
      } catch (e) { namesLater(t, n + 1); }
    }, TRANSLATE_POLL);
  }
  $('rcpSearch').addEventListener('submit', (e) => {
    e.preventDefault();
    query = $('rcpQ').value.trim();
    load();
  });

  async function openOne(id) {
    $('rcpBrowse').hidden = true;
    $('rcpOne').hidden = false;
    $('rcpTitle').textContent = 'جاري تحضير الوصفة…';
    $('rcpIngr').textContent = '';
    $('rcpSteps').textContent = '';
    $('rcpPhoto').style.backgroundImage = '';
    $('rcpLang').hidden = true;
    recipe = null;
    window.scrollTo(0, 0);
    const t = ++ticket;
    try {
      const r = await fetchOne(id);
      if (t !== ticket) return;
      if (!r) throw new Error('تعذّر فتح الوصفة.');
      drawOne(r);
      setThumb($('rcpPhoto'), r.thumb, false);
      $('rcpPhoto').hidden = !r.thumb;
      if (r.pending) arabicLater(id, t, 0);
    } catch (e) { if (t === ticket) $('rcpTitle').textContent = e.message || 'تعذّر فتح الوصفة.'; }
  }
  const fetchOne = (id) => DEMO ? demo.recipeOne(id) : api('/api/recipes/' + encodeURIComponent(id));
  function drawFav() {
    const on = !!recipe && isFav(recipe.id);
    $('rcpFav').textContent = on ? '♥ في المفضّلة' : '♡ أضفها للمفضّلة';
    $('rcpFav').setAttribute('aria-pressed', String(on));
    $('rcpFav').classList.toggle('is-on', on);
  }
  function drawOne(r) {
    recipe = r;
    drawFav();
    $('rcpTitle').textContent = r.title;
    const src = $('rcpSources');
    src.textContent = '';
    src.hidden = !(r.sources && r.sources.length);
    if (r.sources && r.sources.length) {
      src.append('من وصفات: ');
      r.sources.forEach((u, i) => {
        let host = u;
        try { host = new URL(u).hostname.replace(/^www\./, ''); } catch (e) { /* as is */ }
        if (i) src.append('، ');
        src.append(el('a', { href: u, target: '_blank', rel: 'noopener' }, host));
      });
    }
    $('rcpLang').hidden = r.lang !== 'en';
    $('rcpLang').textContent = r.pending ? 'تُترجم إلى العربية الآن… تظهر هنا بعد لحظات.' : 'هذه الوصفة بالإنجليزية لأن الترجمة لم تنجح الآن، وستُعاد لاحقاً.';
    $('rcpLang').classList.toggle('is-wait', !!r.pending);
    $('rcpIngr').textContent = '';
    $('rcpSteps').textContent = '';
    for (const x of r.ingredients) $('rcpIngr').append(el('li', null, el('span', null, x.name), x.qty ? el('small', null, x.qty) : null));
    for (const s of r.steps) $('rcpSteps').append(el('li', { dir: r.lang === 'en' ? 'ltr' : 'rtl' }, s.text, s.minutes ? el('span', { class: 'rcp-min' }, '⏱ ' + minutesAr(s.minutes)) : null));
  }
  // Shown in English while the Arabic is being written; swapped when it is ready.
  function arabicLater(id, t, n) {
    if (n >= TRANSLATE_TRIES) { drawOne(Object.assign({}, recipe, { pending: false })); return; }
    setTimeout(async () => {
      if (t !== ticket) return;
      try {
        const r = await fetchOne(id);
        if (t !== ticket) return;
        if (r && !r.pending) { drawOne(r); return; }
      } catch (e) { /* again */ }
      arabicLater(id, t, n + 1);
    }, TRANSLATE_POLL);
  }
  $('rcpBack').addEventListener('click', () => {
    $('rcpOne').hidden = true; $('rcpBrowse').hidden = false; ticket++;
    if (shelf === FAV_SHELF && !query) load(); else drawGrid($('rcpNote').hidden ? '' : $('rcpNote').textContent); // hearts may have changed
  });
  $('rcpFav').addEventListener('click', async () => {
    if (!recipe) return;
    const r = recipe, add = !isFav(r.id);
    const card = list.find((x) => x.id === r.id) || {};
    const body = { op: add ? 'add' : 'remove', id: r.id, name: card.name || r.title, ar: r.lang === 'ar' ? r.title : (card.ar || ''), thumb: r.thumb || card.thumb || '' };
    favs = add ? [{ id: body.id, name: body.name, ar: body.ar, thumb: body.thumb, at: Date.now() }].concat(favs) : favs.filter((f) => f.id !== r.id);
    drawFav();
    try {
      const res = DEMO ? demo.recipeFavOp(body) : await send('/api/recipes/favs', 'POST', body);
      if (res && res.favs) favs = res.favs;
      toast(add ? 'أُضيفت إلى المفضّلة، على الإطار أيضاً.' : 'أُزيلت من المفضّلة.');
    } catch (e) { toast(e.message); }
  });
  $('rcpShow').addEventListener('click', async () => {
    if (!recipe) return;
    try {
      if (DEMO) demo.sendRecipe({ id: recipe.id, title: recipe.title, by: me() || '' });
      else await send('/api/pulse/recipe', 'POST', { id: recipe.id, title: recipe.title, by: me() || '' });
      toast('فُتحت «' + recipe.title + '» على الإطار.');
    } catch (e) { toast(e.message); }
  });
  $('rcpShop').addEventListener('click', async () => {
    if (!recipe) return;
    const b = $('rcpShop');
    b.disabled = true;
    let n = 0;
    for (const x of recipe.ingredients.slice(0, 25)) {
      try {
        const body = { op: 'add', list: 'shopping', text: x.name.slice(0, 120), by: me() || 'وصفة' };
        if (DEMO) demo.listOp(body); else await send('/api/lists', 'POST', body);
        n++;
      } catch (e) { /* next */ }
    }
    b.disabled = false;
    toast(n ? 'أُضيف ' + n + ' إلى قائمة الشراء.' : 'تعذّرت الإضافة.');
    if (n && onListsChanged) onListsChanged();
  });

  return {
    shown(v) { if (v && !loaded) { loaded = true; loadFavs().then(() => load()); } },
  };
}
