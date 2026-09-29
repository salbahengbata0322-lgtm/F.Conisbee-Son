// Minimal service worker: caches the app shell (HTML/CSS/JS/icons) so the app
// loads even with a flaky connection. It does NOT cache Supabase data — every
// order/customer/sale lookup still needs a live connection. This is a "looks
// like an app, loads fast" upgrade, not offline data entry.
const CACHE_NAME = "conisbee-orders-v1";
const SHELL_FILES = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  // Only handle same-origin GET requests for the shell files themselves.
  // Everything else (Supabase API calls, CDN scripts) goes straight to the
  // network — we never want stale business data served from cache.
  if (event.request.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
