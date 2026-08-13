// Service Worker: cache de app shell + assets estáticos
const CACHE_NAME = "tcc-assistente-v3";
const APP_SHELL = ["/", "/index.html", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  const keep = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (keep.includes(k) ? null : caches.delete(k))))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // só lidamos com GET (POST /analyze nunca deve ser cacheado)
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Nunca cachear chamadas de API, vídeo, ou extensões de dev
  if (
    url.pathname.startsWith("/analyze") ||
    req.destination === "video" ||
    url.pathname.includes("hot-update") ||
    url.pathname.includes("__vite")
  ) {
    return;
  }

  // Navegação (HTML): network-first para sempre pegar a versão mais nova
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          return res;
        })
        .catch(() => caches.match("/index.html"))
    );
    return;
  }

  // Assets estáticos (JS, CSS, imagens): cache-first
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        // cacheia assets com hash do Vite (são imutáveis)
        if (res.ok && url.pathname.match(/\/assets\//)) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        }
        return res;
      });
    })
  );
});
