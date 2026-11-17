/* One command for every release, so the version can never be half updated and phones always see the new build.
   Usage: node tools/bump.js "What changed, in plain words" ["Another line"]
   It raises the last number of the version (2026.10.167 becomes 2026.10.168) in app.js (APP_VERSION and the top CHANGELOG entry), index.html (app.js?v=),
   version.json, and sw.js (APPJS and the cache name), then runs tests/check.js. Then commit and push. Phones check version.json
   every 10 minutes and whenever the app comes back to the front, and apply the new version by themselves at a safe moment. */
var fs = require('fs'), path = require('path'), cp = require('child_process'), root = path.join(__dirname, '..');
var lines = process.argv.slice(2).map(function(s){ return String(s).trim(); }).filter(Boolean);
if(!lines.length){ console.error('Give at least one line for the change log, in quotes.'); process.exit(1); }
if(lines.some(function(l){ return /[–—]|\s-\s/.test(l); })){ console.error('Keep app wording free of dashes.'); process.exit(1); }
function rd(f){ return fs.readFileSync(path.join(root, f), 'utf8'); } function wr(f, s){ fs.writeFileSync(path.join(root, f), s); }
var cur = JSON.parse(rd('version.json')).version, parts = cur.split('.'); parts[parts.length - 1] = String(+parts[parts.length - 1] + 1); var next = parts.join('.');
function swap(f, a, b){ var s = rd(f); if(s.indexOf(a) < 0){ console.error('Could not find ' + a + ' in ' + f); process.exit(1); } wr(f, s.replace(a, b)); }
swap('app.js', "var APP_VERSION = '" + cur + "';", "var APP_VERSION = '" + next + "';");
swap('app.js', "var CHANGELOG = [\n  { v:'" + cur + "', items:[", "var CHANGELOG = [\n  { v:'" + next + "', items:[\n" + lines.map(function(l){ return "    '" + l.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'"; }).join(',\n') + "\n  ] },\n  { v:'" + cur + "', items:[");
swap('index.html', 'app.js?v=' + cur, 'app.js?v=' + next);
swap('version.json', cur, next);
swap('sw.js', 'app.js?v=' + cur, 'app.js?v=' + next);
var sw = rd('sw.js'), m = /var CACHE = 'pesa-shell-v(\d+)'/.exec(sw); if(!m){ console.error('Could not find the cache name in sw.js'); process.exit(1); }
wr('sw.js', sw.replace(m[0], "var CACHE = 'pesa-shell-v" + (+m[1] + 1) + "'"));
console.log(cur + ' -> ' + next + ', cache v' + m[1] + ' -> v' + (+m[1] + 1));
try{ console.log(cp.execFileSync('node', [path.join(root, 'tests/check.js')], { cwd:root }).toString().trim().split('\n').slice(-3).join('\n')); }catch(e){ console.error(String(e.stdout || e.message)); process.exit(1); }
