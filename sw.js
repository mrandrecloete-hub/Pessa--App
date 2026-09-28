// Pesa service worker — best-effort offline shell caching.
// Registration is attempted defensively from index.html; on hosts that
// don't allow SW registration for this page (e.g. an embedded preview
// frame), the app simply runs without offline caching.
var CACHE = 'pesa-shell-v1';
var SHELL = ['./index.html', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', function(evt){
  self.skipWaiting();
  evt.waitUntil(
    caches.open(CACHE).then(function(cache){
      return Promise.all(SHELL.map(function(u){
        return cache.add(u).catch(function(){ /* ignore individual failures */ });
      }));
    })
  );
});

self.addEventListener('activate', function(evt){
  evt.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){ return k !== CACHE; }).map(function(k){ return caches.delete(k); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(evt){
  if(evt.request.method !== 'GET') return;
  evt.respondWith(
    caches.match(evt.request).then(function(cached){
      var network = fetch(evt.request).then(function(res){
        if(res && res.ok){
          var copy = res.clone();
          caches.open(CACHE).then(function(cache){ cache.put(evt.request, copy); });
        }
        return res;
      }).catch(function(){ return cached; });
      return cached || network;
    })
  );
});
