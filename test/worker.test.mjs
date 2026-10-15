import assert from 'node:assert/strict';
import worker from '../src/worker.js';

// In-memory stand-in for a KV namespace.
function memoryKV() {
  const m = new Map();
  return {
    async get(k, type) {
      if (!m.has(k)) return null;
      const { v } = m.get(k);
      return type === 'json' ? JSON.parse(v) : v;
    },
    async getWithMetadata(k) {
      if (!m.has(k)) return { value: null, metadata: null };
      const { v, meta } = m.get(k);
      return { value: v, metadata: meta };
    },
    async put(k, v, opts) { m.set(k, { v, meta: opts && opts.metadata }); },
    async delete(k) { m.delete(k); },
  };
}

const env = {
  STORE: memoryKV(),
  ACCESS_KEY: 'secret-key-123',
  ASSETS: { fetch: async (req) => new Response('asset ' + new URL(req.url).pathname) },
};
const call = (path, init = {}) =>
  worker.fetch(new Request('https://frame.test' + path, init), env);
const k = (path) => path + (path.includes('?') ? '&' : '?') + 'key=secret-key-123';

let r = await call('/api/time');
assert.equal(r.status, 200);
assert.ok(Math.abs((await r.json()).now - Date.now()) < 5000);

r = await call('/api/lists');
assert.equal(r.status, 401, 'key required');
r = await call('/api/lists?key=wrong-key-1234');
assert.equal(r.status, 401);

r = await call(k('/api/lists'));
assert.deepEqual(await r.json(), { tasks: [], shopping: [] });

const post = (body) => call(k('/api/lists'), { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
r = await post({ op: 'add', list: 'shopping', text: '  خبز  ' });
let data = await r.json();
assert.equal(data.shopping[0].text, 'خبز');
await post({ op: 'add', list: 'shopping', text: 'خبز' });
data = await (await post({ op: 'add', list: 'shopping', text: 'نعناع' })).json();
assert.equal(data.shopping.length, 2, 'duplicate open item not added');
const id = data.shopping[1].id;
data = await (await post({ op: 'toggle', list: 'shopping', id })).json();
assert.equal(data.shopping.find((x) => x.id === id).done, true);
data = await (await post({ op: 'clearDone', list: 'shopping' })).json();
assert.deepEqual(data.shopping.map((x) => x.text), ['نعناع']);
r = await post({ op: 'add', list: 'groceries', text: 'x' });
assert.equal(r.status, 400);

// photos
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);
r = await call(k('/api/photos'), { method: 'POST', body: jpeg, headers: { 'content-type': 'image/jpeg' } });
assert.equal(r.status, 201);
const pid = (await r.json()).id;
r = await call(k('/api/photos'));
assert.equal((await r.json()).photos[0].id, pid);
r = await call(k('/api/photos/' + pid));
assert.equal(r.headers.get('content-type'), 'image/jpeg');
assert.deepEqual(new Uint8Array(await r.arrayBuffer()), jpeg);
r = await call(k('/api/photos'), { method: 'POST', body: 'x', headers: { 'content-type': 'text/plain' } });
assert.equal(r.status, 415);
r = await call(k('/api/photos/' + pid), { method: 'DELETE' });
assert.equal(r.status, 200);
r = await call(k('/api/photos'));
assert.equal((await r.json()).photos.length, 0);

// settings
const put = (path, body) => call(k(path), { method: 'PUT', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
data = await (await put('/api/settings', { city: 'فاس', latitude: 34.03, longitude: -5, night: { start: '22:30', end: '06:00', dim: 0.6 }, evil: true })).json();
assert.equal(data.city, 'فاس');
assert.equal(data.night.start, '22:30');
assert.equal(data.evil, undefined, 'unknown fields dropped');

// family dates
const ev = (body) => call(k('/api/events'), { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
data = await (await ev({ op: 'add', name: 'عيد ميلاد سلمى', date: '03-12' })).json();
assert.equal(data.length, 1);
r = await ev({ op: 'add', name: 'x', date: '02-30' });
assert.equal(r.status, 400, 'impossible date rejected');
data = await (await ev({ op: 'add', name: 'سفر إلى أكادير', date: '2026-12-20' })).json();
assert.equal(data.length, 2);

// importing a calendar file: replace on re-import, remove by source, old dates dropped
const today = new Date().toISOString().slice(0, 10);
const later = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
data = await (await ev({ op: 'import', source: 'المدرسة', events: [
  { name: 'اجتماع', date: later, time: '17:00' },
  { name: 'رحلة', date: today, end: later },
  { name: 'قديم', date: '2020-01-01' },
  { name: '', date: today },
  { name: 'ساعة غلط', date: today, time: '25:99' },
] })).json();
const school = data.filter((e) => e.src === 'المدرسة');
assert.equal(school.length, 3, 'empty names and old dates dropped');
assert.equal(school.find((e) => e.name === 'ساعة غلط').time, undefined, 'bad time ignored');
assert.equal(school.find((e) => e.name === 'رحلة').end, later);
data = await (await ev({ op: 'import', source: 'المدرسة', events: [{ name: 'اجتماع جديد', date: later }] })).json();
assert.deepEqual(data.filter((e) => e.src === 'المدرسة').map((e) => e.name), ['اجتماع جديد'], 're-import replaces');
data = await (await ev({ op: 'removeSource', source: 'المدرسة' })).json();
assert.equal(data.filter((e) => e.src).length, 0);
r = await ev({ op: 'import', source: 'x', events: [{ name: 'قديم', date: '2020-01-01' }] });
assert.equal(r.status, 400, 'nothing current to import');

// message
data = await (await put('/api/message', { text: 'العشاء عند الجدة الساعة 8', hours: 6 })).json();
assert.ok(data.until > Date.now());

// board: one call with everything; frame check-in recorded
data = await (await call(k('/api/board?frame=1'))).json();
assert.equal(data.settings.city, 'فاس');
assert.equal(data.events.length, 2);
assert.equal(data.message.text, 'العشاء عند الجدة الساعة 8');
assert.ok(Math.abs(data.frameSeen - Date.now()) < 5000);
assert.ok(Array.isArray(data.lists.shopping));

const evId = data.events[0].id;
data = await (await ev({ op: 'remove', id: evId })).json();
assert.equal(data.length, 1);
r = await call(k('/api/message'), { method: 'DELETE' });
data = await (await call(k('/api/board'))).json();
assert.equal(data.message, null);
r = await call('/api/board');
assert.equal(r.status, 401);

// repeating tasks: due today -> on the list at once; not duplicated; next date moves on
const rt = (body) => call(k('/api/routines'), { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
const todayIso = new Date().toISOString().slice(0, 10);
const plus = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
data = await (await rt({ op: 'add', text: 'سقي النباتات', kind: 'days', every: 3 })).json();
assert.equal(data.routines.length, 1);
assert.equal(data.routines[0].next, plus(3), 'next time is in 3 days');
let plants = data.lists.tasks.filter((x) => x.text === 'سقي النباتات');
assert.equal(plants.length, 1, 'due today: added to the list');
assert.equal(plants[0].rid, data.routines[0].id);
data = await (await call(k('/api/board'))).json();
assert.equal(data.lists.tasks.filter((x) => x.text === 'سقي النباتات').length, 1, 'not added twice');
data = await (await rt({ op: 'add', text: 'أداء فاتورة الكهرباء', kind: 'monthly', day: 5, start: plus(40) })).json();
assert.ok(data.routines[1].next >= plus(40), 'starts no earlier than the chosen start');
assert.ok(!data.lists.tasks.some((x) => x.text === 'أداء فاتورة الكهرباء'), 'not due yet');
r = await rt({ op: 'add', text: 'x', kind: 'yearly' });
assert.equal(r.status, 400);
r = await rt({ op: 'add', text: 'x', kind: 'days', every: 0 });
assert.equal(r.status, 400);
// when the day comes round again, the task is back (simulate by moving `next` to today)
const rs = JSON.parse((await env.STORE.get('routines')));
rs[0].next = todayIso;
await env.STORE.put('routines', JSON.stringify(rs));
const lst = await env.STORE.get('lists', 'json');
lst.tasks = lst.tasks.map((x) => (x.rid === rs[0].id ? Object.assign(x, { done: true }) : x));
await env.STORE.put('lists', JSON.stringify(lst));
data = await (await call(k('/api/lists'))).json();
plants = data.tasks.filter((x) => x.text === 'سقي النباتات');
assert.equal(plants.length, 2, 'done one stays (until cleared), a fresh one is added');
assert.equal(plants.filter((x) => !x.done).length, 1);
data = await (await rt({ op: 'remove', id: rs[0].id })).json();
assert.equal(data.routines.length, 1);

// Ramadan Quran tracker: counts per Hijri year, 0..30, a new year starts at 0
const qu = (body) => call(k('/api/quran'), { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
data = await (await qu({ year: 1448, op: 'inc' })).json();
assert.equal(data.juz, 1);
await qu({ year: 1448, op: 'inc' });
data = await (await qu({ year: 1448, op: 'set', value: 99 })).json();
assert.equal(data.juz, 30, 'capped at 30');
data = await (await qu({ year: 1449, op: 'inc' })).json();
assert.equal(data.juz, 1, 'new Ramadan starts again');
r = await qu({ op: 'inc' });
assert.equal(r.status, 400, 'year required');

// adhan audio
const mp3 = new Uint8Array([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, 1]);
r = await call(k('/api/audio/adhan'), { method: 'PUT', body: mp3, headers: { 'content-type': 'audio/mpeg' } });
assert.equal(r.status, 200);
assert.equal((await r.json()).adhan.size, mp3.length);
r = await call(k('/api/audio/adhan'));
assert.equal(r.headers.get('content-type'), 'audio/mpeg');
assert.deepEqual(new Uint8Array(await r.arrayBuffer()), mp3);
r = await call(k('/api/audio/adhan'), { method: 'PUT', body: 'x', headers: { 'content-type': 'text/plain' } });
assert.equal(r.status, 415);
r = await call(k('/api/audio/other'), { method: 'PUT', body: mp3, headers: { 'content-type': 'audio/mpeg' } });
assert.equal(r.status, 404, 'only adhan and adhan-fajr');

// previews and the frame's sound status
const pv = (body) => call(k('/api/preview'), { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
data = await (await pv({ what: 'ramadan', minutes: 10 })).json();
assert.ok(data.until > Date.now() + 9 * 60000);
data = await (await call(k('/api/board?frame=1&audio=blocked'))).json();
assert.equal(data.preview.what, 'ramadan');
assert.equal(data.frameAudio, 'blocked');
assert.equal(data.audio.adhan.size, mp3.length);
assert.equal(data.quran.juz, 1);
assert.equal(data.routines.length, 1);
await pv({ what: 'none' });
data = await (await call(k('/api/board?frame=1&audio=ok'))).json();
assert.equal(data.preview, null);
assert.equal(data.frameAudio, 'ok', 'a change in sound status is recorded at once');
r = await pv({ what: 'fireworks' });
assert.equal(r.status, 400);
r = await call(k('/api/audio/adhan'), { method: 'DELETE' });
assert.deepEqual(await r.json(), {});

// new settings are validated
data = await (await put('/api/settings', {
  adhan: { enabled: true, volume: 7, prayers: { fajr: false } },
  ramadan: { enabled: false }, adhkar: { auto: true, minutes: 1000 }, dailyVerse: false, weatherNudge: 'yes',
})).json();
assert.deepEqual(data.adhan, { enabled: true, prayers: { fajr: false, dhuhr: true, asr: true, maghrib: true, isha: true }, volume: 1 });
assert.deepEqual(data.ramadan, { enabled: false, quran: true });
assert.deepEqual(data.adhkar, { auto: true, minutes: 120 });
assert.equal(data.dailyVerse, false);
assert.equal(data.weatherNudge, undefined);

// static
r = await call('/m');
assert.equal(await r.text(), 'asset /admin.html');
r = await call('/admin');
assert.equal(await r.text(), 'asset /admin.html');
r = await call('/');
assert.equal(await r.text(), 'asset /');
// photos shared from a phone before its service worker runs: sent to the control panel
r = await call('/share', { method: 'POST', body: new FormData() });
assert.equal(r.status, 303);
assert.equal(new URL(r.headers.get('location')).pathname, '/admin');

console.log('worker: all tests passed');
