// «وصفات»: recipes from TheMealDB, translated once, cached; pork and alcohol left out.
import assert from 'node:assert/strict';
import worker, { PulseHub } from '../src/worker.js';
import { recipeDeps } from '../src/recipes.js';
import { fromMeal, stepMinutes, halalMeal, checkTranslation } from '../public/js/recipes-common.js';
import { fakeNamespace } from './fake-do.mjs';

function memoryKV() {
  const m = new Map();
  return { m, async get(k, type) { if (!m.has(k)) return null; const v = m.get(k); return type === 'json' ? JSON.parse(v) : v; }, async put(k, v) { m.set(k, v); }, async delete(k) { m.delete(k); } };
}

// ---------- the rules ----------
assert.equal(stepMinutes('Simmer for 20-25 minutes until tender.'), 25);
assert.equal(stepMinutes('Bake for 1 hour.'), 60);
assert.equal(stepMinutes('Stir well.'), null);
const tagine = {
  idMeal: '52999', strMeal: 'Chicken Tagine', strCategory: 'Chicken', strArea: 'Moroccan', strMealThumb: 'https://www.themealdb.com/images/media/meals/x.jpg',
  strInstructions: 'STEP 1\r\nBrown the chicken in oil.\r\nSTEP 2\r\nAdd the onions and spices, then simmer for 40 minutes.\r\nAdd olives and serve.',
  strIngredient1: 'Chicken', strMeasure1: '1 whole', strIngredient2: 'Onion', strMeasure2: '2', strIngredient3: 'Olives', strMeasure3: '100g', strIngredient4: '',
};
const en = fromMeal(tagine);
assert.equal(en.steps.length, 3, 'STEP headings dropped');
assert.equal(en.steps[1].minutes, 40);
assert.equal(en.ingredients.length, 3);
assert.equal(halalMeal(tagine), true);
assert.equal(halalMeal(Object.assign({}, tagine, { strIngredient4: 'Bacon' })), false);
assert.equal(halalMeal(Object.assign({}, tagine, { strIngredient4: 'Red Wine' })), false);
assert.equal(halalMeal(Object.assign({}, tagine, { strCategory: 'Pork' })), false);
assert.equal(halalMeal(Object.assign({}, tagine, { strIngredient4: 'Ginger' })), true, 'ginger is not gin');
assert.equal(checkTranslation({ title: 'Chicken', steps: [{ text: 'x' }] }, en), null, 'not Arabic: refused');

// ---------- the server ----------
let calls = [];
recipeDeps.fetch = async (url) => {
  calls.push(String(url));
  const u = new URL(url);
  const f = u.pathname.split('/').pop();
  if (f === 'filter.php') return Response.json({ meals: [{ idMeal: '52999', strMeal: 'Chicken Tagine', strMealThumb: 't1' }, { idMeal: '53000', strMeal: 'Pork Tagine', strMealThumb: 't2' }] });
  if (f === 'lookup.php') return Response.json({ meals: u.searchParams.get('i') === '52999' ? [tagine] : null });
  if (f === 'search.php') return Response.json({ meals: u.searchParams.get('s') === 'tagine' ? [tagine] : null });
  return new Response('?', { status: 404 });
};
let aiCalls = 0, aiFails = false;
const AI = { async run(model, input) {
  aiCalls++;
  if (aiFails) throw new Error('quota');
  const sys = input.messages[0].content;
  if (sys.includes('dish names')) return { response: JSON.stringify({ names: JSON.parse(input.messages[1].content).map(() => 'طاجين الدجاج') }) };
  if (sys.includes('food search')) return { response: '{"q": "tagine"}' };
  return { response: { title: 'طاجين الدجاج', ingredients: [{ name: 'دجاج', qty: 'دجاجة' }], steps: [{ text: 'حمّروا الدجاج في الزيت.', minutes: null }, { text: 'أضيفوا البصل والتوابل واتركوه يطهى.', minutes: 40 }, { text: 'أضيفوا الزيتون وقدّموه.', minutes: null }] } };
} };
const env = { STORE: memoryKV(), PULSE: fakeNamespace(PulseHub, {}), AI, ASSETS: { fetch: async () => new Response('') } };
const get = async (path) => worker.fetch(new Request('https://frame.test' + path), env);

let r = await get('/api/recipes?a=Moroccan');
assert.equal(r.status, 200);
let data = await r.json();
data.recipes = data.recipes.filter((x) => !x.builtin); // the built-in Moroccan ones: below
assert.equal(data.recipes.length, 1, 'pork left out');
assert.equal(data.recipes[0].ar, 'طاجين الدجاج');
const n = calls.length;
await get('/api/recipes?a=Moroccan');
assert.equal(calls.length, n, 'kept, not asked again');
assert.equal((await get('/api/recipes?a=Narnian')).status, 400);

r = await get('/api/recipes/52999');
data = await r.json();
assert.equal(data.lang, 'ar');
assert.equal(data.title, 'طاجين الدجاج');
assert.equal(data.steps[1].minutes, 40);
const a1 = aiCalls;
await get('/api/recipes/52999');
assert.equal(aiCalls, a1, 'translated once');
assert.equal((await get('/api/recipes/1')).status, 404);

// Arabic search → English → TheMealDB.
r = await get('/api/recipes?q=' + encodeURIComponent('طاجين'));
data = await r.json();
assert.ok(data.recipes.some((x) => x.id === '52999'));
assert.ok(calls.some((c) => c.includes('search.php?s=tagine')));

// No translation: English, tried again later.
aiFails = true;
env.STORE.m.clear();
r = await get('/api/recipes/52999');
data = await r.json();
assert.equal(data.lang, 'en');
assert.equal(data.steps.length, 3);

// On Cloudflare (a ctx): the English answer comes at once, the Arabic follows in the background.
aiFails = false;
env.STORE.m.clear();
const bg = [];
const ctx = { waitUntil(p) { bg.push(p); } };
const before = aiCalls;
const getNow = async (path) => worker.fetch(new Request('https://frame.test' + path), env, ctx);
data = await (await getNow('/api/recipes/52999')).json();
assert.equal(data.pending, true);
assert.equal(data.lang, 'en');
assert.equal(data.steps.length, 3, 'readable in English meanwhile');
await getNow('/api/recipes/52999'); // asked again meanwhile: no second translation
await Promise.all(bg);
assert.equal(aiCalls - before, 2, 'one translation only (title + one piece of steps)');
data = await (await getNow('/api/recipes/52999')).json();
assert.equal(data.lang, 'ar');
assert.ok(!data.pending);
data = await (await getNow('/api/recipes?c=Chicken')).json();
assert.equal(data.pending, true);
const fromSite = (d) => d.recipes.filter((x) => !x.builtin)[0];
assert.equal(fromSite(data).ar, '');
await Promise.all(bg);
data = await (await getNow('/api/recipes?c=Chicken')).json();
assert.equal(fromSite(data).ar, 'طاجين الدجاج');
assert.ok(!data.pending);

// Built-in Moroccan recipes come first; one opens without TheMealDB or the AI.
const { MOROCCAN } = await import('../public/js/recipes-morocco.js');
data = await (await get('/api/recipes?a=Moroccan')).json();
assert.equal(data.recipes[0].id, MOROCCAN[0].id, 'built-in first');
assert.equal(data.recipes.length, MOROCCAN.length + 1, 'then TheMealDB');
const dessert = MOROCCAN.find((r) => r.cat === 'Dessert');
data = await (await get('/api/recipes?c=Dessert')).json();
assert.ok(data.recipes.some((r) => r.id === dessert.id), 'by kind of dish too');
const before2 = calls.length, ai2 = aiCalls;
data = await (await get('/api/recipes/' + MOROCCAN[0].id)).json();
assert.equal(data.lang, 'ar');
assert.equal(data.title, MOROCCAN[0].title);
assert.ok(data.thumb.startsWith('/img/recipes/'));
assert.equal(calls.length, before2);
assert.equal(aiCalls, ai2);
data = await (await get('/api/recipes?q=' + encodeURIComponent(MOROCCAN[0].title))).json();
assert.equal(data.recipes[0].id, MOROCCAN[0].id, 'found by its Arabic name');
assert.equal((await get('/api/recipes/ma999')).status, 404);
const realFetch = recipeDeps.fetch;
recipeDeps.fetch = async () => new Response('down', { status: 503 });
env.STORE.m.clear();
data = await (await get('/api/recipes?a=Moroccan')).json();
assert.equal(data.recipes.length, MOROCCAN.length, 'recipe site down: built-in ones still there');
recipeDeps.fetch = realFetch;

// Favourites, shared by the frame and the phones.
const post = (body) => worker.fetch(new Request('https://frame.test/api/recipes/favs', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }), env);
assert.deepEqual((await (await get('/api/recipes/favs')).json()).favs, []);
await post({ op: 'add', id: '52999', name: 'Chicken Tagine', ar: 'طاجين الدجاج', thumb: 'https://www.themealdb.com/images/media/meals/x.jpg' });
await post({ op: 'add', id: 'ma01', name: 'Harira', ar: 'حريرة', thumb: 'javascript:alert(1)' });
data = (await (await get('/api/recipes/favs')).json()).favs;
assert.deepEqual(data.map((f) => f.id), ['ma01', '52999'], 'newest first');
assert.equal(data[0].thumb, '', 'only recipe pictures');
await post({ op: 'add', id: '52999', name: 'Chicken Tagine' });
assert.equal((await (await get('/api/recipes/favs')).json()).favs.length, 2, 'no doubles');
await post({ op: 'remove', id: 'ma01' });
assert.deepEqual((await (await get('/api/recipes/favs')).json()).favs.map((f) => f.id), ['52999']);
assert.equal((await post({ op: 'add', id: '../x' })).status, 400);

// Open a recipe on the frame.
const hub = env.PULSE;
const sock = { got: [], send(m) { this.got.push(JSON.parse(m)); } };
hub.sockets.add(sock);
r = await worker.fetch(new Request('https://frame.test/api/pulse/recipe', { method: 'POST', body: JSON.stringify({ id: '52999', title: 'طاجين', by: 'ماما' }), headers: { 'content-type': 'application/json' } }), env);
assert.equal(r.status, 200);
assert.equal(sock.got.at(-1).type, 'recipe');
assert.equal(sock.got.at(-1).recipe.id, '52999');
assert.equal((await (await get('/api/pulse/recipe')).json()).recipe.by, 'ماما');

console.log('recipes: all tests passed');
