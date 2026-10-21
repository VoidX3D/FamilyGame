/* Made by VoidX3D (Sincere Bhattarai) - Family Game Hub */
const CACHE = "family-game-shell-v2";
const SHELL = [
  "/",
  "/index.html",
  "/styles.css",
  "/app.js",
  "/games.js",
  "/dom.js",
  "/icons.js",
  "/net.js",
  "/config.js",
  "/storage.js",
  "/audio.js",
  "/manifest.webmanifest",
  "/assets/logo.svg",
  "/assets/icons/icon-192.png",
  "/assets/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(SHELL);
    if (!(await cache.match("/audio.js"))) {
      throw new Error("The audio module was not added to the offline shell.");
    }
  })());
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)),
    )),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request).then((response) => {
        if (response.ok && request.destination !== "document") {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      }).catch(() => cached);
      return cached || network;
    }),
  );
});
