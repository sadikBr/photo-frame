// Frame dashboard backend (Cloudflare Worker).
// Serves the static app from ./public and a small JSON API:
//   GET  /api/time                 server clock (the frame's clock can drift after power cuts)
//   GET  /api/board                everything the frame shows: lists, settings, family dates,
//                                  message, and when the frame last checked in (?frame=1 marks it)
//   PUT  /api/settings             frame settings from the control panel (validated, see below)
//   POST /api/events               {op:"add", name, date:"MM-DD"|"YYYY-MM-DD"} | {op:"remove", id}
//                                  | {op:"import", source, events:[{name, date, time?, end?}]}
//                                  | {op:"removeSource", source}   (entries from an .ics file)
//   PUT  /api/message              {text, hours?}  a note shown on the frame's clock screen
//   DELETE /api/message
//   GET  /api/lists                family to-do and shopping lists
//   POST /api/lists                {op:"add"|"toggle"|"remove"|"clearDone", list, text?, id?}
//   POST /api/routines             {op:"add", text, kind:"days"|"weekly"|"monthly", every?, weekday?, day?, start?}
//                                  | {op:"remove", id}   repeating tasks that come back on the to-do list
//   POST /api/quran                {year, op:"inc"|"dec"|"set", value?}  Ramadan Quran tracker (juz read)
//   PUT  /api/audio/<name>         upload the adhan (name: adhan | adhan-fajr; body = audio bytes)
//   GET  /api/audio/<name>         the audio file;  DELETE removes it
//   POST /api/preview              {what:"ramadan"|"adhkar"|"adhan"|"none", minutes?}  show it on the frame now
//   GET  /api/photos               photo index
//   POST /api/photos               upload one JPEG (body = image bytes)
//   GET  /api/photos/<id>          the photo
//   DELETE /api/photos/<id>
// If the ACCESS_KEY secret is set, every /api call except /api/time needs ?key= or an x-key header.

import { sanitizeSettings, clean, num } from './settings.js';
import { dueFrom, addDays } from '../public/js/routines.js';

export { dueFrom };

const LISTS = ['tasks', 'shopping'];
const MAX_ITEMS = 200;
const MAX_TEXT = 120;
const MAX_PHOTOS = 300;
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const MAX_EVENTS = 1500;
const MAX_IMPORT = 500;
const KEEP_PAST_DAYS = 40; // one-off dates older than this are dropped
const SEEN_EVERY = 10 * 60 * 1000; // write the frame's check-in at most every 10 minutes
const MAX_ROUTINES = 60;
const AUDIO_NAMES = ['adhan', 'adhan-fajr'];
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra },
  });
const fail = (status, message) => json({ error: message }, status);

function authorized(request, env, url) {
  if (!env.ACCESS_KEY) return true;
  const given = request.headers.get('x-key') || url.searchParams.get('key') || '';
  if (given.length !== env.ACCESS_KEY.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ env.ACCESS_KEY.charCodeAt(i);
  return diff === 0;
}

function needStore(env) {
  if (!env.STORE) throw Object.assign(new Error('The STORE KV namespace is not bound. See README, step 3.'), { status: 500 });
  return env.STORE;
}

// ---------- lists ----------
async function readLists(env) {
  const data = (await needStore(env).get('lists', 'json')) || {};
  for (const l of LISTS) if (!Array.isArray(data[l])) data[l] = [];
  return applyRoutines(env, data);
}

// ---------- repeating tasks ----------
// A routine puts its task back on the to-do list on each due day:
//   days    every N days from `start`        (e.g. water the plants every 3 days)
//   weekly  on a weekday (0 = Sunday)         (e.g. every Friday)
//   monthly on a day of the month             (e.g. the 5th: pay the electricity bill;
//           the 31st means the last day in shorter months)
// `next` is the next due day; it moves forward each time the task is put back.
const localToday = (env) => isoDay(Date.now() + (Number(env.UTC_OFFSET_MINUTES) || 0) * 60000);

async function readRoutines(env) {
  return (await needStore(env).get('routines', 'json')) || [];
}

// Puts due routines on the to-do list (unless the task is already there and not done).
async function applyRoutines(env, data) {
  const routines = await readRoutines(env);
  const today = localToday(env);
  let changed = false;
  for (const r of routines) {
    if (!r.next || r.next > today) continue;
    const open = data.tasks.some((x) => !x.done && (x.rid === r.id || x.text === r.text));
    if (!open && data.tasks.length < MAX_ITEMS) {
      data.tasks.unshift({ id: crypto.randomUUID().slice(0, 8), text: r.text, done: false, ts: Date.now(), rid: r.id });
    }
    r.next = dueFrom(r, addDays(today, 1));
    changed = true;
  }
  if (changed) {
    data.updated = Date.now();
    await needStore(env).put('lists', JSON.stringify(data));
    await needStore(env).put('routines', JSON.stringify(routines));
  }
  return data;
}

async function updateRoutines(request, env) {
  let body;
  try { body = await request.json(); } catch (e) { return fail(400, 'Body must be JSON.'); }
  let routines = await readRoutines(env);
  if (body.op === 'add') {
    const text = clean(body.text, MAX_TEXT);
    if (!text) return fail(400, 'Write the task.');
    if (routines.length >= MAX_ROUTINES) return fail(400, 'Too many repeating tasks. Remove some first.');
    const today = localToday(env);
    const r = { id: crypto.randomUUID().slice(0, 8), text, kind: body.kind };
    const whole = (v, lo, hi) => (Number.isInteger(Number(v)) && Number(v) >= lo && Number(v) <= hi && v !== '' && v != null ? Number(v) : null);
    if (body.kind === 'days') {
      r.every = whole(body.every, 1, 90);
      if (r.every == null) return fail(400, 'Choose every how many days (1 to 90).');
    } else if (body.kind === 'weekly') {
      r.weekday = whole(body.weekday, 0, 6);
      if (r.weekday == null) return fail(400, 'Choose the day of the week.');
    } else if (body.kind === 'monthly') {
      r.day = whole(body.day, 1, 31);
      if (r.day == null) return fail(400, 'Choose the day of the month (1 to 31).');
    } else {
      return fail(400, 'kind must be days, weekly or monthly.');
    }
    r.start = /^\d{4}-\d{2}-\d{2}$/.test(body.start || '') && validDate(body.start) && body.start >= today ? body.start : today;
    r.next = dueFrom(r, today);
    routines.push(r);
  } else if (body.op === 'remove') {
    routines = routines.filter((r) => r.id !== body.id);
  } else {
    return fail(400, 'Unknown op.');
  }
  await needStore(env).put('routines', JSON.stringify(routines));
  const lists = await readLists(env); // a routine due today shows up at once
  return json({ routines: await readRoutines(env), lists });
}

// ---------- Ramadan: Quran reading tracker (juz read this Ramadan) ----------
async function updateQuran(request, env) {
  let body;
  try { body = await request.json(); } catch (e) { return fail(400, 'Body must be JSON.'); }
  const year = Math.round(num(body.year, 1400, 1600) || 0);
  if (!year) return fail(400, 'year (Hijri) is required.');
  const cur = (await needStore(env).get('quran', 'json')) || {};
  let juz = cur.year === year ? cur.juz || 0 : 0; // a new Ramadan starts from zero
  if (body.op === 'inc') juz++;
  else if (body.op === 'dec') juz--;
  else if (body.op === 'set') juz = Math.round(num(body.value, 0, 30) || 0);
  else return fail(400, 'Unknown op.');
  const q = { year, juz: Math.min(30, Math.max(0, juz)), at: Date.now() };
  await needStore(env).put('quran', JSON.stringify(q));
  return json(q);
}

// ---------- adhan audio ----------
async function audioIndex(env) {
  return (await needStore(env).get('audio:index', 'json')) || {};
}

async function putAudio(request, env, name) {
  const type = (request.headers.get('content-type') || '').split(';')[0].trim();
  if (!/^audio\/[a-z0-9.+-]+$/.test(type)) return fail(415, 'Send an audio file (MP3, M4A, OGG or WAV).');
  const buf = await request.arrayBuffer();
  if (!buf.byteLength) return fail(400, 'The file is empty.');
  if (buf.byteLength > MAX_AUDIO_BYTES) return fail(413, 'The audio file is larger than 10 MB.');
  await needStore(env).put('audio:' + name, buf, { metadata: { type } });
  const index = await audioIndex(env);
  index[name] = { at: Date.now(), size: buf.byteLength, type };
  await needStore(env).put('audio:index', JSON.stringify(index));
  return json(index);
}

async function getAudio(env, name) {
  const { value, metadata } = await needStore(env).getWithMetadata('audio:' + name, 'arrayBuffer');
  if (!value) return fail(404, 'No such audio.');
  // The frame asks for ?v=<upload time>, so a new upload is a new URL and this can be cached.
  return new Response(value, {
    headers: { 'content-type': (metadata && metadata.type) || 'audio/mpeg', 'cache-control': 'private, max-age=31536000, immutable' },
  });
}

async function deleteAudio(env, name) {
  await needStore(env).delete('audio:' + name);
  const index = await audioIndex(env);
  delete index[name];
  await needStore(env).put('audio:index', JSON.stringify(index));
  return json(index);
}

// ---------- preview: show something on the frame now (Ramadan look, adhkar, adhan test) ----------
async function readPreview(env) {
  const p = await needStore(env).get('preview', 'json');
  return p && p.until > Date.now() ? p : null;
}

async function putPreview(request, env) {
  let body;
  try { body = await request.json(); } catch (e) { return fail(400, 'Body must be JSON.'); }
  if (body.what === 'none') { await needStore(env).delete('preview'); return json(null); }
  if (!['ramadan', 'adhkar', 'adhan'].includes(body.what)) return fail(400, 'Unknown preview.');
  const minutes = num(body.minutes, 1, 60) || 10;
  const p = { id: crypto.randomUUID().slice(0, 8), what: body.what, until: Date.now() + minutes * 60000 };
  await needStore(env).put('preview', JSON.stringify(p));
  return json(p);
}

async function updateLists(request, env) {
  let body;
  try { body = await request.json(); } catch (e) { return fail(400, 'Body must be JSON.'); }
  const { op, list, id } = body || {};
  if (!LISTS.includes(list)) return fail(400, 'list must be "tasks" or "shopping".');
  const data = await readLists(env);
  const items = data[list];
  if (op === 'add') {
    const text = String(body.text || '').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);
    if (!text) return fail(400, 'text is empty.');
    if (items.length >= MAX_ITEMS) return fail(400, 'This list is full. Clear done items first.');
    const dup = items.find((x) => !x.done && x.text === text);
    if (!dup) items.unshift({ id: crypto.randomUUID().slice(0, 8), text, done: false, ts: Date.now() });
  } else if (op === 'toggle') {
    const it = items.find((x) => x.id === id);
    if (it) { it.done = !it.done; it.ts = Date.now(); }
  } else if (op === 'remove') {
    data[list] = items.filter((x) => x.id !== id);
  } else if (op === 'clearDone') {
    data[list] = items.filter((x) => !x.done);
  } else {
    return fail(400, 'Unknown op.');
  }
  data.updated = Date.now();
  await needStore(env).put('lists', JSON.stringify(data));
  return json(data);
}

// ---------- photos ----------
async function photoIndex(env) {
  return (await needStore(env).get('photos:index', 'json')) || [];
}

async function addPhoto(request, env) {
  const type = request.headers.get('content-type') || '';
  if (!/^image\/(jpeg|webp|png)$/.test(type)) return fail(415, 'Send a JPEG, PNG or WebP image.');
  const buf = await request.arrayBuffer();
  if (!buf.byteLength) return fail(400, 'The image is empty.');
  if (buf.byteLength > MAX_PHOTO_BYTES) return fail(413, 'The image is larger than 2 MB. Resize it first.');
  const index = await photoIndex(env);
  if (index.length >= MAX_PHOTOS) return fail(400, 'The album is full (300 photos). Delete some first.');
  const id = Date.now().toString(36) + crypto.randomUUID().slice(0, 6);
  await needStore(env).put('photo:' + id, buf, { metadata: { type } });
  index.push({ id, added: Date.now() });
  await needStore(env).put('photos:index', JSON.stringify(index));
  return json({ id }, 201);
}

async function getPhoto(env, id) {
  const { value, metadata } = await needStore(env).getWithMetadata('photo:' + id, 'arrayBuffer');
  if (!value) return fail(404, 'No such photo.');
  return new Response(value, {
    headers: { 'content-type': (metadata && metadata.type) || 'image/jpeg', 'cache-control': 'private, max-age=31536000, immutable' },
  });
}

async function deletePhoto(env, id) {
  const index = await photoIndex(env);
  await needStore(env).delete('photo:' + id);
  await needStore(env).put('photos:index', JSON.stringify(index.filter((p) => p.id !== id)));
  return json({ ok: true });
}

// ---------- settings ----------
async function putSettings(request, env) {
  let body;
  try { body = await request.json(); } catch (e) { return fail(400, 'Body must be JSON.'); }
  const settings = sanitizeSettings(body);
  settings.updated = Date.now();
  await needStore(env).put('settings', JSON.stringify(settings));
  return json(settings);
}

// ---------- family dates ----------
async function readEvents(env) {
  return (await needStore(env).get('events', 'json')) || [];
}

function validDate(d) {
  const m = /^(?:(\d{4})-)?(\d{2})-(\d{2})$/.exec(String(d || ''));
  if (!m) return false;
  const y = m[1] ? +m[1] : 2024; // leap year so 02-29 is allowed for yearly dates
  const mo = +m[2], da = +m[3];
  const dt = new Date(Date.UTC(y, mo - 1, da));
  return dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === da && (!m[1] || (y >= 2000 && y <= 2100));
}

const validTime = (t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(t || ''));
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);
// Yearly dates (MM-DD) always stay; one-off dates stay until they are KEEP_PAST_DAYS old.
const current = (e) => e.date.length === 5 || (e.end || e.date) >= isoDay(Date.now() - KEEP_PAST_DAYS * 86400000);

async function updateEvents(request, env) {
  let body;
  try { body = await request.json(); } catch (e) { return fail(400, 'Body must be JSON.'); }
  let events = (await readEvents(env)).filter(current);
  if (body.op === 'import') {
    const source = clean(body.source, 60);
    if (!source) return fail(400, 'Name the imported calendar.');
    if (!Array.isArray(body.events) || !body.events.length) return fail(400, 'The file has no entries to import.');
    const incoming = [];
    for (const raw of body.events.slice(0, MAX_IMPORT)) {
      const name = clean(raw && raw.name, 100);
      if (!name || !validDate(raw.date)) continue;
      const e = { id: crypto.randomUUID().slice(0, 8), name, date: raw.date, src: source };
      if (validTime(raw.time)) e.time = raw.time;
      if (raw.date.length === 10 && validDate(raw.end) && raw.end.length === 10 && raw.end > raw.date) e.end = raw.end;
      if (current(e)) incoming.push(e);
    }
    if (!incoming.length) return fail(400, 'Nothing in this file falls in the coming year.');
    // Importing the same calendar again replaces what came from it last time.
    events = events.filter((e) => e.src !== source).concat(incoming);
    if (events.length > MAX_EVENTS) return fail(400, 'Too many dates on the calendar. Remove an imported calendar first.');
  } else if (body.op === 'removeSource') {
    events = events.filter((e) => e.src !== body.source);
  } else if (body.op === 'add') {
    const name = clean(body.name, 100);
    if (!name) return fail(400, 'Give the occasion a name.');
    if (!validDate(body.date)) return fail(400, 'The date must be MM-DD (every year) or YYYY-MM-DD (once).');
    if (events.length >= MAX_EVENTS) return fail(400, 'Too many dates. Remove some first.');
    events.push({ id: crypto.randomUUID().slice(0, 8), name, date: body.date });
  } else if (body.op === 'remove') {
    events = events.filter((e) => e.id !== body.id);
  } else {
    return fail(400, 'Unknown op.');
  }
  events.sort((a, b) => (a.date.slice(-5) < b.date.slice(-5) ? -1 : 1));
  await needStore(env).put('events', JSON.stringify(events));
  return json(events);
}

// ---------- message ----------
async function readMessage(env) {
  const m = await needStore(env).get('message', 'json');
  return m && (!m.until || m.until > Date.now()) ? m : null;
}

async function putMessage(request, env) {
  let body;
  try { body = await request.json(); } catch (e) { return fail(400, 'Body must be JSON.'); }
  const text = clean(body.text, 200);
  if (!text) return fail(400, 'The message is empty.');
  const hours = num(body.hours, 1, 24 * 30);
  const msg = { text, at: Date.now(), until: hours ? Date.now() + hours * 3600000 : null };
  await needStore(env).put('message', JSON.stringify(msg));
  return json(msg);
}

// ---------- everything the frame needs, in one request ----------
async function board(env, url) {
  const store = needStore(env);
  const [lists, settings, events, message, seen, routines, quran, audio, preview] = await Promise.all([
    readLists(env), store.get('settings', 'json'), readEvents(env), readMessage(env), store.get('frame:seen', 'json'),
    readRoutines(env), store.get('quran', 'json'), audioIndex(env), readPreview(env),
  ]).then((r) => { r[2] = r[2].filter(current); return r; });
  let frameSeen = seen && seen.at;
  // Whether the frame's browser lets the page play the adhan: "ok", "blocked" (needs one tap
  // on the screen) or "off" (adhan not switched on). Shown in the control panel.
  let frameAudio = (seen && seen.audio) || null;
  if (url.searchParams.get('frame') === '1') {
    const now = Date.now();
    const audioNow = ['ok', 'blocked', 'off'].includes(url.searchParams.get('audio')) ? url.searchParams.get('audio') : frameAudio;
    if (!frameSeen || now - frameSeen > SEEN_EVERY || audioNow !== frameAudio) {
      await store.put('frame:seen', JSON.stringify({ at: now, audio: audioNow }));
    }
    frameSeen = now;
    frameAudio = audioNow;
  }
  // `build` changes with every deploy, so an open frame knows to reload the new code.
  const build = (env.CF_VERSION_METADATA && env.CF_VERSION_METADATA.id) || null;
  return json({
    lists, settings: settings || {}, events, message, routines, quran: quran || null, audio, preview,
    frameSeen: frameSeen || null, frameAudio, now: Date.now(), today: localToday(env), build,
  });
}

// ---------- router ----------
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) {
      // Photos shared from the phone are normally caught by the control panel's service worker
      // (sw.js). If it isn't running yet, open the control panel instead of an error page.
      if (url.pathname === '/share') return Response.redirect(new URL('/admin?shared=0#photos', url), 303);
      if (url.pathname === '/m' || url.pathname === '/admin' || url.pathname === '/phone') {
        url.pathname = '/admin.html';
        return env.ASSETS.fetch(new Request(url, request));
      }
      return env.ASSETS ? env.ASSETS.fetch(request) : fail(404, 'Not found');
    }
    try {
      const path = url.pathname.replace(/\/+$/, '');
      const method = request.method;
      if (path === '/api/time') return json({ now: Date.now() });
      if (!authorized(request, env, url)) return fail(401, 'Wrong or missing access key.');

      if (path === '/api/board' && method === 'GET') return board(env, url);
      if (path === '/api/settings') {
        if (method === 'GET') return json((await needStore(env).get('settings', 'json')) || {});
        if (method === 'PUT') return putSettings(request, env);
      }
      if (path === '/api/events') {
        if (method === 'GET') return json(await readEvents(env));
        if (method === 'POST') return updateEvents(request, env);
      }
      if (path === '/api/message') {
        if (method === 'GET') return json(await readMessage(env));
        if (method === 'PUT') return putMessage(request, env);
        if (method === 'DELETE') { await needStore(env).delete('message'); return json(null); }
      }
      if (path === '/api/lists') {
        if (method === 'GET') return json(await readLists(env));
        if (method === 'POST') return updateLists(request, env);
      }
      if (path === '/api/routines') {
        if (method === 'GET') return json(await readRoutines(env));
        if (method === 'POST') return updateRoutines(request, env);
      }
      if (path === '/api/quran') {
        if (method === 'GET') return json((await needStore(env).get('quran', 'json')) || null);
        if (method === 'POST') return updateQuran(request, env);
      }
      if (path === '/api/preview') {
        if (method === 'GET') return json(await readPreview(env));
        if (method === 'POST') return putPreview(request, env);
      }
      const am = /^\/api\/audio\/([a-z-]+)$/.exec(path);
      if (am && AUDIO_NAMES.includes(am[1])) {
        if (method === 'GET') return getAudio(env, am[1]);
        if (method === 'PUT') return putAudio(request, env, am[1]);
        if (method === 'DELETE') return deleteAudio(env, am[1]);
      }
      if (path === '/api/audio' && method === 'GET') return json(await audioIndex(env));
      if (path === '/api/photos') {
        if (method === 'GET') return json({ photos: await photoIndex(env) });
        if (method === 'POST') return addPhoto(request, env);
      }
      const pm = /^\/api\/photos\/([a-z0-9]{6,40})$/.exec(path);
      if (pm) {
        if (method === 'GET') return getPhoto(env, pm[1]);
        if (method === 'DELETE') return deletePhoto(env, pm[1]);
      }
      return fail(404, 'Unknown API route.');
    } catch (e) {
      return fail(e.status || 500, e.message || 'Server error.');
    }
  },
};
