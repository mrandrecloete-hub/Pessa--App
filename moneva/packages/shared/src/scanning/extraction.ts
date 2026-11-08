import { z } from 'zod';
import { parseAmount } from './amount';
import { parseDate } from './date';
import { isSupportedCurrency } from '../money/currency';
import type { PayslipResult } from './payslip';
import type { RawStatementRow } from './types';

/**
 * Result of reading a PHOTO or PDF (receipt, payslip, bank statement) with a vision model on the server.
 * Model output is untrusted: it is validated here, amounts and dates are re-parsed by our own
 * parsers, and the user always confirms before anything is saved.
 */
const money = z.union([z.string(), z.number()]).transform((v) => String(v));

const rawSchema = z.object({
  documentType: z.enum(['receipt', 'payslip', 'bank_statement', 'unknown']).catch('unknown'),
  confidence: z.number().min(0).max(1).catch(0),
  currency: z.string().optional(),
  receipt: z
    .object({ merchant: z.string().optional(), date: z.string().optional(), total: money.optional(), category_hint: z.string().optional() })
    .optional(),
  payslip: z
    .object({
      employer: z.string().optional(),
      period: z.string().optional(),
      gross: money.optional(),
      net: money.optional(),
      deductions: z.array(z.object({ label: z.string(), kind: z.string().optional(), amount: money })).optional(),
    })
    .optional(),
  transactions: z
    .array(
      z.object({ date: z.string(), description: z.string(), amount: money, direction: z.enum(['in', 'out', 'unknown']).catch('unknown') }),
    )
    .optional(),
});

export interface ReceiptData {
  merchant: string;
  date: string | null;
  total: string | null;
  currency: string | null;
}
export interface Extraction {
  documentType: 'receipt' | 'payslip' | 'bank_statement' | 'unknown';
  confidence: number;
  receipt?: ReceiptData;
  payslip?: PayslipResult;
  rows: RawStatementRow[];
  warnings: string[];
}

export function parseExtractionJson(text: string, defaultYear?: number): Extraction {
  const warnings: string[] = [];
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  let json: unknown;
  try {
    json = JSON.parse(cleaned);
  } catch {
    return {
      documentType: 'unknown',
      confidence: 0,
      rows: [],
      warnings: ['The document could not be read. Try a clearer, flat, well-lit photo.'],
    };
  }
  const p = rawSchema.safeParse(json);
  if (!p.success) return { documentType: 'unknown', confidence: 0, rows: [], warnings: ['The reader returned something unexpected.'] };
  const d = p.data;
  const cur = d.currency?.toUpperCase();
  const currency = cur && isSupportedCurrency(cur) ? cur : null;
  if (cur && !currency) warnings.push(`Currency ${cur} is not supported yet.`);
  const out: Extraction = { documentType: d.documentType, confidence: d.confidence, rows: [], warnings };

  if (d.receipt) {
    const t = d.receipt.total ? parseAmount(d.receipt.total) : null;
    const date = d.receipt.date ? parseDate(d.receipt.date, defaultYear) : null;
    if (!t) warnings.push('Total could not be read. Please type it in.');
    if (!date) warnings.push('Date could not be read. Please check it.');
    out.receipt = { merchant: (d.receipt.merchant ?? '').trim(), date, total: t ? t.value : null, currency };
  }
  if (d.payslip) {
    const net = d.payslip.net ? parseAmount(d.payslip.net) : null;
    const gross = d.payslip.gross ? parseAmount(d.payslip.gross) : null;
    const kinds = ['tax', 'social_security', 'pension', 'medical'] as const;
    const deductions = (d.payslip.deductions ?? []).flatMap((x): PayslipResult['deductions'] => {
      const a = parseAmount(x.amount);
      if (!a) return [];
      const kind: PayslipResult['deductions'][number]['kind'] = (kinds as readonly string[]).includes(x.kind ?? '')
        ? (x.kind as (typeof kinds)[number])
        : 'other';
      return [{ label: x.label, kind, amount: a.value }];
    });
    const per = d.payslip.period && /^\d{4}-\d{2}$/.test(d.payslip.period) ? d.payslip.period : undefined;
    const checks: PayslipResult['checks'] = [];
    let conf = d.confidence;
    if (gross && net) {
      const total = deductions.reduce((s, x) => s + Number(x.amount) * 100, 0);
      const ok = Math.abs(Number(gross.value) * 100 - total - Number(net.value) * 100) <= 100;
      checks.push({
        ok,
        message: ok ? 'Gross minus deductions matches net pay' : 'Gross minus deductions does not match net pay. Check the figures.',
      });
      if (!ok) conf = Math.min(conf, 0.5);
    } else checks.push({ ok: false, message: 'Gross or net pay not found, so totals could not be checked' });
    out.payslip = {
      employer: d.payslip.employer,
      period: per,
      gross: gross?.value,
      net: net?.value,
      deductions,
      checks,
      confidence: conf,
      requiresConfirmation: true,
    };
    if (!net) warnings.push('Net pay could not be read. Please type it in.');
  }
  (d.transactions ?? []).forEach((t, i) => {
    const date = parseDate(t.date, defaultYear);
    const a = parseAmount(t.amount);
    if (!date || !a || a.value === '0') return void warnings.push(`Row ${i + 1} was skipped because its date or amount was unreadable.`);
    const direction = t.direction !== 'unknown' ? t.direction : a.sign === -1 ? 'out' : 'unknown';
    out.rows.push({ date, description: t.description.trim(), amount: a.value, direction, line: i + 1 });
  });
  return out;
}
