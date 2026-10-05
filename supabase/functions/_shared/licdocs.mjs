/* Pesa licence documents: the proof of payment and the licence certificate.
   One source for both the issuer page (tools/issuer.html) and the licence server (supabase/functions/licence).
   make(jsPDF, ASSETS, SELLER) returns { buildProof(d), buildCert(d), proofNumber(d) }.
   d = { ref, shop, client, email, plan, months, from, exp, key, paid, method, bankRef, amount, seq }
   tools/embed_issuer_assets.py copies this file into tools/issuer.html. */
function make(J, ASSETS, SELLER){
  function pad(n){ return n < 10 ? '0' + n : '' + n; }
  function money(n){ n = Number(n) || 0; return 'N$' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  var LIMITS = { starter:'Up to 3 staff accounts, 1 branch', business:'Up to 10 staff accounts, 3 branches', premium:'Unlimited staff accounts and branches' };
  function cap(w){ return w.charAt(0).toUpperCase() + w.slice(1); }
  function nice(isoStr){ var d = new Date(isoStr + 'T00:00:00'); return isNaN(d) ? isoStr : d.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }); }
  function periodWord(m){ return m === 1 ? 'monthly' : m === 12 ? 'yearly' : m + ' months'; }
  var RGB = { green:[11,74,56], deep:[8,52,40], gold:[201,150,42], ink:[16,36,28], muted:[91,111,102], line:[207,229,216], tint:[241,247,244] };
  function docHeader(doc, title, status){
    var W = 210; doc.setFillColor.apply(doc, RGB.deep); doc.rect(0, 0, W, 34, 'F');
    doc.setFillColor.apply(doc, RGB.green); doc.rect(0, 0, W, 30, 'F');
    try{ doc.addImage(ASSETS.logo, 'PNG', 14, 6, 18 * 349 / 360, 18); }catch(e){}
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(22); doc.text('PESA', 36, 16);
    doc.setFontSize(7); doc.setTextColor.apply(doc, RGB.gold); doc.text('YOUR MULA, YOUR PRIDE', 36, 21.5, { charSpace:0.8 });
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
    doc.text(SELLER.name, W - 14, 12, { align:'right' }); doc.text(SELLER.place, W - 14, 17, { align:'right' });
    doc.text(SELLER.email, W - 14, 22, { align:'right' });
    doc.setDrawColor.apply(doc, RGB.gold); doc.setLineWidth(0.9); doc.line(0, 30, W, 30); doc.setLineWidth(0.2);
    doc.setTextColor.apply(doc, RGB.green); doc.setFont('helvetica', 'bold'); doc.setFontSize(21); doc.text(title, 14, 50, { charSpace:1.2 });
    doc.setDrawColor.apply(doc, RGB.gold); doc.setLineWidth(0.8); doc.line(14, 53.5, 44, 53.5); doc.setLineWidth(0.2);
    if(status){
      doc.setDrawColor.apply(doc, RGB.gold); doc.setLineWidth(0.6); doc.roundedRect(W - 14 - 30, 42.5, 30, 9, 4.5, 4.5, 'S');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor.apply(doc, RGB.gold); doc.text(status, W - 14 - 15, 48.5, { align:'center', charSpace:1 }); doc.setLineWidth(0.2);
    }
    return 62;
  }
  function docFooter(doc, note){
    var W = 210, H = 297;
    doc.setFillColor.apply(doc, RGB.green); doc.rect(0, H - 14, W, 14, 'F'); doc.setDrawColor.apply(doc, RGB.gold); doc.setLineWidth(0.6); doc.line(0, H - 14, W, H - 14); doc.setLineWidth(0.2);
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
    doc.text(SELLER.name + '   |   ' + SELLER.email + '   |   WhatsApp ' + SELLER.whatsapp, 14, H - 6);
    doc.text(note, W - 14, H - 6, { align:'right' });
  }
  function card(doc, x, y, w, h, heading){
    doc.setFillColor.apply(doc, RGB.tint); doc.setDrawColor.apply(doc, RGB.line); doc.roundedRect(x, y, w, h, 2.5, 2.5, 'FD');
    doc.setFillColor.apply(doc, RGB.green); doc.roundedRect(x + 4, y + 4.4, 1.2, 3.6, 0.4, 0.4, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor.apply(doc, RGB.green); doc.text(heading.toUpperCase(), x + 7.5, y + 7.4, { charSpace:0.6 });
  }
  function lines(doc, arr, x, y, w, size, color){
    var yy = y; doc.setFontSize(size);
    arr.forEach(function(t, i){ if(!t) return; doc.setFont('helvetica', i === 0 ? 'bold' : 'normal'); doc.setTextColor.apply(doc, i === 0 ? RGB.ink : (color || RGB.muted)); var parts = doc.splitTextToSize(String(t), w); doc.text(parts, x, yy); yy += parts.length * (size * 0.5); });
    return yy;
  }
  function strip(doc, x, y, w, items){
    card(doc, x, y, w, 20, 'Details'); var n = items.length, cw = (w - 12) / n;
    items.forEach(function(it, i){
      var cx = x + 6 + i * cw; doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor.apply(doc, RGB.muted); doc.text(it[0].toUpperCase(), cx, y + 12.2, { charSpace:0.3 });
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.6); doc.setTextColor.apply(doc, RGB.ink); doc.text(doc.splitTextToSize(String(it[1]), cw - 3), cx, y + 17);
    });
    return 20;
  }
  function stamp(doc, cx, cy, when){
    var D = 40, tilt = -9, half = D / 2, rad = tilt * Math.PI / 180, C = Math.cos(rad), S = Math.sin(rad);
    var px = cx - half * C + half * S, py = cy + half * S + half * C, ix = px, iy = py - D;
    try{ doc.addImage(ASSETS.stamp, 'PNG', ix, iy, D, D, undefined, undefined, tilt); }catch(e){ return; }
    var fx = 0.5024801587301587, fy = 0.5322740814299901, Lx = fx * D, Ly = (1 - fy) * D - 1.0;
    var Rx = C * Lx - S * Ly, Ry = S * Lx + C * Ly, tx = ix + Rx, ty = (iy + D) - Ry;
    var M = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.2); doc.setTextColor(15, 15, 15);
    doc.text(pad(when.getDate()) + ' ' + M[when.getMonth()] + ' ' + when.getFullYear(), tx, ty, { align:'center', angle:tilt });
  }
  function proofNumber(d){ return 'PP-' + d.paid.replace(/-/g, '') + '-' + d.ref.slice(-4) + '-' + String(d.seq || 1).padStart(3, '0'); }
  function buildProof(d){
    var doc = new J({ unit:'mm', format:'a4', compress:true }), M = 14, W = 210 - 2 * M;
    var y = docHeader(doc, 'PROOF OF PAYMENT', 'PAID');
    y += strip(doc, M, y, W, [['Proof no.', proofNumber(d)], ['Payment date', nice(d.paid)], ['Paid by', d.method], ['Licence reference', d.ref]]) + 6;
    var cw = (W - 6) / 2, ch = 34;
    card(doc, M, y, cw, ch, 'Received from'); lines(doc, [d.client || d.shop || 'Customer', d.email, d.shop && d.client && d.shop !== d.client ? d.shop : ''], M + 7.5, y + 15, cw - 12, 10);
    card(doc, M + cw + 6, y, cw, ch, 'Received by'); lines(doc, [SELLER.name, SELLER.place, SELLER.email, 'WhatsApp ' + SELLER.whatsapp], M + cw + 13.5, y + 15, cw - 12, 9);
    y += ch + 8;
    // table
    doc.setFillColor.apply(doc, RGB.green); doc.rect(M, y, W, 8, 'F'); doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
    doc.text('DESCRIPTION', M + 3, y + 5.3, { charSpace:0.5 }); doc.text('SUBSCRIPTION PERIOD', M + 98, y + 5.3, { charSpace:0.5 }); doc.text('AMOUNT', M + W - 5, y + 5.3, { align:'right', charSpace:0.5 });
    y += 8; doc.setDrawColor.apply(doc, RGB.line);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor.apply(doc, RGB.ink); doc.text('Pesa ' + cap(d.plan) + ' plan', M + 3, y + 7);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor.apply(doc, RGB.muted); doc.text('Pesa shop management software, ' + periodWord(d.months) + ' subscription', M + 3, y + 12);
    doc.setFontSize(9); doc.setTextColor.apply(doc, RGB.ink); doc.text(nice(d.from) + ' to ' + nice(d.exp), M + 98, y + 7);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text(money(d.amount), M + W - 3, y + 7, { align:'right' });
    y += 17; doc.line(M, y, M + W, y); y += 6;
    var tw = 80, tx = M + W - tw;
    doc.setFillColor.apply(doc, RGB.green); doc.roundedRect(tx, y, tw, 13, 1.5, 1.5, 'F'); doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(255, 255, 255); doc.text('TOTAL RECEIVED', tx + 4, y + 8, { charSpace:0.5 });
    doc.setFontSize(14); doc.text(money(d.amount), tx + tw - 4, y + 8.6, { align:'right' });
    if(d.bankRef){ doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor.apply(doc, RGB.muted); doc.text('Bank reference: ' + d.bankRef, M, y + 8); }
    y += 24;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor.apply(doc, RGB.muted);
    var note = 'This document confirms that the payment above was received and matched to the licence reference shown. Your licence key is sent in a separate document, the Licence Certificate. Keep this proof for your records. It is a proof of payment, not a tax invoice.';
    var np = doc.splitTextToSize(note, W); doc.text(np, M, y); y += np.length * 4.3 + 12;
    stamp(doc, M + W - 30, y + 18, new Date(d.paid + 'T12:00:00'));
    doc.setDrawColor.apply(doc, RGB.muted); doc.line(M, y + 30, M + 62, y + 30); doc.setFontSize(7.5); doc.text('Authorised by ' + SELLER.name, M, y + 34);
    docFooter(doc, 'Proof of payment ' + proofNumber(d));
    return doc;
  }
  function buildCert(d){
    var doc = new J({ unit:'mm', format:'a4', compress:true }), M = 14, W = 210 - 2 * M;
    var y = docHeader(doc, 'LICENCE CERTIFICATE', 'ACTIVE');
    y += strip(doc, M, y, W, [['Licence reference', d.ref], ['Plan', cap(d.plan)], ['Valid from', nice(d.from)], ['Valid until', nice(d.exp)]]) + 6;
    var cw = (W - 6) / 2, ch = 30;
    card(doc, M, y, cw, ch, 'Licensed to'); lines(doc, [d.shop || d.client || 'Customer', d.client && d.shop && d.client !== d.shop ? d.client : '', d.email], M + 7.5, y + 15, cw - 12, 10);
    card(doc, M + cw + 6, y, cw, ch, 'What this plan includes'); lines(doc, [cap(d.plan) + ' plan', LIMITS[d.plan], 'Every Pesa feature'], M + cw + 13.5, y + 15, cw - 12, 9.5);
    y += ch + 8;
    // key block
    var key = d.key, per = 62, rows = []; for(var i = 0; i < key.length; i += per) rows.push(key.slice(i, i + per));
    var kh = 16 + rows.length * 4.6 + 6;
    card(doc, M, y, W, kh, 'Your licence key');
    doc.setFillColor(255, 255, 255); doc.setDrawColor.apply(doc, RGB.line); doc.roundedRect(M + 4, y + 11, W - 8, kh - 15, 1.5, 1.5, 'FD');
    doc.setFont('courier', 'bold'); doc.setFontSize(8.6); doc.setTextColor.apply(doc, RGB.ink); rows.forEach(function(r, i){ doc.text(r, M + 7, y + 17.5 + i * 4.6); });
    y += kh + 8;
    card(doc, M, y, W, 50, 'How to switch your licence on');
    var steps = ['Open Pesa and sign in as the owner of the business.', 'Tap the menu, then Settings, then Security, help and about, then Licence and subscription.', 'Copy the whole licence key above, starting with PESA1, and paste it into the Licence key box.', 'Tap Activate key. You will see a message saying your licence is active.'];
    doc.setFontSize(9); steps.forEach(function(t, i){
      var yy = y + 15 + i * 8.6; doc.setFillColor.apply(doc, RGB.green); doc.circle(M + 9, yy - 1.2, 2.7, 'F'); doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.text(String(i + 1), M + 9, yy + 0.1, { align:'center' });
      doc.setTextColor.apply(doc, RGB.ink); doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.text(doc.splitTextToSize(t, W - 28), M + 15, yy);
    });
    y += 58;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.3); doc.setTextColor.apply(doc, RGB.muted);
    var n = ['This key only works for the business with Licence reference ' + d.ref + '. Keep it private and do not share it.', 'Your records stay on your own device. When the licence ends you have a short grace period to renew, and nothing is ever deleted.', 'To renew or change plan, open Pay for Pesa in Settings, or message us on WhatsApp ' + SELLER.whatsapp + '.'];
    var yy = y; n.forEach(function(t){ var p = doc.splitTextToSize('•  ' + t, W - 48); doc.text(p, M, yy); yy += p.length * 4.2 + 1.8; });
    stamp(doc, M + W - 22, Math.max(y + 12, 246), new Date(d.paid + 'T12:00:00'));
    docFooter(doc, 'Licence certificate ' + d.ref);
    return doc;
  }
  return { buildProof:buildProof, buildCert:buildCert, proofNumber:proofNumber, money:money, nice:nice, cap:cap };
}
export { make };
