// The pilot form reminder and the backup advice appear once, in the first session after registering, then never again by themselves.
const { chromium } = require('playwright');
let fail = 0; const ck = (n, c, x) => { console.log((c ? '  ok   ' : '  FAIL ') + n + (c ? '' : '  -> ' + JSON.stringify(x))); if (!c) fail++; };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 430, height: 900 }, serviceWorkers: 'block' });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8933/index.html'); await p.waitForSelector('#rcCompanyName');
  await p.fill('#rcCompanyName', 'Prompt Shop'); await p.fill('#rcOwnerName', 'Alice'); await p.fill('#rcOwnerEmail', 'a@x.com');
  await p.fill('#rcOwnerPassword', 'aaaa1111'); await p.fill('#rcOwnerPassword2', 'aaaa1111'); await p.click('#rcSubmit');
  await p.waitForSelector('#cnAgree'); await p.click('#cnAgree'); await p.click('#cnAccept'); await p.waitForSelector('.hero-card');
  // the setup guide is a different prompt; keep it out of the way so only the two we test are watched
  await p.evaluate(() => { window.__t.btSave({ setupHidden: true }); });
  // first session: the pilot reminder opens once
  const pilot = await p.waitForSelector('#prlater', { timeout: 12000 }).then(() => true).catch(() => false);
  ck('the pilot reminder opens once after registering', pilot);
  const seenFlag = await p.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => /^pesa_welcome_/.test(k)) || 'x') || 'null'));
  ck('and it is then used up', !!seenFlag && !seenFlag.pf, seenFlag);
  if (pilot) await p.click('#prlater');
  // the backup advice no longer shows on the dashboard (it lives in Settings)
  await p.evaluate(() => { window.__t.setTab('dashboard'); }); await p.waitForTimeout(500);
  ck('no backup advice on the dashboard', !(await p.$('#bkSafeBanner')));
  // the pilot form stays available by choice
  ck('the pilot form can still be opened by choice', await p.evaluate(() => { try { window.__t.handleDrawerAction('pilotform'); return !!document.querySelector('#pvGo'); } catch (e) { return false; } }));
  await p.evaluate(() => window.__t.closeModal());
  // a later session: nothing comes up by itself
  await p.reload(); await p.waitForSelector('.hero-card', { timeout: 15000 });
  await p.evaluate(() => { window.__t.btSave({ setupHidden: true }); });
  await p.waitForTimeout(8000);
  ck('a later session has no pilot reminder', !(await p.$('#prlater')) && !(await p.$('#pfSnack')));
  ck('a later session has no backup banner', !(await p.$('#bkSafeBanner')));
  ck('the saved flags are cleared', await p.evaluate(() => !Object.keys(localStorage).some(k => /^pesa_welcome_/.test(k))));
  // an existing user (never marked) is never prompted
  await p.evaluate(() => { Object.keys(localStorage).filter(k => /^pesa_welcome_/.test(k)).forEach(k => localStorage.removeItem(k)); });
  await p.reload(); await p.waitForSelector('.hero-card', { timeout: 15000 });
  await p.waitForTimeout(7000);
  ck('a person who registered long ago gets no prompt', !(await p.$('#prlater')) && !(await p.$('#bkSafeBanner')));
  ck('no page errors', errs.length === 0, errs);
  console.log(fail ? 'FAILED ' + fail : 'ALL OK'); await b.close(); process.exit(fail ? 1 : 0);
})();
