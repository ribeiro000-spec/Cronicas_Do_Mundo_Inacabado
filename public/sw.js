/*
 * Service Worker — cache do jogo para carregar rápido e funcionar offline.
 *
 * - Página (navegação): rede primeiro, cache como reserva (assim atualizações aparecem logo).
 * - Chunks do mapa, dados e assets: cache primeiro (não mudam entre visitas; a versão do
 *   manifesto do mundo vai na URL, então um mundo novo gera URLs novas).
 * - Arquivos do build com hash no nome (assets/*.js, *.css): cache primeiro.
 *
 * Para forçar todos os jogadores a baixarem tudo de novo, aumente CACHE_VERSION.
 */
const CACHE_VERSION = 'v2';
const RUNTIME = `cronicas-${CACHE_VERSION}`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(RUNTIME).then((cache) => cache.addAll(['./', './index.html', './manifest.webmanifest'])).catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('cronicas-') && k !== RUNTIME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // O manifesto do mundo define a versão dos chunks: sempre tente a rede primeiro.
  if (req.mode === 'navigate' || url.pathname.endsWith('/manifest.json')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(RUNTIME).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() =>
          caches
            .match(req)
            .then((r) => r || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error())),
        ),
    );
    return;
  }

  const cacheFirst = /\/(data|assets|icons)\//.test(url.pathname);
  if (cacheFirst) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(RUNTIME).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
  }
});
