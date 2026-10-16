// «نبضة حقيقية»: reading a heartbeat with the phone's camera. With a fingertip on the lens and
// the camera's light on, the skin turns a little darker each time the heart pushes blood
// through it; the red of the picture rises and falls with the pulse. This file turns those
// numbers into beats (and is tested with made-up signals in test/heart.test.mjs).

const median = (a) => { const s = a.slice().sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : 0; };

// samples: [{t: ms, v: average red}] → {bpm, intervals (ms between beats), quality 0–1} or null.
export function analyzePulse(samples) {
  if (!samples || samples.length < 60) return null;
  const t0 = samples[0].t, t1 = samples[samples.length - 1].t;
  if (t1 - t0 < 6000) return null;
  // Even steps of 1/30 s.
  const dt = 1000 / 30;
  const xs = [];
  let j = 0;
  for (let t = t0; t <= t1; t += dt) {
    while (j < samples.length - 2 && samples[j + 1].t < t) j++;
    const a = samples[j], b = samples[j + 1];
    const k = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
    xs.push(a.v + (b.v - a.v) * Math.max(0, Math.min(1, k)));
  }
  // Take away the slow drift (1 s average), smooth a little, and turn upside down: the picture
  // is darkest when the blood arrives.
  const avg = (arr, w) => {
    const out = new Array(arr.length);
    let sum = 0, q = [];
    for (let i = 0; i < arr.length; i++) {
      q.push(arr[i]); sum += arr[i];
      if (q.length > w) sum -= q.shift();
      out[i] = sum / q.length;
    }
    // centre the window
    const sh = Math.floor(w / 2);
    return out.map((_, i) => out[Math.min(arr.length - 1, i + sh)]);
  };
  const slow = avg(xs, 30);
  let sig = xs.map((x, i) => slow[i] - x);
  sig = avg(sig, 4);
  const n = sig.length;
  const mean = sig.reduce((s, x) => s + x, 0) / n;
  sig = sig.map((x) => x - mean);
  const energy = sig.reduce((s, x) => s + x * x, 0);
  if (energy <= 1e-9) return null;
  // The beat's length: the strongest repeat between 0.33 s (180/min) and 1.5 s (40/min).
  const corr = [];
  let best = 0, bestLag = 0;
  for (let lag = 8; lag <= 46; lag++) {
    let c = 0;
    for (let i = 0; i + lag < n; i++) c += sig[i] * sig[i + lag];
    corr[lag] = c / (energy * ((n - lag) / n));
  }
  for (let lag = 10; lag <= 45; lag++) if (corr[lag] > best) { best = corr[lag]; bestLag = lag; }
  if (!bestLag) return null;
  // Two beats also repeat: take the shortest repeat that is nearly as strong.
  for (let lag = 10; lag < bestLag; lag++) {
    if (corr[lag] >= 0.8 * best && corr[lag] >= corr[lag - 1] && corr[lag] >= corr[lag + 1]) { bestLag = lag; break; }
  }
  // Each beat: the highest point within ±40 % of the beat's length.
  const std = Math.sqrt(energy / n);
  const peaks = [];
  const win = Math.max(3, Math.round(bestLag * 0.4));
  for (let i = win; i < n - win; i++) {
    if (sig[i] < 0.3 * std) continue;
    let top = true;
    for (let k = i - win; k <= i + win; k++) if (sig[k] > sig[i]) { top = false; break; }
    if (top && (!peaks.length || i - peaks[peaks.length - 1] >= win)) peaks.push(i);
  }
  // Between samples: where the top of the curve really is (a parabola through three points).
  const at = peaks.map((i) => {
    const a = sig[i - 1], b = sig[i], c = sig[i + 1];
    const den = a - 2 * b + c;
    return i + (den ? Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / den)) : 0);
  });
  const intervals = [];
  for (let i = 1; i < at.length; i++) {
    const ms = (at[i] - at[i - 1]) * dt;
    if (ms > bestLag * dt * 0.65 && ms < bestLag * dt * 1.4) intervals.push(Math.round(ms));
  }
  if (intervals.length < 4) return null;
  const bpm = Math.round(60000 / median(intervals));
  if (bpm < 40 || bpm > 180) return null;
  const quality = Math.max(0, Math.min(1, best)) * Math.min(1, intervals.length / 10);
  return { bpm, intervals: intervals.slice(-40), quality: Math.round(quality * 100) / 100 };
}

// From taps in time with the pulse (felt at the wrist): the same answer.
export function pulseFromTaps(times) {
  const iv = [];
  for (let i = 1; i < times.length; i++) iv.push(Math.round(times[i] - times[i - 1]));
  const ok = iv.filter((x) => x >= 330 && x <= 1500);
  if (ok.length < 5) return null;
  const m = median(ok);
  const near = ok.filter((x) => Math.abs(x - m) < m * 0.3);
  if (near.length < 5) return null;
  // Taps wobble: the average beat is fairer than the middle one.
  return { bpm: Math.round(60000 / (near.reduce((x, y) => x + y, 0) / near.length)), intervals: near.slice(-40), quality: 0.5 };
}

// Is a fingertip covering the lens? (Red and bright, little green or blue.)
export const fingerOn = (r, g, b) => r > 90 && r > g * 1.6 && r > b * 1.6;

// A heartbeat line (like a hospital monitor) for these beats: SVG path in a w×h box.
export function ecgPath(intervals, w, h, from = 0) {
  const total = intervals.reduce((s, x) => s + x, 0) || 1;
  const k = w / total;
  let x = from, d = 'M0 ' + (h * 0.6).toFixed(1);
  const base = h * 0.6;
  for (const iv of intervals) {
    const s = iv * k;
    const p = (f) => (x + s * f).toFixed(1);
    d += 'L' + p(0.3) + ' ' + base.toFixed(1)
      + 'L' + p(0.36) + ' ' + (base - h * 0.08).toFixed(1)
      + 'L' + p(0.42) + ' ' + base.toFixed(1)
      + 'L' + p(0.5) + ' ' + (base + h * 0.08).toFixed(1)
      + 'L' + p(0.55) + ' ' + (h * 0.05).toFixed(1)
      + 'L' + p(0.6) + ' ' + (h * 0.85).toFixed(1)
      + 'L' + p(0.66) + ' ' + base.toFixed(1)
      + 'L' + p(0.8) + ' ' + (base - h * 0.12).toFixed(1)
      + 'L' + p(0.9) + ' ' + base.toFixed(1);
    x += s;
  }
  return d + 'L' + w + ' ' + base.toFixed(1);
}
