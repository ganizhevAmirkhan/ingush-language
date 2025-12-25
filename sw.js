const CACHE = "ingush-cache-v1";

const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./script.js",
  "./manifest.json",

  "./icons/icon-72.png",
  "./icons/icon-96.png",
  "./icons/icon-128.png",
  "./icons/icon-144.png",
  "./icons/icon-152.png",
  "./icons/icon-192.png",
  "./icons/icon-384.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png"
];

self.addEventListener("fetch", event => {
  if (event.request.url.includes("dictionary.json")) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async cache => {
        try {
          const fresh = await fetch(event.request);
          cache.put(event.request, fresh.clone());
          return fresh;
        } catch {
          return cache.match(event.request);
        }
      })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(resp =>
      resp || fetch(event.request)
    )
  );
});
