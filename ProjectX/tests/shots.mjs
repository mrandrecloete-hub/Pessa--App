// Drives the real UI and saves screenshots. Usage: node tests/shots.mjs <outDir> [track ...]
import { createRequire } from 'node:module';
const { chromium, devices } = createRequire(import.meta.url)('playwright');
const out = process.argv[2] || 'shots', tracks = process.argv.slice(3);
const args = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const browser = await chromium.launch({ args });
const errors = [];
async function open(ctxOpts) {
  const ctx = await browser.newContext(ctxOpts), page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/404|Failed to load/.test(m.text())) errors.push(m.text()); });
  await page.goto('http://localhost:8377/index.html'); await page.waitForFunction(() => window.PX && window.PX.app.ui);
  return page;
}
const click = (page, sel) => page.click(sel);
let page = await open({ viewport: { width: 1280, height: 720 } });
await page.screenshot({ path: out + '/01-title.png' });
await click(page, '[data-act=start]'); await page.screenshot({ path: out + '/02-story.png' });
await click(page, '[data-act=storyok]'); await page.screenshot({ path: out + '/03-menu.png' });
await click(page, '[data-id=garage]'); await page.waitForTimeout(1500); await page.screenshot({ path: out + '/04-garage.png' });
await click(page, '[data-act=go]'); await click(page, '[data-id=career]'); await page.screenshot({ path: out + '/05-career.png' });
await click(page, '[data-act=go]'); await click(page, '[data-id=quick]'); await page.screenshot({ path: out + '/06-setup.png' });
for (const t of tracks.length ? tracks : ['desert']) {
  await page.evaluate(t => { const a = PX.app; a.save.tracks = ['desert', 'city', 'mountain', 'military', 'jungle', 'neon']; a.ui.sel.track = t; a.ui.sel.mode = 'quick'; a.autopilot = true; a.startMode('quick', a.ui.sel); }, t);
  // advance the simulation quickly, then let real frames render
  await page.evaluate(() => { const r = PX.app.race; for (let i = 0; i < 60 * 14; i++) r.step(1 / 60); });
  await page.waitForTimeout(2500); await page.screenshot({ path: `${out}/10-race-${t}.png`, timeout: 180000 }); console.log(t, 'fps', await page.evaluate(() => PX.app.fps), 'px', await page.evaluate(() => PX.app.px));
  await page.evaluate(() => { const r = PX.app.race; for (let i = 0; i < 60 * 9; i++) r.step(1 / 60); });
  await page.waitForTimeout(2000); await page.screenshot({ path: `${out}/11-race-${t}-b.png`, timeout: 180000 });
  await page.evaluate(() => PX.app.quitRace());
}
if (!tracks.length) {
  await page.evaluate(() => { const a = PX.app; a.autopilot = true; a.startMode('arena', a.ui.sel); const r = a.race; for (let i = 0; i < 60 * 25; i++) r.step(1 / 60); });
  await page.waitForTimeout(2500); await page.screenshot({ path: out + '/12-arena.png' });
  await page.evaluate(() => { PX.app.quitRace(); PX.app.ui.settings(); }); await page.screenshot({ path: out + '/13-settings.png' });
  // phone
  page = await open({ ...devices['Pixel 7'], viewport: { width: 915, height: 412 }, isMobile: true, hasTouch: true });
  await click(page, '[data-act=start]'); await click(page, '[data-act=storyok]'); await page.screenshot({ path: out + '/20-phone-menu.png' });
  await page.evaluate(() => { const a = PX.app; a.autopilot = true; a.startMode('quick', a.ui.sel); const r = a.race; for (let i = 0; i < 60 * 12; i++) r.step(1 / 60); });
  await page.waitForTimeout(2500); await page.screenshot({ path: out + '/21-phone-race.png' });
  console.log('phone tier:', await page.evaluate(() => PX.app.tierName));
}
console.log(errors.length ? 'ERRORS: ' + errors.slice(0, 6).join(' | ') : 'no errors'); await browser.close();
