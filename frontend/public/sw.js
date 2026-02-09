// Service Worker simples: cache de app shell (mínimo, sem complicar)
const CACHE_NAME = "tcc-assistente-v1";
const APP_SHELL = ["/", "/index.html", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k === CACHE_NAME ? null : caches.delete(k))))
    )
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  // Não cachear chamadas de API nem mídia
  if (req.url.includes("/analyze") || req.destination === "video") return;

  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req))
  );
});
