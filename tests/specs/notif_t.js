// Device alerts and email alerts: the alert is shown on the device, and also emailed through EmailJS when switched on,
// at most once per alert per 6 hours and 10 a day.
const { chromium } = require('playwright');
let fail = 0; const ck = (n, c, extra) => { console.log((c ? '  ok   ' : '  FAIL ') + n + (c ? '' : (extra !== undefined ? '  -> ' + JSON.stringify(extra) : ''))); if (!c) fail++; };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ permissions: ['notifications'] });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await require('./biz_boot.js')(p);
  const r = await p.evaluate(async () => {
    const o = {}; o.supported = 'Notification' in window; o.perm = Notification.permission;
    localStorage.setItem('pesa_notify_v1', '1'); o.active = notifyActive();
    // the email service is stubbed so nothing really leaves the test
    const sent = []; window.fetch = (u, init) => { if (/emailjs/.test(u)) { sent.push(JSON.parse(init.body)); return Promise.resolve({ ok: true }); } return Promise.reject(new Error('x')); };
    o.noEmailYet = (sendEmailAlert('Low stock: Milk', 'Milk: 2 left', 'pesa-lowstock-1'), sent.length);
    localStorage.setItem('pesa_emailjs_v1', JSON.stringify({ service: 'service_a', template: 'template_reset', key: 'pubkey' }));
    localStorage.setItem('pesa_email_alerts_v1', JSON.stringify({ on: true, to: 'owner@example.com', template: 'template_alert' }));
    o.ready = emailAlertsOn();
    showDeviceNotification('Low stock: Milk', 'Milk: 2 left', 'pesa-lowstock-1');
    showDeviceNotification('Low stock: Milk', 'Milk: 1 left', 'pesa-lowstock-1');
    o.sentOnce = sent.length; o.params = sent[0] && sent[0].template_params; o.tpl = sent[0] && sent[0].template_id;
    for (let i = 0; i < 20; i++) showDeviceNotification('T' + i, 'b', 'tag' + i);
    o.capped = sent.length;
    localStorage.setItem('pesa_email_alerts_v1', JSON.stringify({ on: false, to: 'owner@example.com', template: 'template_alert' }));
    o.offStops = emailAlertsOn();
    return o; });
  console.log('   ', JSON.stringify(r));
  ck('browser supports notifications and they are allowed', r.supported && r.perm === 'granted', r);
  ck('device alerts are active once switched on', r.active === true);
  ck('no email before email alerts are set up', r.noEmailYet === 0);
  ck('email alerts ready once set up', r.ready === true);
  ck('the same alert is emailed once, not twice', r.sentOnce === 1, r.sentOnce);
  ck('email goes to the chosen address with the alert template', r.params && r.params.to_email === 'owner@example.com' && r.tpl === 'template_alert' && /Low stock/.test(r.params.subject) && r.params.message === 'Milk: 2 left', r.params);
  ck('no more than 10 emails a day', r.capped === 10, r.capped);
  ck('switching email alerts off stops them', r.offStops === false);
  ck('no page errors', errs.length === 0, errs);
  console.log(fail ? 'FAILED ' + fail : 'ALL OK'); await b.close(); process.exit(fail ? 1 : 0);
})();
