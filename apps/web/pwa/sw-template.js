/* AutoPix service worker — generated at build time (see vite.config.js). */
/* eslint-disable no-restricted-globals */
const VERSION = '__BUILD_ID__';
const SHELL_CACHE = `autopix-shell-${VERSION}`;
const ASSET_CACHE = 'autopix-assets-v1';
const PRECACHE = __PRECACHE__;

// Caching policy (safe by construction):
//  • /api/*  → network only. Private/authenticated responses are NEVER cached.
//  • /assets → cache-first (content-hashed, immutable, public).
//  • pages   → network-first; offline falls back to the public app shell.
//  • icons/manifest → stale-while-revalidate.

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const shell = await caches.open(SHELL_CACHE);
      await shell.addAll(['/', '/offline.html', '/manifest.webmanifest', '/icons/icon-192.png']);
      const assets = await caches.open(ASSET_CACHE);
      await Promise.all(PRECACHE.map((u) => assets.add(u).catch(() => {})));
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith('autopix-shell-') && k !== SHELL_CACHE).map((k) => caches.delete(k)));
      // Drop hashed assets that the current build no longer references.
      const assets = await caches.open(ASSET_CACHE);
      const keep = new Set(PRECACHE.map((u) => new URL(u, self.location.origin).href));
      for (const req of await assets.keys()) {
        if (new URL(req.url).pathname.startsWith('/assets/') && !keep.has(req.url)) await assets.delete(req);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'LOGOUT') {
    // Nothing private is cached, but drop page shells defensively.
    event.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('autopix-shell-')).map((k) => caches.delete(k)))));
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // network only, never cached

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          const shell = await caches.open(SHELL_CACHE);
          return (await shell.match('/')) || (await shell.match('/offline.html')) || Response.error();
        }
      })(),
    );
    return;
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(ASSET_CACHE);
        const hit = await cache.match(request);
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok) cache.put(request, res.clone());
        return res;
      })(),
    );
    return;
  }

  if (url.pathname.startsWith('/icons/') || url.pathname === '/manifest.webmanifest') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(SHELL_CACHE);
        const hit = await cache.match(request);
        const network = fetch(request)
          .then((res) => {
            if (res.ok) cache.put(request, res.clone());
            return res;
          })
          .catch(() => hit);
        return hit || network;
      })(),
    );
  }
});

// ---- Push notifications (Web Push). Payload carries no secrets.
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'AutoPix', body: event.data?.text() };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'AutoPix', {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/maskable-192.png',
      tag: data.tag,
      data: { url: typeof data.url === 'string' && data.url.startsWith('/') ? data.url : '/app' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/app', self.location.origin).href;
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const client = all.find((c) => new URL(c.url).origin === self.location.origin);
      if (client) {
        await client.focus();
        return client.navigate(target);
      }
      return self.clients.openWindow(target);
    })(),
  );
});
