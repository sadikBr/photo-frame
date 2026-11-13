// The secret knock, the wheel and match mode (server side).
import assert from 'node:assert/strict';
import { PulseHub, pushDeps, matchDeps, cleanRhythm, knockWords, knockVibration, cleanWheels } from '../src/pulse-hub.js';
import { parseScoreboard, pickMatch, matchChanges, changeMessage, scoreboardUrl, scoreboardUrls, previewMatch, nameAr, channelsFrom, tvFor } from '../src/match.js';
import { b64u } from '../src/webpush.js';
import { fakeNamespace } from './fake-do.mjs';

// ---------- knocks: rhythm cleaning ----------
assert.deepEqual(cleanRhythm([1000, 1200, 1230, 1900]), [0, 200, 900], 'starts at 0; taps 30 ms apart are one');
assert.equal(cleanRhythm([]), null);
assert.equal(cleanRhythm('x'), null);
assert.equal(cleanRhythm(Array.from({ length: 30 }, (_, i) => i * 100)).length, 16, 'at most 16 taps');
assert.deepEqual(cleanRhythm([0, 5000, 9000]), [0, 5000], 'within 8 seconds');
assert.equal(knockWords([0, 200, 900, 1100]), 'طق طق … طق طق');
assert.deepEqual(knockVibration([0, 200, 900]), [70, 130, 70, 630, 70]);

// ---------- wheels: cleaning ----------
const cw = cleanWheels([
  { name: '  من يغسل الصحون؟ ', items: ['سارة', 'يوسف', 'سارة', ' '] },
  { name: 'واحد فقط', items: ['x'] },
  { id: 'BAD ID', name: 'x'.repeat(60), items: Array.from({ length: 20 }, (_, i) => 'خيار ' + i) },
]);
assert.equal(cw.length, 2, 'a wheel needs two choices');
assert.deepEqual(cw[0].items, ['سارة', 'يوسف'], 'no repeats, no blanks');
assert.equal(cw[1].name.length, 40);
assert.equal(cw[1].items.length, 12);
assert.match(cw[1].id, /^[a-z0-9]{4,24}$/);
assert.match(cw[0].id, /^[a-z0-9]{4,24}$/, 'a new wheel gets an id');
assert.notEqual(cw[0].id, cw[1].id);

// ---------- a hub with phones that get notifications ----------
const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
const env = { VAPID_PUBLIC_KEY: b64u(new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey))), VAPID_PRIVATE_KEY: (await crypto.subtle.exportKey('jwk', kp.privateKey)).d, UTC_OFFSET_MINUTES: '0' };
const ns = fakeNamespace(PulseHub, env);
const hub = ns.obj;
const alarms = [];
hub.ctx.storage.setAlarm = async (t) => { alarms.push(t); hub.alarmAt = t; };
hub.ctx.storage.getAlarm = async () => hub.alarmAt || null;
const fireAlarm = async () => { hub.alarmAt = null; await hub.alarm(); }; // (a fired alarm is gone)
const sent = []; // [endpoint, decrypted? no: we record the message via message wrapper]
pushDeps.fetch = async (url) => { sent.push(url); return new Response(null, { status: 201 }); };
const pushed = [];
const origPushTo = hub.pushTo.bind(hub);
hub.pushTo = async (to, message, urgency) => { pushed.push({ to: to.map((s) => s.name), message, urgency }); return origPushTo(to, message, urgency); };

const call = (path, method = 'GET', body) => hub.fetch(new Request('https://frame.test' + path, body === undefined ? { method } : { method, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }));
const phone = async (n) => {
  const ua = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  return { endpoint: 'https://fcm.googleapis.com/fcm/send/' + n, keys: { p256dh: b64u(new Uint8Array(await crypto.subtle.exportKey('raw', ua.publicKey))), auth: b64u(crypto.getRandomValues(new Uint8Array(16))) } };
};
for (const [n, who, notify] of [['mama', 'ماما', 'all'], ['baba', 'بابا', 'all'], ['jadda', 'جدتي', 'mine']]) {
  const r = await call('/api/pulse/push/subscribe', 'POST', { subscription: await phone(n), name: who, notify });
  assert.equal(r.status, 200);
}
let r = await call('/api/pulse/phones');
assert.deepEqual((await r.json()).names, ['ماما', 'بابا', 'جدتي']);

// ---------- knocks ----------
// From a phone: the frame plays it; the other phones that want everything hear about it.
r = await call('/api/pulse', 'POST', { kind: 'knock', from: 'ماما', rhythm: [0, 180, 360, 900] });
assert.equal(r.status, 200);
let k = (await r.json()).pulse;
assert.deepEqual(k.rhythm, [0, 180, 360, 900]);
await hub.pushing;
let last = pushed.pop();
assert.deepEqual(last.to, ['بابا']);
assert.equal(last.message.title, '🚪 دقّة من ماما');
assert.equal(last.message.body, 'على باب البيت · طق طق طق … طق');
assert.deepEqual(last.message.vibrate, [70, 110, 70, 110, 70, 470, 70]);
assert.equal(last.message.heart, true);
assert.equal(last.urgency, 'high');
// From the frame to one person: only that phone, even if it only wants hearts.
r = await call('/api/pulse', 'POST', { kind: 'knock', rhythm: [0, 300], to: 'جدتي' });
k = (await r.json()).pulse;
assert.equal(k.from, 'البيت');
assert.equal(k.toName, 'جدتي');
await hub.pushing;
last = pushed.pop();
assert.deepEqual(last.to, ['جدتي']);
assert.equal(last.message.title, '🚪 دقّة من البيت');
assert.equal(last.message.heart, false);
assert.match(last.message.url, /^\/admin\?play=[a-z0-9]+#fun$/);
// From the frame to everyone.
await new Promise((ok) => setTimeout(ok, 2100)); // (same sender and kind within 2 s is refused)
r = await call('/api/pulse', 'POST', { kind: 'knock', rhythm: [0, 300, 600] });
assert.equal(r.status, 200);
await hub.pushing;
assert.deepEqual(pushed.pop().to, ['ماما', 'بابا', 'جدتي']);
r = await call('/api/pulse', 'POST', { kind: 'knock', from: 'بابا', rhythm: [] });
assert.equal(r.status, 400, 'an empty knock');
// A heart back to a knock names it.
r = await call('/api/pulse/reply', 'POST', { to: (await (await call('/api/pulse?light=1')).json()).pulses.find((x) => x.from === 'ماما').id });
await hub.pushing;
last = pushed.pop();
assert.deepEqual(last.to, ['ماما']);
assert.equal(last.message.body, 'ردّاً على دقّتك');

// ---------- wheels ----------
r = await call('/api/pulse/wheels');
assert.deepEqual((await r.json()).wheels, [], 'none at first');
const sock = { got: [], send(m) { this.got.push(JSON.parse(m)); } };
ns.sockets.add(sock);
r = await call('/api/pulse/wheels', 'PUT', { wheels: [{ name: 'من يغسل الصحون؟', items: ['سارة', 'يوسف', 'ماما'] }] });
const wheels = (await r.json()).wheels;
assert.equal(wheels.length, 1);
assert.match(wheels[0].id, /^[a-z0-9]{4,24}$/);
assert.equal(sock.got.pop().type, 'wheels', 'the frame hears about new wheels at once');
r = await call('/api/pulse/spin', 'POST', { wheel: wheels[0].id, from: 'بابا' });
assert.equal(r.status, 200);
const spin = (await r.json()).pulse;
assert.equal(spin.kind, 'spin');
assert.ok(spin.idx >= 0 && spin.idx < 3);
assert.equal(spin.result, spin.items[spin.idx]);
assert.deepEqual(spin.items, ['سارة', 'يوسف', 'ماما'], 'the wheel as it was, for drawing it');
assert.equal(sock.got.pop().pulse.id, spin.id, 'the frame gets the spin live');
await hub.pushing;
last = pushed.pop();
assert.deepEqual(last.to, ['ماما']);
assert.equal(last.message.title, '🎡 من يغسل الصحون؟');
assert.equal(last.message.body, 'النتيجة: ' + spin.result + ' · من بابا');
r = await call('/api/pulse/spin', 'POST', { wheel: 'nope' });
assert.equal(r.status, 404);
// Fair enough: every choice comes up.
const counts = {};
for (let i = 0; i < 60; i++) {
  hub.ctx.storage.put('pulses', []);
  const j = await (await call('/api/pulse/spin', 'POST', { wheel: wheels[0].id, from: 'x' + i })).json();
  counts[j.pulse.result] = (counts[j.pulse.result] || 0) + 1;
}
assert.equal(Object.keys(counts).length, 3);

// ---------- match mode: reading ESPN ----------
const T0 = Date.parse('2026-11-14T20:00:00Z');
function espnEvent({ id = '401999001', date = T0, state = 'pre', name = 'STATUS_SCHEDULED', clock = "0'", period = 0, mar = 0, opp = 0, details = [], oppName = 'Mali', home = true }) {
  return {
    id, date: new Date(date).toISOString().replace(':00.000Z', 'Z'), name: oppName + ' at Morocco',
    competitions: [{
      status: { clock: 0, displayClock: clock, period, type: { name, state, completed: state === 'post', detail: '', shortDetail: '' } },
      competitors: [
        { id: '2869', homeAway: home ? 'home' : 'away', score: String(mar), team: { id: '2869', abbreviation: 'MAR', displayName: 'Morocco', logo: 'https://a.espncdn.com/i/teamlogos/countries/500/mar.png' } },
        { id: '4470', homeAway: home ? 'away' : 'home', score: String(opp), team: { id: '4470', abbreviation: 'MLI', displayName: oppName, logo: 'https://evil.example/x.png' } },
      ],
      details,
    }],
  };
}
const goal = (team, min, who, extra = {}) => Object.assign({ type: { id: '70', text: 'Goal' }, clock: { value: 0, displayValue: min }, team: { id: team }, scoringPlay: true, athletesInvolved: [{ displayName: who, shortName: who }] }, extra);
let parsed = parseScoreboard({ events: [espnEvent({}), { id: 'x', competitions: [{ competitors: [{ team: { id: '1' } }, { team: { id: '2' } }] }] }] }, 'fifa.friendly');
assert.equal(parsed.length, 1, 'only Morocco');
assert.equal(parsed[0].opp.name, 'مالي');
assert.equal(parsed[0].opp.logo, '', 'pictures only from ESPN');
assert.equal(parsed[0].mar.logo, 'https://a.espncdn.com/i/teamlogos/countries/500/mar.png');
assert.equal(parsed[0].comp, 'مباراة ودية');
assert.equal(parsed[0].kickoff, T0);
assert.equal(nameAr('Atlantis'), 'Atlantis');
parsed = parseScoreboard({ events: [espnEvent({ state: 'in', name: 'STATUS_SECOND_HALF', clock: "67'", period: 2, mar: 2, opp: 1, details: [goal('2869', "12'", 'B. Díaz'), goal('4470', "40'", 'X'), goal('2869', "61'", 'Y. En-Nesyri', { penaltyKick: true }), { type: { text: 'Yellow Card' }, team: { id: '4470' } }] })] }, 'caf.nations');
assert.equal(parsed[0].phase, 'الشوط الثاني');
assert.equal(parsed[0].clock, "67'");
assert.deepEqual(parsed[0].goals.map((g) => g.side + g.min), ["mar12'", "opp40'", "mar61'"], 'goals only, in order');
assert.equal(parsed[0].goals[2].pen, true);
assert.match(scoreboardUrl('fifa.friendly', T0), /\/soccer\/fifa\.friendly\/scoreboard\?dates=20261114&limit=100$/);
assert.deepEqual(scoreboardUrls('fifa.friendly', T0 - 86400000, T0 + 86400000).map((u) => /dates=(\d+)&/.exec(u)[1]), ['20261113', '20261114', '20261115'], 'one request per day (ESPN refuses ranges)');
assert.equal(scoreboardUrls('x', T0 - 6 * 3600000, T0).length, 1, 'an evening kick-off: one day');
// Where to watch
const m0 = () => parseScoreboard({ events: [espnEvent({})] }, 'fifa.friendly')[0];
const withTv = (comp) => { const e = espnEvent({}); Object.assign(e.competitions[0], comp); return e; };
assert.deepEqual(channelsFrom(espnEvent({})), [], 'nothing listed (like Morocco–Niger, 13 Nov 2026)');
assert.deepEqual(channelsFrom(withTv({ broadcasts: [{ market: 'national', names: ['ESPN+', 'beIN SPORTS'] }], geoBroadcasts: [{ media: { shortName: 'Fox Sports' }, region: 'us' }] })),
  ['beIN SPORTS'], 'American channels left out, beIN kept');
assert.deepEqual(channelsFrom(withTv({ geoBroadcasts: [{ media: { shortName: 'Arryadia TNT' }, region: 'ma' }, { media: { shortName: 'Al Aoula' }, region: 'ma' }, { media: { shortName: 'SSC 1' }, region: 'mena' }, { media: { shortName: 'ESPN' }, region: 'us' }] })),
  ['الرياضية', 'الأولى', 'SSC 1'], 'channels for other regions kept, SNRT names in Arabic');
assert.deepEqual(channelsFrom(withTv({ broadcast: 'beIN Sports 1, ESPN+' })), ['beIN Sports 1']);
let tvM = parseScoreboard({ events: [withTv({ geoBroadcasts: [{ media: { shortName: 'beIN Sports 2' }, region: 'mena' }] })] }, 'caf.nations')[0];
assert.deepEqual(tvM.tv, ['beIN Sports 2']);
assert.deepEqual(tvFor(tvM, {}), { names: ['beIN Sports 2'], src: 'api' });
assert.deepEqual(tvFor(m0(), {}), { names: ['الرياضية', 'الأولى'], src: 'default' }, 'SNRT when ESPN lists nothing');
assert.deepEqual(tvFor(tvM, { tv: { id: tvM.id, text: 'الرياضية 3' } }), { names: ['الرياضية 3'], src: 'manual' }, 'typed beats ESPN');
assert.equal(tvFor(tvM, { tv: { id: 'other', text: 'X' } }).src, 'api', 'typed for another match: ignored');
assert.equal(tvFor(previewMatch(0, 1000), {}), null);
// Which one matters
const m = (o) => parseScoreboard({ events: [espnEvent(o)] }, 'fifa.friendly')[0];
assert.equal(pickMatch([m({ id: 'a', date: T0 + 30 * 3600000 }), m({ id: 'b', date: T0 + 3600000 })], T0).id, 'b', 'the next one');
assert.equal(pickMatch([m({ id: 'a', date: T0 + 3600000 }), m({ id: 'b', state: 'in', name: 'STATUS_FIRST_HALF' })], T0).id, 'b', 'the one being played');
assert.equal(pickMatch([m({ id: 'a', date: T0 + 3 * 3600000 }), m({ id: 'b', state: 'post', name: 'STATUS_FULL_TIME', date: T0 - 2 * 3600000 })], T0).id, 'b', 'just finished, next one far off');
assert.equal(pickMatch([m({ id: 'a', date: T0 + 5 * 86400000 })], T0), null, 'nothing within two days');
// What changed
const a0 = m({ id: 'z', state: 'pre' }), a1 = m({ id: 'z', state: 'in', name: 'STATUS_FIRST_HALF', mar: 1, details: [goal('2869', "9'", 'Hakimi')] });
assert.deepEqual(matchChanges(a0, a1), [{ type: 'start' }, { type: 'goal', side: 'mar' }]);
assert.deepEqual(matchChanges(a1, m({ id: 'z', state: 'post', name: 'STATUS_FULL_TIME', mar: 1, opp: 1 })), [{ type: 'goal', side: 'opp' }, { type: 'end' }]);
assert.deepEqual(changeMessage(a1, { type: 'goal', side: 'mar' }), { tag: 'match-z', url: '/admin#fun', heart: false, kind: 'match', title: '⚽ هدف للمغرب!', body: 'المغرب 1 – 0 مالي · د 9 Hakimi' });
assert.equal(changeMessage(m({ id: 'z', state: 'post', name: 'STATUS_FULL_TIME', mar: 2, opp: 0 }), { type: 'end' }).title, '🎉 فاز المغرب!');
// The practice match
assert.equal(previewMatch(0, 10000).mar.score, 0);
assert.equal(previewMatch(0, 25000).mar.score, 1);
assert.equal(previewMatch(0, 75000).opp.score, 1);
assert.equal(previewMatch(0, 150000).state, 'post');

// ---------- match mode: the hub ----------
let now = T0 - 5 * 3600000; // 15:00, match at 20:00 (Morocco = GMT)
matchDeps.now = () => now;
let espn = { 'fifa.friendly': [espnEvent({})] }; // what ESPN says per league
const asked = [];
matchDeps.fetch = async (url) => {
  asked.push(url);
  const slug = /soccer\/([^/]+)\/scoreboard/.exec(url)[1];
  if (slug === 'fifa.arab') return new Response('nope', { status: 404 });
  if (/dates=\d+-\d+/.test(url)) return new Response('{"code":400}', { status: 400 }); // like ESPN since Nov 2026
  return new Response(JSON.stringify({ events: espn[slug] || [] }));
};
r = await call('/api/pulse/match');
let v = await r.json();
assert.equal(v.mode, 'today');
assert.equal(v.match.opp.name, 'مالي');
assert.equal(asked.length, 6 * 4, 'one look per competition and day');
assert.deepEqual(v.tv, { names: ['الرياضية', 'الأولى'], src: 'default' }, 'the frame is told where to watch');
r = await call('/api/pulse/match', 'PUT', { tv: { id: v.match.id, text: '  beIN   Sports 1 ' } });
assert.deepEqual((await r.json()).tv, { names: ['beIN Sports 1'], src: 'manual' });
r = await call('/api/pulse/match', 'PUT', { tv: { id: v.match.id, text: '' } });
assert.equal((await r.json()).tv.src, 'default', 'empty = automatic again');
assert.equal(hub.alarmAt, now + 3 * 3600000, 'looks again in 3 hours (kick-off is further)');
now = T0 - 2 * 3600000; await fireAlarm();
assert.equal(hub.alarmAt, T0 - 20 * 60000, 'then wakes up 20 minutes before kick-off');
asked.length = 0;
await call('/api/pulse/match');
assert.equal(asked.length, 0, 'not again so soon');
// 19:50: the frame shows the countdown; the score is fetched every 15 s.
now = T0 - 10 * 60000;
v = await (await call('/api/pulse/match')).json();
assert.equal(v.mode, 'live');
// 20:00 kick-off, 20:09 goal.
const pushedBefore = pushed.length;
sock.got.length = 0;
espn = { 'fifa.friendly': [espnEvent({ state: 'in', name: 'STATUS_FIRST_HALF', clock: "1'", period: 1 })] };
now = T0 + 20000;
await fireAlarm(); // nobody asked: the alarm looks
await hub.pushing;
assert.equal(pushed[pushed.length - 1].message.title, '⚽ بدأت المباراة');
assert.equal(hub.alarmAt, now + 30000, 'every 30 s during the match');
assert.equal(sock.got.pop().type, 'match', 'the frame is told');
espn = { 'fifa.friendly': [espnEvent({ state: 'in', name: 'STATUS_FIRST_HALF', clock: "9'", period: 1, mar: 1, details: [goal('2869', "9'", 'Hakimi')] })] };
now += 10000;
v = await (await call('/api/pulse/match')).json();
assert.equal(v.match.mar.score, 0, 'not before 15 s');
now += 6000;
v = await (await call('/api/pulse/match')).json();
assert.equal(v.match.mar.score, 1);
await hub.pushing;
last = pushed[pushed.length - 1];
assert.equal(last.message.title, '⚽ هدف للمغرب!');
assert.deepEqual(last.to, ['ماما', 'بابا'], 'to the phones that want everything');
assert.equal(last.urgency, 'high');
// The end, then 15 minutes of the final score on the frame.
espn = { 'fifa.friendly': [espnEvent({ state: 'post', name: 'STATUS_FULL_TIME', mar: 1, details: [goal('2869', "9'", 'Hakimi')] })] };
now += 2 * 3600000;
v = await (await call('/api/pulse/match')).json();
await hub.pushing;
assert.equal(pushed[pushed.length - 1].message.title, '🎉 فاز المغرب!');
assert.equal(v.mode, 'live');
now += 16 * 60000;
v = await (await call('/api/pulse/match')).json();
assert.equal(v.mode, 'done');
assert.equal(pushed.length - pushedBefore, 3, 'start, goal, end');
// Goal notifications off; match mode off.
r = await call('/api/pulse/match', 'PUT', { push: false });
assert.equal((await r.json()).cfg.push, false);
r = await call('/api/pulse/match', 'PUT', { on: false });
v = await r.json();
assert.equal(v.on, false);
assert.equal(v.mode, 'none');
await call('/api/pulse/match', 'PUT', { on: true, push: true });
// ESPN down: no crash, try again later.
matchDeps.fetch = async () => { throw new Error('offline'); };
now += 4 * 3600000;
v = await (await call('/api/pulse/match')).json();
assert.equal(v.on, true);

// The practice match and cheers.
r = await call('/api/pulse/match/preview', 'POST', {});
v = await r.json();
assert.equal(v.mode, 'live');
assert.equal(v.match.preview, true);
now += 25000;
v = await (await call('/api/pulse/match')).json();
assert.equal(v.match.mar.score, 1);
r = await call('/api/pulse/match/cheer', 'POST', { from: 'ماما', cheer: 'flag' });
assert.equal(r.status, 200);
assert.equal(sock.got.pop().type, 'cheer');
assert.equal((await call('/api/pulse/match/cheer', 'POST', { from: 'ماما', cheer: 'ball' })).status, 429, 'not that fast');
assert.equal((await call('/api/pulse/match/cheer', 'POST', { from: 'بابا', cheer: 'boo' })).status, 400);
v = await (await call('/api/pulse/match?since=0')).json();
assert.equal(v.cheers.length, 1);
r = await call('/api/pulse/match/preview', 'POST', { stop: true });
assert.notEqual((await r.json()).match && (await call('/api/pulse/match')).status, 500);

console.log('fun: all tests passed');
