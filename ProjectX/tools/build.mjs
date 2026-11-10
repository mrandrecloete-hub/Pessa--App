// Build: bundle src/main.js into dist/game.js, write dist/index.html (full page) and dist/page.html (fragment), copy assets.
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..'), dist = join(root, 'dist');
mkdirSync(join(dist, 'assets', 'audio'), { recursive: true });
await build({ entryPoints: [join(root, 'src/main.js')], bundle: true, minify: true, format: 'iife', target: 'es2020', outfile: join(dist, 'game.js'), legalComments: 'none' });
const page = readFileSync(join(root, 'src/page.html'), 'utf8');
writeFileSync(join(dist, 'page.html'), page);
const i = page.indexOf('<div id="app">');
const local = existsSync(join(root, 'assets/fonts/fonts.css')), gf = /<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>/;
const pageApp = local ? page.replace(gf, '<link rel="stylesheet" href="assets/fonts/fonts.css">') : page, j = pageApp.indexOf('<div id="app">');
writeFileSync(join(dist, 'index.html'), `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,user-scalable=no">\n<meta name="theme-color" content="#090a0e">\n<link rel="manifest" href="manifest.json">\n${pageApp.slice(0, j)}</head>\n<body>\n${pageApp.slice(j)}</body>\n</html>\n`);
cpSync(join(root, 'assets/poster.jpg'), join(dist, 'assets/poster.jpg'));
if (local) cpSync(join(root, 'assets/fonts'), join(dist, 'assets/fonts'), { recursive: true });
if (existsSync(join(root, 'assets/audio'))) cpSync(join(root, 'assets/audio'), join(dist, 'assets/audio'), { recursive: true });
if (existsSync(join(root, 'assets/manifest.json'))) cpSync(join(root, 'assets/manifest.json'), join(dist, 'manifest.json'));
if (existsSync(join(root, 'assets/icon-512.png'))) { cpSync(join(root, 'assets/icon-512.png'), join(dist, 'icon-512.png')); cpSync(join(root, 'assets/icon-192.png'), join(dist, 'icon-192.png')); }
console.log('built', dist);
