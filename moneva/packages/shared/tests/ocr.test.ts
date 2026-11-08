import { describe, expect, it } from 'vitest';
import { buildCandidates, parsePayslip, parseReceiptText, parseStatementText, rowsFromLines, rowsToPairs, rowsToText, summariseCandidates, type OcrLine } from '../src';

const L = (text: string, left: number, top: number, w = 80, h = 20): OcrLine => ({ text, frame: { left, top, right: left + w, bottom: top + h } });

describe('rebuilding rows from OCR positions', () => {
  it('puts pieces on the same line together, left to right, even when slightly tilted or out of order', () => {
    const lines = [L('245.60', 500, 102), L('SHOPRITE WINDHOEK', 120, 100, 200), L('02/11/2026', 10, 99), L('15 254.40', 650, 104), L('01/11/2026', 10, 60), L('SALARY ACME', 120, 61, 200), L('15 000.00 CR', 500, 62), L('15 500.00 CR', 650, 59)];
    const rows = rowsFromLines(lines);
    expect(rows).toEqual([['01/11/2026', 'SALARY ACME', '15 000.00 CR', '15 500.00 CR'], ['02/11/2026', 'SHOPRITE WINDHOEK', '245.60', '15 254.40']]);
    const parsed = parseStatementText(rowsToText(rows)).rows;
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toMatchObject({ amount: '15000', direction: 'in' });
    expect(parsed[1]).toMatchObject({ amount: '245.6', direction: 'out', description: 'SHOPRITE WINDHOEK' });
    expect(summariseCandidates(buildCandidates('a', parsed, new Set()))).toMatchObject({ income: '15000', expenses: '245.6' });
  });
  it('splits two column payslips into label and amount pairs', () => {
    const rows = rowsFromLines([L('Employer: Acme Trading CC', 10, 10, 300), L('Pay period: October 2026', 10, 40, 300), L('Gross salary', 10, 80), L('20,000.00', 200, 80), L('PAYE', 400, 80), L('3,100.00', 600, 80), L('Pension fund', 400, 110), L('1,000.00', 600, 110), L('Social Security', 400, 140), L('54.00', 600, 140), L('Net pay', 10, 200), L('15,846.00', 200, 200)]);
    const text = rowsToPairs(rows);
    expect(text.split('\n')).toContain('PAYE  3,100.00');
    const p = parsePayslip(text);
    expect(p).toMatchObject({ employer: 'Acme Trading CC', period: '2026-10', gross: '20000', net: '15846' });
    expect(p.checks[0]!.ok).toBe(true);
  });
  it('handles empty input', () => {
    expect(rowsFromLines([])).toEqual([]);
    expect(rowsToPairs([])).toBe('');
  });
});

describe('receipt text', () => {
  const slip = ['SHOPRITE', 'Maerua Mall Windhoek', 'TAX INVOICE', 'VAT No 1234567', 'Date: 05/11/2026 14:32', 'BREAD  18.99', 'MILK 2L  32.50', 'SUBTOTAL  1,083.13', 'VAT 15%  162.47', 'TOTAL  1,245.60', 'CASH  1,300.00', 'CHANGE  54.40'].join('\n');
  it('reads merchant, date and the labelled total, ignoring subtotal, VAT, cash and change', () => {
    expect(parseReceiptText(slip)).toEqual({ merchant: 'SHOPRITE', date: '2026-11-05', total: '1245.6', confidence: 1, warnings: [] });
  });
  it('never guesses the total from the biggest number', () => {
    const r = parseReceiptText('SPAR\n05/11/2026\nBREAD 18.99\nCASH 500.00');
    expect(r.total).toBeNull();
    expect(r.warnings.join(' ')).toContain('Total');
    expect(r.confidence).toBeLessThan(0.5);
  });
  it('skips header noise for the merchant and reads Afrikaans totals', () => {
    const r = parseReceiptText('TAX INVOICE\nTel 061 123 4567\nWoermann Brock\n2026-11-03\nTOTAAL N$ 89.90');
    expect(r).toMatchObject({ merchant: 'Woermann Brock', date: '2026-11-03', total: '89.9' });
  });
  it('flags conflicting totals', () => {
    const r = parseReceiptText('ENGEN\n01/11/2026\nTOTAL 300.00\nTOTAL DUE 320.00');
    expect(r.total).toBe('320');
    expect(r.warnings.join(' ')).toContain('More than one total');
  });
});
