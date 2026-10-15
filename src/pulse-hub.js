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

export const TAPS = ['love', 'miss', 'morning', 'night', 'way', 'news'];
const KEEP = 60; // moments kept
const KEEP_MS = 7 * 86400000; // and no older than a week
const MAX_AUDIO = 600 * 1024; // a stored value may be up to 2 MB
// The list of moments is one stored value; drawings and recordings are kept apart under their
// own keys ('draw:<id>', 'audio:<id>') so the list stays small.
const MAX_POINTS = 8000;

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

  async add(p) {
    const now = Date.now();
    const all = await this.load();
    const list = [];
    for (const x of all) {
      if (now - x.at < KEEP_MS) list.push(x);
      else await this.drop(x);
    }
    // Not too fast: the same person and kind within 2 s, or more than 120 an hour.
    if (list.some((x) => x.from === p.from && x.kind === p.kind && now - x.at < 2000)) return fail(429, 'لحظة… أُرسلت للتو.');
    if (list.filter((x) => now - x.at < 3600000).length >= 120) return fail(429, 'كثير من النبضات في ساعة واحدة. انتظر قليلاً.');
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
    return json({ pulse: p, live });
  }

  async fetch(request) {
    const url = new URL(request.url);
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
      if (!from) return fail(400, 'Who is sending? Choose your name first.');
      if (body.kind === 'tap') {
        if (!TAPS.includes(body.tap)) return fail(400, 'Unknown tap.');
        return this.add({ kind: 'tap', tap: body.tap, from });
      }
      if (body.kind === 'draw') {
        const strokes = cleanStrokes(body.strokes);
        if (!strokes) return fail(400, 'The drawing is empty.');
        return this.add({ kind: 'draw', strokes, from });
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
      const id = newId();
      await this.ctx.storage.put('audio:' + id, { type, data: buf });
      const res = await this.add({ id, kind: 'voice', from, audio: { type, dur: Math.round(dur * 10) / 10 } });
      if (res.status !== 200) await this.ctx.storage.delete('audio:' + id);
      return res;
    }

    const am = /^\/api\/pulse\/audio\/([a-z0-9]{6,24})$/.exec(path);
    if (am && method === 'GET') {
      const a = await this.ctx.storage.get('audio:' + am[1]);
      if (!a) return fail(404, 'No such recording.');
      return new Response(a.data, { headers: { 'content-type': a.type, 'cache-control': 'private, max-age=604800, immutable' } });
    }

    if (path === '/api/pulse/reply' && method === 'POST') {
      let body;
      try { body = await request.json(); } catch (e) { return fail(400, 'Body must be JSON.'); }
      const target = (await this.load()).find((x) => x.id === body.to);
      if (!target) return fail(404, 'That moment is gone.');
      return this.add({ kind: 'reply', from: 'البيت', to: target.id, toName: target.from, toKind: target.kind });
    }

    return fail(404, 'Unknown pulse route.');
  }

  // Frames only send keep-alive pings (answered automatically); nothing else to do.
  async webSocketMessage() {}
  async webSocketClose(ws, code) { try { ws.close(code, 'bye'); } catch (e) { /* already closed */ } }
  async webSocketError() {}
}
