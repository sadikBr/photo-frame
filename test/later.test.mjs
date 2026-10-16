// Surprises for later, real heartbeats, statuses and zellige colouring (server side).
import assert from 'node:assert/strict';
import { PulseHub, pushDeps, cleanBeat } from '../src/pulse-hub.js';
import { tileCount, PATTERN_COUNT, weekIndex, pattern } from '../public/js/zellige.js';
import { b64u } from '../src/webpush.js';
import { fakeNamespace } from './fake-do.mjs';

// Our own clock, to jump ahead.
const realNow = Date.now;
let shift = 0;
Date.now = () => realNow() + shift;

const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
const env = { VAPID_PUBLIC_KEY: b64u(new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey))), VAPID_PRIVATE_KEY: (await crypto.subtle.exportKey('jwk', kp.privateKey)).d };
const ns = fakeNamespace(PulseHub, env);
const hub = ns.obj;
hub.ctx.storage.setAlarm = async (t) => { hub.alarmAt = t; };
hub.ctx.storage.getAlarm = async () => hub.alarmAt || null;
pushDeps.fetch = async () => new Response(null, { status: 201 });
const pushed = [];
const orig = hub.pushTo.bind(hub);
hub.pushTo = async (to, message, urgency) => { pushed.push({ to: to.map((s) => s.name), message }); return orig(to, message, urgency); };
const call = (path, method = 'GET', body) => hub.fetch(new Request('https://frame.test' + path, body === undefined ? { method } : { method, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }));
const sock = { got: [], send(m) { this.got.push(JSON.parse(m)); } };
ns.sockets.add(sock);
const ua = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
await call('/api/pulse/push/subscribe', 'POST', { subscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/baba', keys: { p256dh: b64u(new Uint8Array(await crypto.subtle.exportKey('raw', ua.publicKey))), auth: b64u(crypto.getRandomValues(new Uint8Array(16))) } }, name: 'بابا', notify: 'all' });
const pulses = async () => (await (await call('/api/pulse?light=1')).json()).pulses;

// ---------- a surprise for tomorrow morning ----------
const at = Date.now() + 9 * 3600000;
let r = await call('/api/pulse', 'POST', { kind: 'tap', tap: 'news', from: 'ماما', at });
assert.equal(r.status, 200);
const s1 = (await r.json()).later;
assert.equal(s1.due, at);
assert.equal(s1.sched, true);
assert.equal(hub.alarmAt, at, 'the alarm is set for it');
assert.equal((await pulses()).length, 0, 'nobody sees it before');
assert.equal(sock.got.length, 0, 'the frame is not told');
assert.equal(pushed.length, 0, 'no notification yet');
// A drawing for later too, and one to cancel.
r = await call('/api/pulse', 'POST', { kind: 'draw', from: 'ماما', strokes: [{ c: 1, w: 1, p: [10, 10, 0, 500, 500, 300] }], at: at + 60000 });
const s2 = (await r.json()).later;
r = await call('/api/pulse', 'POST', { kind: 'tap', tap: 'love', from: 'ماما', at: at + 120000 });
const s3 = (await r.json()).later;
r = await call('/api/pulse/later?from=' + encodeURIComponent('ماما'));
let mine = (await r.json()).later;
assert.deepEqual(mine.map((x) => x.id), [s1.id, s2.id, s3.id], 'in order');
assert.equal(mine[1].strokes, undefined, 'the list is light');
assert.equal((await (await call('/api/pulse/later?from=' + encodeURIComponent('بابا'))).json()).later.length, 0, 'only your own');
assert.equal((await call('/api/pulse/later/cancel', 'POST', { id: s3.id, from: 'بابا' })).status, 403, 'only whoever wrote it cancels it');
assert.equal((await call('/api/pulse/later/cancel', 'POST', { id: s3.id, from: 'ماما' })).status, 200);
assert.equal((await call('/api/pulse', 'POST', { kind: 'tap', tap: 'love', from: 'ماما', at: Date.now() + 90 * 86400000 })).status, 400, 'not further than two months');
// A time in the past or right now: sent at once.
r = await call('/api/pulse', 'POST', { kind: 'tap', tap: 'love', from: 'سلمى', at: Date.now() - 5000 });
assert.ok((await r.json()).pulse, 'sent now');
sock.got.length = 0;
pushed.length = 0;
// The morning comes: the alarm sends the first one.
shift = 9 * 3600000 + 500;
hub.alarmAt = null;
await hub.alarm();
await hub.pushing;
let list = await pulses();
const out1 = list.find((x) => x.id === s1.id);
assert.ok(out1, 'sent');
assert.equal(out1.sched, true);
assert.ok(out1.sentAt < out1.at, 'remembers when it was written');
assert.equal(sock.got.filter((m) => m.type === 'pulse').length, 1, 'the frame gets it live');
assert.equal(pushed[0].message.title, '🎁 مفاجأة من ماما');
assert.equal(hub.alarmAt, at + 60000, 'next: the drawing');
// The frame asks a minute later: the drawing goes out, with its lines.
shift += 61000;
r = await call('/api/pulse?since=0');
list = (await r.json()).pulses;
const d = list.find((x) => x.id === s2.id);
assert.ok(d && d.strokes && d.strokes.length === 1, 'the drawing arrives with its lines');
assert.equal(list.some((x) => x.id === s3.id), false, 'the cancelled one never comes');
assert.equal((await (await call('/api/pulse/later?from=' + encodeURIComponent('ماما'))).json()).later.length, 0);
// A voice note for later.
r = await hub.fetch(new Request('https://frame.test/api/pulse/voice?from=' + encodeURIComponent('بابا') + '&dur=3&at=' + (Date.now() + 3600000), { method: 'POST', body: new Uint8Array([1, 2, 3]), headers: { 'content-type': 'audio/webm' } }));
const v = (await r.json()).later;
assert.equal(v.kind, 'voice');
assert.ok(await hub.ctx.storage.get('audio:' + v.id), 'the recording waits too');

// ---------- a real heartbeat ----------
assert.equal(cleanBeat({ bpm: 20 }), null);
assert.deepEqual(cleanBeat({ bpm: 72, intervals: [830, 840, 50, 820] }).intervals, [830, 840, 820]);
assert.equal(cleanBeat({ bpm: 75 }).intervals.length, 8, 'no beats given: even ones');
pushed.length = 0;
r = await call('/api/pulse', 'POST', { kind: 'beat', from: 'ماما', bpm: 72, intervals: [820, 840, 830, 835] });
assert.equal(r.status, 200);
const beat = (await r.json()).pulse;
assert.equal(beat.bpm, 72);
await hub.pushing;
assert.equal(pushed[0].message.title, '💓 نبضة قلب من ماما');
assert.equal(pushed[0].message.body, '72 نبضة في الدقيقة · قلبٌ ينبض لكم');
assert.equal((await call('/api/pulse', 'POST', { kind: 'beat', from: 'ماما', bpm: 400 })).status, 400);
r = await call('/api/pulse/reply', 'POST', { to: beat.id });
assert.equal(r.status, 200, 'a heart back to a heartbeat');

// ---------- statuses ----------
sock.got.length = 0;
r = await call('/api/pulse/status', 'PUT', { from: 'سلمى', text: 'في الامتحان', emoji: '📚', until: Date.now() + 2 * 3600000 });
assert.equal(r.status, 200);
assert.equal((await r.json()).statuses[0].text, 'في الامتحان');
assert.equal(sock.got.pop().type, 'status', 'the frame hears at once');
shift += 5;
await call('/api/pulse/status', 'PUT', { from: 'بابا', text: 'في الخدمة', emoji: '💼', until: Date.now() + 60 * 60000 });
r = await call('/api/pulse/status');
assert.deepEqual((await r.json()).statuses.map((x) => x.name), ['بابا', 'سلمى'], 'newest first');
assert.equal((await call('/api/pulse/status', 'PUT', { from: 'بابا', text: '', until: Date.now() + 3600000 })).status, 400);
assert.equal((await call('/api/pulse/status', 'PUT', { from: 'بابا', text: 'x', until: Date.now() + 30 * 86400000 })).status, 400, 'up to a week');
assert.equal((await call('/api/pulse/status', 'PUT', { text: 'x', until: Date.now() + 3600000 })).status, 400, 'needs a name');
shift += 61 * 60000;
assert.deepEqual((await (await call('/api/pulse/status')).json()).statuses.map((x) => x.name), ['سلمى'], 'it ends by itself');
r = await call('/api/pulse/status/clear', 'POST', { from: 'سلمى' });
assert.deepEqual((await r.json()).statuses, []);

// ---------- zellige colouring ----------
for (let p = 0; p < PATTERN_COUNT; p++) {
  const pat = pattern(p);
  assert.ok(pat.tiles.length >= 80 && pat.tiles.length <= 130, pat.name + ': ' + pat.tiles.length + ' tiles');
  for (const t of pat.tiles) {
    assert.ok(t.length >= 6 && t.length % 2 === 0);
    assert.ok(t.every((x) => x >= -1 && x <= 1001), 'inside the page');
  }
}
assert.equal(weekIndex(Date.UTC(2026, 9, 19, 0, 0)) - weekIndex(Date.UTC(2026, 9, 18, 23, 59)), 1, 'a new week on Monday');
r = await call('/api/pulse/coloring');
let c = await r.json();
const pid = c.page.pid;
assert.equal(c.tiles, tileCount(pid));
assert.deepEqual(c.page.fills, {});
sock.got.length = 0;
r = await call('/api/pulse/coloring/fill', 'POST', { tile: 3, color: 2, from: 'يوسف' });
assert.equal(r.status, 200);
let m = sock.got.pop();
assert.equal(m.type, 'color');
assert.equal(m.tile, 3);
assert.equal(m.from, 'يوسف');
assert.equal((await call('/api/pulse/coloring/fill', 'POST', { tile: 9999, color: 2 })).status, 400);
assert.equal((await call('/api/pulse/coloring/fill', 'POST', { tile: 1, color: 12 })).status, 400);
await call('/api/pulse/coloring/fill', 'POST', { tile: 3, color: -1, from: 'يوسف' });
c = await (await call('/api/pulse/coloring')).json();
assert.deepEqual(c.page.fills, {}, 'the eraser');
// Colour everything: done.
for (let i = 0; i < c.tiles; i++) await call('/api/pulse/coloring/fill', 'POST', { tile: i, color: i % 10, from: i % 2 ? 'سلمى' : 'جدتي' });
c = await (await call('/api/pulse/coloring')).json();
assert.ok(c.page.doneAt, 'finished');
assert.equal(c.page.who['سلمى'] + c.page.who['جدتي'], c.tiles + 0);
// The frame saves it as a photo, then a new page.
r = await call('/api/pulse/coloring/saved', 'POST', { which: 'current' });
assert.ok((await r.json()).page.savedAt);
r = await call('/api/pulse/coloring/new', 'POST', { from: 'سلمى' });
c = await r.json();
assert.equal(c.page.pid, (pid + 1) % PATTERN_COUNT);
assert.deepEqual(c.archive, [], 'already saved: nothing waits');
// Half a page, then a new week: it waits in the archive for the frame to save.
for (let i = 0; i < Math.ceil(c.tiles / 2); i++) await call('/api/pulse/coloring/fill', 'POST', { tile: i, color: 1, from: 'سلمى' });
shift += 8 * 86400000;
c = await (await call('/api/pulse/coloring')).json();
assert.equal(c.archive.length, 1, 'the half-coloured page is kept to be saved');
assert.deepEqual(c.page.fills, {}, 'a fresh page for the new week');
r = await call('/api/pulse/coloring/saved', 'POST', { which: c.archive[0].id });
assert.deepEqual((await r.json()).archive, []);

Date.now = realNow;
console.log('later/beat/status/colouring: all tests passed');
