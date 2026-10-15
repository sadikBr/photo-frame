// Service worker for the control panel (/admin). Its one job: receive photos shared from the
// phone's share menu (Android, once the control panel is added to the home screen), keep them
// for a moment, and open the control panel, which resizes and uploads them (admin.js).
const CACHE = 'shared-photos';

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
