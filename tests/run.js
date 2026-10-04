// Runs every spec in tests/specs against a fresh test build of the app.
//   npm install            (once; needs internet)
//   npx playwright install chromium   (once, unless a Chromium is already installed)
//   npm test               (all specs)      npm test -- chat acct   (only specs whose name contains chat or acct)
const { spawnSync, spawn } = require('child_process'); const fs = require('fs'), path = require('path'), http = require('http');
const root = path.join(__dirname, '..'), build = path.join(__dirname, '.build'), specs = path.join(__dirname, 'specs');
const out = process.env.PESA_OUT || '/tmp/pesa-tests/'; fs.mkdirSync(out, { recursive: true }); process.env.PESA_OUT = out;
// known harmless lines: the proxy tunnel error in a sandbox, and the word FAILED printed as data
const harmless = [/ERR_TUNNEL/, /FAILED to|status.*FAILED/i];
let r = spawnSync('python3', [path.join(__dirname, 'check.py')], { stdio: 'inherit' }); if(r.status) process.exit(1);
r = spawnSync('python3', [path.join(__dirname, 'build.py')], { stdio: 'inherit' }); if(r.status) process.exit(1);
const srv = spawn('python3', ['-m', 'http.server', '8933', '-d', build], { stdio: 'ignore' });
const want = process.argv.slice(2);
const files = fs.readdirSync(specs).filter(f => f.endsWith('.js') && (!want.length || want.some(w => f.includes(w)))).sort();
function up(){ return new Promise(res => { http.get('http://localhost:8933/index.html', x => { x.resume(); res(true); }).on('error', () => res(false)); }); }
(async () => {
  for (let i = 0; i < 20 && !(await up()); i++) await new Promise(r => setTimeout(r, 250));
  const bad = [];
  for (const f of files) {
    const t0 = Date.now(), p = spawnSync('node', [path.join(specs, f)], { cwd: root, encoding: 'utf8', timeout: 280000, env: process.env });
    const text = (p.stdout || '') + (p.stderr || '');
    const fails = text.split('\n').filter(l => /^\s*FAIL\b/.test(l) && !harmless.some(h => h.test(l)));
    const ok = p.status === 0 && fails.length === 0;
    console.log((ok ? 'PASS ' : 'FAIL ') + f + '  (' + Math.round((Date.now() - t0) / 1000) + 's)');
    if (!ok) { bad.push(f); (fails.length ? fails : text.split('\n').slice(-6)).slice(0, 6).forEach(l => console.log('     ' + l)); }
  }
  srv.kill();
  console.log(bad.length ? '\n' + bad.length + ' spec(s) failed: ' + bad.join(', ') : '\nAll ' + files.length + ' specs passed');
  process.exit(bad.length ? 1 : 0);
})();
