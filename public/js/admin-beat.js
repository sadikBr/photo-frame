// «نبضة حقيقية» on the phone: a fingertip on the back camera, the camera's light on, 15 seconds
// still — the phone finds the pulse in the picture's red, and the frame beats with it. Without a
// light (iPhone) or a camera: tap along with the pulse felt at the wrist.
import { analyzePulse, pulseFromTaps, fingerOn } from './heart.js';
import { HEART_ICON } from './pulse-common.js';
import { heartbeat, unlockAudio } from './sound.js';

const SECONDS = 15;

export function initBeat({ toast, $, post, needName }) {
  let stream = null, track = null, running = false, samples = [], result = null, startAt = 0, raf = 0, taps = [];
  const video = $('beatVideo');
  const wave = $('beatWave');
  const wctx = wave.getContext('2d');
  const small = document.createElement('canvas');
  small.width = 40; small.height = 30;
  const sctx = small.getContext('2d', { willReadFrequently: true });

  function show(state, text) {
    $('beatHint').textContent = text || '';
    $('beatStart').hidden = state === 'run' || state === 'tap';
    $('beatStop').hidden = state !== 'run' && state !== 'tap';
    $('beatTap').hidden = state === 'run';
    $('beatSend').hidden = state !== 'done';
    $('beatCard').classList.toggle('is-running', state === 'run');
    $('beatTapPad').hidden = state !== 'tap';
  }
  function setBpm(b) { $('beatBpm').textContent = b ? String(b) : '–'; }
  function drawWave() {
    const w = wave.width, h = wave.height;
    wctx.clearRect(0, 0, w, h);
    const recent = samples.filter((s) => s.t > performance.now() - 5000);
    if (recent.length < 3) return;
    let lo = Infinity, hi = -Infinity;
    for (const s of recent) { lo = Math.min(lo, s.v); hi = Math.max(hi, s.v); }
    const span = Math.max(1, hi - lo);
    const t0 = performance.now() - 5000;
    wctx.strokeStyle = '#E8657A';
    wctx.lineWidth = 3;
    wctx.lineJoin = 'round';
    wctx.beginPath();
    recent.forEach((s, i) => {
      // Upside down: the beat (darker) goes up.
      const x = ((s.t - t0) / 5000) * w, y = 8 + ((s.v - lo) / span) * (h - 16);
      if (i) wctx.lineTo(x, y); else wctx.moveTo(x, y);
    });
    wctx.stroke();
  }

  function stop() {
    running = false;
    cancelAnimationFrame(raf);
    if (track) { try { track.applyConstraints({ advanced: [{ torch: false }] }).catch(() => {}); } catch (e) { /* none */ } }
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null; track = null;
    video.srcObject = null;
  }

  async function start() {
    if (needName()) return;
    unlockAudio();
    result = null;
    setBpm(0);
    if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) || !window.isSecureContext) {
      show('idle', 'الكاميرا تعمل فقط على رابط https. استعمل «انقر مع نبضك».');
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 30 } } });
    } catch (e) {
      show('idle', 'لم يُسمح بالكاميرا. اسمح بها لهذا الموقع، أو استعمل «انقر مع نبضك».');
      return;
    }
    track = stream.getVideoTracks()[0];
    let torch = false;
    try { await track.applyConstraints({ advanced: [{ torch: true }] }); torch = true; } catch (e) { torch = false; }
    video.srcObject = stream;
    try { await video.play(); } catch (e) { /* muted inline video plays */ }
    samples = [];
    startAt = 0;
    running = true;
    show('run', torch ? 'ضع طرف إصبعك برفق على الكاميرا الخلفية والضوء، ولا تتحرك.' : 'لم يشتغل ضوء الكاميرا: ضع إصبعك على الكاميرا تحت ضوء قوي، أو استعمل «انقر مع نبضك».');
    let lastCheck = 0;
    const loop = () => {
      if (!running) return;
      if (video.readyState >= 2) {
        sctx.drawImage(video, 0, 0, 40, 30);
        const d = sctx.getImageData(10, 7, 20, 16).data;
        let r = 0, g = 0, b = 0;
        for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
        const n = d.length / 4;
        r /= n; g /= n; b /= n;
        const t = performance.now();
        if (!fingerOn(r, g, b)) {
          if (samples.length) { samples = []; startAt = 0; setBpm(0); }
          $('beatHint').textContent = 'ضع طرف إصبعك على الكاميرا (يجب أن تصير الصورة حمراء).';
        } else {
          if (!startAt) { startAt = t; $('beatHint').textContent = 'جيد… لا تتحرك.'; }
          samples.push({ t, v: r });
          const secs = (t - startAt) / 1000;
          $('beatProg').style.width = Math.min(100, (secs / SECONDS) * 100) + '%';
          if (secs > 6 && t - lastCheck > 1500) {
            lastCheck = t;
            const a = analyzePulse(samples.slice(-450));
            if (a && a.quality > 0.3) setBpm(a.bpm);
            if (secs >= SECONDS && a && a.quality > 0.35) { finish(a); return; }
            if (secs >= SECONDS * 2) { stop(); show('idle', 'لم أستطع قراءة النبض. اضغط برفق شديد دون حركة وجرّب مرة أخرى، أو استعمل «انقر مع نبضك».'); return; }
          }
        }
        drawWave();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  }

  function finish(a) {
    stop();
    result = a;
    setBpm(a.bpm);
    show('done', 'قلبك: ' + a.bpm + ' نبضة في الدقيقة. أرسله إلى البيت ليُنبض على الإطار بإيقاعك.');
    // Feel it once here too.
    let t = 0;
    for (const x of a.intervals.slice(0, 6)) { heartbeat(t / 1000, 0.6); t += x; }
    const hEl = $('beatHeart');
    hEl.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.2)' }, { transform: 'scale(1)' }], { duration: 500, iterations: 3 });
  }

  // ----- tapping along -----
  function tapMode() {
    if (needName()) return;
    unlockAudio();
    stop();
    taps = [];
    result = null;
    setBpm(0);
    show('tap', 'تحسّس نبضك في معصمك أو رقبتك، وانقر على القلب مع كل نبضة (10 مرات على الأقل).');
  }
  $('beatTapPad').addEventListener('pointerdown', (e) => {
    e.preventDefault();
    taps.push(performance.now());
    if (taps.length > 40) taps.shift();
    heartbeat(0, 0.4);
    $('beatTapPad').animate([{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { duration: 220 });
    const a = taps.length >= 6 ? pulseFromTaps(taps) : null;
    if (a) setBpm(a.bpm);
    $('beatProg').style.width = Math.min(100, (taps.length / 10) * 100) + '%';
    if (a && taps.length >= 10) { result = a; $('beatSend').hidden = false; $('beatHint').textContent = 'قلبك: ' + a.bpm + ' نبضة في الدقيقة. أكمل النقر لتدقيقه أو أرسله.'; }
  });

  $('beatStart').addEventListener('click', start);
  $('beatStop').addEventListener('click', () => { stop(); show('idle', ''); });
  $('beatTap').addEventListener('click', tapMode);
  $('beatSend').addEventListener('click', async () => {
    if (!result || needName()) return;
    const b = $('beatSend');
    b.disabled = true;
    try {
      await post({ kind: 'beat', bpm: result.bpm, intervals: result.intervals });
      show('idle', 'أُرسل نبضك ❤');
      $('beatProg').style.width = '0';
    } catch (e) { toast(e.message); }
    b.disabled = false;
  });
  $('beatHeart').innerHTML = HEART_ICON(46);
  show('idle', 'ضع طرف إصبعك على الكاميرا الخلفية واضغط «ابدأ». 15 ثانية بلا حركة. (يلزم ضوء الكاميرا: هواتف Android.)');
  document.addEventListener('visibilitychange', () => { if (document.visibilityState !== 'visible' && running) { stop(); show('idle', 'توقف القياس. ابدأ من جديد.'); } });
  return { stop };
}
