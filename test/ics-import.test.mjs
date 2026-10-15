// Checks how an .ics file becomes entries for the frame's calendar.
import assert from 'node:assert/strict';
import { importICS } from '../public/js/ics-import.js';

const DAY = 86400000;
const pad = (n) => String(n).padStart(2, '0');
const d = (offsetDays) => { const t = new Date(Date.now() + offsetDays * DAY); return t.getUTCFullYear() + pad(t.getUTCMonth() + 1) + pad(t.getUTCDate()); };
const iso = (offsetDays) => { const s = d(offsetDays); return s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6); };

// Shaped like a Google Calendar export (CRLF line ends, folded lines, VTIMEZONE, VALARM).
const ics = [
  'BEGIN:VCALENDAR', 'PRODID:-//Google Inc//Google Calendar 70.9054//EN', 'VERSION:2.0',
  'BEGIN:VTIMEZONE', 'TZID:Africa/Casablanca', 'END:VTIMEZONE',
  // one-off appointment in 3 days at 10:30 local
  'BEGIN:VEVENT', 'UID:dentist', `DTSTART;TZID=Africa/Casablanca:${d(3)}T103000`, `DTEND;TZID=Africa/Casablanca:${d(3)}T113000`,
  'SUMMARY:موعد طبيب الأسنان', 'BEGIN:VALARM', 'ACTION:DISPLAY', 'END:VALARM', 'END:VEVENT',
  // weekly class for 6 weeks, starting in 1 day, one week skipped
  'BEGIN:VEVENT', 'UID:swim', `DTSTART;TZID=Africa/Casablanca:${d(1)}T180000`, 'DURATION:PT1H',
  'RRULE:FREQ=WEEKLY;COUNT=6', `EXDATE;TZID=Africa/Casablanca:${d(15)}T180000`, 'SUMMARY:حصة السباحة', 'END:VEVENT',
  // 4-day trip (all-day, end exclusive)
  'BEGIN:VEVENT', 'UID:trip', `DTSTART;VALUE=DATE:${d(20)}`, `DTEND;VALUE=DATE:${d(24)}`, 'SUMMARY:عطلة في إفران', 'END:VEVENT',
  // yearly birthday since 2015
  'BEGIN:VEVENT', 'UID:bday', 'DTSTART;VALUE=DATE:20150312', 'DTEND;VALUE=DATE:20150313', 'RRULE:FREQ=YEARLY',
  'SUMMARY:عيد ميلاد سلمى', 'END:VEVENT',
  // cancelled, and one long in the past
  'BEGIN:VEVENT', 'UID:cancel', `DTSTART:${d(5)}T090000Z`, 'STATUS:CANCELLED', 'SUMMARY:ملغى', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:old', 'DTSTART:20200101T090000Z', 'SUMMARY:قديم', 'END:VEVENT',
  // a folded long title
  'BEGIN:VEVENT', 'UID:long', `DTSTART:${d(7)}T140000Z`, 'SUMMARY:اجتماع أولياء التلاميذ في مدرسة', '  الأمل', 'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

const { entries, stats } = importICS(ics);
const by = (name) => entries.filter((e) => e.name === name);

assert.deepEqual(by('موعد طبيب الأسنان'), [{ name: 'موعد طبيب الأسنان', date: iso(3), time: '10:30' }], 'one-off at local time (Morocco on GMT)');
const swim = by('حصة السباحة');
assert.equal(swim.length, 5, 'weekly x6 minus one excluded week');
assert.ok(!swim.some((e) => e.date === iso(15)), 'excluded week is skipped');
assert.ok(swim.every((e) => e.time === '18:00'));
assert.deepEqual(by('عطلة في إفران'), [{ name: 'عطلة في إفران', date: iso(20), end: iso(23) }], 'multi-day trip keeps its last day');
assert.deepEqual(by('عيد ميلاد سلمى'), [{ name: 'عيد ميلاد سلمى', date: '03-12' }], 'yearly birthday stored once as MM-DD');
assert.equal(by('ملغى').length, 0, 'cancelled skipped');
assert.equal(by('قديم').length, 0, 'old events outside the window skipped');
assert.equal(by('اجتماع أولياء التلاميذ في مدرسة الأمل').length, 1, 'folded title joined');
assert.equal(stats.yearly, 1);
assert.equal(stats.total, entries.length);

// Public holidays inside an imported calendar are dropped (the frame already shows them);
// ranges longer than a month keep their full length.
const now = new Date();
const unityYear = now.getUTCMonth() > 9 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
const school = [
  'BEGIN:VCALENDAR',
  'BEGIN:VEVENT', 'UID:u1', `DTSTART;VALUE=DATE:${unityYear}1031`, `DTEND;VALUE=DATE:${unityYear}1101`, 'SUMMARY:عيد الوحدة', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:u2', `DTSTART;VALUE=DATE:${d(10)}`, `DTEND;VALUE=DATE:${d(71)}`, 'SUMMARY:تحدي القراءة العربي', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:u3', `DTSTART;VALUE=DATE:${d(30)}`, `DTEND;VALUE=DATE:${d(38)}`, 'SUMMARY:عطلة الفترة البينية', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:u4', `DTSTART;VALUE=DATE:${d(40)}`, 'SUMMARY:تحدي الشباب في العلوم', 'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');
const sc = importICS(school);
assert.equal(sc.stats.holidays, 1, 'Unity Day recognised as a built-in holiday');
assert.ok(!sc.entries.some((e) => e.name === 'عيد الوحدة'));
assert.deepEqual(sc.entries.find((e) => e.name === 'تحدي القراءة العربي'), { name: 'تحدي القراءة العربي', date: iso(10), end: iso(70) }, '61-day range kept whole');
assert.deepEqual(sc.entries.find((e) => e.name === 'عطلة الفترة البينية'), { name: 'عطلة الفترة البينية', date: iso(30), end: iso(37) }, '8-day school break');
assert.ok(sc.entries.some((e) => e.name === 'تحدي الشباب في العلوم'), '"الشباب" alone is not Youth Day');

assert.throws(() => importICS('hello'), /لا توجد مواعيد/);
console.log('ics-import: all tests passed (' + entries.length + ' entries)');
