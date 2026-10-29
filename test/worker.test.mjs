import assert from 'node:assert/strict';
import worker, { PulseHub } from '../src/worker.js';
import { pushDeps } from '../src/pulse-hub.js';
import { b64u } from '../src/webpush.js';
import { fakeNamespace } from './fake-do.mjs';

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
  PULSE: fakeNamespace(PulseHub, {}),
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
assert.equal(r.status, 404, 'only the known recordings');
// adhkar recordings: same route, a larger size allowed (an adhkar recording runs ~20 minutes)
r = await call(k('/api/audio/adhkar-morning'), { method: 'PUT', body: new Uint8Array(12 * 1024 * 1024), headers: { 'content-type': 'audio/mpeg' } });
assert.equal(r.status, 200, '12 MB is fine for adhkar');
assert.equal((await r.json())['adhkar-morning'].size, 12 * 1024 * 1024);
r = await call(k('/api/audio/adhan-fajr'), { method: 'PUT', body: new Uint8Array(12 * 1024 * 1024), headers: { 'content-type': 'audio/mpeg' } });
assert.equal(r.status, 413, 'but not for the adhan');
r = await call(k('/api/audio/adhkar-evening'), { method: 'PUT', body: new Uint8Array(25 * 1024 * 1024), headers: { 'content-type': 'audio/mpeg' } });
assert.equal(r.status, 413, 'nor over 24 MB');
r = await call(k('/api/audio/adhkar-morning'), { method: 'DELETE' });
assert.equal((await r.json())['adhkar-morning'], undefined);

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
assert.deepEqual(data.adhkar, { auto: true, minutes: 120, audioAuto: true, volume: 0.8 });
assert.equal(data.dailyVerse, false);
assert.equal(data.weatherNudge, undefined);

// «نبضة»: taps, drawings, voice notes, replies; a live frame gets each one at once
const frameGot = [];
env.PULSE.sockets.add({ send: (m) => frameGot.push(JSON.parse(m)) }); // a frame with a live connection
const pulse = (body, path = '/api/pulse') => call(k(path), { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
r = await pulse({ kind: 'tap', tap: 'love', from: '  بابا  ' });
data = await r.json();
assert.equal(r.status, 200);
assert.equal(data.pulse.from, 'بابا');
assert.equal(data.live, 1, 'delivered to the live frame');
assert.equal(frameGot[0].pulse.tap, 'love');
r = await pulse({ kind: 'tap', tap: 'love', from: 'بابا' });
assert.equal(r.status, 429, 'not twice in two seconds');
r = await pulse({ kind: 'tap', tap: 'fireworks', from: 'بابا' });
assert.equal(r.status, 400);
r = await pulse({ kind: 'tap', tap: 'night' });
assert.equal(r.status, 400, 'sender required');
r = await pulse({ kind: 'draw', from: 'ماما', strokes: [{ c: 9, w: 5, p: [10, 20, 0, 2000, -5, 40, 'x', 1, 2] }, { p: [] }, 'junk'] });
data = await r.json();
assert.deepEqual(data.pulse.strokes, [{ c: 5, w: 1, p: [10, 20, 0, 1000, 0, 40] }], 'drawing cleaned and clamped');
assert.deepEqual(frameGot[1].pulse.strokes, data.pulse.strokes, 'the live frame gets the drawing itself');
const drawId = data.pulse.id;
assert.equal(JSON.stringify(await env.PULSE.obj.ctx.storage.get('pulses')).includes('strokes'), false, 'drawings are stored apart from the list');
r = await pulse({ kind: 'draw', from: 'ماما', strokes: [] });
assert.equal(r.status, 400, 'empty drawing');
const voice = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3]);
r = await call(k('/api/pulse/voice?from=' + encodeURIComponent('جدة') + '&dur=6.27'), { method: 'POST', body: voice, headers: { 'content-type': 'audio/webm;codecs=opus' } });
data = await r.json();
assert.deepEqual(data.pulse.audio, { type: 'audio/webm', dur: 6.3 });
r = await call(k('/api/pulse/audio/' + data.pulse.id));
assert.equal(r.headers.get('content-type'), 'audio/webm');
assert.deepEqual(new Uint8Array(await r.arrayBuffer()), voice);
r = await call(k('/api/pulse/voice?from=x'), { method: 'POST', body: 'x', headers: { 'content-type': 'text/plain' } });
assert.equal(r.status, 415);
const loveId = frameGot[0].pulse.id;
data = await (await pulse({ to: loveId }, '/api/pulse/reply')).json();
assert.deepEqual([data.pulse.kind, data.pulse.from, data.pulse.toName, data.pulse.toKind], ['reply', 'البيت', 'بابا', 'tap']);
r = await pulse({ to: 'nope000' }, '/api/pulse/reply');
assert.equal(r.status, 404);
data = await (await call(k('/api/pulse?light=1'))).json();
assert.deepEqual(data.pulses.map((p) => p.kind), ['tap', 'draw', 'voice', 'reply']);
assert.equal(data.pulses[1].strokes, undefined, 'light list leaves drawings out');
assert.equal(data.pulses[1].points, 2);
assert.equal(data.live, 1);
let full = await (await call(k('/api/pulse'))).json();
assert.deepEqual(full.pulses.find((p) => p.id === drawId).strokes, [{ c: 5, w: 1, p: [10, 20, 0, 1000, 0, 40] }], 'the frame gets drawings back');
data = await (await call(k('/api/pulse?since=' + data.pulses[2].at))).json();
assert.deepEqual(data.pulses.map((p) => p.kind).filter((x) => x !== 'voice'), ['reply'], 'since: only newer ones');
assert.equal(frameGot.length, 4, 'the live frame got every one');
r = await call('/api/pulse');
assert.equal(r.status, 401, 'key required');
// a week later, old moments go, with their drawings and recordings
{
  const st = env.PULSE.obj.ctx.storage;
  const old = await st.get('pulses');
  await st.put('pulses', old.map((x) => Object.assign(x, { at: x.at - 8 * 86400000 })));
  await pulse({ kind: 'tap', tap: 'love', from: 'جدي' });
  assert.deepEqual((await st.get('pulses')).map((x) => x.from), ['جدي']);
  assert.deepEqual(st.keys().filter((x) => /^(draw|audio):/.test(x)), [], 'nothing left behind');
}
// a frame that only asks (no live socket) still counts as listening for 20 s; phones don't count
env.PULSE.sockets.clear();
env.PULSE.obj.lastPoll = 0; // (the test above asked like a frame)
data = await (await call(k('/api/pulse?light=1'))).json();
assert.equal(data.live, 0, 'a phone asking is not a frame');
await call(k('/api/pulse?since=' + Date.now()));
data = await (await call(k('/api/pulse?light=1'))).json();
assert.equal(data.live, 1, 'the frame asked just now');
data = await (await pulse({ kind: 'tap', tap: 'news', from: 'سلمى' })).json();
assert.equal(data.live, 1, 'it will pick it up within seconds');

// «نبضة» on the family's phones (Web Push)
{
  r = await call(k('/api/pulse/push'));
  assert.deepEqual(await r.json(), { enabled: false, publicKey: null, missing: ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY'] }, 'no keys: notifications off');
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
  const pushEnv = { VAPID_PUBLIC_KEY: b64u(new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey))), VAPID_PRIVATE_KEY: (await crypto.subtle.exportKey('jwk', kp.privateKey)).d };
  env.PULSE = fakeNamespace(PulseHub, { VAPID_PUBLIC_KEY: pushEnv.VAPID_PUBLIC_KEY });
  r = await call(k('/api/pulse/push'));
  assert.deepEqual((await r.json()).missing, ['VAPID_PRIVATE_KEY'], 'says which key is missing (by name only)');
  env.PULSE = fakeNamespace(PulseHub, pushEnv);
  const hub = env.PULSE.obj;
  const sent = [];
  let status = 201;
  pushDeps.fetch = async (url, init) => { sent.push({ url, headers: init.headers }); return new Response(null, { status: typeof status === 'function' ? status(url) : status }); };
  const phone = async (n) => {
    const ua = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    return { endpoint: 'https://fcm.googleapis.com/fcm/send/' + n, keys: { p256dh: b64u(new Uint8Array(await crypto.subtle.exportKey('raw', ua.publicKey))), auth: b64u(crypto.getRandomValues(new Uint8Array(16))) } };
  };
  const sub = (subscription, nm, notify) => call(k('/api/pulse/push/subscribe'), { method: 'POST', body: JSON.stringify({ subscription, name: nm, notify }), headers: { 'content-type': 'application/json' } });
  const mama = await phone('mama'), baba = await phone('baba'), jadda = await phone('jadda');
  assert.equal((await sub(mama, 'ماما')).status, 200);
  assert.equal((await sub(baba, 'بابا')).status, 200);
  assert.equal((await sub(jadda, 'جدتي', 'mine')).status, 200);
  r = await sub(mama, 'ماما'); // same phone again: replaced, not doubled
  assert.equal((await r.json()).phones, 3);
  assert.equal((await sub({ ...mama, endpoint: 'https://evil.example/x' }, 'ماما')).status, 400, 'only real push services');
  assert.equal((await sub(mama, '')).status, 400, 'name required');
  r = await call(k('/api/pulse/push'));
  data = await r.json();
  assert.equal(data.enabled, true);
  assert.deepEqual(data.missing, []);

  // A moment from ماما: بابا hears about it; ماما (the sender) and جدتي (hearts only) don't.
  data = await (await pulse({ kind: 'tap', tap: 'miss', from: 'ماما' })).json();
  await hub.pushing;
  assert.deepEqual(sent.map((x) => x.url.split('/').pop()), ['baba']);
  assert.ok(sent[0].headers.authorization.startsWith('vapid t='));
  assert.deepEqual(hub.message(data.pulse), { id: data.pulse.id, kind: 'tap', from: 'ماما', tag: 'pulse-' + data.pulse.id, url: '/admin#pulse', title: 'نبضة من ماما', body: '«اشتقت إليكم»', heart: true });

  // A heart back from the frame goes to ماما only, urgently.
  sent.length = 0;
  const reply = await (await pulse({ to: data.pulse.id }, '/api/pulse/reply')).json();
  await hub.pushing;
  assert.deepEqual(sent.map((x) => x.url.split('/').pop()), ['mama']);
  assert.equal(sent[0].headers.urgency, 'high');
  assert.equal(hub.message(reply.pulse).title, '❤ قلب من البيت');
  assert.equal(hub.message(reply.pulse).body, 'ردّاً على «اشتقت إليكم»');

  // A heart from a phone (the notification's ❤ button) carries the phone owner's name.
  sent.length = 0;
  const fromPhone = await (await pulse({ to: data.pulse.id, from: 'جدتي' }, '/api/pulse/reply')).json();
  await hub.pushing;
  assert.equal(fromPhone.pulse.from, 'جدتي');
  assert.deepEqual(sent.map((x) => x.url.split('/').pop()), ['mama']);
  assert.equal((await pulse({ to: fromPhone.pulse.id }, '/api/pulse/reply')).status, 404, 'no hearts for hearts');

  // جدتي asked for her own hearts only, and gets them; a phone that's gone (410) is forgotten.
  sent.length = 0;
  status = (url) => (url.endsWith('/baba') ? 410 : 201);
  const draw = await (await pulse({ kind: 'draw', from: 'جدتي', strokes: [{ c: 1, w: 1, p: [1, 1, 0] }] })).json();
  await hub.pushing;
  assert.deepEqual(sent.map((x) => x.url.split('/').pop()).sort(), ['baba', 'mama']);
  assert.equal(hub.message(draw.pulse).body, 'رسمة جديدة على الإطار');
  assert.deepEqual((await hub.subs()).map((x) => x.name).sort(), ['جدتي', 'ماما'], 'gone phone removed');
  status = 201;
  sent.length = 0;
  await (await pulse({ to: draw.pulse.id }, '/api/pulse/reply')).json();
  await hub.pushing;
  assert.deepEqual(sent.map((x) => x.url.split('/').pop()), ['jadda'], 'hearts-only phone gets its heart');

  // Test button and switching off.
  r = await call(k('/api/pulse/push/test'), { method: 'POST', body: JSON.stringify({ endpoint: mama.endpoint }), headers: { 'content-type': 'application/json' } });
  assert.deepEqual(await r.json(), { ok: true, status: 201 });
  pushDeps.fetch = async () => { throw new Error('offline'); };
  r = await call(k('/api/pulse/push/test'), { method: 'POST', body: JSON.stringify({ endpoint: mama.endpoint }), headers: { 'content-type': 'application/json' } });
  assert.equal(r.status, 200, 'an unreachable push service is reported, not a crash');
  assert.equal((await r.json()).ok, false);
  data = await (await pulse({ kind: 'tap', tap: 'news', from: 'بابا' })).json();
  await hub.pushing;
  assert.ok(data.pulse, 'moments still go through when pushes fail');
  await call(k('/api/pulse/push/unsubscribe'), { method: 'POST', body: JSON.stringify({ endpoint: mama.endpoint }), headers: { 'content-type': 'application/json' } });
  assert.deepEqual((await hub.subs()).map((x) => x.name), ['جدتي']);
  pushDeps.fetch = (...a) => fetch(...a);
}

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
