// Little sounds made on the spot (no files to download): a knock on a wooden door, the wheel's
// click, a crowd roaring for a goal, a referee's whistle, a short fanfare. The frame and the
// phone share them. Browsers only allow sound after a first touch: call unlockAudio() then.
let ctx = null;
let noiseBuf = null;

export function audio() {
  if (!ctx) {
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ctx = null; }
  }
  return ctx;
}
export function unlockAudio() {
  const c = audio();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
}
export const soundOn = () => { const c = audio(); return !!c && c.state === 'running'; };

function noise(c) {
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const n = c.createBufferSource();
  n.buffer = noiseBuf;
  return n;
}
function env(c, t, peak, attack, decay) {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  return g;
}

// A knock on a wooden door: a low thump and a short woody click. `at`: seconds from now.
export function knock(at = 0, vol = 1) {
  const c = audio();
  if (!soundOn()) return;
  const t = c.currentTime + at;
  const o = c.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(150, t);
  o.frequency.exponentialRampToValueAtTime(58, t + 0.12);
  o.connect(env(c, t, 0.9 * vol, 0.004, 0.16)).connect(c.destination);
  o.start(t);
  o.stop(t + 0.22);
  const n = noise(c);
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 850 + Math.random() * 200;
  bp.Q.value = 1.4;
  n.connect(bp).connect(env(c, t, 0.7 * vol, 0.002, 0.06)).connect(c.destination);
  n.start(t, Math.random());
  n.stop(t + 0.1);
}

// The wheel passing a peg.
export function tick(vol = 0.35) {
  const c = audio();
  if (!soundOn()) return;
  const t = c.currentTime;
  const n = noise(c);
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 2400;
  bp.Q.value = 3;
  n.connect(bp).connect(env(c, t, vol, 0.001, 0.025)).connect(c.destination);
  n.start(t, Math.random());
  n.stop(t + 0.04);
}

// The result: four rising notes.
export function fanfare(vol = 0.16) {
  const c = audio();
  if (!soundOn()) return;
  const t = c.currentTime;
  [523.3, 659.3, 784, 1046.5].forEach((f, i) => {
    const o = c.createOscillator();
    o.type = 'triangle';
    o.frequency.value = f;
    const d = i === 3 ? 0.9 : 0.18;
    o.connect(env(c, t + i * 0.12, vol, 0.01, d)).connect(c.destination);
    o.start(t + i * 0.12);
    o.stop(t + i * 0.12 + d + 0.05);
  });
}

// A crowd for a goal: a swelling roar and three blasts of a horn.
export function roar(seconds = 4.5, vol = 0.5) {
  const c = audio();
  if (!soundOn()) return;
  const t = c.currentTime;
  for (let k = 0; k < 2; k++) {
    const n = noise(c);
    n.loop = true;
    const lp = c.createBiquadFilter();
    lp.type = 'bandpass';
    lp.frequency.value = k ? 1400 : 600;
    lp.Q.value = 0.7;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol * (k ? 0.5 : 0.8), t + 0.5);
    g.gain.setValueAtTime(vol * (k ? 0.5 : 0.8), t + seconds * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
    n.connect(lp).connect(g).connect(c.destination);
    n.start(t, Math.random());
    n.stop(t + seconds + 0.1);
  }
  for (let i = 0; i < 3; i++) {
    const at = t + 0.3 + i * 0.55;
    for (const f of [233, 294, 349]) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1600;
      o.connect(lp).connect(env(c, at, 0.06, 0.03, i === 2 ? 0.9 : 0.4)).connect(c.destination);
      o.start(at);
      o.stop(at + 1);
    }
  }
}

// The other side scored: a disappointed "ooh".
export function sigh(vol = 0.35) {
  const c = audio();
  if (!soundOn()) return;
  const t = c.currentTime;
  const n = noise(c);
  n.loop = true;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(900, t);
  lp.frequency.exponentialRampToValueAtTime(250, t + 1.6);
  n.connect(lp).connect(env(c, t, vol, 0.25, 1.4)).connect(c.destination);
  n.start(t, Math.random());
  n.stop(t + 1.8);
}

// A referee's whistle: `times` short blasts (3 at the end of a match).
export function whistle(times = 1, vol = 0.12) {
  const c = audio();
  if (!soundOn()) return;
  const t0 = c.currentTime;
  for (let i = 0; i < times; i++) {
    const t = t0 + i * 0.45, d = i === times - 1 ? 0.7 : 0.25;
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.value = 2900;
    const trem = c.createOscillator();
    trem.frequency.value = 38;
    const tg = c.createGain();
    tg.gain.value = 120;
    trem.connect(tg).connect(o.frequency);
    o.connect(env(c, t, vol, 0.01, d)).connect(c.destination);
    o.start(t); trem.start(t);
    o.stop(t + d + 0.05); trem.stop(t + d + 0.05);
  }
}

// One heartbeat: "lub-dub", two low thumps. `at`: seconds from now.
export function heartbeat(at = 0, vol = 0.9) {
  const c = audio();
  if (!soundOn()) return;
  const t = c.currentTime + at;
  [[0, 62, 1], [0.16, 52, 0.7]].forEach(([d, f, k]) => {
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(f * 1.6, t + d);
    o.frequency.exponentialRampToValueAtTime(f, t + d + 0.05);
    o.connect(env(c, t + d, vol * k, 0.012, 0.13)).connect(c.destination);
    o.start(t + d);
    o.stop(t + d + 0.2);
  });
}

// A paint drop: a soft "plip" when a tile is coloured.
export function plip(vol = 0.18) {
  const c = audio();
  if (!soundOn()) return;
  const t = c.currentTime;
  const o = c.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(900, t);
  o.frequency.exponentialRampToValueAtTime(1500, t + 0.06);
  o.connect(env(c, t, vol, 0.005, 0.12)).connect(c.destination);
  o.start(t);
  o.stop(t + 0.15);
}
