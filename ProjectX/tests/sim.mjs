// Automated check: loads the built game in headless Chromium and runs full sessions with the autopilot.
// Usage: node tests/sim.mjs [quick]   (serve dist on port 8377 first: npm run serve)
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const quick = process.argv.includes('quick');
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = []; page.on('pageerror', e => errors.push('pageerror: ' + e.message)); page.on('console', m => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
await page.goto('http://localhost:8377/index.html'); await page.waitForFunction(() => window.PX && window.PX.app.ui);
let fail = 0; const ok = (name, cond, info = '') => { console.log((cond ? 'PASS ' : 'FAIL ') + name + (info ? '  ' + info : '')); if (!cond) fail++; };
const field = await page.evaluate(() => PX.app.field(5, 0));
const tracks = quick ? ['desert'] : ['desert', 'city', 'mountain', 'military', 'jungle', 'neon'];
for (const t of tracks) {
  const r = await page.evaluate(([t, field]) => PX.simulate({ mode: 'race', track: t, laps: 3, diff: 'normal', field }, 420), [t, field]);
  const p = r.res.standings.find(s => s.isPlayer), fin = r.res.standings.filter(s => s.time > 0).length;
  ok('race ' + t + ' finishes', r.finished && p.time > 0, `pos ${r.res.pos}/6 time ${p.time.toFixed(1)}s best ${r.res.bestLap.toFixed(1)}s finishers ${fin} wrecks ${r.laps.map(c => c.deaths).join(',')}`);
  ok('race ' + t + ' lap times sane', r.res.bestLap > 25 && r.res.bestLap < 110, r.laps.map(c => c.name.split(' ')[0] + ':' + (c.best || 0).toFixed(1)).join(' '));
}
if (!quick) {
  let r = await page.evaluate(() => PX.simulate({ mode: 'trial', track: 'mountain', laps: 3, field: [] }, 400));
  ok('time trial finishes', r.finished && r.res.bestLap > 0, 'best ' + r.res.bestLap.toFixed(1));
  r = await page.evaluate(field => PX.simulate({ mode: 'arena', diff: 'normal', field }, 200), field);
  const kills = r.laps.reduce((a, c) => a + c.kills, 0);
  ok('arena ends on the timer', r.finished && Math.abs(r.res.time - 150) < 1, 'total wrecks ' + kills + ' scores ' + r.res.standings.map(s => s.kills).join(','));
  ok('arena has combat', kills > 0);
  r = await page.evaluate(() => { const b = { id: 'gauntlet', name: 'Marshal Gauntlet', car: 'bastion', skill: 0.88, aggro: 1, defend: 0.7, hpMul: 2.2 }; return PX.simulate({ mode: 'boss', track: 'city', laps: 3, diff: 'normal', field: [b] }, 400); });
  ok('boss battle finishes', r.finished, 'pos ' + r.res.pos);
  for (const d of ['easy', 'extreme']) { r = await page.evaluate(([d, field]) => PX.simulate({ mode: 'race', track: 'desert', laps: 2, diff: d, field }, 300), [d, field]); ok('difficulty ' + d, r.finished, 'autopilot pos ' + r.res.pos + ' best ' + r.res.bestLap.toFixed(1)); }
}
ok('no script errors', errors.length === 0, errors.slice(0, 5).join(' | '));
await browser.close(); console.log(fail ? fail + ' FAILED' : 'ALL PASSED'); process.exit(fail ? 1 : 0);
