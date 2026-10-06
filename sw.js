// Pesa service worker — best-effort offline shell caching.
// Registration is attempted defensively from index.html; on hosts that
// don't allow SW registration for this page (e.g. an embedded preview
// frame), the app simply runs without offline caching.
//
// Bump CACHE whenever the shell changes so old installs pick up new
// deploys immediately instead of serving one version stale.
var CACHE = 'pesa-shell-v142';
var SHELL = ['./index.html', './manifest.json', './icon-192.png', './icon-512.png', './apple-touch-icon.png', './icon-512-maskable.png', './jspdf.umd.min.js',
  './fonts/Inter-Regular.ttf', './fonts/Inter-Bold.ttf', './fonts/Inter-Italic.ttf', './fonts/PlayfairDisplay-Bold.ttf',
  './fonts/Montserrat-Bold.ttf', './fonts/Lora-Regular.ttf', './fonts/Lora-Bold.ttf', './fonts/Lora-Italic.ttf', './fonts/PermanentMarker.woff2'];
// The page itself is updated often during testing — always prefer a fresh
// copy over whatever's cached, and only fall back to cache when offline.
// Third party files the app needs for PDFs and fonts. They are fetched once
// (no-cors, so the copies are opaque) and kept, so PDFs and fonts still work
// with no internet after the first online visit.
var EXTERNAL = [
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@500;600&display=swap'
];
var NETWORK_FIRST = ['index.html', 'manifest.json'];

// The page and its small files must be saved before this version takes over. The big files (fonts, PDF library)
// download quietly afterwards, so a weak mobile connection is never asked for 5 MB at once.
var CORE = ['./index.html', './manifest.json', './icon-192.png', './apple-touch-icon.png'];
function keep(cache, u, fresh){
  // a file that cannot be downloaded right now keeps the copy already saved by the previous version
  return fetch(new Request(u, fresh ? { cache:'reload' } : {})).then(function(res){
    if(!res || !res.ok) throw new Error('x');
    return cache.put(u, res);
  }).catch(function(){
    return caches.match(u).then(function(old){ if(old) return cache.put(u, old); });
  });
}

self.addEventListener('install', function(evt){
  self.skipWaiting();
  evt.waitUntil(
    caches.open(CACHE).then(function(cache){
      var rest = SHELL.filter(function(u){ return CORE.indexOf(u) === -1; });
      var later = function(){
        EXTERNAL.forEach(function(u){
          fetch(new Request(u, {mode:'no-cors'})).then(function(res){ return cache.put(u, res); }).catch(function(){});
        });
        return rest.reduce(function(chain, u){ return chain.then(function(){ return keep(cache, u, false); }); }, Promise.resolve());
      };
      return Promise.all(CORE.map(function(u){ return keep(cache, u, true); })).then(function(){ later(); });
    })
  );
});

self.addEventListener('activate', function(evt){
  evt.waitUntil(
    caches.open(CACHE).then(function(cache){ return cache.match('./index.html'); }).then(function(ok){
      // never delete the older saved copy unless this version has its own page saved
      if(!ok) return null;
      return caches.keys().then(function(keys){
        return Promise.all(keys.filter(function(k){ return k !== CACHE; }).map(function(k){ return caches.delete(k); }));
      });
    }).then(function(){ return self.clients.claim(); })
  );
});

function isNetworkFirst(url){
  return NETWORK_FIRST.some(function(name){ return url.indexOf(name) !== -1; }) || url.endsWith('/');
}

self.addEventListener('fetch', function(evt){
  if(evt.request.method !== 'GET') return;
  var url = evt.request.url;
  // Video files are streamed by the browser itself (range requests), never kept by the shell cache.
  if(/\.(mp4|webm)(\?|$)/i.test(url)) return;
  // the tiny version note is always read straight from the network (never from the saved copy)
  if(/version\.json(\?|$)/i.test(url)) return;

  if(isNetworkFirst(url)){
    // Instant open: when a saved copy exists it is shown immediately (no waiting on a weak
    // mobile connection) while the newest copy downloads quietly for the next open. The app
    // itself checks version.json and offers the update while it is running. The very first
    // visit has nothing saved, so it waits for the network.
    evt.respondWith(caches.match(evt.request, { ignoreSearch:true }).then(function(c0){
      // opening the app address (ending in a slash) uses the saved page too, so it opens with no network
      return c0 || (evt.request.mode === 'navigate' ? caches.match('./index.html') : null);
    }).then(function(cached){
      var fresh = fetch(evt.request, { cache:'no-cache' }).then(function(res){
        if(res && res.ok){ var copy = res.clone(); caches.open(CACHE).then(function(cache){ cache.put(evt.request, copy); }); }
        return res;
      });
      if(cached){ fresh.catch(function(){}); return cached; }
      return fresh.catch(function(){ return caches.match(evt.request); });
    }));
    return;
  }

  // Static assets (icons etc.): cache-first, refreshed in the background.
  evt.respondWith(
    caches.match(evt.request).then(function(cached){
      var network = fetch(evt.request).then(function(res){
        if(res && (res.ok || res.type === 'opaque')){
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
