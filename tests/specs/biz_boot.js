// Shared helper for the browser tests: registers a fresh test business and signs in as its owner.
// Usage: await require('./biz_boot.js')(page);  The app must be served on http://localhost:8933/index.html (see tests/README or mk.sh).
module.exports = async function boot(p, opts){
  opts = opts || {};
  await p.goto('http://localhost:8933/index.html');
  await p.waitForSelector('#rcCompanyName');
  await p.fill('#rcCompanyName', opts.name || 'Test Bakery');
  await p.fill('#rcOwnerName', opts.owner || 'Owner');
  await p.fill('#rcOwnerEmail', opts.email || 'owner@test.com');
  await p.fill('#rcOwnerPassword', opts.pw || 'aaaa1111');
  await p.fill('#rcOwnerPassword2', opts.pw || 'aaaa1111');
  await p.click('#rcSubmit');
  await p.waitForSelector('#cnAgree'); await p.click('#cnAgree'); await p.click('#cnAccept');
  await p.waitForSelector('.hero-card');
  await p.waitForTimeout(300);
};
