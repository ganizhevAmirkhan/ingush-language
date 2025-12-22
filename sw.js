self.addEventListener("install",e=>{
  e.waitUntil(
    caches.open("dict-v2").then(c=>
      c.addAll(["./","index.html","style.css","script.js"])
    )
  );
});
self.addEventListener("fetch",e=>{
  e.respondWith(
    caches.match(e.request).then(r=>r||fetch(e.request))
  );
});

