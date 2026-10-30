// «مؤقّت»: timers that ring on the frame, started from the frame or a phone (server side + rules).
import assert from 'node:assert/strict';
import { PulseHub, pushDeps } from '../src/pulse-hub.js';
import { timerOp, cleanTimers, fmtTimer } from '../public/js/timers-common.js';
import { b64u } from '../src/webpush.js';
import { fakeNamespace } from './fake-do.mjs';

const realNow = Date.now;
let shift = 0;
Date.now = () => realNow() + shift;
const MIN = 60000;

// ---------- the rules ----------
const t0 = 1_800_000_000_000;
let r = timerOp([], { op: 'add', minutes: 10, label: 'أتاي', by: 'ماما' }, t0);
assert.equal(r.list.length, 1);
assert.equal(r.list[0].end, t0 + 10 * MIN);
assert.equal(r.list[0].by, 'ماما');
assert.ok(timerOp([], { op: 'add', minutes: 0 }, t0).error, 'at least a minute');
assert.ok(timerOp([], { op: 'add', minutes: 300 }, t0).error, 'at most 4 hours');
let l = r.list;
for (let i = 0; i < 5; i++) l = timerOp(l, { op: 'add', minutes: 1 }, t0).list;
assert.equal(l.length, 6);
assert.ok(timerOp(l, { op: 'add', minutes: 1 }, t0).error, 'six at most');
const id = r.list[0].id;
l = timerOp(r.list, { op: 'pause', id }, t0 + MIN).list;
assert.equal(l[0].end, 0);
assert.equal(l[0].left, 9 * MIN);
l = timerOp(l, { op: 'resume', id }, t0 + 5 * MIN).list;
assert.equal(l[0].end, t0 + 14 * MIN, 'the paused time is not counted');
l = timerOp(l, { op: 'more', id, minutes: 1 }, t0 + 5 * MIN).list;
assert.equal(l[0].end, t0 + 15 * MIN);
// It rings: snooze, then stop.
l = timerOp(l, { op: 'snooze', minutes: 5, ids: [id] }, t0 + 16 * MIN).list;
assert.equal(l[0].end, t0 + 21 * MIN);
assert.equal(l[0].snoozed, true);
assert.equal(timerOp(l, { op: 'stop' }, t0 + 20 * MIN).list.length, 1, 'stop only silences what rings');
assert.equal(timerOp(l, { op: 'stop' }, t0 + 22 * MIN).list.length, 0);
assert.equal(timerOp(l, { op: 'cancel', id }, t0).list.length, 0);
assert.equal(cleanTimers(l, t0 + 60 * MIN).length, 0, 'a ring nobody stopped is forgotten after 30 minutes');
assert.equal(fmtTimer(65000), '1:05');
assert.equal(fmtTimer(3725000), '1:02:05');

// ---------- the server ----------
const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
const env = { VAPID_PUBLIC_KEY: b64u(new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey))), VAPID_PRIVATE_KEY: (await crypto.subtle.exportKey('jwk', kp.privateKey)).d };
const ns = fakeNamespace(PulseHub, env);
const hub = ns.obj;
hub.ctx.storage.setAlarm = async (t) => { hub.alarmAt = t; };
hub.ctx.storage.getAlarm = async () => hub.alarmAt || null;
pushDeps.fetch = async () => new Response(null, { status: 201 });
const pushed = [];
const orig = hub.pushTo.bind(hub);
hub.pushTo = async (to, message, urgency) => { pushed.push({ to: to.map((s) => s.name), message, urgency }); return orig(to, message, urgency); };
const call = (path, method = 'GET', body) => hub.fetch(new Request('https://frame.test' + path, body === undefined ? { method } : { method, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }));
const sock = { got: [], send(m) { this.got.push(JSON.parse(m)); } };
ns.sockets.add(sock);
for (const who of ['ماما', 'بابا']) {
  const ua = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  await call('/api/pulse/push/subscribe', 'POST', { subscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/' + encodeURIComponent(who), keys: { p256dh: b64u(new Uint8Array(await crypto.subtle.exportKey('raw', ua.publicKey))), auth: b64u(crypto.getRandomValues(new Uint8Array(16))) } }, name: who, notify: 'all' });
}

r = await call('/api/pulse/timers', 'POST', { op: 'add', minutes: 5, label: 'الفرن', by: 'ماما' });
assert.equal(r.status, 200);
let data = await r.json();
assert.equal(data.timers.length, 1);
assert.ok(data.now > 0, 'the server clock comes along');
const tid = data.timers[0].id;
assert.equal(sock.got.at(-1).type, 'timers', 'the frame hears at once');
assert.equal(sock.got.at(-1).timers[0].id, tid);
assert.equal(hub.alarmAt, data.timers[0].end, 'an alarm for when it rings');
r = await call('/api/pulse/timers', 'POST', { op: 'add', minutes: 3 }); // from the frame: no name
data = await r.json();
assert.equal(data.timers.length, 2);
assert.equal((await (await call('/api/pulse/timers')).json()).timers.length, 2);
assert.equal((await call('/api/pulse/timers', 'POST', { op: 'nope' })).status, 400);

// Both ring: only the phone that started one is told, once.
shift += 6 * MIN;
await hub.alarm();
assert.equal(pushed.length, 1);
assert.deepEqual(pushed[0].to, ['ماما']);
assert.match(pushed[0].message.body, /الفرن/);
assert.equal(pushed[0].urgency, 'high');
await hub.alarm();
assert.equal(pushed.length, 1, 'not twice');
// Snoozed from the phone: rings again later, and tells again.
r = await call('/api/pulse/timers', 'POST', { op: 'snooze', minutes: 1, ids: [tid] });
data = await r.json();
assert.equal(data.timers.find((x) => x.id === tid).snoozed, true);
shift += 2 * MIN;
await hub.alarm();
assert.equal(pushed.length, 2, 'the snoozed one tells again');
// Stopped on the frame.
r = await call('/api/pulse/timers', 'POST', { op: 'stop' });
assert.equal((await r.json()).timers.length, 0);
assert.equal(sock.got.at(-1).timers.length, 0);

Date.now = realNow;
console.log('timers: all tests passed');
