const CACHE_VERSION = "dict-v2-2";
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `runtime-${CACHE_VERSION}`;

const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./script.js",
  "./recorder.js",
  "./manifest.json",
  "./sw.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/maskable-192.png",
  "./icons/maskable-512.png",
  "./icons/apple-touch-icon.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(STATIC_CACHE).then(c => c.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async()=>{
    const keys = await caches.keys();
    await Promise.all(keys.map(k => {
      if(k !== STATIC_CACHE && k !== RUNTIME_CACHE) return caches.delete(k);
    }));
    await self.clients.claim();
  })());
});

function isData(url){
  return url.pathname.includes("/dictionary-v2/") && url.pathname.endsWith(".json");
}
function isAudio(url){
  return url.pathname.includes("/audio/") && url.pathname.endsWith(".mp3");
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if(req.method !== "GET") return;

  const url = new URL(req.url);
  if(url.origin !== self.location.origin) return;

  // data + audio: network-first
  if(isData(url) || isAudio(url)){
    e.respondWith((async()=>{
      const cache = await caches.open(RUNTIME_CACHE);
      try{
        const fresh = await fetch(req);
        cache.put(req, fresh.clone());
        return fresh;
      }catch{
        const cached = await cache.match(req);
        return cached || new Response("Offline", {status:503});
      }
    })());
    return;
  }

  // static: cache-first
  e.respondWith((async()=>{
    const cache = await caches.open(STATIC_CACHE);
    const cached = await cache.match(req);
    if(cached) return cached;
    const fresh = await fetch(req);
    cache.put(req, fresh.clone());
    return fresh;
  })());
});
