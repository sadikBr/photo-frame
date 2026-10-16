// «نبضة حقيقية»: the pulse found in a camera's red channel, and in taps.
import assert from 'node:assert/strict';
import { analyzePulse, pulseFromTaps, fingerOn, ecgPath } from '../public/js/heart.js';

let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
// A made-up fingertip recording: the red dips with each beat (plus a smaller second dip),
// drifts slowly, has noise, and frames come at an uneven ~30 per second.
function recording(bpm, seconds, noise = 0.6) {
  const beats = [];
  let t = 300;
  while (t < seconds * 1000) { beats.push(t); t += (60000 / bpm) * (1 + (rnd() - 0.5) * 0.06); }
  const out = [];
  for (let s = 0; s < seconds * 1000; s += 28 + rnd() * 10) {
    let v = 160 + 6 * Math.sin(s / 4000); // drift (breathing, pressure)
    for (const b of beats) {
      const d = (s - b) / 1000;
      if (d > -0.3 && d < 0.8) v -= 4 * Math.exp(-((d - 0.1) ** 2) / 0.004) + 1.5 * Math.exp(-((d - 0.35) ** 2) / 0.006);
    }
    out.push({ t: 1e6 + s, v: v + (rnd() - 0.5) * noise * 2 });
  }
  return out;
}
for (const bpm of [52, 64, 72, 88, 110, 135]) {
  const r = analyzePulse(recording(bpm, 15));
  assert.ok(r, 'found a pulse at ' + bpm);
  assert.ok(Math.abs(r.bpm - bpm) <= 3, 'at ' + bpm + ' it says ' + r.bpm);
  assert.ok(r.intervals.length >= 8 && r.intervals.every((x) => x > 300 && x < 1700));
  assert.ok(r.quality > 0.3, 'good quality at ' + bpm + ': ' + r.quality);
}
// Only noise, or too short: no answer.
assert.equal(analyzePulse(Array.from({ length: 450 }, (_, i) => ({ t: i * 33, v: 150 + (rnd() - 0.5) * 6 }))) && analyzePulse(Array.from({ length: 450 }, (_, i) => ({ t: i * 33, v: 150 + (rnd() - 0.5) * 6 }))).quality > 0.3, false, 'noise is not a pulse');
assert.equal(analyzePulse(recording(70, 3)), null, 'too short');
assert.equal(analyzePulse(Array.from({ length: 300 }, (_, i) => ({ t: i * 33, v: 150 }))), null, 'a flat line');

// Taps with the pulse felt at the wrist.
let t = 0; const taps = [];
for (let i = 0; i < 12; i++) { taps.push(t); t += 830 + (i % 2 ? 20 : -20); }
assert.equal(pulseFromTaps(taps).bpm, 72);
assert.equal(pulseFromTaps([0, 800, 1600]), null, 'too few taps');
assert.equal(pulseFromTaps([0, 100, 200, 300, 400, 500, 600]), null, 'too fast to be a pulse');

assert.equal(fingerOn(200, 40, 30), true);
assert.equal(fingerOn(120, 110, 100), false, 'a white wall');
assert.equal(fingerOn(20, 5, 5), false, 'dark');
assert.match(ecgPath([800, 800], 400, 100), /^M0 60\.0L/);

console.log('heart: all tests passed');
