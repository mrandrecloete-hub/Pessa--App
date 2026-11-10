import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }), p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:8377/index.html'); await p.waitForFunction(() => window.PX && PX.app.ui);
for (const id of process.argv.slice(2)) { await p.evaluate(id => { PX.app.ui.gcar = id; PX.app.ui.garage(); PX.app.gspin = 0.9; }, id); await p.waitForTimeout(1200); await p.screenshot({ path: 'shots/g-' + id + '.png' }); }
console.log(errs.join('|') || 'no errors'); await b.close();
