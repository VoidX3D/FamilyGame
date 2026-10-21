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
  "/vendor/socket.io.min.js",
  "/vendor/gsap.min.js",
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

  const isDocument = request.destination === "document";
  event.respondWith(isDocument ? networkFirst(request) : staleWhileRevalidate(request));
});

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return (await caches.match(request)) || caches.match("/");
  }
}

async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);
  const refresh = fetch(request).then(async (response) => {
    if (response.ok) {
      const cache = await caches.open(CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  }).catch(() => null);
  return cached || (await refresh) || new Response("Offline", { status: 503 });
}
