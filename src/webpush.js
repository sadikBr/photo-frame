// Web Push from a Cloudflare Worker, with nothing but WebCrypto: the VAPID signature
// (RFC 8292) and the "aes128gcm" payload encryption (RFC 8291). The phone's browser gives us
// a subscription (an https endpoint at its own push service plus two keys); we encrypt a small
// JSON message for that phone only and POST it to the endpoint. Google, Apple and Mozilla run
// those push services for free, no account needed: the VAPID key pair identifies the site.
//
// Keys: VAPID_PUBLIC_KEY (65-byte uncompressed P-256 point, base64url; not secret) and
// VAPID_PRIVATE_KEY (the 32-byte private scalar, base64url; a Worker secret).
// `node tools/make-vapid.mjs` makes a pair.

const enc = new TextEncoder();

export function b64u(bytes) {
  let s = '';
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function unb64u(str) {
  const s = String(str).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '==='.slice((s.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function concat(...parts) {
  const n = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

// Only the browsers' own push services: a subscription is data a phone sent us, and we must not
// be talked into POSTing to anywhere else.
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^android\.googleapis\.com$/, /(^|\.)push\.apple\.com$/,
  /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)notify\.windows\.com$/];
export function validSubscription(sub) {
  if (!sub || typeof sub.endpoint !== 'string' || sub.endpoint.length > 1024) return false;
  let u;
  try { u = new URL(sub.endpoint); } catch (e) { return false; }
  if (u.protocol !== 'https:' || !PUSH_HOSTS.some((re) => re.test(u.hostname))) return false;
  const k = sub.keys || {};
  try {
    return unb64u(k.p256dh).length === 65 && unb64u(k.auth).length === 16;
  } catch (e) { return false; }
}

let keyCache = null;
async function vapidKey(publicKey, privateKey) {
  const id = publicKey + privateKey;
  if (keyCache && keyCache.id === id) return keyCache.key;
  const pub = unb64u(publicKey);
  if (pub.length !== 65 || pub[0] !== 4) throw new Error('VAPID_PUBLIC_KEY is not a P-256 public key.');
  const jwk = { kty: 'EC', crv: 'P-256', x: b64u(pub.slice(1, 33)), y: b64u(pub.slice(33, 65)), d: privateKey, ext: true };
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  keyCache = { id, key };
  return key;
}

// "Authorization: vapid t=<JWT>, k=<public key>" for one push service.
export async function vapidHeader(endpoint, { publicKey, privateKey, subject }) {
  const aud = new URL(endpoint).origin;
  const header = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64u(enc.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject })));
  const unsigned = header + '.' + claims;
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, await vapidKey(publicKey, privateKey), enc.encode(unsigned));
  return 'vapid t=' + unsigned + '.' + b64u(sig) + ', k=' + publicKey;
}

async function hkdf(salt, ikm, info, length) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8));
}

// RFC 8291: one record, aes128gcm. Returns the request body.
export async function encryptPayload(sub, plaintext) {
  const uaPublic = unb64u(sub.keys.p256dh);
  const authSecret = unb64u(sub.keys.auth);
  const local = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, local.privateKey, 256));
  const ikm = await hkdf(authSecret, shared, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const data = concat(typeof plaintext === 'string' ? enc.encode(plaintext) : plaintext, new Uint8Array([2]));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, data));
  const head = new Uint8Array(16 + 4 + 1 + 65);
  head.set(salt, 0);
  new DataView(head.buffer).setUint32(16, 4096);
  head[20] = 65;
  head.set(asPublic, 21);
  return concat(head, cipher);
}

// Send one message. Resolves to the push service's status: 201 = accepted, 404/410 = the phone
// has unsubscribed (forget it).
export async function sendPush(sub, message, vapid, opts = {}) {
  const body = await encryptPayload(sub, JSON.stringify(message));
  const res = await (opts.fetch || fetch)(sub.endpoint, {
    method: 'POST',
    headers: {
      authorization: await vapidHeader(sub.endpoint, vapid),
      'content-encoding': 'aes128gcm',
      'content-type': 'application/octet-stream',
      ttl: String(opts.ttl || 86400),
      urgency: opts.urgency || 'normal',
      ...(opts.topic ? { topic: opts.topic } : {}),
    },
    body,
  });
  return res.status;
}
