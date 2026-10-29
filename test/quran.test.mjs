// «القرآن» (server side): favourites, schedules, playing from a phone or the frame.
import assert from 'node:assert/strict';
import { PulseHub } from '../src/pulse-hub.js';
import { SURAHS, surahName, surahUrl, DEFAULT_FAVS, daysLabel, mmss } from '../public/js/quran-common.js';
import { fakeNamespace } from './fake-do.mjs';

assert.equal(SURAHS.length, 114);
assert.equal(surahName(2), 'البقرة');
assert.equal(surahName(18), 'الكهف');
assert.equal(surahName(67), 'الملك');
assert.equal(surahName(114), 'الناس');
assert.equal(surahUrl(18), 'https://server16.mp3quran.net/nufais/Rewayat-Hafs-A-n-Assem/018.mp3');
assert.deepEqual(DEFAULT_FAVS.map(surahName), ['البقرة', 'الكهف', 'الحجر', 'الشعراء', 'يوسف', 'الملك', 'السجدة']);
assert.equal(daysLabel([5]), 'كل الجمعة');
assert.equal(daysLabel([0, 1, 2, 3, 4, 5, 6]), 'كل يوم');
assert.equal(mmss(3725), '1:02:05');
assert.equal(mmss(65), '1:05');

const ns = fakeNamespace(PulseHub, {});
const hub = ns.obj;
const sock = { got: [], send(m) { this.got.push(JSON.parse(m)); } };
ns.sockets.add(sock);
const call = (path, method = 'GET', body) => hub.fetch(new Request('https://frame.test' + path, body === undefined ? { method } : { method, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }));
const cmd = async (b) => { const r = await call('/api/pulse/quran/cmd', 'POST', b); return { status: r.status, j: await r.json() }; };

let q = await (await call('/api/pulse/quran')).json();
assert.deepEqual(q.cfg.favs, DEFAULT_FAVS, 'his surahs to start with');
assert.equal(q.play, null);

// From a phone: al-Kahf on the frame.
let r = await cmd({ action: 'play', surah: 18, from: 'بابا' });
assert.equal(r.status, 200);
assert.deepEqual(r.j.play.list, [18]);
assert.equal(r.j.play.mode, 'one');
assert.equal(r.j.play.by, 'بابا');
let m = sock.got.pop();
assert.equal(m.type, 'quran', 'the frame hears at once');
assert.equal(m.quran.play.id, r.j.play.id);
const id = r.j.play.id;
// The frame reports.
await call('/api/pulse/quran/status', 'POST', { id, idx: 0, state: 'playing', pos: 61.4, dur: 1800 });
q = await (await call('/api/pulse/quran')).json();
assert.equal(q.status.state, 'playing');
assert.equal(Math.round(q.status.pos), 61);
assert.equal((await (await call('/api/pulse/quran/status', 'POST', { id: 'old', state: 'playing' })).json()).ok, false, 'old reports are ignored');
// Pause, resume, volume.
r = await cmd({ action: 'pause' });
assert.equal(r.j.play.paused, true);
r = await cmd({ action: 'resume' });
assert.equal(r.j.play.paused, false);
assert.equal(r.j.play.id, id, 'same recitation, carried on');
r = await cmd({ action: 'volume', volume: 0.5 });
assert.equal(r.j.cfg.volume, 0.5);
assert.equal((await cmd({ action: 'volume', volume: 'x' })).status, 400);
// The whole list.
r = await cmd({ action: 'play', list: DEFAULT_FAVS, idx: 1 });
assert.equal(r.j.play.mode, 'list');
assert.equal(r.j.play.idx, 1);
const lid = r.j.play.id;
r = await cmd({ action: 'next' });
assert.equal(r.j.play.idx, 2);
r = await cmd({ action: 'prev' });
assert.equal(r.j.play.idx, 1);
// The frame moved on by itself (end of a surah).
await call('/api/pulse/quran/status', 'POST', { id: lid, idx: 4, state: 'playing', pos: 1, dur: 900 });
q = await (await call('/api/pulse/quran')).json();
assert.equal(q.play.idx, 4);
// Past the end of a list: stops; with repeat: starts again.
await cmd({ action: 'play', list: [67, 32], idx: 1, mode: 'list' });
r = await cmd({ action: 'next' });
assert.equal(r.j.play, null);
await cmd({ action: 'play', list: [67, 32], idx: 1, mode: 'repeat' });
r = await cmd({ action: 'next' });
assert.equal(r.j.play.idx, 0);
// The frame finished: nothing playing.
await call('/api/pulse/quran/status', 'POST', { id: r.j.play.id, state: 'ended' });
assert.equal((await (await call('/api/pulse/quran')).json()).play, null);
assert.equal((await cmd({ action: 'pause' })).status, 409);
assert.equal((await cmd({ action: 'play', surah: 115 })).status, 400);
assert.equal((await cmd({ action: 'dance' })).status, 409);

// Favourites and times.
r = await call('/api/pulse/quran', 'PUT', {
  favs: [18, 67, 18, 999, 36],
  schedules: [{ surah: 18, days: [5], time: '10:00' }, { surah: 67, days: [0, 1, 2, 3, 4, 5, 6], time: '22:00' }, { surah: 0, days: [1], time: '10:00' }, { surah: 2, days: [], time: '09:00' }, { surah: 2, days: [1], time: '25:00' }],
  mode: 'repeat',
});
q = await r.json();
assert.deepEqual(q.cfg.favs, [18, 67, 36], 'no repeats, only real surahs');
assert.equal(q.cfg.schedules.length, 2, 'bad ones dropped');
assert.match(q.cfg.schedules[0].id, /^[a-z0-9]{4,24}$/);
assert.equal(q.cfg.mode, 'repeat');
assert.equal(sock.got.pop().type, 'quran');

console.log('quran: all tests passed');
