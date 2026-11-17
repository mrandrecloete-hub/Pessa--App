// Writes site/shop.html, the live Pesa Shop page (https://.../site/shop.html?s=<shop name>), from tools/shop_page.js.
// The shop server address is the one line in tools/shop_api.txt (blank until the shop function is deployed). Run: node tools/build_shop_viewer.js
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
function build(){
  const src = fs.readFileSync(path.join(root, 'tools', 'shop_page.js'), 'utf8');
  let api = ''; try{ api = fs.readFileSync(path.join(root, 'tools', 'shop_api.txt'), 'utf8').trim(); }catch(e){}
  const shopPageHtml = new Function(src + '\nreturn shopPageHtml;')();
  return shopPageHtml(null, api);
}
if(require.main === module){ fs.writeFileSync(path.join(root, 'site', 'shop.html'), build()); console.log('wrote site/shop.html'); }
module.exports = { build };
