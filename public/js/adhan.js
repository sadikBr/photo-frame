// The adhan at prayer times. The audio is uploaded in the control panel.
// Browsers may refuse to play sound until someone has touched the page once. The frame checks
// this silently when it starts; if sound is blocked it asks for one tap ("المس الشاشة …"), and
// after that tap the page may play sound for as long as it stays open. The result
// ('ok' / 'blocked' / 'off') is reported to the control panel.
import config from './config.js';
import { MINUTE } from './util.js';
import { on, audioUrl, prayerDay, setAudioStatus, DEMO } from './data.js';

const PRAYER_KEYS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
const audio = new Audio();
audio.preload = 'auto';
let status = 'off';
let allowed = false; // a play with sound has succeeded on this page
let playing = null; // prayer key while the adhan plays
let probing = false;
const played = new Set(); // 'YYYY-MM-DD-fajr' … already handled
const listeners = [];

const notify = () => { for (const fn of listeners) fn(); };
function setStatus(s) {
  if (s === status) return;
  status = s;
  setAudioStatus(s);
  notify();
}
export const onAdhan = (fn) => listeners.push(fn);
export const adhanStatus = () => status;
export const adhanPlaying = () => playing;

const enabled = () => !DEMO && !!(config.adhan && config.adhan.enabled && audioUrl('adhan'));
const srcFor = (k) => (k === 'fajr' && audioUrl('adhan-fajr')) || audioUrl('adhan');
function load(src) { if (src && audio.getAttribute('src') !== src) audio.src = src; }

// A silent play (volume 0, not muted, so the browser applies its real rule) tells us
// whether the adhan will be allowed to play on its own.
function probe() {
  if (!enabled() || allowed || probing || playing) return;
  probing = true;
  load(srcFor('dhuhr'));
  audio.volume = 0;
  const done = (ok, err) => {
    probing = false;
    audio.pause();
    audio.currentTime = 0;
    if (ok) { allowed = true; setStatus('ok'); } else if (err && err.name === 'NotAllowedError') setStatus('blocked');
  };
  try {
    const p = audio.play();
    if (p && p.then) p.then(() => done(true), (e) => done(false, e)); else done(true);
  } catch (e) { done(false, e); }
}

function refresh() {
  if (!enabled()) { setStatus('off'); return; }
  if (status === 'off') setStatus(allowed ? 'ok' : 'blocked');
  probe();
}
on('settings', refresh);
on('audio', refresh);

// Any touch on the screen: play with sound inside the touch, which unlocks this element.
export function unlock() {
  if (!enabled() || allowed || playing) return;
  load(srcFor('dhuhr'));
  audio.volume = 0;
  try {
    const p = audio.play();
    const done = (ok) => { audio.pause(); audio.currentTime = 0; if (ok) { allowed = true; setStatus('ok'); } };
    if (p && p.then) p.then(() => done(true), () => done(false)); else done(true);
  } catch (e) { /* ignore */ }
}

export function play(k) {
  const src = srcFor(k);
  if (!src || DEMO) return;
  load(src);
  audio.volume = (config.adhan && config.adhan.volume) || 0.8;
  audio.currentTime = 0;
  playing = k;
  notify();
  const p = audio.play();
  if (p && p.then) {
    p.then(() => { allowed = true; setStatus('ok'); }, (e) => {
      playing = null;
      if (e && e.name === 'NotAllowedError') setStatus('blocked');
      notify();
    });
  }
}

export function stop() {
  audio.pause();
  playing = null;
  notify();
}
audio.addEventListener('ended', () => { if (playing) { playing = null; notify(); } });
audio.addEventListener('error', () => { if (playing) { playing = null; notify(); } });

// Called every second: start the adhan when a prayer time arrives.
export function tick(t) {
  if (!enabled()) return;
  const day = prayerDay(t);
  if (!day) return;
  for (const k of PRAYER_KEYS) {
    const at = day[k];
    if (!at) continue;
    const id = new Date(at).toISOString().slice(0, 10) + '-' + k;
    if (played.has(id)) continue;
    // Only within the first minute: a frame that starts up later doesn't play an old adhan.
    if (t >= at && t - at < MINUTE) {
      played.add(id);
      if (config.adhan.prayers[k] !== false) play(k);
    } else if (t - at >= MINUTE) {
      played.add(id);
    }
  }
}

refresh();
