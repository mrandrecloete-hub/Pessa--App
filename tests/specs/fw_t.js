// App firewall: refuses risky connections, keeps normal ones working, and removes hostile page parts.
const { chromium } = require('playwright');
let fail = 0; const ck = (n, c, extra) => { console.log((c ? '  ok   ' : '  FAIL ') + n + (c ? '' : (extra !== undefined ? '  -> ' + JSON.stringify(extra) : ''))); if (!c) fail++; };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ serviceWorkers: 'block' });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await require('./biz_boot.js')(p);
  const r = await p.evaluate(async () => { const F = window.PesaFirewall, o = {};
    o.exists = !!F;
    o.http = F.judge('http://evil.example/x'); o.ip = F.judge('https://8.8.8.8/x'); o.js = F.judge('javascript:alert(1)');
    o.fonts = F.judge('https://fonts.googleapis.com/css'); o.sb = F.judge('https://abc.supabase.co/rest/v1/x'); o.same = F.judge('version.json');
    o.unknownStd = F.judge('https://other.example/x');
    F.setMode('strict'); o.unknownStrict = F.judge('https://other.example/x'); F.setMode('standard');
    try{ await fetch('http://evil.example/steal'); o.fetchRefused = false; }catch(e){ o.fetchRefused = /firewall/.test(e.message); }
    const f = document.createElement('iframe'); f.src = 'https://evil.example/'; document.body.appendChild(f);
    const a = document.createElement('a'); a.setAttribute('href', 'javascript:alert(1)'); document.body.appendChild(a);
    await new Promise(r => setTimeout(r, 100));
    o.frameGone = !f.isConnected; o.linkClean = !a.getAttribute('href');
    o.stats = F.stats(); return o; });
  ck('firewall is loaded', r.exists);
  ck('plain http refused', r.http === 'plain http', r.http); ck('raw ip refused', r.ip === 'raw ip address', r.ip); ck('script address refused', r.js === 'script address', r.js);
  ck('fonts and cloud project allowed', r.fonts === '' && r.sb === '' && r.same === '');
  ck('unknown https site allowed in Standard, refused in Strict', r.unknownStd === '' && r.unknownStrict === 'site not on the allowed list', r);
  ck('fetch to plain http is refused', r.fetchRefused === true);
  ck('hostile frame removed and script link cleaned', r.frameGone && r.linkClean, r);
  ck('refusals are logged', r.stats.refused >= 3, r.stats);
  ck('no page errors', errs.length === 0, errs);
  console.log(fail ? 'FAILED ' + fail : 'ALL OK'); await b.close(); process.exit(fail ? 1 : 0);
})();
