/* Service worker: makes the app work offline.
   - The small "app shell" (HTML, CSS, JS, fonts, icons, exercises.json) is
     cached when the worker installs.
   - Thumbnails, photos and instructions.json are cached the first time they
     are viewed (about 27 MB of photos, too much to download up front).
   - All paths are relative because the site lives under /workout-tracker/. */

const VERSION = "1.4.0"; // x-release-please-version
const SHELL_CACHE = "workout-tracker-v" + VERSION;
const IMAGE_CACHE = "workout-tracker-images"; // unversioned: images survive releases
const LAZY_CACHE = "workout-tracker-lazy-v" + VERSION;

const PRECACHE = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "css/style.css",
  "js/logic.js",
  "js/bodymap.js",
  "js/app.js",
  "icons/icon.svg",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/maskable-512.png",
  "fonts/outfit-latin.woff2",
  "fonts/outfit-latin-ext.woff2",
  "data/exercises.json",
];

if (typeof self !== "undefined" && self.addEventListener) {
  self.addEventListener("install", event => {
    event.waitUntil(caches.open(SHELL_CACHE).then(cache => cache.addAll(PRECACHE)));
    // No skipWaiting(): a new version takes over on the next launch.
  });

  self.addEventListener("activate", event => {
    const keep = [SHELL_CACHE, LAZY_CACHE, IMAGE_CACHE];
    event.waitUntil(
      caches.keys()
        .then(names => Promise.all(
          names
            .filter(name => name.startsWith("workout-tracker-") && !keep.includes(name))
            .map(name => caches.delete(name))
        ))
        .then(() => self.clients.claim())
    );
  });

  self.addEventListener("fetch", event => {
    const request = event.request;
    if (request.method !== "GET") return;
    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;

    const scope = new URL("./", self.location).pathname;
    const path = url.pathname.slice(scope.length);

    if (path.startsWith("images/")) {
      event.respondWith(cacheFirst(request, IMAGE_CACHE));
    } else if (path === "data/instructions.json") {
      event.respondWith(cacheFirst(request, LAZY_CACHE));
    } else {
      // Shell files (and navigations to ./ or index.html): cache-first.
      // Query strings are ignored so e.g. index.html?x=1 still matches.
      event.respondWith(
        caches.open(SHELL_CACHE)
          .then(cache => cache.match(request, { ignoreSearch: true }))
          .then(hit => hit || fetch(request))
      );
    }
  });
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

if (typeof module !== "undefined") module.exports = { VERSION, PRECACHE };
