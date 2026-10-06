// Any generated document can be emailed to anyone: the download box has an Email it button that opens the send sheet.
const { chromium } = require('playwright');
let fail = 0; const ck = (n, c, extra) => { console.log((c ? '  ok   ' : '  FAIL ') + n + (c ? '' : (extra !== undefined ? '  -> ' + JSON.stringify(extra) : ''))); if (!c) fail++; };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ serviceWorkers: 'block' });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await require('./biz_boot.js')(p);
  await p.evaluate(() => { window.__opened = []; window.open = u => { window.__opened.push(u); return null; }; document.addEventListener('click', e => { const a = e.target.closest && e.target.closest('a[href^="mailto:"]'); if (a) { e.preventDefault(); window.__opened.push(a.getAttribute('href')); } }, true);
    const fake = { output: () => new Blob(['%PDF-1.4 test'], { type: 'application/pdf' }), getNumberOfPages: () => 1 };
    window.__ret = 'pending'; window.__t.saveGeneratedPdf(fake, 'receipt-INV-0007.pdf').then(r => { window.__ret = r; }); });
  await p.waitForSelector('#xpMail');
  ck('download box has an Email it button', true);
  await p.click('#xpMail');
  await p.waitForSelector('.send-overlay');
  ck('send sheet opens with the document name', /receipt INV 0007/i.test(await p.textContent('.send-overlay .banner')));
  ck('saveGeneratedPdf does not claim a download happened', (await p.evaluate(() => window.__ret)) === false);
  await p.selectOption('#sdRecipient', 'manual');
  await p.fill('#sdEmail', 'anyone@gmail.com, boss@company.co.za');
  await p.click('[data-channel="email"]');
  await p.waitForFunction(() => window.__opened.length > 0, null, { timeout: 5000 }).catch(() => {});
  const url = await p.evaluate(() => window.__opened[0] || '');
  ck('email app opens addressed to both people', /^mailto:anyone@gmail\.com,boss@company\.co\.za\?/.test(url), url);
  ck('subject names the document and the shop', /subject=Receipt%20inv%200007%20from%20/i.test(url), url);
  // a bad address is refused
  await p.fill('#sdEmail', 'not-an-email'); await p.evaluate(() => { window.__opened = []; }); await p.click('[data-channel="email"]'); await p.waitForTimeout(300);
  ck('a bad address is refused', (await p.evaluate(() => window.__opened.length)) === 0);
  ck('no page errors', errs.length === 0, errs);
  console.log(fail ? 'FAILED ' + fail : 'ALL OK'); await b.close(); process.exit(fail ? 1 : 0);
})();
