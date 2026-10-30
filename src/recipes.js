// «وصفات»: recipes from TheMealDB, translated into Arabic once by Workers AI and kept in KV.
//
//   GET /api/recipes?a=Moroccan | ?c=Dessert   a shelf: [{id, name, ar, thumb}]
//   GET /api/recipes?q=طاجين                     a search (an Arabic query is put into English first)
//   GET /api/recipes/<id>                        one recipe, in Arabic when the translation works
//
// The translation takes a while the first time (the model writes the whole recipe), so nobody
// waits for it: the first answer is the English straight from TheMealDB with "pending": true,
// the translation carries on in the background (ctx.waitUntil), and the frame and the panel ask
// again every few seconds until the Arabic is there. After that it is kept and opens at once.
// The steps are translated in pieces at the same time, which makes it several times quicker.
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
const BUSY = 90; // seconds a background translation is given before another may start
const CHUNK = 5; // steps per translation piece

// Background work: with a ctx (Cloudflare) it carries on after the answer; without one (tests,
// old callers) it is waited for, so the answer is already complete.
async function later(ctx, work) {
  if (ctx && ctx.waitUntil) { ctx.waitUntil(work().catch(() => {})); return true; }
  await work();
  return false;
}
// One background translation at a time per key.
async function claim(kv, key) {
  if (!kv) return true;
  if (await kv.get(key + ':busy')) return false;
  await kv.put(key + ':busy', '1', { expirationTtl: BUSY });
  return true;
}

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

export async function recipeList(env, url, ctx) {
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
  const shape = (ar) => ({ recipes: meals.map((m, i) => ({ id: String(m.idMeal), name: m.strMeal, ar: ar[i] || '', thumb: m.strMealThumb })) });
  if (!env.AI || !meals.length) {
    const out = shape([]);
    if (kv) await kv.put(cacheKey, JSON.stringify(out), { expirationTtl: DAY });
    return json(out);
  }
  let done = null;
  const work = async () => {
    const ar = await arabicNames(env, meals.map((m) => m.strMeal));
    done = shape(ar);
    if (kv) await kv.put(cacheKey, JSON.stringify(done), { expirationTtl: (ar.some(Boolean) ? 14 : 1) * DAY });
  };
  const busy = !(await claim(kv, cacheKey));
  if (busy || await later(ctx, work)) return json(Object.assign(shape([]), { pending: true }));
  return json(done);
}

export async function recipeOne(env, id, ctx) {
  const kv = env.STORE;
  const key = V + id;
  const hit = kv && await kv.get(key, 'json');
  if (hit) return json(hit);
  const m = ((await mealdb(env, 'lookup.php?i=' + encodeURIComponent(id))).meals || [])[0];
  if (!m) return fail(404, 'That recipe is gone.');
  if (!halalMeal(m)) return fail(404, 'That recipe is not shown here.');
  const en = fromMeal(m);
  if (!env.AI) return json(en);
  let done = null;
  const work = async () => {
    const ar = await translate(env, en);
    done = ar || en;
    if (kv) await kv.put(key, JSON.stringify(done), ar ? {} : { expirationTtl: DAY });
  };
  const busy = !(await claim(kv, key));
  if (busy || await later(ctx, work)) return json(Object.assign({}, en, { pending: true }));
  return json(done);
}

// The recipe into Arabic: the title and ingredients in one piece and the steps in pieces of a
// few, all at the same time (the model's writing time is what is slow, so shorter pieces in
// parallel finish much sooner than one long answer).
const RECIPE_RULES = 'You translate recipes into clear, simple Arabic (فصحى بسيطة) for a Moroccan family cooking from a kitchen screen. ' +
  'Use metric units when the recipe gives them, keep quantities, and use common Moroccan names for ingredients when they exist. ';
async function translate(env, en) {
  const pieces = [];
  for (let i = 0; i < en.steps.length; i += CHUNK) pieces.push(en.steps.slice(i, i + CHUNK));
  const [head, ...parts] = await Promise.all([
    ai(env, RECIPE_RULES + 'Translate the title and the ingredients. Answer with JSON only: {"title": "...", "ingredients": [{"name": "...", "qty": "..."}]}',
      JSON.stringify({ title: en.title, ingredients: en.ingredients }), 1200),
    ...pieces.map((p) => ai(env, RECIPE_RULES +
      'Translate these recipe steps, in order. Keep each step short (one or two sentences); you may split a long step. For each step, "minutes" is how long it cooks, rests or waits (a number), or null. ' +
      'Answer with JSON only: {"steps": [{"text": "...", "minutes": null}]}',
      JSON.stringify({ title: en.title, steps: p.map((x) => x.text) }), 1500)),
  ]);
  if (!head || parts.some((p) => !p || !Array.isArray(p.steps))) return null;
  return checkTranslation({ title: head.title, ingredients: head.ingredients, steps: parts.flatMap((p) => p.steps) }, en);
}
