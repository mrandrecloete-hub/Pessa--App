/* Writes integrity.json: a SHA-256 for every published file and one fingerprint for the whole build. Run from the app folder at every release:  node tools/build_integrity.js
   The Verify check in About compares the files on the phone with this list and with the copy on the official site. */
var fs = require('fs'), path = require('path'), crypto = require('crypto'), root = path.join(__dirname, '..');
var skip = /^(\.git|node_modules|tools|README\.md|integrity\.json|\.nojekyll|_headers|LICENSE)$/;
function walk(d, rel, out){ fs.readdirSync(d).forEach(function(n){ if(skip.test(n) && !rel) return; var p = path.join(d, n), r = rel ? rel + '/' + n : n; if(fs.statSync(p).isDirectory()) walk(p, r, out); else out[r] = crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); }); return out; }
var files = walk(root, '', {}), keys = Object.keys(files).sort(), fp = crypto.createHash('sha256').update(keys.map(function(k){ return k + ':' + files[k]; }).join('\n')).digest('hex');
var ver = (/APP_VERSION|Version (\d+\.\d+\.\d+)/.exec(fs.readFileSync(path.join(root, 'app.js'), 'utf8')) || [])[1] || '';
var sorted = {}; keys.forEach(function(k){ sorted[k] = files[k]; });
fs.writeFileSync(path.join(root, 'integrity.json'), JSON.stringify({ app: 'Ashelz Bible App', version: ver, built: new Date().toISOString().slice(0, 10), fingerprint: fp, files: sorted }, null, 1));
console.log('integrity.json: ' + keys.length + ' files, version ' + ver + ', fingerprint ' + fp.slice(0, 16));
