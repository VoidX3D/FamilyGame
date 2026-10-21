/* Made by VoidX3D (Sincere Bhattarai) - Family Game Hub */
/* The offline shell.
 *
 * The cache is only a fallback for when there is no network. Every request
 * goes to the network first, so a deploy is always picked up on the next
 * load. The earlier version served the cached copy first and refreshed it
 * in the background, which meant a player who opened the site right after a
 * deploy got the old JavaScript next to the new HTML.
 *
 * Nothing that must not be written to disk is cached: the host console and
 * the API are skipped, and a response that asks not to be stored is
 * dropped rather than kept.
 */

const CACHE = "family-game-shell";
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

/* Paths that are never written to the cache. */
const SKIP_PREFIXES = ["/admin", "/api", "/g/", "/game"];

function isSkipped(url) {
  return SKIP_PREFIXES.some((prefix) => url.pathname.startsWith(prefix));
}

function isCacheable(response) {
  if (!response || !response.ok) return false;
  const control = response.headers.get("cache-control") ?? "";
  if (control.includes("no-store")) return false;
  return response.type !== "opaque";
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // One file at a time, so one missing asset does not fail the whole
      // install and leave the app without a worker.
      await Promise.all(
        SHELL.map((path) =>
          cache.add(path).catch(() => undefined),
        ),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isSkipped(url)) return;

  event.respondWith(networkFirst(request));
});

/* The network wins. The cache is only used when the network is gone. */
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (isCacheable(response)) {
      const cache = await caches.open(CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (request.destination === "document") {
      return (await caches.match("/")) || new Response("Offline", { status: 503 });
    }
    return new Response("Offline", { status: 503 });
  }
}
