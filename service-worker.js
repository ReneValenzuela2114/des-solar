/* ============================================================================
   DES · Service Worker (kit PWA)
   Estrategia:
     - Navegación / HTML  -> RED PRIMERO (nunca queda pegado en version vieja).
     - Estaticos propios   -> CACHE PRIMERO (iconos, manifest) para que abra
                              rapido y funcione sin conexion la "cascara".
     - API / Workers / datos sensibles -> NUNCA se cachean (siempre a la red).
   Al publicar una version nueva: subir CACHE_VERSION en 1. El SW se activa,
   borra las cachEs viejas y toma control de inmediato (skipWaiting + claim).
   ========================================================================== */

const CACHE_VERSION = 'des-v1';
const CACHE_NAME = 'des-shell-' + CACHE_VERSION;

/* Cascara minima que se precachea en la instalacion. Solo estaticos propios:
   jamas datos ni respuestas de la API. */
const SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/icon-maskable-512.png',
  './assets/apple-touch-icon.png'
];

/* Hosts cuyos datos NUNCA se cachean (Workers, proxy IA, almacenamiento R2). */
const NEVER_CACHE_HOSTS = [
  'des-api.renealejandrovalenzuela.workers.dev',
  'des-proxy.renealejandrovalenzuela.workers.dev',
  'des-r2.renealejandrovalenzuela.workers.dev'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_ASSETS).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith('des-shell-') && k !== CACHE_NAME)
            .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  /* Solo GET; el resto (POST a la API, etc.) va directo a la red. */
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  /* Datos sensibles / API: siempre a la red, nunca tocar cache. */
  if (NEVER_CACHE_HOSTS.includes(url.hostname)) return;

  /* Navegacion / documento HTML: RED PRIMERO, con la cache como respaldo. */
  const isNavigation = req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html');

  if (isNavigation) {
    event.respondWith(
      fetch(req)
        .then((resp) => {
          const copy = resp.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
          return resp;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('./index.html')))
    );
    return;
  }

  /* Estaticos propios (mismo origen): CACHE PRIMERO, y si no esta, red + guardar. */
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((resp) => {
          if (resp && resp.status === 200 && resp.type === 'basic') {
            const copy = resp.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
          }
          return resp;
        });
      })
    );
    return;
  }

  /* Cross-origin (CDN de librerias, etc.): red normal, sin cachear. */
});
