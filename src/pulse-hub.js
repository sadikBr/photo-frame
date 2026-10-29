// «نبضة»: little moments sent from a phone to the frame — a tap (hearts, moon, car…), a finger
// drawing, or a short voice note — and hearts sent back from the frame.
//
// One Durable Object holds them. Unlike KV it is always up to date at once, and it keeps a live
// WebSocket to each open frame so a moment appears within a second. Frames that can't hold the
// socket ask GET /api/pulse?since=… every few seconds instead.
//
//   POST /api/pulse            {kind:"tap", tap, from} | {kind:"draw", strokes, from}
//   POST /api/pulse/voice      ?from=…&dur=… ; body = the recording (audio/*)
//   POST /api/pulse/reply      {to: pulseId}             a heart back from the frame
//   GET  /api/pulse            ?since=<ms>&light=1        recent moments, and how many frames are live
//   GET  /api/pulse/audio/<id> the recording
//   GET  /api/pulse/live       WebSocket (the frame)
//   GET  /api/pulse/push       {enabled, publicKey} for phone notifications
//   POST /api/pulse/push/subscribe {subscription, name, notify: "all"|"mine"}
//   POST /api/pulse/push/unsubscribe {endpoint} · POST /api/pulse/push/test {endpoint}
//   GET  /api/pulse/phones     names of the phones that get notifications (the frame's knock)
//
// «الدقّة السرية»: POST /api/pulse {kind:"knock", rhythm:[ms…], from} — from a phone, the frame
// plays the knocks; from the frame (no from, optional to: a name), the phones vibrate it.
// «عجلة الحظ»: GET/PUT /api/pulse/wheels {wheels:[{id,name,items}]} · POST /api/pulse/spin
// {wheel, from} — the server picks, and the spin is a moment like the others.
// «وضع الماتش»: GET /api/pulse/match (state, refreshed from ESPN when due) · PUT {on, push} ·
// POST /api/pulse/match/preview {stop?} · POST /api/pulse/match/cheer {from, cheer}.
// «مفاجأة مؤجلة»: POST /api/pulse (or /voice?at=…) with "at": kept back until then (an alarm
// sends it) · GET /api/pulse/later?from=… · POST /api/pulse/later/cancel {id, from}.
// «نبضة حقيقية»: POST /api/pulse {kind:"beat", bpm, intervals:[ms…], from}.
// «حالتي»: GET /api/pulse/status · PUT {from, text, emoji, until} · POST /api/pulse/status/clear {from}.
// «تلوين الزليج»: GET /api/pulse/coloring · POST …/fill {tile, color, from} · …/new {from} ·
// …/saved {which: "current"|archived page's id} (the frame saves finished pages as photos).
// «القرآن»: GET /api/pulse/quran · PUT {favs, schedules, volume, mode, reciter} · POST …/cmd {action:
// play|pause|resume|next|prev|stop|volume, surah|list, idx, mode, reciter, volume, from} (the frame hears at
// once) · POST …/status {id, idx, state, pos, dur} (the frame says what it is playing).
//
// Phone notifications (Web Push): a new moment goes to every other phone that asked for all
// moments; a heart back goes to the phone(s) of the person it answers; a knock from the frame to
// the phone it's for (or all); goals to everyone who asked for all.

import { sendPush, validSubscription } from './webpush.js';
import { tileCount, PATTERN_COUNT, weekIndex } from '../public/js/zellige.js';
import { validSurah, validReciter, DEFAULT_FAVS } from '../public/js/quran-common.js';
import { LEAGUES, scoreboardUrl, parseScoreboard, pickMatch, matchChanges, changeMessage, previewMatch, PREVIEW_MS } from './match.js';

export const pushDeps = { fetch: (...a) => fetch(...a) }; // tests swap this
export const matchDeps = { fetch: (...a) => fetch(...a), now: () => Date.now() }; // and this

export const TAPS = ['love', 'miss', 'morning', 'night', 'way', 'news'];
const KEEP = 60; // moments kept
const MAX_SUBS = 40; // phones with notifications
const TAP_TITLES = { love: 'أفكر فيكم', miss: 'اشتقت إليكم', morning: 'صباح الخير', night: 'تصبحون على خير', way: 'أنا في الطريق إلى البيت', news: 'عندي خبر سعيد!' };
const KEEP_MS = 7 * 86400000; // and no older than a week
const MAX_AUDIO = 600 * 1024; // a stored value may be up to 2 MB
// The list of moments is one stored value; drawings and recordings are kept apart under their
// own keys ('draw:<id>', 'audio:<id>') so the list stays small.
const MAX_POINTS = 8000;
const HOME = 'البيت'; // the frame, when it sends something
const MAX_WHEELS = 12, MAX_ITEMS = 12;
export const CHEERS = ['flag', 'ball', 'clap', 'fire', 'horn'];
const MAX_LATER = 50; // surprises waiting
const LATER_MAX_MS = 60 * 86400000; // up to two months ahead
const GLAZES = 10;
const MIN = 60000, HOUR = 3600000;

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});
const fail = (status, error) => json({ error }, status);
const name = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, 24);
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// Strokes: [{ c: colour 0–5, w: 1|2, p: [x, y, t, x, y, t, …] }] with x, y in 0–1000 and t in ms
// since the drawing began. Anything else is dropped.
export function cleanStrokes(input) {
  if (!Array.isArray(input)) return null;
  const out = [];
  let points = 0;
  for (const s of input.slice(0, 300)) {
    if (!s || !Array.isArray(s.p)) continue;
    const p = [];
    for (let i = 0; i + 2 < s.p.length; i += 3) {
      const x = Math.round(Number(s.p[i])), y = Math.round(Number(s.p[i + 1])), t = Math.round(Number(s.p[i + 2]));
      if (![x, y, t].every(Number.isFinite)) continue;
      p.push(Math.min(1000, Math.max(0, x)), Math.min(1000, Math.max(0, y)), Math.min(600000, Math.max(0, t)));
      if (++points > MAX_POINTS) break;
    }
    if (p.length) out.push({ c: Math.min(5, Math.max(0, Math.round(Number(s.c)) || 0)), w: s.w === 2 ? 2 : 1, p });
    if (points > MAX_POINTS) break;
  }
  return out.length ? out : null;
}

// A knock: tap times in ms from the first tap. Up to 16 taps within 8 s; taps closer than 70 ms
// count as one.
export function cleanRhythm(input) {
  if (!Array.isArray(input)) return null;
  const t = input.map(Number).filter(Number.isFinite).map(Math.round).sort((a, b) => a - b);
  if (!t.length) return null;
  const out = [];
  for (const x of t) {
    const v = x - t[0];
    if (v > 8000) break;
    if (out.length && v - out[out.length - 1] < 70) continue;
    out.push(v);
    if (out.length >= 16) break;
  }
  return out;
}
// "طق طق … طق": the taps, with a pause where the rhythm pauses.
export function knockWords(r) {
  let s = '';
  r.forEach((t, i) => { s += i ? (t - r[i - 1] > 450 ? ' … ' : ' ') : ''; s += 'طق'; });
  return s;
}
// The same rhythm as a vibration: buzz, pause, buzz…
export function knockVibration(r) {
  const out = [];
  r.forEach((t, i) => {
    if (i) out.push(Math.max(40, t - r[i - 1] - 70));
    out.push(70);
  });
  return out;
}

export function cleanWheels(input) {
  if (!Array.isArray(input)) return null;
  const out = [];
  for (const w of input.slice(0, MAX_WHEELS)) {
    if (!w || typeof w !== 'object') continue;
    const nm = String(w.name == null ? '' : w.name).replace(/\s+/g, ' ').trim().slice(0, 40);
    const items = [...new Set((Array.isArray(w.items) ? w.items : []).map(name).filter(Boolean))].slice(0, MAX_ITEMS);
    if (!nm || items.length < 2) continue;
    out.push({ id: typeof w.id === 'string' && /^[a-z0-9]{4,24}$/.test(w.id) ? w.id : newId(), name: nm, items });
  }
  return out;
}

// A heartbeat from a phone's camera (or taps): beats per minute and the gaps between beats.
export function cleanBeat(body) {
  const bpm = Math.round(Number(body.bpm));
  if (!Number.isFinite(bpm) || bpm < 35 || bpm > 210) return null;
  const iv = (Array.isArray(body.intervals) ? body.intervals : []).map((x) => Math.round(Number(x))).filter((x) => x >= 280 && x <= 1800).slice(-40);
  return { bpm, intervals: iv.length >= 3 ? iv : Array(8).fill(Math.round(60000 / bpm)) };
}

export class PulseHub {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    // Keep-alive pings are answered without waking the object.
    try { ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong')); } catch (e) { /* not in tests */ }
  }

  sockets() { try { return this.ctx.getWebSockets(); } catch (e) { return []; } }
  live() { return this.sockets().length + (this.lastPoll && Date.now() - this.lastPoll < 20000 ? 1 : 0); }

  async load() { return (await this.ctx.storage.get('pulses')) || []; }

  async drop(x) {
    if (x.audio) await this.ctx.storage.delete('audio:' + x.id);
    if (x.kind === 'draw') await this.ctx.storage.delete('draw:' + x.id);
  }

  // Put each drawing back into its moment (the frame needs them; phones ask with light=1).
  async withStrokes(list) {
    const keys = list.filter((x) => x.kind === 'draw').map((x) => 'draw:' + x.id);
    if (!keys.length) return list;
    const found = new Map();
    for (let i = 0; i < keys.length; i += 100) {
      const got = await this.ctx.storage.get(keys.slice(i, i + 100));
      for (const [k, v] of got) found.set(k, v);
    }
    return list.map((x) => (x.kind === 'draw' ? Object.assign({}, x, { strokes: found.get('draw:' + x.id) || [] }) : x));
  }

  async add(p, force) {
    const now = Date.now();
    const all = await this.load();
    const list = [];
    for (const x of all) {
      if (now - x.at < KEEP_MS) list.push(x);
      else await this.drop(x);
    }
    // Not too fast: the same person and kind within 2 s, or more than 120 an hour.
    // (Hearts back are checked per moment: someone may answer several in a row.)
    if (!force && list.some((x) => x.from === p.from && x.kind === p.kind && x.to === p.to && now - x.at < 2000)) return fail(429, 'لحظة… أُرسلت للتو.');
    if (!force && list.filter((x) => now - x.at < 3600000).length >= 120) return fail(429, 'كثير من النبضات في ساعة واحدة. انتظر قليلاً.');
    p.id = p.id || newId();
    // Strictly increasing, so "everything after <at>" never misses one sent in the same ms.
    p.at = Math.max(now, list.length ? list[list.length - 1].at + 1 : 0);
    const item = Object.assign({}, p);
    if (p.strokes) {
      await this.ctx.storage.put('draw:' + p.id, p.strokes);
      delete item.strokes;
      item.points = p.strokes.reduce((n, s) => n + s.p.length / 3, 0);
    }
    list.push(item);
    while (list.length > KEEP) await this.drop(list.shift());
    await this.ctx.storage.put('pulses', list);
    const msg = JSON.stringify({ type: 'pulse', pulse: p });
    let live = 0;
    for (const ws of this.sockets()) { try { ws.send(msg); live++; } catch (e) { /* closed */ } }
    if (!live && this.lastPoll && now - this.lastPoll < 20000) live = 1; // it will ask within seconds
    // Phones are told in the background; the sender doesn't wait for them.
    this.pushing = this.notify(item).catch((e) => console.error('push', e));
    if (this.ctx.waitUntil) this.ctx.waitUntil(this.pushing);
    return json({ pulse: p, live });
  }

  // ---------- phone notifications ----------
  vapid() {
    const e = this.env || {};
    if (!e.VAPID_PUBLIC_KEY || !e.VAPID_PRIVATE_KEY) return null;
    return { publicKey: e.VAPID_PUBLIC_KEY, privateKey: e.VAPID_PRIVATE_KEY, subject: e.VAPID_SUBJECT || this.origin || 'https://example.com' };
  }

  async subs() { return (await this.ctx.storage.get('subs')) || []; }

  message(p) {
    const what = (kind, tap, mine) => (kind === 'tap' ? '«' + (TAP_TITLES[tap] || '') + '»' : kind === 'draw' ? (mine ? 'رسمتك' : 'رسمة')
      : kind === 'knock' ? (mine ? 'دقّتك' : 'دقّة') : (mine ? 'رسالتك الصوتية' : 'رسالة صوتية'));
    const base = { id: p.id, kind: p.kind, from: p.from, tag: 'pulse-' + p.id, url: '/admin#pulse' };
    if (p.kind === 'reply') {
      return Object.assign(base, { title: '❤ قلب من ' + p.from, body: 'ردّاً على ' + what(p.toKind, p.toTap, true), heart: false });
    }
    if (p.kind === 'knock') {
      return Object.assign(base, {
        title: '🚪 دقّة من ' + p.from,
        body: (p.from === HOME ? '' : 'على باب البيت · ') + knockWords(p.rhythm),
        url: '/admin?play=' + p.id + '#fun',
        vibrate: knockVibration(p.rhythm),
        heart: p.from !== HOME,
      });
    }
    if (p.kind === 'beat') {
      return Object.assign(base, { title: (p.sched ? '🎁 ' : '💓 ') + 'نبضة قلب من ' + p.from, body: p.bpm + ' نبضة في الدقيقة · قلبٌ ينبض لكم', heart: true });
    }
    if (p.kind === 'spin') {
      return Object.assign(base, { title: '🎡 ' + p.wheelName, body: 'النتيجة: ' + p.result + ' · من ' + (p.from === HOME ? 'الإطار' : p.from), url: '/admin#fun', heart: false });
    }
    const body = p.kind === 'tap' ? what('tap', p.tap) : p.kind === 'draw' ? 'رسمة جديدة على الإطار'
      : 'رسالة صوتية' + (p.audio && p.audio.dur ? ' (' + Math.round(p.audio.dur) + ' ث)' : '');
    return Object.assign(base, { title: (p.sched ? '🎁 مفاجأة من ' : 'نبضة من ') + p.from, body, heart: true });
  }

  // Who hears about it: a heart goes to whoever it answers; a moment to everyone else who
  // wants all of them.
  async notify(p) {
    const vapid = this.vapid();
    if (!vapid) return 0;
    const subs = await this.subs();
    const to = p.kind === 'reply'
      ? subs.filter((s) => s.name === p.toName && s.notify !== 'off')
      : p.kind === 'knock' && p.from === HOME
        ? subs.filter((s) => s.notify !== 'off' && (!p.toName || s.name === p.toName))
        : subs.filter((s) => s.name !== p.from && s.notify === 'all');
    return this.pushTo(to, this.message(p), p.kind === 'reply' || p.kind === 'knock' ? 'high' : 'normal');
  }

  async pushTo(to, message, urgency) {
    const vapid = this.vapid();
    if (!vapid || !to.length) return 0;
    const gone = [];
    let sent = 0;
    await Promise.all(to.map(async (s) => {
      try {
        const status = await sendPush(s, message, vapid, { fetch: pushDeps.fetch, urgency });
        if (status === 404 || status === 410) gone.push(s.endpoint);
        else if (status >= 200 && status < 300) sent++;
      } catch (e) { console.error('push to', new URL(s.endpoint).host, e.message); }
    }));
    if (gone.length) await this.ctx.storage.put('subs', (await this.subs()).filter((s) => !gone.includes(s.endpoint)));
    return sent;
  }

  async fetch(request) {
    const url = new URL(request.url);
    this.origin = url.origin;
    const path = url.pathname.replace(/\/+$/, '');
    const method = request.method;

    if (path === '/api/pulse/live') {
      if (request.headers.get('upgrade') !== 'websocket') return fail(426, 'WebSocket expected.');
      const pair = new WebSocketPair();
      this.ctx.acceptWebSocket(pair[1]);
      pair[1].send(JSON.stringify({ type: 'hello', at: Date.now() }));
      return new Response(null, { status: 101, webSocket: pair[0] });
    }

    if (path === '/api/pulse' && method === 'GET') {
      await this.releaseDue();
      const since = Number(url.searchParams.get('since')) || 0;
      const light = url.searchParams.get('light') === '1';
      let list = (await this.load()).filter((x) => x.at > since && Date.now() - x.at < KEEP_MS);
      if (!light) list = await this.withStrokes(list);
      // A frame without the live socket asks every few seconds: count it as listening too.
      // (Phones ask with light=1.)
      if (!light) this.lastPoll = Date.now();
      return json({ pulses: list, live: this.live(), now: Date.now() });
    }

    if (path === '/api/pulse' && method === 'POST') {
      let body;
      try { body = await request.json(); } catch (e) { return fail(400, 'Body must be JSON.'); }
      const from = name(body.from);
      // Sent now, or kept for later («مفاجأة مؤجلة»).
      const due = body.at == null ? 0 : Number(body.at);
      if (due && (!Number.isFinite(due) || due > Date.now() + LATER_MAX_MS)) return fail(400, 'Choose a time within the next two months.');
      const go = (p) => (due && due > Date.now() + 20000 ? this.later(p, due) : this.add(p));
      if (body.kind === 'knock') {
        const rhythm = cleanRhythm(body.rhythm);
        if (!rhythm) return fail(400, 'The knock is empty.');
        const p = { kind: 'knock', from: from || HOME, rhythm };
        const to = name(body.to);
        if (p.from === HOME && to) p.toName = to;
        return go(p);
      }
      if (!from) return fail(400, 'Who is sending? Choose your name first.');
      if (body.kind === 'tap') {
        if (!TAPS.includes(body.tap)) return fail(400, 'Unknown tap.');
        return go({ kind: 'tap', tap: body.tap, from });
      }
      if (body.kind === 'draw') {
        const strokes = cleanStrokes(body.strokes);
        if (!strokes) return fail(400, 'The drawing is empty.');
        return go({ kind: 'draw', strokes, from });
      }
      if (body.kind === 'beat') {
        const b = cleanBeat(body);
        if (!b) return fail(400, 'That is not a heartbeat (35–210 a minute).');
        return go(Object.assign({ kind: 'beat', from }, b));
      }
      return fail(400, 'Unknown kind.');
    }

    if (path === '/api/pulse/voice' && method === 'POST') {
      const from = name(url.searchParams.get('from'));
      if (!from) return fail(400, 'Who is sending? Choose your name first.');
      const type = (request.headers.get('content-type') || '').split(';')[0].trim();
      if (!/^audio\/[a-z0-9.+-]+$/.test(type)) return fail(415, 'Send an audio recording.');
      const buf = await request.arrayBuffer();
      if (!buf.byteLength) return fail(400, 'The recording is empty.');
      if (buf.byteLength > MAX_AUDIO) return fail(413, 'The recording is too long.');
      const dur = Math.min(30, Math.max(0, Number(url.searchParams.get('dur')) || 0));
      const due = Number(url.searchParams.get('at')) || 0;
      if (due && due > Date.now() + LATER_MAX_MS) return fail(400, 'Choose a time within the next two months.');
      const id = newId();
      await this.ctx.storage.put('audio:' + id, { type, data: buf });
      const v = { id, kind: 'voice', from, audio: { type, dur: Math.round(dur * 10) / 10 } };
      const res = due > Date.now() + 20000 ? await this.later(v, due) : await this.add(v);
      if (res.status !== 200) await this.ctx.storage.delete('audio:' + id);
      return res;
    }

    const am = /^\/api\/pulse\/audio\/([a-z0-9]{6,24})$/.exec(path);
    if (am && method === 'GET') {
      const a = await this.ctx.storage.get('audio:' + am[1]);
      if (!a) return fail(404, 'No such recording.');
      return new Response(a.data, { headers: { 'content-type': a.type, 'cache-control': 'private, max-age=604800, immutable' } });
    }

    // A heart back: from the frame («البيت»), or from a phone (its owner's name).
    if (path === '/api/pulse/reply' && method === 'POST') {
      let body;
      try { body = await request.json(); } catch (e) { return fail(400, 'Body must be JSON.'); }
      const target = (await this.load()).find((x) => x.id === body.to);
      if (!target || target.kind === 'reply') return fail(404, 'That moment is gone.');
      const from = name(body.from) || 'البيت';
      const reply = { kind: 'reply', from, to: target.id, toName: target.from, toKind: target.kind };
      if (target.tap) reply.toTap = target.tap;
      return this.add(reply);
    }

    // ---------- surprises for later ----------
    if (path === '/api/pulse/later' && method === 'GET') {
      await this.releaseDue();
      const who = name(url.searchParams.get('from'));
      const list = (await this.laterList()).filter((x) => x.from === who).map((x) => {
        const o = Object.assign({}, x);
        delete o.strokes;
        return o;
      });
      return json({ later: list });
    }
    if (path === '/api/pulse/later/cancel' && method === 'POST') {
      let body;
      try { body = await request.json(); } catch (e) { return fail(400, 'Body must be JSON.'); }
      const list = await this.laterList();
      const x = list.find((y) => y.id === body.id);
      if (!x) return fail(404, 'It was already sent (or cancelled).');
      if (x.from !== name(body.from)) return fail(403, 'Only whoever wrote it can cancel it.');
      await this.drop(x);
      await this.ctx.storage.put('later', list.filter((y) => y.id !== x.id));
      await this.setNextAlarm();
      return json({ ok: true });
    }

    // ---------- statuses ----------
    if (path === '/api/pulse/status' && method === 'GET') return json({ statuses: await this.statuses() });
    if ((path === '/api/pulse/status' && method === 'PUT') || (path === '/api/pulse/status/clear' && method === 'POST')) {
      let body;
      try { body = await request.json(); } catch (e) { return fail(400, 'Body must be JSON.'); }
      const who = name(body.from);
      if (!who) return fail(400, 'Who is this? Choose your name first.');
      const all = (await this.ctx.storage.get('statuses')) || {};
      if (path.endsWith('/clear')) delete all[who];
      else {
        const text = String(body.text == null ? '' : body.text).replace(/\s+/g, ' ').trim().slice(0, 40);
        const emoji = String(body.emoji == null ? '' : body.emoji).trim().slice(0, 8);
        const until = Number(body.until);
        if (!text) return fail(400, 'Write a status.');
        if (!Number.isFinite(until) || until < Date.now() + 60000 || until > Date.now() + 7 * 86400000) return fail(400, 'Choose until when (up to a week).');
        all[who] = { text, emoji, until, at: Date.now() };
        const names = Object.keys(all);
        if (names.length > 30) delete all[names.sort((a, b) => all[a].at - all[b].at)[0]];
      }
      await this.ctx.storage.put('statuses', all);
      const list = await this.statuses();
      this.broadcast({ type: 'status', statuses: list });
      return json({ statuses: list });
    }

    // ---------- zellige colouring ----------
    if (path === '/api/pulse/coloring' && method === 'GET') return json(await this.coloring());
    if (path.startsWith('/api/pulse/coloring/') && method === 'POST') {
      let body;
      try { body = await request.json(); } catch (e) { return fail(400, 'Body must be JSON.'); }
      const action = path.slice('/api/pulse/coloring/'.length);
      const state = await this.coloring();
      const c = state.page;
      if (action === 'fill') {
        const tile = Number(body.tile), color = Number(body.color);
        if (!Number.isInteger(tile) || tile < 0 || tile >= tileCount(c.pid)) return fail(400, 'No such tile.');
        if (!Number.isInteger(color) || color < -1 || color >= GLAZES) return fail(400, 'No such colour.');
        const who = name(body.from) || HOME;
        if (color < 0) delete c.fills[tile]; else c.fills[tile] = color;
        c.who[who] = (c.who[who] || 0) + 1;
        c.v++;
        const done = Object.keys(c.fills).length >= tileCount(c.pid);
        if (done && !c.doneAt) c.doneAt = Date.now();
        if (!done) c.doneAt = 0;
        await this.ctx.storage.put('coloring', c);
        this.broadcast({ type: 'color', tile, color, v: c.v, from: who, done: !!c.doneAt, pid: c.pid });
        return json({ v: c.v, done: !!c.doneAt });
      }
      if (action === 'new') {
        const next = this.archivePage(state, c);
        next.pid = (c.pid + 1) % PATTERN_COUNT;
        await this.ctx.storage.put('coloring', next);
        await this.ctx.storage.put('coloringArchive', state.archive);
        const out = await this.coloring();
        this.broadcast({ type: 'coloring', coloring: out });
        return json(out);
      }
      if (action === 'saved') {
        if (body.which === 'current') { c.savedAt = Date.now(); await this.ctx.storage.put('coloring', c); }
        else await this.ctx.storage.put('coloringArchive', state.archive.filter((x) => x.id !== body.which));
        return json(await this.coloring());
      }
      return fail(404, 'Unknown colouring route.');
    }

    // ---------- the Quran ----------
    if (path === '/api/pulse/quran' && method === 'GET') return json(await this.quran());
    if (path === '/api/pulse/quran' && method === 'PUT') {
      let body;
      try { body = await request.json(); } catch (e) { return fail(400, 'Body must be JSON.'); }
      const cfg = (await this.quran()).cfg;
      if (Array.isArray(body.favs)) cfg.favs = [...new Set(body.favs.map(Number).filter(validSurah))].slice(0, 30);
      if (['one', 'list', 'repeat'].includes(body.mode)) cfg.mode = body.mode;
      if (body.reciter !== undefined) {
        if (!validReciter(body.reciter)) return fail(400, 'Unknown reciter.');
        cfg.reciter = body.reciter;
      }
      if (body.volume != null && Number.isFinite(Number(body.volume))) cfg.volume = Math.min(1, Math.max(0, Number(body.volume)));
      if (Array.isArray(body.schedules)) {
        cfg.schedules = body.schedules.slice(0, 20).map((x) => ({
          id: typeof x.id === 'string' && /^[a-z0-9]{4,24}$/.test(x.id) ? x.id : newId(),
          surah: Number(x.surah),
          days: [...new Set((Array.isArray(x.days) ? x.days : []).map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort(),
          time: /^([01]\d|2[0-3]):[0-5]\d$/.test(x.time) ? x.time : '',
          on: x.on !== false,
        })).filter((x) => validSurah(x.surah) && x.days.length && x.time);
      }
      await this.ctx.storage.put('quranCfg', cfg);
      const q = await this.quran();
      this.broadcast({ type: 'quran', quran: q });
      return json(q);
    }
    if (path === '/api/pulse/quran/cmd' && method === 'POST') {
      let body;
      try { body = await request.json(); } catch (e) { return fail(400, 'Body must be JSON.'); }
      const q = await this.quran();
      let play = q.play;
      const by = name(body.from) || HOME;
      const a = body.action;
      if (a === 'play') {
        const list = Array.isArray(body.list) ? body.list.map(Number).filter(validSurah).slice(0, 114) : validSurah(Number(body.surah)) ? [Number(body.surah)] : [];
        if (!list.length) return fail(400, 'Which surah?');
        const idx = Math.min(list.length - 1, Math.max(0, Number(body.idx) || 0));
        const mode = ['one', 'list', 'repeat'].includes(body.mode) ? body.mode : list.length > 1 ? q.cfg.mode === 'one' ? 'list' : q.cfg.mode : 'one';
        if (body.reciter !== undefined && !validReciter(body.reciter)) return fail(400, 'Unknown reciter.');
        const reciter = validReciter(body.reciter) ? body.reciter : validReciter(q.cfg.reciter) ? q.cfg.reciter : 'nufais';
        play = { id: newId(), list, idx, mode, reciter, by, at: Date.now(), paused: false, rev: 0 };
        q.status = null;
      } else if (a === 'volume') {
        const v = Number(body.volume);
        if (!Number.isFinite(v)) return fail(400, 'Volume 0–1.');
        q.cfg.volume = Math.min(1, Math.max(0, v));
        await this.ctx.storage.put('quranCfg', q.cfg);
      } else {
        if (!play) return fail(409, 'Nothing is playing.');
        if (a === 'pause') play.paused = true;
        else if (a === 'resume') play.paused = false;
        else if (a === 'stop') play = null;
        else if (a === 'next' || a === 'prev') {
          let i = play.idx + (a === 'next' ? 1 : -1);
          if (i >= play.list.length) i = play.mode === 'repeat' ? 0 : -1;
          if (i < 0 && a === 'prev') i = 0;
          if (i < 0) play = null; else { play.idx = i; play.paused = false; q.status = null; }
        } else return fail(400, 'Unknown action.');
        if (play) { play.rev = (play.rev || 0) + 1; play.by = by; }
      }
      await this.ctx.storage.put('quranPlay', play);
      if (a !== 'volume') await this.ctx.storage.put('quranStatus', q.status || null);
      const out = await this.quran();
      this.broadcast({ type: 'quran', quran: out });
      return json(out);
    }
    if (path === '/api/pulse/quran/status' && method === 'POST') {
      let body;
      try { body = await request.json(); } catch (e) { return fail(400, 'Body must be JSON.'); }
      const q = await this.quran();
      const play = q.play;
      if (!play || play.id !== body.id) return json({ ok: false });
      const st = ['playing', 'paused', 'loading', 'error', 'ended'].includes(body.state) ? body.state : 'playing';
      if (st === 'ended') {
        await this.ctx.storage.put('quranPlay', null);
        await this.ctx.storage.put('quranStatus', null);
      } else {
        // The frame moves on through a list by itself: keep the server's place in step.
        const idx = Number(body.idx);
        if (Number.isInteger(idx) && idx >= 0 && idx < play.list.length && idx !== play.idx) { play.idx = idx; await this.ctx.storage.put('quranPlay', play); }
        await this.ctx.storage.put('quranStatus', { id: play.id, idx: play.idx, state: st, pos: Math.max(0, Number(body.pos) || 0), dur: Math.max(0, Number(body.dur) || 0), at: Date.now() });
      }
      return json({ ok: true });
    }

    if (path === '/api/pulse/phones' && method === 'GET') {
      const names = [...new Set((await this.subs()).filter((s) => s.notify !== 'off').map((s) => s.name))];
      return json({ names });
    }

    // ---------- the wheel ----------
    if (path === '/api/pulse/wheels') {
      if (method === 'GET') return json({ wheels: await this.wheels() });
      if (method === 'PUT') {
        let body;
        try { body = await request.json(); } catch (e) { return fail(400, 'Body must be JSON.'); }
        const wheels = cleanWheels(body.wheels);
        if (!wheels) return fail(400, 'Send {wheels: [...]}.');
        await this.ctx.storage.put('wheels', wheels);
        this.broadcast({ type: 'wheels', wheels });
        return json({ wheels });
      }
    }
    if (path === '/api/pulse/spin' && method === 'POST') {
      let body;
      try { body = await request.json(); } catch (e) { return fail(400, 'Body must be JSON.'); }
      const w = (await this.wheels()).find((x) => x.id === body.wheel);
      if (!w) return fail(404, 'That wheel is gone.');
      const idx = crypto.getRandomValues(new Uint32Array(1))[0] % w.items.length;
      return this.add({ kind: 'spin', from: name(body.from) || HOME, wheel: w.id, wheelName: w.name, items: w.items, idx, result: w.items[idx] });
    }

    // ---------- match mode ----------
    if (path === '/api/pulse/match') {
      if (method === 'GET') return json(await this.matchView(Number(url.searchParams.get('since')) || 0));
      if (method === 'PUT') {
        let body;
        try { body = await request.json(); } catch (e) { return fail(400, 'Body must be JSON.'); }
        const cfg = await this.matchCfg();
        if (typeof body.on === 'boolean') cfg.on = body.on;
        if (typeof body.push === 'boolean') cfg.push = body.push;
        await this.ctx.storage.put('matchCfg', cfg);
        const v = await this.matchView(0);
        this.broadcast({ type: 'match', view: v });
        return json(v);
      }
    }
    if (path === '/api/pulse/match/preview' && method === 'POST') {
      let body = {};
      try { body = await request.json(); } catch (e) { /* none */ }
      const st = (await this.ctx.storage.get('match')) || {};
      if (body.stop) delete st.preview; else st.preview = matchDeps.now();
      await this.ctx.storage.put('match', st);
      const v = await this.matchView(0);
      this.broadcast({ type: 'match', view: v });
      return json(v);
    }
    if (path === '/api/pulse/match/cheer' && method === 'POST') {
      let body;
      try { body = await request.json(); } catch (e) { return fail(400, 'Body must be JSON.'); }
      const from = name(body.from);
      if (!from) return fail(400, 'Who is cheering? Choose your name first.');
      if (!CHEERS.includes(body.cheer)) return fail(400, 'Unknown cheer.');
      const now = Date.now();
      this.cheers = (this.cheers || []).filter((c) => now - c.at < 2 * MIN);
      if (this.cheers.some((c) => c.from === from && now - c.at < 600)) return fail(429, 'لحظة…');
      const c = { id: newId(), from, cheer: body.cheer, at: Math.max(now, this.cheers.length ? this.cheers[this.cheers.length - 1].at + 1 : 0) };
      this.cheers.push(c);
      if (this.cheers.length > 60) this.cheers.shift();
      this.broadcast({ type: 'cheer', cheer: c });
      return json({ cheer: c, live: this.live() });
    }

    if (path === '/api/pulse/push' && method === 'GET') {
      const v = this.vapid();
      // Names only (never values), so the control panel can say exactly what is missing.
      const missing = ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY'].filter((k) => !(this.env || {})[k]);
      return json({ enabled: !!v, publicKey: v ? v.publicKey : null, missing });
    }
    if (path.startsWith('/api/pulse/push/') && method === 'POST') {
      let body;
      try { body = await request.json(); } catch (e) { return fail(400, 'Body must be JSON.'); }
      const action = path.slice('/api/pulse/push/'.length);
      let subs = await this.subs();
      if (action === 'subscribe') {
        if (!this.vapid()) return fail(501, 'Notifications are not set up on the server (VAPID keys). See the README.');
        const sub = body.subscription;
        if (!validSubscription(sub)) return fail(400, 'Not a push subscription from a known browser.');
        const who = name(body.name);
        if (!who) return fail(400, 'Who is this phone? Choose your name first.');
        const notify = ['all', 'mine', 'off'].includes(body.notify) ? body.notify : 'all';
        subs = subs.filter((s) => s.endpoint !== sub.endpoint);
        subs.push({ endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth }, name: who, notify, at: Date.now() });
        while (subs.length > MAX_SUBS) subs.shift();
        await this.ctx.storage.put('subs', subs);
        return json({ ok: true, name: who, notify, phones: subs.length });
      }
      if (action === 'unsubscribe') {
        await this.ctx.storage.put('subs', subs.filter((s) => s.endpoint !== body.endpoint));
        return json({ ok: true });
      }
      if (action === 'test') {
        const s = subs.find((x) => x.endpoint === body.endpoint);
        const vapid = this.vapid();
        if (!s || !vapid) return fail(404, 'This phone is not signed up for notifications.');
        let status = 0;
        try {
          status = await sendPush(s, { title: 'نبضة', body: 'هكذا تصلك النبضات على هذا الهاتف ❤', tag: 'pulse-test', url: '/admin#pulse', heart: false }, vapid, { fetch: pushDeps.fetch, urgency: 'high' });
        } catch (e) { return json({ ok: false, status: 0, error: 'The push service could not be reached.' }); }
        if (status === 404 || status === 410) await this.ctx.storage.put('subs', subs.filter((x) => x.endpoint !== s.endpoint));
        return json({ ok: status >= 200 && status < 300, status });
      }
      return fail(404, 'Unknown push route.');
    }

    return fail(404, 'Unknown pulse route.');
  }

  broadcast(msg) {
    const s = JSON.stringify(msg);
    for (const ws of this.sockets()) { try { ws.send(s); } catch (e) { /* closed */ } }
  }

  async wheels() { return (await this.ctx.storage.get('wheels')) || []; }

  // ---------- match mode ----------
  async matchCfg() { return Object.assign({ on: true, push: true }, await this.ctx.storage.get('matchCfg')); }

  // One look at a time (the frame, the phones and the alarm may all ask at once).
  matchView(since) {
    if (!this.matchBusy) {
      this.matchBusy = this.matchRefresh()
        .catch((e) => { console.error('match', e); return { on: true, mode: 'none', match: null, now: Date.now(), error: 'match data unavailable' }; })
        .finally(() => { this.matchBusy = null; });
    }
    return this.matchBusy.then((v) => Object.assign({}, v, { cheers: (this.cheers || []).filter((c) => c.at > since && Date.now() - c.at < 2 * MIN) }));
  }

  async matchRefresh() {
    const now = matchDeps.now();
    const cfg = await this.matchCfg();
    const st = (await this.ctx.storage.get('match')) || {};
    if (st.preview && now - st.preview < PREVIEW_MS + 15 * 1000) {
      const m = previewMatch(st.preview, now);
      return { on: true, cfg, mode: 'live', match: m, now };
    }
    if (!cfg.on) return { on: false, cfg, mode: 'none', match: null, now };
    let dirty = false;
    const changes = [];
    const before = st.cur || null;
    // Look for Morocco's matches every 3 hours; every 30 minutes on a match day.
    const soon = before && before.state !== 'post' && before.kickoff - now < 6 * HOUR;
    if (!st.scannedAt || now - st.scannedAt > (soon ? 30 * MIN : 3 * HOUR)) {
      const lists = await Promise.all(LEAGUES.map(async (slug) => {
        try {
          const r = await matchDeps.fetch(scoreboardUrl(slug, now - 86400000, now + 2 * 86400000), { headers: { accept: 'application/json' } });
          if (!r.ok) return null;
          return parseScoreboard(await r.json(), slug);
        } catch (e) { return null; }
      }));
      // ESPN didn't answer at all: try again in 10 minutes.
      st.scannedAt = lists.some(Boolean) ? now : now - (soon ? 20 * MIN : 3 * HOUR - 10 * MIN);
      if (lists.some(Boolean)) {
        const picked = pickMatch(lists.flat().filter(Boolean), now);
        if (picked && before && picked.id === before.id) changes.push(...matchChanges(before, picked));
        st.cur = picked;
      }
      dirty = true;
    }
    // During the match: the score every 15 seconds.
    const c = st.cur;
    if (!dirty && c && c.state !== 'post' && now >= c.kickoff - 20 * MIN && now < c.kickoff + 4 * HOUR && now - (st.liveAt || 0) >= 15000) {
      try {
        const r = await matchDeps.fetch(scoreboardUrl(c.slug, c.kickoff - 86400000, c.kickoff + 86400000), { headers: { accept: 'application/json' } });
        if (r.ok) {
          const found = parseScoreboard(await r.json(), c.slug).find((x) => x.id === c.id);
          if (found) { changes.push(...matchChanges(c, found)); st.cur = found; }
        }
      } catch (e) { /* next time */ }
      st.liveAt = now;
      dirty = true;
    }
    if (st.cur && st.cur.state === 'post' && st.endId !== st.cur.id && changes.some((x) => x.type === 'end')) { st.endId = st.cur.id; st.endedAt = now; }
    if (dirty) await this.ctx.storage.put('match', st);
    const view = { on: true, cfg, mode: this.matchMode(st, now), match: st.cur || null, now };
    if (dirty) this.broadcast({ type: 'match', view });
    if (changes.length && cfg.push && st.cur) {
      const subs = (await this.subs()).filter((s) => s.notify === 'all');
      const sending = Promise.all(changes.map((ch) => this.pushTo(subs, changeMessage(st.cur, ch), ch.type === 'goal' ? 'high' : 'normal'))).catch((e) => console.error('match push', e));
      this.pushing = sending;
      if (this.ctx.waitUntil) this.ctx.waitUntil(sending);
    }
    await this.armAlarm(st, now);
    return view;
  }

  // live: the frame shows the match (from 15 min before kick-off to 15 min after the end);
  // today: later today (Morocco time); next: within two days; done: just finished.
  matchMode(st, now) {
    const m = st.cur;
    if (!m) return 'none';
    if (m.state === 'in') return 'live';
    if (m.state === 'pre') {
      if (m.kickoff - now <= 15 * MIN && now - m.kickoff < 3 * HOUR) return 'live';
      const off = (Number(this.env && this.env.UTC_OFFSET_MINUTES) || 0) * MIN;
      const day = (t) => Math.floor((t + off) / 86400000);
      return day(m.kickoff) === day(now) ? 'today' : 'next';
    }
    return st.endId === m.id && now - st.endedAt < 15 * MIN ? 'live' : 'done';
  }

  // Keep watching without anyone asking: every 30 s during a match, else at the next kick-off
  // (or in 3 hours to look for new fixtures).
  async armAlarm(st, now) {
    const c = st.cur;
    let at = now + 3 * HOUR;
    if (c && c.state !== 'post' && now >= c.kickoff - 20 * MIN && now < c.kickoff + 4 * HOUR) at = now + 30000;
    else if (c && c.state === 'pre' && c.kickoff - 20 * MIN > now) at = Math.min(at, c.kickoff - 20 * MIN);
    // (Stored only when it changes much, so a frame asking every minute doesn't write each time.)
    const prev = await this.ctx.storage.get('matchAlarm');
    if (!prev || prev <= now || prev > at + 5000) await this.ctx.storage.put('matchAlarm', at);
    await this.setNextAlarm();
  }
  // One alarm for both: the match's next look and the next surprise.
  async setNextAlarm() {
    const s = this.ctx.storage;
    if (!s.setAlarm) return;
    const now = Date.now();
    const cfg = await this.matchCfg();
    const times = [];
    const m = cfg.on ? await s.get('matchAlarm') : null;
    if (m) times.push(Math.max(m, now + 1000));
    for (const x of await this.laterList()) times.push(Math.max(x.due, now + 1000));
    if (!times.length) return;
    const at = Math.min(...times);
    try {
      const cur = await s.getAlarm();
      if (!cur || cur <= now || cur > at + 1000) await s.setAlarm(at);
    } catch (e) { /* not available */ }
  }

  async alarm() {
    await this.releaseDue();
    const cfg = await this.matchCfg();
    if (cfg.on) await this.matchView(0);
    await this.setNextAlarm();
  }

  // ---------- surprises for later ----------
  async laterList() { return (await this.ctx.storage.get('later')) || []; }
  async later(p, due) {
    const list = await this.laterList();
    if (list.length >= MAX_LATER) return fail(429, 'Too many surprises waiting (50). Cancel some first.');
    if (list.filter((x) => x.from === p.from).length >= 20) return fail(429, 'You have 20 surprises waiting already.');
    p.id = p.id || newId();
    const item = Object.assign({}, p, { due: Math.round(due), sched: true, sentAt: Date.now() });
    if (p.strokes) {
      await this.ctx.storage.put('draw:' + p.id, p.strokes);
      delete item.strokes;
      item.points = p.strokes.reduce((n, s2) => n + s2.p.length / 3, 0);
    }
    list.push(item);
    list.sort((a, b) => a.due - b.due);
    await this.ctx.storage.put('later', list);
    await this.setNextAlarm();
    return json({ later: item, live: 0 });
  }
  // Send the ones whose time has come (by the alarm, or whenever the frame asks).
  async releaseDue() {
    const list = await this.laterList();
    const now = Date.now();
    if (!list.length || list[0].due > now + 1000) return 0;
    const due = list.filter((x) => x.due <= now + 1000), rest = list.filter((x) => x.due > now + 1000);
    await this.ctx.storage.put('later', rest);
    for (const x of due) {
      const p = Object.assign({}, x);
      delete p.due;
      if (p.kind === 'draw') p.strokes = (await this.ctx.storage.get('draw:' + p.id)) || [];
      await this.add(p, true);
    }
    return due.length;
  }

  // ---------- the Quran ----------
  async quran() {
    const cfg = Object.assign({ favs: DEFAULT_FAVS.slice(), mode: 'list', volume: 0.8, schedules: [], reciter: 'nufais' }, await this.ctx.storage.get('quranCfg'));
    return { cfg, play: (await this.ctx.storage.get('quranPlay')) || null, status: (await this.ctx.storage.get('quranStatus')) || null };
  }

  // ---------- statuses ----------
  async statuses() {
    const all = (await this.ctx.storage.get('statuses')) || {};
    const now = Date.now();
    return Object.keys(all).filter((n) => all[n].until > now).map((n) => Object.assign({ name: n }, all[n])).sort((a, b) => b.at - a.at);
  }

  // ---------- zellige colouring ----------
  // A new page every week (Monday); a page at least half coloured and not saved yet waits in the
  // archive until the frame saves it as a photo.
  async coloring() {
    const off = Number(this.env && this.env.UTC_OFFSET_MINUTES) || 0;
    const week = weekIndex(Date.now(), off);
    let page = await this.ctx.storage.get('coloring');
    const archive = (await this.ctx.storage.get('coloringArchive')) || [];
    const state = { archive };
    if (!page) page = { pid: week % PATTERN_COUNT, week, fills: {}, who: {}, v: 0, doneAt: 0, savedAt: 0, started: Date.now() };
    else if (page.week !== week) {
      page = Object.assign(this.archivePage(state, page), { pid: (page.pid + 1) % PATTERN_COUNT });
      await this.ctx.storage.put('coloring', page);
      await this.ctx.storage.put('coloringArchive', state.archive);
    }
    state.page = page;
    state.week = week;
    state.tiles = tileCount(page.pid);
    return state;
  }
  archivePage(state, c) {
    const filled = Object.keys(c.fills).length;
    if (!c.savedAt && filled >= tileCount(c.pid) / 2) {
      state.archive = state.archive.concat([{ id: newId(), pid: c.pid, fills: c.fills, who: c.who, at: Date.now() }]).slice(-3);
    }
    const off = Number(this.env && this.env.UTC_OFFSET_MINUTES) || 0;
    return { pid: c.pid, week: weekIndex(Date.now(), off), fills: {}, who: {}, v: (c.v || 0) + 1, doneAt: 0, savedAt: 0, started: Date.now() };
  }

  // Frames only send keep-alive pings (answered automatically); nothing else to do.
  async webSocketMessage() {}
  async webSocketClose(ws, code) { try { ws.close(code, 'bye'); } catch (e) { /* already closed */ } }
  async webSocketError() {}
}
