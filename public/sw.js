/**
 * Service worker of the installed app. Everything that matters here needs the network — signing
 * in, the live examiner, the scoring — so nothing is served from a cache while online: pages go
 * straight to the server as before. Its one job is the offline screen, shown instead of the
 * browser's error page when a page cannot be loaded.
 *
 * Bump VERSION whenever offline.html changes, so installed apps fetch the new copy.
 */
const VERSION = 1;
const CACHE = `janob-offline-v${VERSION}`;
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: "reload" })))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith("janob-offline-") && key !== CACHE) await caches.delete(key);
      }
      // Requests the page while the worker is still starting up, so going through it costs no time.
      await self.registration.navigationPreload?.enable();
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  // Only page loads: API calls and assets go to the network untouched.
  if (event.request.mode !== "navigate" || event.request.method !== "GET") return;
  event.respondWith(
    (async () => {
      try {
        return (await event.preloadResponse) ?? (await fetch(event.request));
      } catch {
        return (await caches.match(OFFLINE_URL, { cacheName: CACHE })) ?? Response.error();
      }
    })(),
  );
});
