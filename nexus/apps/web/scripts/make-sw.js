// Writes out/sw.js: precaches every file of the on-device build so the app opens with no network.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const out = path.join(__dirname, '..', 'out'); const files = [];
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); fs.statSync(p).isDirectory() ? walk(p) : files.push('/' + path.relative(out, p).split(path.sep).join('/')); } })(out);
const list = files.filter(f => f !== '/sw.js' && !f.startsWith('/brand/') || /emblem|app-icon-emblem|hero-dune|logo-emblem/.test(f));
const hash = crypto.createHash('sha256'); for (const f of list.sort()) hash.update(f + fs.statSync(path.join(out, f)).size);
const v = hash.digest('hex').slice(0, 10);
fs.writeFileSync(path.join(out, 'sw.js'), `const CACHE='nexus-local-${v}';const FILES=${JSON.stringify(list)};
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==CACHE).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;e.respondWith(caches.match(e.request,{ignoreSearch:true}).then(r=>r||fetch(e.request)))});
`);
console.log('sw.js: ' + list.length + ' files, cache nexus-local-' + v);
