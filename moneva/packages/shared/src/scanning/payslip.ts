import Decimal from 'decimal.js';
import { parseAmount } from './amount';
import { monthFromName } from './date';

export interface PayslipResult {
  employer?: string;
  /** YYYY-MM of the pay period when found. */
  period?: string;
  gross?: string;
  net?: string;
  deductions: Array<{ label: string; kind: 'tax' | 'social_security' | 'pension' | 'medical' | 'other'; amount: string }>;
  totalDeductions?: string;
  /** Human-readable consistency checks. Empty list means nothing could be checked. */
  checks: Array<{ ok: boolean; message: string }>;
  /** 0..1, lowered when fields are missing or checks fail. */
  confidence: number;
  /** Always true: the user must confirm before anything is saved. */
  requiresConfirmation: true;
}

const LABELS: Array<{ field: 'gross' | 'net' | 'totalDeductions'; re: RegExp }> = [
  { field: 'net', re: /\b(net (pay|salary|income|amount)|nett? pay|take[- ]home|amount payable|nett salary)\b/i },
  { field: 'totalDeductions', re: /\btotal (statutory )?deductions?\b/i },
  { field: 'gross', re: /\b(gross (pay|salary|earnings|income|amount)|total (earnings|gross|income)|gross)\b/i },
];
const DEDUCTIONS: Array<{ kind: PayslipResult['deductions'][number]['kind']; re: RegExp }> = [
  { kind: 'tax', re: /\b(paye|income tax|tax)\b/i },
  { kind: 'social_security', re: /\b(social security|ssc|sscn)\b/i },
  { kind: 'pension', re: /\b(pension|provident|retirement)\b/i },
  { kind: 'medical', re: /\b(medical( aid)?|health)\b/i },
];

function lastAmount(line: string): string | null {
  const toks = line.match(/(?:N\$|R)?\s?\d[\d ,]*[.,]\d{2}\b/g);
  if (!toks) return null;
  const p = parseAmount(toks[toks.length - 1]!);
  return p ? p.value : null;
}

/**
 * Extract the money lines from payslip text (OCR output or PDF text). Only labelled values are
 * taken. Deductions are NOT expenses: only the net pay is income received. Fields that cannot
 * be found are left undefined instead of guessed.
 */
export function parsePayslip(text: string): PayslipResult {
  const out: PayslipResult = { deductions: [], checks: [], confidence: 0, requiresConfirmation: true };
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  for (const line of lines) {
    const emp = /^(employer|company|organisation|organization)\s*[:\-]\s*(.+)$/i.exec(line);
    if (emp && !out.employer) {
      out.employer = emp[2]!.trim();
      continue;
    }
    const per = /\b(?:pay (?:period|month)|period|month)\s*[:\-]?\s*([A-Za-z]{3,9})\s*,?\s*(\d{4})\b/i.exec(line);
    if (per && !out.period) {
      const m = monthFromName(per[1]!);
      if (m) out.period = `${per[2]}-${String(m).padStart(2, '0')}`;
    }
    const amt = lastAmount(line);
    if (!amt) continue;
    const lab = LABELS.find((l) => l.re.test(line));
    if (lab) {
      if (out[lab.field] === undefined) out[lab.field] = amt;
      continue;
    }
    const ded = DEDUCTIONS.find((d) => d.re.test(line));
    if (ded) out.deductions.push({ label: line.replace(/[\d\s.,N$R]+$/i, '').trim() || ded.kind, kind: ded.kind, amount: amt });
  }
  let conf = 0;
  if (out.net) conf += 0.5;
  if (out.gross) conf += 0.2;
  if (out.period) conf += 0.1;
  if (out.employer) conf += 0.05;
  if (out.gross && out.net) {
    const itemised = out.deductions.reduce((a, d) => a.plus(d.amount), new Decimal(0));
    const total = out.totalDeductions ? new Decimal(out.totalDeductions) : itemised;
    const expected = new Decimal(out.gross).minus(total);
    const ok = expected.minus(out.net).abs().lte(1);
    out.checks.push({
      ok,
      message: ok
        ? 'Gross minus deductions matches net pay'
        : `Gross minus deductions is ${expected.toFixed(2)} but net pay reads ${out.net}`,
    });
    conf += ok ? 0.15 : -0.2;
  } else {
    out.checks.push({ ok: false, message: 'Gross or net pay not found, so totals could not be checked' });
  }
  out.confidence = Math.max(0, Math.min(1, Number(conf.toFixed(2))));
  return out;
}
