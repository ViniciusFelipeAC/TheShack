// Service worker da Shack: abre o app instalado mais rápido e mostra as notificações push mesmo com o app fechado.
// A API (/api) nunca passa pelo cache: o estado da casa é sempre o do servidor.
const CACHE = 'shack-v1';
const SHELL = ['/', '/manifest.webmanifest', '/icons/apple-touch-icon.png', '/icons/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => undefined).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  // Páginas: rede primeiro (pega a versão nova), cache se o servidor estiver fora do ar.
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).then((res) => {
      const copy = res.clone();
      if (res.ok) caches.open(CACHE).then((c) => c.put('/', copy));
      return res;
    }).catch(() => caches.match('/').then((r) => r ?? Response.error())));
    return;
  }
  // Arquivos com hash no nome nunca mudam: cache primeiro.
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(caches.match(req).then((hit) => hit ?? fetch(req).then((res) => {
      const copy = res.clone();
      if (res.ok) caches.open(CACHE).then((c) => c.put(req, copy));
      return res;
    })));
  }
});

self.addEventListener('push', (event) => {
  let data = { title: 'The Shack', body: '' };
  try { if (event.data) data = event.data.json(); } catch { /* payload em texto */ }
  // No iPhone, todo push precisa virar notificação visível; se não virar, o iOS cancela a assinatura.
  event.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    tag: data.id,
    renotify: data.kind === 'alarm',
    requireInteraction: data.priority === 'high',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data,
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = windows.find((w) => 'focus' in w);
    if (open) return open.focus();
    return self.clients.openWindow('/');
  })());
});
