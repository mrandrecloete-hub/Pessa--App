import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }), p = await b.newPage();
await p.goto('http://localhost:8377/index.html'); await p.waitForFunction(() => window.PX && PX.app.ui);
const r = await p.evaluate(() => PX.simulate({ mode: 'arena', diff: 'normal', field: PX.app.field(5, 2) }, 200));
console.log(r.finished && Math.abs(r.res.time - 150) < 1 ? 'PASS' : 'FAIL', 'arena time', r.res.time.toFixed(1), 'scores', r.res.standings.map(s => s.kills).join(','));
await b.close();
