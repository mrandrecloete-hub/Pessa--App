// Draws the app icon with a headless browser canvas. Usage: node tools/icon.cjs
const { chromium } = require('playwright'), fs = require('fs'), path = require('path');
(async () => { const b = await chromium.launch(), p = await b.newPage();
  for (const n of [512, 192]) {
    const data = await p.evaluate(n => { const c = document.createElement('canvas'); c.width = c.height = n; const g = c.getContext('2d'), k = n / 512;
      const bg = g.createRadialGradient(n/2, n*0.45, 0, n/2, n/2, n*0.7); bg.addColorStop(0, '#2a1410'); bg.addColorStop(1, '#090a0e'); g.fillStyle = bg; g.fillRect(0, 0, n, n);
      g.save(); g.translate(n/2, n/2); g.transform(1, 0, -0.18, 1, 0, 0); g.lineCap = 'butt';
      g.strokeStyle = '#ffb21e'; g.lineWidth = 34*k; g.beginPath(); g.moveTo(-150*k, 150*k); g.lineTo(150*k, -150*k); g.stroke();
      g.strokeStyle = '#e3261b'; g.shadowColor = '#e3261b'; g.shadowBlur = 40*k; g.lineWidth = 92*k; g.beginPath(); g.moveTo(-130*k, -150*k); g.lineTo(130*k, 150*k); g.stroke();
      g.shadowBlur = 0; g.strokeStyle = '#e3261b'; g.lineWidth = 92*k; g.beginPath(); g.moveTo(130*k, -150*k); g.lineTo(-130*k, 150*k); g.stroke(); g.restore();
      return c.toDataURL('image/png').split(',')[1]; }, n);
    fs.writeFileSync(path.join(__dirname, '..', 'assets', 'icon-' + n + '.png'), Buffer.from(data, 'base64')); }
  await b.close(); })();
