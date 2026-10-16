// Makes the key pair the server uses to sign phone notifications (VAPID).
//   node tools/make-vapid.mjs
// Put the public key in wrangler.jsonc ("vars": { "VAPID_PUBLIC_KEY": "…" }) and the private
// key in a secret: npx wrangler secret put VAPID_PRIVATE_KEY   (paste it when asked).
// For `wrangler dev`, put both lines in a file named .dev.vars (it is git-ignored).
const b64u = (b) => Buffer.from(b).toString('base64url');
const { publicKey, privateKey } = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
const pub = new Uint8Array(await crypto.subtle.exportKey('raw', publicKey));
const jwk = await crypto.subtle.exportKey('jwk', privateKey);
console.log('VAPID_PUBLIC_KEY=' + b64u(pub));
console.log('VAPID_PRIVATE_KEY=' + jwk.d);
