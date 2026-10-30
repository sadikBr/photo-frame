// «وصفات»: recipes from TheMealDB, translated into Arabic once by Workers AI and kept in KV.
//
//   GET /api/recipes?a=Moroccan | ?c=Dessert   a shelf: [{id, name, ar, thumb}]
//   GET /api/recipes?q=طاجين                     a search (an Arabic query is put into English first)
//   GET /api/recipes/<id>                        one recipe, in Arabic when the translation works
//
// TheMealDB's free key "1" is for personal and development use, which a family frame is; set the
// MEALDB_KEY variable to a supporter key if you have one. The translation needs the Workers AI
// binding ("ai": {"binding": "AI"} in wrangler.jsonc, free daily allowance). Without it (or if a
// translation fails) the recipe comes in English and the translation is tried again a day later.
// Pork and alcohol are left out.
import { fromMeal, checkTranslation, halalMeal, halalName, shelfById } from '../public/js/recipes-common.js';

export const recipeDeps = { fetch: (...a) => fetch(...a) }; // tests swap this
const MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const V = 'rcp1:'; // KV key prefix (bump to drop old translations)
const DAY = 86400;

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});
const fail = (status, error) => json({ error }, status);

async function mealdb(env, q) {
  const key = env.MEALDB_KEY || '1';
  const res = await recipeDeps.fetch('https://www.themealdb.com/api/json/v1/' + encodeURIComponent(key) + '/' + q, { headers: { accept: 'application/json' } });
  if (!res.ok) throw Object.assign(new Error('The recipe site did not answer (' + res.status + '). Try again later.'), { status: 502 });
  return res.json();
}

// One call to the model that must answer with JSON.
async function ai(env, system, user, maxTokens) {
  if (!env.AI) return null;
  try {
    const out = await env.AI.run(MODEL, { messages: [{ role: 'system', content: system }, { role: 'user', content: user }], max_tokens: maxTokens, temperature: 0.2 });
    const r = out && out.response;
    if (r && typeof r === 'object') return r;
    const s = String(r || '');
    const a = s.indexOf('{') >= 0 && (s.indexOf('[') < 0 || s.indexOf('{') < s.indexOf('[')) ? s.indexOf('{') : s.indexOf('[');
    const b = Math.max(s.lastIndexOf('}'), s.lastIndexOf(']'));
    return a >= 0 && b > a ? JSON.parse(s.slice(a, b + 1)) : null;
  } catch (e) { return null; }
}

// Dish names in Arabic, for a whole shelf at once.
async function arabicNames(env, names) {
  if (!names.length) return [];
  const r = await ai(env,
    'You translate dish names into Arabic for a Moroccan family. Use the usual Arabic (or Moroccan) name when a dish has one (Tagine → طاجين, Couscous → كسكس, Harira → حريرة). Keep them short. Answer with JSON only: {"names": [...]} in the same order and the same count.',
    JSON.stringify(names), 1500);
  const list = r && Array.isArray(r.names) ? r.names : Array.isArray(r) ? r : null;
  return list && list.length === names.length ? list.map((x) => String(x || '').trim().slice(0, 60)) : names.map(() => '');
}

export async function recipeList(env, url) {
  const kv = env.STORE;
  const a = url.searchParams.get('a'), c = url.searchParams.get('c');
  let q = (url.searchParams.get('q') || '').trim().slice(0, 60);
  let cacheKey, meals;
  if (q) {
    cacheKey = V + 'q:' + q.toLowerCase();
    const hit = kv && await kv.get(cacheKey, 'json');
    if (hit) return json(hit);
    // An Arabic query («طاجين بالدجاج»): into English for the search.
    let en = q;
    if (/[؀-ۿ]/.test(q)) {
      const r = await ai(env, 'Translate this food search into a short English search term (one to three words, the main dish or ingredient). Answer with JSON only: {"q": "..."}', q, 60);
      en = r && r.q ? String(r.q).slice(0, 60) : '';
      if (!en) return json({ recipes: [], note: 'ابحث بالإنجليزية: tagine, couscous, chicken…' });
    }
    const byName = (await mealdb(env, 'search.php?s=' + encodeURIComponent(en))).meals || [];
    meals = byName.filter(halalMeal);
    if (!meals.length) {
      const word = en.split(/\s+/).pop();
      meals = ((await mealdb(env, 'filter.php?i=' + encodeURIComponent(word))).meals || []).filter((m) => halalName(m.strMeal));
    }
  } else {
    const shelf = a ? shelfById('a', a) : c ? shelfById('c', c) : shelfById('a', 'Moroccan');
    if (!shelf) return fail(400, 'Unknown shelf.');
    cacheKey = V + 'list:' + shelf.kind + ':' + shelf.id;
    const hit = kv && await kv.get(cacheKey, 'json');
    if (hit) return json(hit);
    meals = ((await mealdb(env, 'filter.php?' + shelf.kind + '=' + encodeURIComponent(shelf.id))).meals || []).filter((m) => halalName(m.strMeal));
  }
  meals = meals.slice(0, 60);
  const ar = await arabicNames(env, meals.map((m) => m.strMeal));
  const out = { recipes: meals.map((m, i) => ({ id: String(m.idMeal), name: m.strMeal, ar: ar[i] || '', thumb: m.strMealThumb })) };
  if (kv) await kv.put(cacheKey, JSON.stringify(out), { expirationTtl: (ar.some(Boolean) ? 14 : 1) * DAY });
  return json(out);
}

export async function recipeOne(env, id) {
  const kv = env.STORE;
  const key = V + id;
  const hit = kv && await kv.get(key, 'json');
  if (hit) return json(hit);
  const m = ((await mealdb(env, 'lookup.php?i=' + encodeURIComponent(id))).meals || [])[0];
  if (!m) return fail(404, 'That recipe is gone.');
  if (!halalMeal(m)) return fail(404, 'That recipe is not shown here.');
  const en = fromMeal(m);
  const t = await ai(env,
    'You translate recipes into clear, simple Arabic (فصحى بسيطة) for a Moroccan family cooking from a kitchen screen. ' +
    'Use metric units when the recipe gives them, keep quantities, and use common Moroccan names for ingredients when they exist. ' +
    'Keep each step short (one or two sentences) and in order; you may split a long step. For each step, "minutes" is how long it cooks, rests or waits (a number), or null. ' +
    'Answer with JSON only: {"title": "...", "ingredients": [{"name": "...", "qty": "..."}], "steps": [{"text": "...", "minutes": null}]}',
    JSON.stringify({ title: en.title, ingredients: en.ingredients, steps: en.steps.map((s) => s.text) }), 3000);
  const ar = checkTranslation(t, en);
  const out = ar || en;
  if (kv) await kv.put(key, JSON.stringify(out), ar ? {} : { expirationTtl: DAY });
  return json(out);
}
