// «وصفات»: recipes from TheMealDB (www.themealdb.com, free API), shown step by step on the frame.
// Shared by the server (src/recipes.js), the frame (frame-recipes.js), the control panel
// (admin-recipes.js) and the preview pages (demo.js).
//
// A recipe, as the frame and the panel get it:
//   { id, title, area, category, thumb, lang: "ar" | "en",
//     ingredients: [{ name, qty }], steps: [{ text, minutes }] }
// minutes: how long that step waits or cooks (a timer button on the frame), or null.

// What to browse: cuisines (TheMealDB "area") and kinds of dish ("category"), Moroccan first.
export const RECIPE_SHELVES = [
  { kind: 'a', id: 'Moroccan', ar: 'مغربية' },
  { kind: 'c', id: 'Dessert', ar: 'حلويات' },
  { kind: 'c', id: 'Breakfast', ar: 'فطور' },
  { kind: 'a', id: 'Algerian', ar: 'جزائرية' },
  { kind: 'a', id: 'Tunisian', ar: 'تونسية' },
  { kind: 'a', id: 'Egyptian', ar: 'مصرية' },
  { kind: 'a', id: 'Lebanese', ar: 'لبنانية' },
  { kind: 'a', id: 'Syrian', ar: 'سورية' },
  { kind: 'a', id: 'Turkish', ar: 'تركية' },
  { kind: 'c', id: 'Chicken', ar: 'دجاج' },
  { kind: 'c', id: 'Beef', ar: 'لحم البقر' },
  { kind: 'c', id: 'Lamb', ar: 'لحم الغنم' },
  { kind: 'c', id: 'Seafood', ar: 'سمك' },
  { kind: 'c', id: 'Vegetarian', ar: 'نباتية' },
  { kind: 'c', id: 'Pasta', ar: 'معكرونة' },
  { kind: 'a', id: 'Italian', ar: 'إيطالية' },
  { kind: 'a', id: 'French', ar: 'فرنسية' },
  { kind: 'a', id: 'Indian', ar: 'هندية' },
];
export const shelfById = (kind, id) => RECIPE_SHELVES.find((s) => s.kind === kind && s.id === id) || null;

// Pork and alcohol are left out of the lists and searches (a Muslim family's kitchen).
const HARAM = /\b(pork|bacon|ham|prosciutto|pancetta|chorizo|lard|salami|pepperoni|gammon|wine|beer|rum|brandy|whisky|whiskey|vodka|sherry|cognac|liqueur|cider|kirsch|bourbon|marsala|port|stout|ale|lager|champagne|prosecco|gin|tequila|amaretto|grand marnier|baileys|kahlua)\b/i;
export const halalMeal = (m) => {
  if (!m) return false;
  if (/^pork$/i.test(m.strCategory || '')) return false;
  if (HARAM.test(m.strMeal || '')) return false;
  for (let i = 1; i <= 20; i++) if (HARAM.test(m['strIngredient' + i] || '')) return false;
  return true;
};
export const halalName = (name) => !HARAM.test(name || '');

// "Simmer for 20-25 minutes" → 25; "bake 1 hour" → 60; nothing → null.
export function stepMinutes(text) {
  const s = String(text || '');
  let best = 0;
  for (const m of s.matchAll(/(\d+(?:\.\d+)?)(?:\s*(?:-|–|to)\s*(\d+(?:\.\d+)?))?\s*(hours?|hrs?|minutes?|mins?)\b/gi)) {
    const n = Number(m[2] || m[1]) * (/^h/i.test(m[3]) ? 60 : 1);
    if (n > best) best = n;
  }
  return best >= 1 && best <= 600 ? Math.round(best) : null;
}

const tidy = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

// TheMealDB's meal → our recipe (English, before translation).
export function fromMeal(m) {
  const ingredients = [];
  for (let i = 1; i <= 20; i++) {
    const name = tidy(m['strIngredient' + i]);
    if (name) ingredients.push({ name, qty: tidy(m['strMeasure' + i]) });
  }
  // Steps: the instructions' own lines (minus "STEP 1" headings); one long paragraph is cut into
  // sentences, two at a time.
  let parts = String(m.strInstructions || '').split(/\r?\n+/).map(tidy).filter((x) => x && !/^(step\s*)?\d+[.):]?$/i.test(x));
  parts = parts.map((x) => x.replace(/^(step\s*\d+[.):-]?\s*|\d+[.)]\s+)/i, ''));
  if (parts.length <= 2) {
    const sentences = parts.join(' ').split(/(?<=[.!?])\s+(?=[A-Z0-9])/).map(tidy).filter(Boolean);
    parts = [];
    for (let i = 0; i < sentences.length; i += 2) parts.push(sentences.slice(i, i + 2).join(' '));
  }
  const steps = parts.slice(0, 40).map((text) => ({ text: text.slice(0, 600), minutes: stepMinutes(text) }));
  return {
    id: String(m.idMeal), title: tidy(m.strMeal), area: tidy(m.strArea), category: tidy(m.strCategory),
    thumb: tidy(m.strMealThumb), lang: 'en', ingredients, steps,
  };
}

// The translated recipe from the model, checked: the same ingredients and steps, in Arabic.
export function checkTranslation(t, en) {
  if (!t || typeof t !== 'object') return null;
  const str = (v, n) => tidy(v).slice(0, n);
  const title = str(t.title, 80);
  const ingredients = (Array.isArray(t.ingredients) ? t.ingredients : []).slice(0, 30)
    .map((x) => ({ name: str(x && x.name, 60), qty: str(x && x.qty, 40) })).filter((x) => x.name);
  const steps = (Array.isArray(t.steps) ? t.steps : []).slice(0, 40).map((x) => {
    const text = str(x && x.text, 400);
    const n = Number(x && x.minutes);
    return { text, minutes: Number.isFinite(n) && n >= 1 && n <= 600 ? Math.round(n) : stepMinutes(x && x.text) };
  }).filter((x) => x.text);
  const arabic = (s) => /[؀-ۿ]/.test(s);
  if (!title || !arabic(title) || steps.length < Math.min(2, en.steps.length) || !steps.every((x) => arabic(x.text))) return null;
  return Object.assign({}, en, { title, ingredients: ingredients.length ? ingredients : en.ingredients, steps, lang: 'ar' });
}
