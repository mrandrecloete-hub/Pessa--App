// Pesa service worker — best-effort offline shell caching.
// Registration is attempted defensively from index.html; on hosts that
// don't allow SW registration for this page (e.g. an embedded preview
// frame), the app simply runs without offline caching.
//
// Bump CACHE whenever the shell changes so old installs pick up new
// deploys immediately instead of serving one version stale.
var CACHE = 'pesa-shell-v4';
var SHELL = ['./index.html', './manifest.json', './icon-192.png', './icon-512.png'];
// The page itself is updated often during testing — always prefer a fresh
// copy over whatever's cached, and only fall back to cache when offline.
var NETWORK_FIRST = ['index.html', 'manifest.json'];

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

function isNetworkFirst(url){
  return NETWORK_FIRST.some(function(name){ return url.indexOf(name) !== -1; }) || url.endsWith('/');
}

self.addEventListener('fetch', function(evt){
  if(evt.request.method !== 'GET') return;
  var url = evt.request.url;

  if(isNetworkFirst(url)){
    // Network-first: always try to get the latest page/manifest; only use
    // the cached copy if the network is unreachable (offline).
    evt.respondWith(
      fetch(evt.request, { cache: 'no-store' }).then(function(res){
        if(res && res.ok){
          var copy = res.clone();
          caches.open(CACHE).then(function(cache){ cache.put(evt.request, copy); });
        }
        return res;
      }).catch(function(){ return caches.match(evt.request); })
    );
    return;
  }

  // Static assets (icons etc.): cache-first, refreshed in the background.
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

// Tapping a Pesa alert (low stock, till closed) brings the app to the front,
// or opens it if it has been closed since.
self.addEventListener('notificationclick', function(evt){
  evt.notification.close();
  evt.waitUntil(
    self.clients.matchAll({ type:'window', includeUncontrolled:true }).then(function(list){
      for(var i=0;i<list.length;i++){
        if(list[i].focus) return list[i].focus();
      }
      if(self.clients.openWindow) return self.clients.openWindow('./index.html');
    })
  );
});
