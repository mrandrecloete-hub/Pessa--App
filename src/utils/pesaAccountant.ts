/**
 * PESA AUTOMATED BUILT-IN ACCOUNTANT ENGINE
 * Accrual based double entry bookkeeping for a Namibian retail SME.
 * Currency: Namibian Dollar (NAD). The Namibia Dollar is pegged 1:1 to the South African Rand.
 *
 * Design rules (they exist so the books can be checked by an outside accountant):
 *  1. Every amount is a whole number of cents. No floating point sums, so a journal either balances exactly or it is refused.
 *  2. Every journal id is derived from the source record (sale id, expense id and so on). The same data always gives the same
 *     journals, so a report can be re-run and compared line by line. Nothing is random and nothing uses the clock.
 *  3. Balances are never stored on accounts. They are always added up from the journal lines, so there is no running total that
 *     can drift.
 *  4. VAT is only posted for a VAT registered business. Prices include VAT (the way Pesa records them), so VAT is taken out of
 *     the standard rated lines. Input VAT is only posted when the VAT amount from the supplier's tax invoice was recorded.
 *
 * This file is the typed reference version of the engine that runs inside Pesa (index.html). Both use the same rules and the
 * test suite checks that they give the same figures.
 *
 * Contents:
 *  1. Chart of accounts
 *  2. Money helpers
 *  3. Journal builders (sale, expense, supplier invoice and payment, wastage, customer payment, opening balances)
 *  4. General ledger (PesaAccountantCore)
 *  5. Financial statements (PesaFinancialReporting)
 */

// ==========================================================
// 1. CHART OF ACCOUNTS
// ==========================================================

export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
export type AccountGroup = 'CASH' | 'RECEIVABLE' | 'INVENTORY' | 'TAX' | 'PAYABLE' | 'EQUITY' | 'SALES' | 'COGS' | 'OPEX';

export interface LedgerAccount {
  code: string;
  name: string;
  type: AccountType;
  group: AccountGroup;
}

/** Codes 1000, 1010, 1200, 1300, 2000, 2150, 3000, 4000, 5000 and 5100 keep the meaning they had in the first draft of this engine. */
export const CHART_OF_ACCOUNTS: ReadonlyArray<LedgerAccount> = [
  { code: '1000', name: 'Cash on hand (tills and drawer)', type: 'ASSET', group: 'CASH' },
  { code: '1010', name: 'Digital wallets (PayToday, easyWallet and others)', type: 'ASSET', group: 'CASH' },
  { code: '1020', name: 'Bank', type: 'ASSET', group: 'CASH' },
  { code: '1030', name: 'Card takings not yet settled to the bank', type: 'ASSET', group: 'CASH' },
  { code: '1040', name: 'Receipts and payments with no source recorded', type: 'ASSET', group: 'CASH' },
  { code: '1200', name: 'Inventory (stock on hand at cost)', type: 'ASSET', group: 'INVENTORY' },
  { code: '1300', name: 'Trade receivables (customer credit)', type: 'ASSET', group: 'RECEIVABLE' },
  { code: '1400', name: 'VAT input tax (claimable from NamRA)', type: 'ASSET', group: 'TAX' },
  { code: '2000', name: 'Trade payables (suppliers)', type: 'LIABILITY', group: 'PAYABLE' },
  { code: '2150', name: 'VAT output tax (payable to NamRA)', type: 'LIABILITY', group: 'TAX' },
  { code: '3000', name: "Owner's equity and opening balances", type: 'EQUITY', group: 'EQUITY' },
  { code: '4000', name: 'Sales, standard rated (15%)', type: 'REVENUE', group: 'SALES' },
  { code: '4010', name: 'Sales, zero rated (0%)', type: 'REVENUE', group: 'SALES' },
  { code: '4020', name: 'Sales, VAT exempt', type: 'REVENUE', group: 'SALES' },
  { code: '5000', name: 'Cost of goods sold', type: 'EXPENSE', group: 'COGS' },
  { code: '5050', name: 'Stock wastage and shrinkage', type: 'EXPENSE', group: 'COGS' },
  { code: '5100', name: 'Transport, freight and logistics', type: 'EXPENSE', group: 'OPEX' },
  { code: '5110', name: 'Rent', type: 'EXPENSE', group: 'OPEX' },
  { code: '5120', name: 'Electricity', type: 'EXPENSE', group: 'OPEX' },
  { code: '5125', name: 'Water', type: 'EXPENSE', group: 'OPEX' },
  { code: '5130', name: 'Wages and salaries', type: 'EXPENSE', group: 'OPEX' },
  { code: '5140', name: 'Airtime and data', type: 'EXPENSE', group: 'OPEX' },
  { code: '5150', name: 'Repairs and maintenance', type: 'EXPENSE', group: 'OPEX' },
  { code: '5190', name: 'Other operating expenses', type: 'EXPENSE', group: 'OPEX' }
];

/** Pesa expense category to expense account. 'Stock purchase' is not an expense: it buys inventory. */
export const EXPENSE_ACCOUNT: Readonly<Record<string, string>> = {
  'Stock purchase': '1200', 'Rent': '5110', 'Electricity': '5120', 'Water': '5125', 'Transport': '5100',
  'Wages': '5130', 'Airtime/Data': '5140', 'Maintenance': '5150', 'Other': '5190'
};

/** Where the money came from or went to, by the label Pesa records. Anything else lands in 1040 so nothing is guessed. */
export function sourceAccount(label: string | undefined | null): string {
  const s = String(label || '').toLowerCase();
  if (/cash/.test(s)) return '1000';
  if (/wallet/.test(s)) return '1010';
  if (/bank|transfer|eft|cheque|card/.test(s)) return '1020';
  return '1040';
}

// ==========================================================
// 2. MONEY HELPERS (whole cents)
// ==========================================================

export type TaxCategory = 'STANDARD' | 'ZERO_RATED' | 'EXEMPT';

export function toCents(n: unknown): number {
  const v = Number(n);
  if (!isFinite(v)) return 0;
  return Math.round(v * 100 + (v >= 0 ? 1e-7 : -1e-7));
}
export function fmtCents(c: number): string {
  const neg = c < 0, a = Math.abs(c), s = String(Math.floor(a / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return (neg ? '-' : '') + s + '.' + String(a % 100).padStart(2, '0');
}
/** VAT contained in a VAT inclusive amount. rateBp is the rate in basis points (15% = 1500). */
export function vatInside(grossCents: number, rateBp: number): number {
  return rateBp > 0 ? Math.round(grossCents * rateBp / (10000 + rateBp)) : 0;
}
/** Splits `total` over `weights` in proportion, in whole cents, so the parts always add up to `total` exactly. */
export function allocate(total: number, weights: number[]): number[] {
  const s = weights.reduce((a, b) => a + b, 0);
  if (s <= 0) return weights.map((_, i) => (i === 0 ? total : 0));
  if (s === total) return weights.slice();
  const raw = weights.map(w => total * w / s), fl = raw.map(Math.floor);
  let rem = total - fl.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, f: r - Math.floor(r) })).sort((a, b) => b.f - a.f || a.i - b.i);
  for (let k = 0; rem > 0 && k < order.length; k++, rem--) fl[order[k].i] += 1;
  return fl;
}

// ==========================================================
// 3. JOURNALS
// ==========================================================

export interface JournalLine { account: string; dr: number; cr: number; }
export interface Journal {
  id: string;
  date: string;          // YYYY-MM-DD, the business date in Namibia time
  kind: 'SALE' | 'EXPENSE' | 'SUPINV' | 'SUPPAY' | 'WASTE' | 'CUSTPAY' | 'CUSTOPEN' | 'OPEN';
  ref: string;           // the Pesa record this was built from
  memo: string;
  lines: JournalLine[];
  flags?: string[];
}
const D = (account: string, c: number): JournalLine => ({ account, dr: c, cr: 0 });
const C = (account: string, c: number): JournalLine => ({ account, dr: 0, cr: c });
const keep = (lines: JournalLine[]) => lines.filter(l => l.dr > 0 || l.cr > 0);

export interface Ctx {
  vatVendor: boolean;
  vatRatePct: number;
  dateKey: (iso: string) => string;
}
export interface SaleIn {
  id: string; createdAt: string; total: number; cost?: number; paymentMethod?: string; cashBack?: number;
  items?: Array<{ lineTotal?: number; qty?: number; unitPrice?: number; taxCategory?: TaxCategory }>;
}

export function saleJournal(s: SaleIn, ctx: Ctx): Journal {
  const T = toCents(s.total), cb = toCents(s.cashBack), cost = toCents(s.cost), flags: string[] = [];
  const method = s.paymentMethod || 'cash';
  const w = [0, 0, 0];
  (s.items || []).forEach(it => {
    const g = toCents(it.lineTotal != null ? it.lineTotal : (Number(it.qty) || 0) * (Number(it.unitPrice) || 0));
    const cat = it.taxCategory === 'ZERO_RATED' ? 1 : it.taxCategory === 'EXEMPT' ? 2 : 0;
    w[cat] += g;
  });
  if (!ctx.vatVendor) { w[0] += w[1] + w[2]; w[1] = 0; w[2] = 0; }
  const sumItems = w[0] + w[1] + w[2];
  if (sumItems !== T) flags.push('ITEMS_DIFFER_FROM_TOTAL');
  const [std, zero, ex] = allocate(T, sumItems > 0 ? w : [T, 0, 0]);
  const vat = ctx.vatVendor ? vatInside(std, Math.round(ctx.vatRatePct * 100)) : 0;
  const debit = method === 'card' ? '1030' : method === 'wallet' ? '1010' : method === 'credit' ? '1300' : '1000';
  const lines = keep([
    D(debit, T + (method === 'card' ? cb : 0)),
    C('4000', std - vat), C('4010', zero), C('4020', ex), C('2150', vat),
    method === 'card' ? C('1000', cb) : C('1000', 0),
    D('5000', cost), C('1200', cost)
  ]);
  if (cost === 0 && T > 0) flags.push('NO_COST_RECORDED');
  return { id: 'SALE-' + s.id, date: ctx.dateKey(s.createdAt), kind: 'SALE', ref: s.id, memo: 'Sale ' + s.id + ' (' + method + ')', lines, flags };
}

export interface ExpenseIn { id: string; createdAt: string; category?: string; amount: number; vat?: number; paidFrom?: string; note?: string; ref?: string; }
export function expenseJournal(e: ExpenseIn, ctx: Ctx): Journal {
  const A = toCents(e.amount), flags: string[] = [];
  let V = ctx.vatVendor ? toCents(e.vat) : 0;
  if (V < 0 || V > A) { V = 0; flags.push('VAT_IGNORED'); }
  const acct = EXPENSE_ACCOUNT[e.category || ''] || '5190';
  if (!EXPENSE_ACCOUNT[e.category || '']) flags.push('CATEGORY_UNKNOWN');
  return { id: 'EXP-' + e.id, date: ctx.dateKey(e.createdAt), kind: 'EXPENSE', ref: e.ref || e.id,
    memo: (e.category || 'Expense') + (e.note ? ': ' + e.note : ''),
    lines: keep([D(acct, A - V), D('1400', V), C(sourceAccount(e.paidFrom), A)]), flags };
}

export interface SupplierInvoiceIn { id: string; date: string; amount: number; vat?: number; number?: string; supplierName?: string; }
export function supplierInvoiceJournal(i: SupplierInvoiceIn, ctx: Ctx): Journal {
  const A = toCents(i.amount), flags: string[] = [];
  let V = ctx.vatVendor ? toCents(i.vat) : 0;
  if (V < 0 || V > A) { V = 0; flags.push('VAT_IGNORED'); }
  return { id: 'SINV-' + i.id, date: i.date, kind: 'SUPINV', ref: i.number || i.id,
    memo: 'Supplier invoice ' + (i.number || '') + (i.supplierName ? ' from ' + i.supplierName : ''),
    lines: keep([D('1200', A - V), D('1400', V), C('2000', A)]), flags };
}
export interface SupplierPaymentIn { id: string; date: string; amount: number; method?: string; ref?: string; supplierName?: string; }
export function supplierPaymentJournal(p: SupplierPaymentIn): Journal {
  const A = toCents(p.amount);
  return { id: 'SPAY-' + p.id, date: p.date, kind: 'SUPPAY', ref: p.ref || p.id,
    memo: 'Payment to ' + (p.supplierName || 'supplier') + (p.method ? ' (' + p.method + ')' : ''),
    lines: keep([D('2000', A), C(sourceAccount(p.method), A)]), flags: [] };
}
export interface WastageIn { id: string; createdAt: string; qty: number; unitCost?: number; productName?: string; reason?: string; }
export function wastageJournal(w: WastageIn, fallbackUnitCost: number, ctx: Ctx): Journal {
  const known = w.unitCost != null && isFinite(Number(w.unitCost));
  const value = toCents((Number(w.qty) || 0) * (known ? Number(w.unitCost) : fallbackUnitCost));
  return { id: 'WASTE-' + w.id, date: ctx.dateKey(w.createdAt), kind: 'WASTE', ref: w.id,
    memo: 'Wastage ' + (w.productName || '') + (w.reason ? ' (' + w.reason + ')' : ''),
    lines: keep([D('5050', value), C('1200', value)]), flags: known ? [] : ['WASTAGE_COST_ESTIMATED'] };
}
export interface CustomerEntryIn { id: string; customerId: string; createdAt: string; type: string; amount: number; note?: string; customerName?: string; }
/** A customer ledger payment, or an opening balance charge. Sales on credit are already posted by the sale, so they are skipped (null). */
export function customerEntryJournal(c: CustomerEntryIn, ctx: Ctx): Journal | null {
  const A = toCents(c.amount);
  if (c.type === 'payment') return { id: 'CPAY-' + c.customerId + '-' + c.id, date: ctx.dateKey(c.createdAt), kind: 'CUSTPAY', ref: c.id,
    memo: 'Payment received' + (c.customerName ? ' from ' + c.customerName : ''), lines: keep([D('1040', A), C('1300', A)]), flags: [] };
  if (c.type === 'charge' && c.note !== 'Sale on credit') return { id: 'COPEN-' + c.customerId + '-' + c.id, date: ctx.dateKey(c.createdAt), kind: 'CUSTOPEN', ref: c.id,
    memo: 'Customer balance brought forward' + (c.customerName ? ': ' + c.customerName : ''), lines: keep([D('1300', A), C('3000', A)]), flags: [] };
  return null;
}
export interface OpeningIn { date: string; cash?: number; wallet?: number; bank?: number; inventory?: number; payables?: number; }
/** Opening balances on the day the books start. Equity is the balancing figure (assets less liabilities). */
export function openingJournal(o: OpeningIn): Journal | null {
  const a: Array<[string, number]> = [['1000', toCents(o.cash)], ['1010', toCents(o.wallet)], ['1020', toCents(o.bank)], ['1200', toCents(o.inventory)]];
  const p = toCents(o.payables);
  const lines: JournalLine[] = keep([...a.map(([c, v]) => D(c, v)), C('2000', p)]);
  const dr = lines.reduce((s, l) => s + l.dr, 0), cr = lines.reduce((s, l) => s + l.cr, 0);
  if (dr === 0 && cr === 0) return null;
  lines.push(dr - cr >= 0 ? C('3000', dr - cr) : D('3000', cr - dr));
  return { id: 'OPEN-' + o.date, date: o.date, kind: 'OPEN', ref: 'OPEN', memo: 'Opening balances', lines, flags: [] };
}

// ==========================================================
// 4. GENERAL LEDGER
// ==========================================================

export class PesaAccountantCore {
  readonly accounts: Map<string, LedgerAccount> = new Map();
  readonly journals: Journal[] = [];
  private ids: Set<string> = new Set();

  constructor() { CHART_OF_ACCOUNTS.forEach(a => this.accounts.set(a.code, a)); }

  /** Refuses anything that would break the books: bad amounts, unknown accounts, a repeated id, or debits that differ from credits by even one cent. */
  postJournalEntry(j: Journal): void {
    if (this.ids.has(j.id)) throw new Error('[Accountant] Journal ' + j.id + ' is already posted.');
    let dr = 0, cr = 0;
    for (const l of j.lines) {
      if (!Number.isInteger(l.dr) || !Number.isInteger(l.cr) || l.dr < 0 || l.cr < 0 || (l.dr > 0 && l.cr > 0)) throw new Error('[Accountant] Bad amount on ' + j.id + ' account ' + l.account);
      if (!this.accounts.has(l.account)) throw new Error('[Accountant] Unknown account ' + l.account + ' on ' + j.id);
      dr += l.dr; cr += l.cr;
    }
    if (dr !== cr) throw new Error('[Accountant] ' + j.id + ' is unbalanced: debits ' + fmtCents(dr) + ' credits ' + fmtCents(cr));
    this.ids.add(j.id);
    this.journals.push(j);
  }

  /** Posts a Pesa sale. Kept from the first draft; now also splits the VAT categories and takes cash back into account. */
  autoPostSale(s: SaleIn, ctx: Ctx): Journal { const j = saleJournal(s, ctx); this.postJournalEntry(j); return j; }

  /** Net movement per account (debit minus credit, in cents) for journals dated from `from` to `to` inclusive. Empty bounds mean no limit. */
  movement(from?: string, to?: string): Map<string, { dr: number; cr: number }> {
    const m = new Map<string, { dr: number; cr: number }>();
    for (const j of this.journals) {
      if ((from && j.date < from) || (to && j.date > to)) continue;
      for (const l of j.lines) { const a = m.get(l.account) || { dr: 0, cr: 0 }; a.dr += l.dr; a.cr += l.cr; m.set(l.account, a); }
    }
    return m;
  }

  /** Trial balance for a period: opening (everything before `from`), movement in the period, closing. Totals always agree. */
  trialBalance(from: string, to: string) {
    const before = new Map<string, number>(), within = this.movement(from, to);
    for (const j of this.journals) if (j.date < from) for (const l of j.lines) before.set(l.account, (before.get(l.account) || 0) + l.dr - l.cr);
    const rows = CHART_OF_ACCOUNTS.map(a => {
      const mv = within.get(a.code) || { dr: 0, cr: 0 }, open = before.get(a.code) || 0;
      return { code: a.code, name: a.name, type: a.type, open, dr: mv.dr, cr: mv.cr, close: open + mv.dr - mv.cr };
    }).filter(r => r.open !== 0 || r.dr !== 0 || r.cr !== 0 || r.close !== 0);
    const sum = (k: 'dr' | 'cr' | 'open' | 'close') => rows.reduce((s, r) => s + r[k], 0);
    return { rows, totalDr: sum('dr'), totalCr: sum('cr'), openNet: sum('open'), closeNet: sum('close') };
  }
}

// ==========================================================
// 5. FINANCIAL STATEMENTS
// ==========================================================

export interface ProfitAndLossStatement {
  salesStandard: number; salesZero: number; salesExempt: number; revenue: number;
  costOfGoodsSold: number; wastage: number; grossProfit: number;
  expenses: Array<{ code: string; name: string; amount: number }>; operatingExpenses: number; netIncome: number;
}
export interface VatSummary { standardNet: number; zeroRated: number; exempt: number; outputVat: number; inputVat: number; netPayable: number; }

export class PesaFinancialReporting {
  /** Income statement for the journals dated from `from` to `to`. All figures are cents. */
  static compileProfitAndLoss(core: PesaAccountantCore, from: string, to: string): ProfitAndLossStatement {
    const mv = core.movement(from, to), cr = (c: string) => { const m = mv.get(c); return m ? m.cr - m.dr : 0; }, dr = (c: string) => -cr(c);
    const salesStandard = cr('4000'), salesZero = cr('4010'), salesExempt = cr('4020'), revenue = salesStandard + salesZero + salesExempt;
    const cogs = dr('5000'), wastage = dr('5050'), grossProfit = revenue - cogs - wastage;
    const expenses = CHART_OF_ACCOUNTS.filter(a => a.group === 'OPEX').map(a => ({ code: a.code, name: a.name, amount: dr(a.code) })).filter(r => r.amount !== 0);
    const operatingExpenses = expenses.reduce((s, r) => s + r.amount, 0);
    return { salesStandard, salesZero, salesExempt, revenue, costOfGoodsSold: cogs, wastage, grossProfit, expenses, operatingExpenses, netIncome: grossProfit - operatingExpenses };
  }
  /** VAT working figures for the period. Net payable is negative when NamRA owes the business a refund. */
  static compileVat(core: PesaAccountantCore, from: string, to: string): VatSummary {
    const mv = core.movement(from, to), cr = (c: string) => { const m = mv.get(c); return m ? m.cr - m.dr : 0; };
    const outputVat = cr('2150'), inputVat = -cr('1400');
    return { standardNet: cr('4000'), zeroRated: cr('4010'), exempt: cr('4020'), outputVat, inputVat, netPayable: outputVat - inputVat };
  }
}
