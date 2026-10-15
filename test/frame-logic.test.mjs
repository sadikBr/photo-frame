// Frame-side logic that doesn't need a browser: repeating-task dates, weather tips, adhkar lists.
import assert from 'node:assert/strict';
import { dueFrom } from '../public/js/routines.js';
import { weatherNudge } from '../public/js/nudge.js';
import { adhkarFor, verseOfDay } from '../public/js/adhkar-data.js';

// every 3 days from the 14th: 14, 17, 20…
const plants = { kind: 'days', every: 3, start: '2026-10-14' };
assert.equal(dueFrom(plants, '2026-10-14'), '2026-10-14');
assert.equal(dueFrom(plants, '2026-10-15'), '2026-10-17');
assert.equal(dueFrom(plants, '2026-10-18'), '2026-10-20');
assert.equal(dueFrom({ kind: 'weekly', weekday: 5 }, '2026-10-14'), '2026-10-16', 'next Friday');
assert.equal(dueFrom({ kind: 'weekly', weekday: 3 }, '2026-10-14'), '2026-10-14', 'today if it is that day');
assert.equal(dueFrom({ kind: 'monthly', day: 5 }, '2026-10-06'), '2026-11-05');
assert.equal(dueFrom({ kind: 'monthly', day: 31 }, '2026-11-02'), '2026-11-30', 'last day of a 30-day month');
assert.equal(dueFrom({ kind: 'monthly', day: 30 }, '2027-02-01'), '2027-02-28', 'February');
assert.equal(dueFrom({ kind: 'monthly', day: 5, start: '2026-12-01' }, '2026-10-14'), '2026-12-05', 'respects start');

// weather tips
assert.match(weatherNudge({ code: 63, max: 18, min: 11, rain: 80, mm: 6 }).text, /المظلة/);
assert.match(weatherNudge({ code: 2, max: 17, min: 6, rain: 0 }).text, /بارد صباحاً/);
assert.match(weatherNudge({ code: 0, max: 38, min: 24, rain: 0 }).text, /حر شديد/);
assert.match(weatherNudge({ code: 3, max: 20, min: 14, rain: 10, gusts: 70 }).text, /رياح قوية/);
assert.match(weatherNudge({ code: 95, max: 25, min: 18, rain: 50 }).text, /عواصف/);
assert.match(weatherNudge({ code: 63, max: 18, min: 11, rain: 80 }, true).text, /غداً/);
assert.equal(weatherNudge({ code: 3, max: 22, min: 15, rain: 10 }).text, 'اليوم غائم ومعتدل، بين 15 و22 درجة', 'an ordinary day: a plain summary');
assert.equal(weatherNudge({ code: 3, max: 27, min: 18, rain: 10 }, true).text, 'غداً غائم ودافئ، بين 18 و27 درجة');
assert.equal(weatherNudge(null), null);

// adhkar: morning and evening wording, morning-only / evening-only items
const m = adhkarFor('m'), e = adhkarFor('e');
assert.ok(m.every((a) => a.t && a.n > 0) && e.every((a) => a.t && a.n > 0));
assert.ok(m.some((a) => a.t.startsWith('أصبحنا وأصبح')) && e.some((a) => a.t.startsWith('أمسينا وأمسى')));
assert.ok(e.some((a) => a.t.startsWith('أعوذ بكلمات الله')) && !m.some((a) => a.t.startsWith('أعوذ بكلمات الله')));
assert.equal(verseOfDay(0).kind, 'verse');
assert.equal(verseOfDay(1).kind, 'hadith');
console.log('frame logic: all tests passed');

// evening tips talk about tomorrow; the weather service is asked for a fixed offset
assert.match(weatherNudge({ code: 45, max: 22, min: 14, rain: 0 }, true).text, /صباح الغد/);
assert.match(weatherNudge({ code: 2, max: 18, min: 5, rain: 0 }, true).text, /صباح الغد/);
const { fixedTimeZone, setUtcOffsetMinutes } = await import('../public/js/util.js');
assert.equal(fixedTimeZone(), 'GMT', 'Morocco is on GMT');
setUtcOffsetMinutes(60);
assert.equal(fixedTimeZone(), 'Etc/GMT-1', 'POSIX sign: GMT+1 is Etc/GMT-1');
setUtcOffsetMinutes(0);
console.log('frame logic: weather time zone ok');
