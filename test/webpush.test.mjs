// Web Push: what the server sends must be what a phone's browser can decrypt and verify.
import assert from 'node:assert/strict';
import { encryptPayload, vapidHeader, sendPush, validSubscription, b64u, unb64u } from '../src/webpush.js';

const enc = new TextEncoder();
const subtle = crypto.subtle;
const hkdf = async (salt, ikm, info, n) => new Uint8Array(await subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info },
  await subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']), n * 8));
const cat = (...p) => { const o = new Uint8Array(p.reduce((a, x) => a + x.length, 0)); let i = 0; for (const x of p) { o.set(x, i); i += x.length; } return o; };

// The phone: its own key pair and auth secret, as PushManager.subscribe() makes them.
const ua = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
const uaPublic = new Uint8Array(await subtle.exportKey('raw', ua.publicKey));
const auth = crypto.getRandomValues(new Uint8Array(16));
const sub = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc123', keys: { p256dh: b64u(uaPublic), auth: b64u(auth) } };

// Decrypt the way the browser does (RFC 8291 §3.4).
async function decrypt(body) {
  const salt = body.slice(0, 16);
  const rs = new DataView(body.buffer, body.byteOffset).getUint32(16);
  const idlen = body[20];
  const asPublic = body.slice(21, 21 + idlen);
  const cipher = body.slice(21 + idlen);
  assert.equal(rs, 4096);
  assert.equal(idlen, 65);
  const asKey = await subtle.importKey('raw', asPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await subtle.deriveBits({ name: 'ECDH', public: asKey }, ua.privateKey, 256));
  const ikm = await hkdf(auth, shared, cat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const plain = new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: nonce },
    await subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']), cipher));
  assert.equal(plain[plain.length - 1], 2, 'last-record delimiter');
  return new TextDecoder().decode(plain.slice(0, -1));
}

const msg = JSON.stringify({ title: 'نبضة من ماما', body: '«أفكر فيكم»' });
assert.equal(await decrypt(await encryptPayload(sub, msg)), msg, 'phone can decrypt it');

// VAPID: a JWT for the push service's origin, signed with our key, with our public key attached.
const kp = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const vapid = { publicKey: b64u(new Uint8Array(await subtle.exportKey('raw', kp.publicKey))), privateKey: (await subtle.exportKey('jwk', kp.privateKey)).d, subject: 'https://frame.example' };
const h = await vapidHeader(sub.endpoint, vapid);
const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(h);
assert.ok(m, h);
assert.equal(m[4], vapid.publicKey);
const claims = JSON.parse(Buffer.from(m[2], 'base64url').toString());
assert.equal(claims.aud, 'https://fcm.googleapis.com');
assert.equal(claims.sub, 'https://frame.example');
assert.ok(claims.exp > Date.now() / 1000 && claims.exp < Date.now() / 1000 + 86400);
assert.ok(await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, kp.publicKey, unb64u(m[3]), enc.encode(m[1] + '.' + m[2])), 'signature verifies');

// The request itself.
let req;
const status = await sendPush(sub, { title: 'x' }, vapid, { fetch: async (url, init) => { req = { url, init }; return new Response(null, { status: 201 }); }, urgency: 'high' });
assert.equal(status, 201);
assert.equal(req.url, sub.endpoint);
assert.equal(req.init.headers['content-encoding'], 'aes128gcm');
assert.equal(req.init.headers.urgency, 'high');
assert.equal(JSON.parse(await decrypt(req.init.body)).title, 'x');

// Only real push services, only well-formed keys.
assert.equal(validSubscription(sub), true);
assert.equal(validSubscription({ ...sub, endpoint: 'https://web.push.apple.com/QGx' }), true);
assert.equal(validSubscription({ ...sub, endpoint: 'https://updates.push.services.mozilla.com/wpush/v2/x' }), true);
assert.equal(validSubscription({ ...sub, endpoint: 'https://evil.example/fcm.googleapis.com' }), false);
assert.equal(validSubscription({ ...sub, endpoint: 'http://fcm.googleapis.com/x' }), false);
assert.equal(validSubscription({ ...sub, endpoint: 'https://fcm.googleapis.com.evil.example/x' }), false);
assert.equal(validSubscription({ ...sub, keys: { p256dh: 'AAAA', auth: sub.keys.auth } }), false);
console.log('webpush: all tests passed');
