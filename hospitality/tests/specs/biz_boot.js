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
  // the first run setup guide opens by itself about 2 seconds after sign in on an empty business; keep it from racing with the tests
  if(!opts.keepSetupGuide) await p.evaluate(function(){ try{ window.__t.btSave({ setupHidden:true }); window.__t.pfSave({ remindAt:Date.now() }); }catch(e){} });
  // opts.demo: a few ordinary products, for specs that need real stock to work with (new businesses start empty)
  if(opts.demo) await p.evaluate(async function(){ var r = window.__t.refs, iso = new Date().toISOString(); var list = [['Milk 1L','6001234567890',21.99,16,'Dairy'],['Rice 2kg','6009000000011',45,38,'Groceries'],['Maize Meal 10kg','6009000000028',89.99,68,'Groceries'],['Cooking Oil 750ml','6009000000035',37.99,29,'Groceries'],['Brown Bread','6009000000042',15,9,'Bakery']]; for(var i=0;i<list.length;i++){ var d = r.products.doc(); await d.set({ name:list[i][0], barcode:list[i][1], sellPrice:list[i][2], costPrice:list[i][3], category:list[i][4], stockQty:40, lowStock:5, createdAt:iso }); } });
  await p.waitForTimeout(300);
};
