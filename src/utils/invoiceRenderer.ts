/**
 * src/utils/invoiceRenderer.ts
 * Pesa: A4 invoice / Namibian Tax Invoice renderer. Pure function, no DOM, no network.
 * Output is one self contained HTML string (inline CSS, table layout) ready for print or PDF conversion.
 */

// ---- shared definitions (same as the Pesa fiscal types) ----
export type TaxCategory = 'STANDARD' | 'ZERO_RATED' | 'EXEMPT';
export type CurrencyCode = 'NAD' | 'ZAR';
export type FiscalStatus = 'PENDING' | 'SUBMITTED' | 'CLEARED' | 'FAILED';

export interface FiscalReceiptPayload {
  invoiceId: string;
  timestamp: string;
  merchantTin: string;
  branchCode: string;
  terminalId: string;
  currency: CurrencyCode;
  totals: { grossAmount: number; netAmount: number; vatAmount: number; zeroRatedAmount: number; exemptAmount: number };
  items: Array<{ name: string; qty: number; price: number; taxType: TaxCategory }>;
  fiscalStatus: FiscalStatus;
}

/** Optional invoice fields that sit on top of the fiscal payload. */
export interface InvoiceExtras {
  buyer?: { name?: string; tin?: string; contact?: string };
  dueDate?: string;
  notes?: string;
  /** Cryptographic validation hash. Leave empty until one is issued: the block then prints as reserved. */
  verificationHash?: string;
}

export interface BusinessDetails {
  tradingName: string;
  legalName?: string;
  /** Marks the business as a VAT vendor. Decides TAX INVOICE or INVOICE. */
  isVatVendor: boolean;
  tin?: string;
  vatNumber?: string;
  address?: string;
  phone?: string;
  email?: string;
  /** Standard VAT rate in percent. Default 15. */
  vatRatePct?: number;
  /** Unit prices include VAT (how Pesa prices stock). Default true. */
  pricesIncludeVat?: boolean;
}

export interface InvoiceTotals {
  net: number;        // standard rated value excluding VAT
  vat: number;        // VAT collected at the standard rate
  zeroRated: number;  // zero rated (0%) supplies
  exempt: number;     // exempt supplies
  gross: number;      // net + vat + zeroRated + exempt = total due
}

// ---- money helpers: whole cents, so 2 decimal places are exact ----
const cents = (n: number): number => Math.round((Number.isFinite(n) ? n : 0) * 100);
const fromCents = (c: number): number => c / 100;
const money = (n: number, cur: CurrencyCode): string =>
  (cur === 'ZAR' ? 'R' : 'N$') + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = (v: unknown): string =>
  String(v ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] as string));

/** Task 1: totals worked out from the lines, to 2 decimal places. Net + VAT + Zero rated + Exempt always equals Gross. */
export function computeInvoiceTotals(items: FiscalReceiptPayload['items'], vatRatePct = 15, pricesIncludeVat = true): InvoiceTotals {
  let std = 0, zero = 0, exempt = 0;
  for (const it of items) {
    const line = Math.round(cents(it.price) * (Number.isFinite(it.qty) ? it.qty : 0));
    if (it.taxType === 'ZERO_RATED') zero += line;
    else if (it.taxType === 'EXEMPT') exempt += line;
    else std += line;
  }
  let net: number, vat: number, stdGross: number;
  if (pricesIncludeVat) { vat = Math.round(std * vatRatePct / (100 + vatRatePct)); net = std - vat; stdGross = std; }
  else { net = std; vat = Math.round(std * vatRatePct / 100); stdGross = std + vat; }
  return { net: fromCents(net), vat: fromCents(vat), zeroRated: fromCents(zero), exempt: fromCents(exempt), gross: fromCents(stdGross + zero + exempt) };
}

const TAX_LABEL = (t: TaxCategory, rate: number): string => (t === 'ZERO_RATED' ? '0%' : t === 'EXEMPT' ? 'Exempt' : rate + '%');

/** Tasks 2 and 3: the A4 HTML template. */
export function generateInvoiceHtml(payload: FiscalReceiptPayload & InvoiceExtras, merchantDetails: BusinessDetails): string {
  const m = merchantDetails, cur = payload.currency, rate = m.vatRatePct ?? 15;
  const totals = computeInvoiceTotals(payload.items, rate, m.pricesIncludeVat ?? true);
  const title = m.isVatVendor ? 'TAX INVOICE' : 'INVOICE';
  const issued = new Date(payload.timestamp);
  const issuedText = isNaN(issued.getTime()) ? esc(payload.timestamp) : issued.toLocaleString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const sellerTin = m.tin || payload.merchantTin || '';
  const missing = '<span style="color:#b42318;font-weight:700;">Not provided</span>';

  const rows = payload.items.map((it, i) => {
    const line = fromCents(Math.round(cents(it.price) * it.qty));
    return `<tr>
      <td class="c" style="width:7%">${i + 1}</td>
      <td style="width:43%">${esc(it.name)}</td>
      <td class="r" style="width:9%">${esc(it.qty)}</td>
      <td class="r" style="width:17%">${money(it.price, cur)}</td>
      <td class="c" style="width:10%">${esc(TAX_LABEL(it.taxType, rate))}</td>
      <td class="r" style="width:14%">${money(line, cur)}</td></tr>`;
  }).join('');

  const idBlock = (label: string, value: string) =>
    `<div style="margin-top:6px"><div class="lbl">${label}</div><div class="val">${value}</div></div>`;

  const totalRow = (label: string, value: number) =>
    `<tr><td class="tl">${label}</td><td class="tv">${money(value, cur)}</td></tr>`;

  const hash = (payload.verificationHash || '').trim();

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${title} ${esc(payload.invoiceId)}</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #fff; color: #17211d; font: 10pt/1.45 Helvetica, Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { width: 210mm; min-height: 297mm; margin: 0 auto; padding: 16mm 15mm 14mm; position: relative; }
  table { border-collapse: collapse; width: 100%; }
  .band { border-top: 4px solid #16463b; border-bottom: 1px solid #c9a24a; }
  .band td { padding: 8px 0 10px; }
  h1 { margin: 0; font-size: 22pt; letter-spacing: .12em; color: #16463b; }
  .lbl { font-size: 7pt; letter-spacing: .08em; text-transform: uppercase; color: #5d6b66; font-weight: 700; }
  .val { font-size: 10pt; font-weight: 700; color: #17211d; word-break: break-word; }
  .box { border: 1px solid #c8d3ce; border-radius: 4px; padding: 10px 12px; vertical-align: top; background: #f6f9f7; }
  .box h2 { margin: 0 0 4px; font-size: 8pt; letter-spacing: .1em; text-transform: uppercase; color: #16463b; }
  .items th { background: #16463b; color: #fff; font-size: 7.5pt; letter-spacing: .08em; text-transform: uppercase; padding: 7px 8px; text-align: left; }
  .items td { padding: 7px 8px; border-bottom: 1px solid #dfe7e3; }
  .items tr:nth-child(even) td { background: #f6f9f7; }
  .r { text-align: right; font-variant-numeric: tabular-nums; } .c { text-align: center; }
  .items th.r { text-align: right; } .items th.c { text-align: center; }
  .tl { padding: 6px 10px; background: #eaf1ee; border: 1px solid #c8d3ce; font-size: 7.5pt; letter-spacing: .06em; text-transform: uppercase; font-weight: 700; color: #4a5a54; width: 55%; }
  .tv { padding: 6px 10px; border: 1px solid #c8d3ce; text-align: right; font-weight: 700; font-variant-numeric: tabular-nums; }
  .due td { background: #16463b; color: #fff; border: 0; padding: 9px 10px; font-weight: 800; }
  .due td.tv { font-size: 12pt; border-top: 2px solid #c9a24a; }
  .sig { border: 1px solid #c8d3ce; border-radius: 4px; padding: 10px 12px; background: #f6f9f7; page-break-inside: avoid; }
  .hash { margin-top: 5px; min-height: 9mm; border: 1px dashed #9aaba5; border-radius: 3px; background: #fff; padding: 6px 8px; font: 8pt/1.3 "Courier New", monospace; word-break: break-all; }
  .tag { text-align: center; margin-top: 12mm; font-size: 7.5pt; letter-spacing: .32em; color: #8a9a94; }
  .tag b { color: #b5893a; font-weight: 600; }
</style></head><body><div class="page">

  <table class="band"><tr>
    <td style="vertical-align:bottom"><h1>${title}</h1><div class="lbl" style="margin-top:4px">Pesa &middot; ${esc(m.tradingName)}</div></td>
    <td style="text-align:right;vertical-align:bottom">
      <div class="lbl">Invoice no.</div><div class="val">${esc(payload.invoiceId)}</div>
      <div class="lbl" style="margin-top:5px">Issued</div><div class="val">${issuedText}</div>
      ${payload.dueDate ? `<div class="lbl" style="margin-top:5px">Due date</div><div class="val">${esc(payload.dueDate)}</div>` : ''}
    </td></tr></table>

  <table style="margin-top:12px;border-spacing:0"><tr>
    <td class="box" style="width:50%;border-right:0;border-radius:4px 0 0 4px">
      <h2>Seller</h2>
      <div class="val" style="font-size:11pt">${esc(m.legalName || m.tradingName)}</div>
      ${m.legalName && m.legalName !== m.tradingName ? `<div>Trading as ${esc(m.tradingName)}</div>` : ''}
      ${idBlock('Seller TIN (Tax Identification Number)', sellerTin ? esc(sellerTin) : missing)}
      ${idBlock('Seller VAT registration number', m.vatNumber ? esc(m.vatNumber) : (m.isVatVendor ? missing : 'Not a VAT vendor'))}
      <div style="margin-top:6px;font-size:9pt;color:#4a5a54">${[m.address, m.phone, m.email].filter(Boolean).map(esc).join('<br>')}</div>
      <div style="margin-top:4px;font-size:8pt;color:#5d6b66">Branch ${esc(payload.branchCode)} &middot; Terminal ${esc(payload.terminalId)}</div>
    </td>
    <td class="box" style="width:50%;border-radius:0 4px 4px 0">
      <h2>Buyer</h2>
      <div class="val" style="font-size:11pt">${esc(payload.buyer?.name || 'Customer')}</div>
      ${idBlock('Buyer TIN', payload.buyer?.tin ? esc(payload.buyer.tin) : '<span style="color:#5d6b66;font-weight:400">Not supplied</span>')}
      ${payload.buyer?.contact ? `<div style="margin-top:6px;font-size:9pt;color:#4a5a54">${esc(payload.buyer.contact).replace(/\n/g, '<br>')}</div>` : ''}
    </td></tr></table>

  <table class="items" style="margin-top:14px">
    <thead><tr><th class="c">#</th><th>Description</th><th class="r">Qty</th><th class="r">Unit price${(m.pricesIncludeVat ?? true) ? ' (incl. VAT)' : ''}</th><th class="c">VAT</th><th class="r">Amount</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>

  <table style="margin-top:14px"><tr>
    <td style="vertical-align:top;padding-right:14px;width:50%">
      ${payload.notes ? `<div class="box"><h2>Notes</h2><div style="font-size:9pt">${esc(payload.notes).replace(/\n/g, '<br>')}</div></div>` : ''}
    </td>
    <td style="vertical-align:top;width:50%">
      <table>
        ${totalRow('Net total (excl. VAT)', totals.net)}
        ${totalRow('Total ' + rate + '% VAT collected', totals.vat)}
        ${totalRow('Zero rated total (0%)', totals.zeroRated)}
        ${totalRow('Exempt total', totals.exempt)}
        <tr class="due"><td class="tl" style="background:#16463b;color:#fff;border:0">Gross total due</td><td class="tv">${money(totals.gross, cur)}</td></tr>
      </table>
    </td></tr></table>

  <div class="sig" style="margin-top:16px">
    <h2 style="margin:0 0 4px;font-size:8pt;letter-spacing:.1em;text-transform:uppercase;color:#16463b">Document verification signature</h2>
    <div style="font-size:8pt;color:#5d6b66">Reserved for a cryptographic validation code. Until a code is printed in the box below, this document has not been validated by NamRA.</div>
    <div class="lbl" style="margin-top:7px">Verification code</div>
    <div class="hash">${hash ? esc(hash) : '&nbsp;'}</div>
  </div>

  <div class="tag"><b>YOUR MULA, YOUR PRIDE</b></div>
</div></body></html>`;
}
