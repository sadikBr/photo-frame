// «وصفات» on the frame: browse recipes (TheMealDB, put into Arabic by the server) by cuisine or
// kind, then cook one step at a time in big letters, readable from the stove. A tap on the step
// (or «التالي») goes on; a step that waits («اتركه 20 دقيقة») has a button that starts that timer;
// the ingredients go to the shopping list with one tap. A recipe sent from a phone opens by itself.
import { h } from './util.js';
import { frameFetch, frameListOp, DEMO } from './data.js';
import * as demo from './demo.js';
import { RECIPE_SHELVES, setThumb, TRANSLATE_POLL, TRANSLATE_TRIES } from './recipes-common.js';
import { minutesAr } from './timers-common.js';

export const RECIPE_ICON = (s) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 13h16a8 8 0 0 1-16 0z"/><path d="M2.5 13h19M9 9c0-1.5 1-1.5 1-3M13 9c0-1.5 1-1.5 1-3"/></svg>`;
const PAGE = 8;
const FAV_SHELF = { kind: 'fav', id: 'favs', ar: 'المفضّلة' };
const HEART = (s, full) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true" fill="${full ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z"/></svg>`;
const IDLE_CLOSE = 3 * 3600000; // a recipe left open closes after 3 hours without a touch
const SENT_FRESH = 15 * 60000; // a recipe sent from a phone opens if it arrived this recently

export function createRecipes({ stage, tab, startTimer }) {
  // ----- the two faces: the shelves, and one recipe -----
  const shelves = h('div', { class: 'rc-shelves', role: 'tablist', 'aria-label': 'أنواع الوصفات' });
  const grid = h('div', { class: 'rc-grid' });
  const note = h('div', { class: 'rc-note', hidden: true });
  const prevPage = h('button', { type: 'button', class: 'rc-page' }, '‹ السابقة');
  const nextPage = h('button', { type: 'button', class: 'rc-page' }, 'التالية ›');
  const pager = h('div', { class: 'rc-pager' }, nextPage, prevPage);
  const browse = h('div', { class: 'rc-browse' },
    h('div', { class: 'rc-head' }, h('span', { class: 'rc-head-icon', html: RECIPE_ICON(40) }),
      h('div', null, h('div', { class: 'fun-title' }, 'وصفات'), h('div', { class: 'fun-sub' }, 'اختاروا وصفة، ثم اطبخوا خطوة خطوة.'))),
    shelves, grid, note, pager);

  const cTitle = h('div', { class: 'rc-title' });
  const cPhoto = h('div', { class: 'rc-photo' });
  const cIngr = h('ul', { class: 'rc-ingr' });
  const cShop = h('button', { type: 'button', class: 'rc-shop' }, 'أضيفوا المكوّنات إلى قائمة الشراء');
  const cCount = h('div', { class: 'rc-count' });
  const cStep = h('div', { class: 'rc-step', role: 'button', tabindex: '0', 'aria-label': 'الخطوة التالية' });
  const cTimer = h('button', { type: 'button', class: 'rc-timer', hidden: true });
  const cPrev = h('button', { type: 'button', class: 'rc-nav rc-prev' }, 'السابق');
  const cNext = h('button', { type: 'button', class: 'rc-nav rc-next' }, 'التالي');
  const cDots = h('div', { class: 'rc-dots' });
  const LANG_EN = 'هذه الوصفة بالإنجليزية لأن الترجمة لم تنجح الآن، وستُعاد لاحقاً.';
  const LANG_WAIT = 'تُترجم إلى العربية الآن… تظهر هنا بعد لحظات.';
  const cLang = h('div', { class: 'rc-lang', hidden: true });
  const cBack = h('button', { type: 'button', class: 'rc-back' }, 'كل الوصفات');
  const cFav = h('button', { type: 'button', class: 'rc-fav', 'aria-pressed': 'false' });
  const cook = h('div', { class: 'rc-cook', hidden: true },
    h('div', { class: 'rc-side' }, cPhoto, h('div', { class: 'rc-side-title' }, 'المكوّنات'), cIngr, cShop),
    h('div', { class: 'rc-main' },
      h('div', { class: 'rc-top' }, cBack, cFav, h('span', { class: 'rc-top-gap' }), cCount),
      cTitle, cStep, cLang,
      h('div', { class: 'rc-actions' }, cNext, cTimer, cPrev),
      cDots));

  const closeBtn = h('button', { class: 'fun-close', type: 'button', 'aria-label': 'إغلاق' }, '×');
  const modal = h('div', { class: 'fun-modal rc', hidden: true }, h('div', { class: 'fun-scrim' }), browse, cook, closeBtn);
  stage.append(modal);

  let open = false, shelf = RECIPE_SHELVES[0], list = [], page = 0, recipe = null, step = 0, lastTouch = 0, loadTicket = 0;
  let favs = []; // the family's favourites [{id, name, ar, thumb}], shared with the phones
  const SHELVES = [FAV_SHELF].concat(RECIPE_SHELVES);
  const touch = () => { lastTouch = Date.now(); };
  modal.addEventListener('pointerdown', touch, { capture: true });

  // ----- browsing -----
  for (const s of SHELVES) {
    const b = h('button', { type: 'button', class: 'rc-shelf' + (s === FAV_SHELF ? ' rc-shelf-fav' : ''), role: 'tab', 'aria-selected': 'false' });
    if (s === FAV_SHELF) b.innerHTML = HEART(22, true);
    b.append(s.ar);
    b.addEventListener('click', () => loadShelf(s));
    shelves.append(b);
  }
  function drawShelves() {
    SHELVES.forEach((s, i) => shelves.children[i].setAttribute('aria-selected', String(s === shelf)));
    const on = shelves.children[SHELVES.indexOf(shelf)];
    if (on && on.scrollIntoView) on.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }
  async function loadShelf(s) {
    shelf = s;
    page = 0;
    drawShelves();
    list = [];
    drawGrid('جاري التحميل…');
    const ticket = ++loadTicket;
    try {
      const r = await fetchShelf(s);
      if (ticket !== loadTicket) return;
      list = r.recipes || [];
      drawGrid(r.note || (list.length ? '' : 'لا وصفات هنا الآن.'));
      if (r.pending) namesLater(s, ticket, 0);
    } catch (e) {
      if (ticket === loadTicket) drawGrid('تعذّر الوصول إلى موقع الوصفات. حاولوا بعد قليل.');
    }
  }
  async function fetchShelf(s) {
    if (s === FAV_SHELF) {
      await loadFavs();
      return { recipes: favs, note: favs.length ? '' : 'لا وصفات مفضّلة بعد. افتحوا وصفة واضغطوا ♥ لتجدوها هنا.' };
    }
    return DEMO ? demo.recipeList(s) : frameFetch('/api/recipes?' + s.kind + '=' + encodeURIComponent(s.id));
  }
  async function loadFavs() {
    try { favs = (DEMO ? demo.recipeFavs() : await frameFetch('/api/recipes/favs')).favs || []; } catch (e) { /* keep what we have */ }
  }
  const isFav = (id) => favs.some((f) => f.id === String(id));
  function drawFav() {
    const on = !!recipe && isFav(recipe.id);
    cFav.setAttribute('aria-pressed', String(on));
    cFav.innerHTML = HEART(26, on);
    cFav.append(on ? 'في المفضّلة' : 'للمفضّلة');
  }
  cFav.addEventListener('click', async () => {
    if (!recipe) return;
    const r = recipe, add = !isFav(r.id);
    const card = list.find((x) => x.id === r.id) || {};
    const body = { op: add ? 'add' : 'remove', id: r.id, name: card.name || r.title, ar: r.lang === 'ar' ? r.title : (card.ar || ''), thumb: r.thumb || card.thumb || '' };
    favs = add ? [{ id: body.id, name: body.name, ar: body.ar, thumb: body.thumb, at: Date.now() }].concat(favs) : favs.filter((f) => f.id !== r.id); // at once; the server agrees
    drawFav();
    try { const res = DEMO ? demo.recipeFavOp(body) : await frameFetch('/api/recipes/favs', 'POST', body); favs = res.favs || favs; } catch (e) { /* shown already; next open re-reads */ }
    if (shelf === FAV_SHELF) list = favs.slice();
  });
  // The shelf came with English names (the Arabic is being written): ask again in a moment and
  // only rename the cards, staying on the same page.
  function namesLater(s, ticket, n) {
    if (n >= TRANSLATE_TRIES / 3) return;
    setTimeout(async () => {
      if (ticket !== loadTicket || !open) return;
      try {
        const r = await fetchShelf(s);
        if (ticket !== loadTicket) return;
        const ar = new Map((r.recipes || []).map((x) => [x.id, x.ar]));
        list = list.map((x) => Object.assign({}, x, { ar: ar.get(x.id) || x.ar }));
        if (!browse.hidden) drawGrid('');
        if (r.pending) namesLater(s, ticket, n + 1);
      } catch (e) { namesLater(s, ticket, n + 1); }
    }, TRANSLATE_POLL);
  }
  function drawGrid(msg) {
    grid.textContent = '';
    note.hidden = !msg;
    note.textContent = msg || '';
    const pages = Math.max(1, Math.ceil(list.length / PAGE));
    page = Math.min(page, pages - 1);
    for (const r of list.slice(page * PAGE, page * PAGE + PAGE)) {
      const img = h('span', { class: 'rc-card-img' });
      setThumb(img, r.thumb, true);
      const card = h('button', { type: 'button', class: 'rc-card' }, img, h('span', { class: 'rc-card-name' }, h('span', null, r.ar || r.name)));
      if (isFav(r.id)) card.append(h('span', { class: 'rc-card-fav', html: HEART(22, true) }));
      card.addEventListener('click', () => openRecipe(r.id));
      grid.append(card);
    }
    pager.hidden = pages < 2;
    prevPage.disabled = page === 0;
    nextPage.disabled = page >= pages - 1;
  }
  prevPage.addEventListener('click', () => { page--; drawGrid(''); });
  nextPage.addEventListener('click', () => { page++; drawGrid(''); });

  // ----- cooking -----
  async function openRecipe(id) {
    show();
    if (!favs.length) loadFavs().then(() => { if (recipe) drawFav(); });
    browse.hidden = true;
    cook.hidden = false;
    recipe = null;
    cTitle.textContent = '';
    cStep.textContent = 'جاري تحضير الوصفة…';
    cIngr.textContent = '';
    cDots.textContent = '';
    cCount.textContent = '';
    cTimer.hidden = true;
    const ticket = ++loadTicket;
    try {
      const r = await fetchOne(id);
      if (ticket !== loadTicket) return;
      if (!r || !r.steps || !r.steps.length) throw new Error('empty');
      recipe = r;
      step = 0;
      drawRecipe();
      if (r.pending) arabicLater(id, ticket, 0);
    } catch (e) {
      if (ticket === loadTicket) cStep.textContent = 'تعذّر فتح الوصفة. حاولوا بعد قليل.';
    }
  }
  const fetchOne = (id) => DEMO ? demo.recipeOne(id) : frameFetch('/api/recipes/' + encodeURIComponent(id));
  // Opened in English while the Arabic is being written: swap it in when it is ready, on the
  // same step.
  function arabicLater(id, ticket, n) {
    if (n >= TRANSLATE_TRIES) { cLang.textContent = LANG_EN; return; }
    setTimeout(async () => {
      if (ticket !== loadTicket || !recipe || recipe.id !== String(id)) return;
      try {
        const r = await fetchOne(id);
        if (ticket !== loadTicket || !recipe || recipe.id !== String(id)) return;
        if (r && !r.pending && r.steps && r.steps.length) {
          recipe = r;
          step = Math.min(step, r.steps.length - 1);
          drawRecipe(true);
          return;
        }
      } catch (e) { /* again */ }
      arabicLater(id, ticket, n + 1);
    }, TRANSLATE_POLL);
  }
  function drawRecipe(keepStep) {
    const r = recipe;
    cTitle.textContent = r.title;
    if (!keepStep) setThumb(cPhoto, r.thumb, false);
    cPhoto.classList.toggle('is-empty', !r.thumb);
    cIngr.textContent = '';
    for (const x of r.ingredients) cIngr.append(h('li', null, h('span', { class: 'rc-ingr-name' }, x.name), x.qty ? h('span', { class: 'rc-ingr-qty' }, x.qty) : null));
    cShop.disabled = false;
    cShop.textContent = 'أضيفوا المكوّنات إلى قائمة الشراء';
    cLang.hidden = r.lang !== 'en';
    cLang.textContent = r.pending ? LANG_WAIT : LANG_EN;
    cLang.classList.toggle('is-wait', !!r.pending);
    drawFav();
    cook.classList.toggle('is-en', r.lang === 'en');
    cDots.textContent = '';
    r.steps.forEach((_, i) => {
      const d = h('button', { type: 'button', class: 'rc-dot', 'aria-label': 'الخطوة ' + (i + 1) });
      d.addEventListener('click', () => { step = i; drawStep(); });
      cDots.append(d);
    });
    drawStep();
  }
  function drawStep() {
    const r = recipe;
    if (!r) return;
    const s = r.steps[step];
    cCount.textContent = 'الخطوة ' + (step + 1) + ' من ' + r.steps.length;
    cStep.textContent = s.text;
    cStep.dir = r.lang === 'en' ? 'ltr' : 'rtl';
    cStep.classList.toggle('is-long', s.text.length > 160);
    cTimer.hidden = !s.minutes;
    if (s.minutes) cTimer.textContent = 'ابدأ مؤقّت ' + minutesAr(s.minutes);
    cPrev.disabled = step === 0;
    cNext.textContent = step === r.steps.length - 1 ? 'انتهينا ✓' : 'التالي';
    [...cDots.children].forEach((d, i) => d.classList.toggle('is-on', i === step));
    cStep.animate([{ opacity: 0.25 }, { opacity: 1 }], { duration: 250 });
  }
  function next() {
    if (!recipe) return;
    if (step < recipe.steps.length - 1) { step++; drawStep(); } else close();
  }
  cNext.addEventListener('click', next);
  cStep.addEventListener('click', next);
  cPrev.addEventListener('click', () => { if (recipe && step > 0) { step--; drawStep(); } });
  cTimer.addEventListener('click', () => {
    const s = recipe && recipe.steps[step];
    if (!s || !s.minutes) return;
    startTimer(s.minutes, recipe.title.slice(0, 20));
    cTimer.textContent = 'بدأ المؤقّت ✓';
  });
  cShop.addEventListener('click', async () => {
    if (!recipe) return;
    cShop.disabled = true;
    let n = 0;
    for (const x of recipe.ingredients.slice(0, 25)) {
      try { await frameListOp({ op: 'add', list: 'shopping', text: x.name.slice(0, 120), by: 'وصفة' }); n++; } catch (e) { /* next */ }
    }
    cShop.textContent = n ? 'أُضيفت ' + n + ' إلى قائمة الشراء ✓' : 'تعذّرت الإضافة';
  });
  cBack.addEventListener('click', () => {
    recipe = null; cook.hidden = true; browse.hidden = false;
    if (!list.length || shelf === FAV_SHELF) loadShelf(shelf); else drawGrid(''); // hearts may have changed
  });

  // ----- open / close -----
  function show() {
    touch();
    if (open) return;
    open = true;
    modal.hidden = false;
    modal.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220 });
  }
  function showShelves() {
    show();
    loadFavs().then(() => { if (!recipe && !browse.hidden) drawGrid(note.hidden ? '' : note.textContent); });
    if (recipe) return; // back to the recipe being cooked
    browse.hidden = false;
    cook.hidden = true;
    if (!list.length) loadShelf(shelf);
  }
  function close() { open = false; modal.hidden = true; }
  closeBtn.addEventListener('click', close);
  tab.addEventListener('click', showShelves);

  // A recipe sent from a phone.
  function sent(x) { if (x && x.id && Date.now() - (x.at || 0) < SENT_FRESH) openRecipe(x.id); }
  (async () => {
    try { sent(DEMO ? demo.demoRecipe() : (await frameFetch('/api/pulse/recipe')).recipe); } catch (e) { /* none */ }
  })();
  if (DEMO) window.addEventListener('storage', (e) => { if (e.key === 'fd:demo-recipe') sent(demo.demoRecipe()); });

  return {
    open: showShelves,
    busy: () => open,
    tick() { if (open && Date.now() - lastTouch > IDLE_CLOSE) close(); },
    socket(m) { if (m.type === 'recipe') { if (m.recipe) sent(m.recipe); } },
  };
}
