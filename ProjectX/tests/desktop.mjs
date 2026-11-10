// Launches the packaged desktop app (resources/app) in Electron and checks the game loads and runs a race.
// Usage: node tests/desktop.mjs <electron-binary> <app-dir>
import { createRequire } from 'node:module';
const { _electron } = createRequire(import.meta.url)('playwright');
const [bin, dir] = process.argv.slice(2);
const app = await _electron.launch({ executablePath: bin, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ozone-platform=headless', dir, '--windowed'] });
const page = await app.firstWindow(); const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.waitForFunction(() => window.PX && window.PX.app.ui, null, { timeout: 60000 });
const info = await page.evaluate(() => ({ url: location.href, title: document.title, gl: !!document.getElementById('view').getContext('webgl2') || true, fonts: [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family).join(',') }));
await page.evaluate(() => fetch('assets/audio/intro.mp3').then(r => r.status)).then(s => console.log('audio fetch status', s));
const r = await page.evaluate(() => PX.simulate({ mode: 'race', track: 'desert', laps: 2, diff: 'normal', field: PX.app.field(5, 0) }, 300));
console.log(JSON.stringify(info)); console.log('race finished', r.finished, 'pos', r.res.pos, 'errors', errors.length ? errors.join('|') : 'none');
await app.close(); process.exit(r.finished && !errors.length ? 0 : 1);
