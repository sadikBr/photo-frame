// «وصفات» in the control panel: browse or search recipes (TheMealDB, put into Arabic by the
// server), read one, and open it on the frame («اعرضها على الإطار»), where it is cooked step by
// step; its ingredients can go to the shopping list.
import * as demo from './demo.js';
import { RECIPE_SHELVES } from './recipes-common.js';
import { minutesAr } from './timers-common.js';

export function initRecipes({ api, send, toast, el, $, DEMO, me, onListsChanged }) {
  let shelf = RECIPE_SHELVES[0], query = '', list = [], recipe = null, loaded = false, ticket = 0;

  function drawShelves() {
    const box = $('rcpShelves');
    box.textContent = '';
    for (const s of RECIPE_SHELVES) {
      const on = !query && s === shelf;
      box.append(el('button', { type: 'button', class: 'wheel-chip' + (on ? ' is-on' : ''), 'aria-pressed': String(on), onclick: () => { query = ''; $('rcpQ').value = ''; load(s); } }, s.ar));
    }
  }
  function drawGrid(msg) {
    const grid = $('rcpGrid');
    grid.textContent = '';
    $('rcpNote').hidden = !msg;
    $('rcpNote').textContent = msg || '';
    for (const r of list) {
      const img = el('span', { class: 'rcp-card-img' });
      if (r.thumb) img.style.backgroundImage = 'url("' + r.thumb.replace(/"/g, '') + '")';
      grid.append(el('button', { type: 'button', class: 'rcp-card', onclick: () => openOne(r.id) }, img, el('span', { class: 'rcp-card-name' }, r.ar || r.name)));
    }
  }
  async function load(s) {
    if (s) shelf = s;
    drawShelves();
    list = [];
    drawGrid('جاري التحميل…');
    const t = ++ticket;
    try {
      const path = query ? '/api/recipes?q=' + encodeURIComponent(query) : '/api/recipes?' + shelf.kind + '=' + encodeURIComponent(shelf.id);
      const r = DEMO ? demo.recipeList(shelf) : await api(path);
      if (t !== ticket) return;
      list = r.recipes || [];
      drawGrid(r.note || (list.length ? '' : query ? 'لم نجد وصفة بهذا الاسم. جرّب كلمة أخرى (أو بالإنجليزية).' : 'لا وصفات هنا الآن.'));
    } catch (e) { if (t === ticket) drawGrid(e.message || 'تعذّر الوصول إلى موقع الوصفات.'); }
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
      const r = DEMO ? demo.recipeOne(id) : await api('/api/recipes/' + encodeURIComponent(id));
      if (t !== ticket) return;
      recipe = r;
      $('rcpTitle').textContent = r.title;
      $('rcpPhoto').style.backgroundImage = r.thumb ? 'url("' + r.thumb.replace(/"/g, '') + '")' : '';
      $('rcpPhoto').hidden = !r.thumb;
      $('rcpLang').hidden = r.lang !== 'en';
      for (const x of r.ingredients) $('rcpIngr').append(el('li', null, el('span', null, x.name), x.qty ? el('small', null, x.qty) : null));
      for (const s of r.steps) $('rcpSteps').append(el('li', { dir: r.lang === 'en' ? 'ltr' : 'rtl' }, s.text, s.minutes ? el('span', { class: 'rcp-min' }, '⏱ ' + minutesAr(s.minutes)) : null));
    } catch (e) { if (t === ticket) $('rcpTitle').textContent = e.message || 'تعذّر فتح الوصفة.'; }
  }
  $('rcpBack').addEventListener('click', () => { $('rcpOne').hidden = true; $('rcpBrowse').hidden = false; ticket++; });
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
    shown(v) { if (v && !loaded) { loaded = true; load(); } },
  };
}
