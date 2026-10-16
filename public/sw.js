// Service worker for the control panel (/admin):
// 1. photos shared from the phone's share menu (Android, once the control panel is installed):
//    kept for a moment, then the control panel resizes and uploads them (admin.js);
// 2. «نبضة» notifications: a moment from the family or a heart back, shown even when the app
//    is closed, with a «❤ ردّ بقلب» button where the phone supports buttons.
const CACHE = 'shared-photos';
const CFG = 'fd-cfg'; // what the page tells us: access key, who this phone is, quiet nights

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method === 'POST' && url.pathname === '/share') e.respondWith(receive(e.request));
  // Everything else goes to the network as usual.
});

async function receive(request) {
  let n = 0;
  try {
    const form = await request.formData();
    const files = form.getAll('photos').filter((f) => f && typeof f !== 'string' && /^image\//.test(f.type));
    const cache = await caches.open(CACHE);
    for (const f of files) {
      await cache.put('/shared/' + Date.now() + '-' + n++, new Response(f, {
        headers: { 'content-type': f.type, 'x-name': encodeURIComponent(f.name || 'photo') },
      }));
    }
  } catch (e) { /* nothing usable was shared */ }
  return Response.redirect('/admin?shared=' + n + '#photos', 303);
}

// ---------- «نبضة» notifications ----------
async function config() {
  try {
    const r = await (await caches.open(CFG)).match('/__cfg');
    return r ? await r.json() : {};
  } catch (e) { return {}; }
}

const quietNow = (cfg) => {
  if (cfg.quietNight === false) return false;
  const h = new Date().getHours();
  return h >= 23 || h < 6;
};

self.addEventListener('push', (e) => {
  let m = {};
  try { m = e.data ? e.data.json() : {}; } catch (err) { m = { title: 'نبضة', body: e.data ? e.data.text() : '' }; }
  e.waitUntil((async () => {
    // The test button always shows the real notification, at once and with sound.
    const test = m.tag === 'pulse-test';
    // The app is open and in front: it shows the moment itself (no notification needed).
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const front = wins.find((w) => w.visibilityState === 'visible' && w.focused);
    if (front && !test) { front.postMessage({ type: 'pulse-push', message: m }); return; }
    const cfg = await config();
    const quiet = !test && quietNow(cfg);
    const canAct = 'actions' in Notification.prototype;
    await self.registration.showNotification(m.title || 'نبضة', {
      body: m.body || '',
      icon: '/icon-192.png',
      badge: '/brand/icon-monochrome-512.png',
      tag: m.tag || 'pulse',
      renotify: true,
      lang: 'ar',
      dir: 'rtl',
      silent: quiet,
      vibrate: quiet ? undefined : [80, 60, 80],
      timestamp: Date.now(),
      data: { url: m.url || '/admin#pulse', id: m.id, from: m.from },
      actions: canAct && m.heart && m.id && cfg.me ? [{ action: 'heart', title: '❤ ردّ بقلب' }] : [],
    });
  })());
});

self.addEventListener('notificationclick', (e) => {
  const n = e.notification;
  const d = n.data || {};
  n.close();
  if (e.action === 'heart') {
    e.waitUntil((async () => {
      const cfg = await config();
      let ok = false;
      try {
        const res = await fetch('/api/pulse/reply', {
          method: 'POST',
          headers: Object.assign({ 'content-type': 'application/json' }, cfg.key ? { 'x-key': cfg.key } : {}),
          body: JSON.stringify({ to: d.id, from: cfg.me }),
        });
        ok = res.ok;
      } catch (err) { ok = false; }
      await self.registration.showNotification(ok ? 'وصل قلبك ❤' : 'تعذّر إرسال القلب', {
        body: ok && d.from ? 'إلى ' + d.from : 'افتح التطبيق وحاول من هناك.',
        icon: '/icon-192.png', badge: '/brand/icon-monochrome-512.png', tag: 'pulse-heart-sent', silent: true, lang: 'ar', dir: 'rtl',
        data: { url: '/admin#pulse' },
      });
      setTimeout(async () => { for (const x of await self.registration.getNotifications({ tag: 'pulse-heart-sent' })) x.close(); }, 4000);
    })());
    return;
  }
  e.waitUntil((async () => {
    const url = new URL(d.url || '/admin#pulse', self.location.origin).href;
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const w = wins.find((x) => new URL(x.url).pathname === '/admin');
    if (w) {
      try { await w.focus(); } catch (err) { /* not allowed */ }
      w.postMessage({ type: 'pulse-open' });
      return;
    }
    await self.clients.openWindow(url);
  })());
});

// The browser renewed this phone's subscription: tell the server the new address.
self.addEventListener('pushsubscriptionchange', (e) => {
  e.waitUntil((async () => {
    const cfg = await config();
    if (!cfg.publicKey || !cfg.me) return;
    const key = Uint8Array.from(atob(cfg.publicKey.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((cfg.publicKey.length + 3) % 4)), (c) => c.charCodeAt(0));
    const sub = (e.newSubscription) || await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    await fetch('/api/pulse/push/subscribe', {
      method: 'POST',
      headers: Object.assign({ 'content-type': 'application/json' }, cfg.key ? { 'x-key': cfg.key } : {}),
      body: JSON.stringify({ subscription: sub.toJSON(), name: cfg.me, notify: cfg.notify || 'all' }),
    });
  })());
});
