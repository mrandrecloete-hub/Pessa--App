import { describe, expect, it } from 'vitest';
import {
  buildCandidates,
  categorise,
  parseAmount,
  parseDate,
  parsePayslip,
  parseStatementCsv,
  parseStatementText,
  summariseCandidates,
} from '../src';

describe('amount and date', () => {
  it.each([
    ['1,234.50', '1234.5', 0],
    ['1.234,50', '1234.5', 0],
    ['1 234,50', '1234.5', 0],
    ['N$ 1,234.50', '1234.5', 0],
    ['-500.00', '500', -1],
    ['500.00-', '500', -1],
    ['(500.00)', '500', -1],
    ['500.00 DR', '500', -1],
    ['500.00 CR', '500', 1],
    ['12,50', '12.5', 0],
    ['1,234', '1234', 0],
  ])('amount %s', (raw, value, sign) => expect(parseAmount(raw)).toEqual({ value, sign }));
  it('rejects non amounts', () => {
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount('')).toBeNull();
  });
  it('dates are day first and validated', () => {
    expect(parseDate('05/03/2026')).toBe('2026-03-05');
    expect(parseDate('2026-03-05')).toBe('2026-03-05');
    expect(parseDate('5 Mar 2026')).toBe('2026-03-05');
    expect(parseDate('05 Mar', 2026)).toBe('2026-03-05');
    expect(parseDate('31/02/2026')).toBeNull();
    expect(parseDate('05 Mar')).toBeNull();
  });
});

describe('statement CSV', () => {
  const csv = `Account Number,12345\nDate,Description,Debit,Credit,Balance\n01/11/2026,SALARY ACME CC,,15000.00,15500.00\n02/11/2026,SHOPRITE WINDHOEK,245.60,,15254.40\n03/11/2026,ENGEN KLEIN WINDHOEK,600.00,,14654.40\nbad,row,1,,\n`;
  const { rows, skipped } = parseStatementCsv(csv);
  it('reads rows and reports the unreadable one', () => {
    expect(rows).toHaveLength(3);
    expect(skipped).toHaveLength(1);
    expect(rows[0]).toMatchObject({ date: '2026-11-01', amount: '15000', direction: 'in' });
    expect(rows[1]).toMatchObject({ amount: '245.6', direction: 'out' });
  });
  it('categorises and totals, with duplicate protection on a second import', () => {
    const c1 = buildCandidates('acc', rows, new Set());
    const s = summariseCandidates(c1);
    expect(s).toMatchObject({ income: '15000', expenses: '845.6', net: '14154.4', counted: 3 });
    expect(s.byCategory).toEqual({ groceries: '245.6', fuel: '600' });
    const c2 = buildCandidates('acc', rows, new Set(c1.map((x) => x.fingerprint)));
    expect(c2.every((x) => x.duplicate)).toBe(true);
    expect(summariseCandidates(c2)).toMatchObject({ counted: 0, duplicatesSkipped: 3, income: '0', expenses: '0' });
  });
  it('keeps two identical purchases in one file', () => {
    const r = [
      { date: '2026-11-01', description: 'COFFEE SHOP', amount: '30', direction: 'out' as const, line: 1 },
      { date: '2026-11-01', description: 'COFFEE SHOP', amount: '30', direction: 'out' as const, line: 2 },
    ];
    const c = buildCandidates('a', r, new Set());
    expect(c[0]!.fingerprint).not.toBe(c[1]!.fingerprint);
  });
  it('semicolon delimited with debit/credit missing header fails honestly', () => {
    expect(parseStatementCsv('foo;bar\n1;2').rows).toHaveLength(0);
  });
});

describe('statement text (OCR output)', () => {
  const text = `FNB Namibia statement\n01/11/2026 SALARY ACME  15 000.00 CR  15 500.00 CR\n02/11/2026 SHOPRITE WINDHOEK  245.60  15 254.40\nthis line is noise\n03/11/2026 MTC AIRTIME  100.00 DR\n`;
  const { rows } = parseStatementText(text);
  it('extracts rows and infers direction from balance change', () => {
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ amount: '15000', direction: 'in' });
    expect(rows[1]).toMatchObject({ amount: '245.6', direction: 'out', description: 'SHOPRITE WINDHOEK' });
    expect(rows[2]).toMatchObject({ amount: '100', direction: 'out' });
  });
  it('leaves direction unknown and excludes it from totals', () => {
    const r = parseStatementText('04/11/2026 UNKNOWN PAYMENT 99.00').rows;
    expect(r[0]!.direction).toBe('unknown');
    const c = buildCandidates('a', r, new Set());
    expect(c[0]!.needsReview).toBe(true);
    expect(summariseCandidates(c)).toMatchObject({ counted: 0, excludedUnknownDirection: 1 });
  });
});

describe('categoriser', () => {
  it('known merchants are confident, unknown ones need review', () => {
    expect(categorise('NAMPOWER PREPAID', 'out')).toMatchObject({ categoryId: 'electricity' });
    expect(categorise('XQZ 123', 'out').confidence).toBeLessThan(0.75);
  });
  it('user rule wins', () => {
    expect(categorise('JOES PLACE', 'out', [{ merchantContains: 'joes', categoryId: 'restaurants' }]).categoryId).toBe('restaurants');
  });
  it('direction must agree', () => {
    expect(categorise('SALARY', 'out').categoryId).toBe('other');
  });
});

describe('payslip', () => {
  const slip = `Employer: Acme Trading CC\nPay period: October 2026\nGross salary  N$ 20,000.00\nPAYE  3,100.00\nSocial Security  N$ 54.00\nPension fund  1,000.00\nTotal deductions  4,154.00\nNet pay  N$ 15,846.00`;
  it('extracts and validates', () => {
    const p = parsePayslip(slip);
    expect(p).toMatchObject({ employer: 'Acme Trading CC', period: '2026-10', gross: '20000', net: '15846', totalDeductions: '4154' });
    expect(p.checks[0]!.ok).toBe(true);
    expect(p.confidence).toBeGreaterThan(0.9);
    expect(p.deductions.map((d) => d.kind)).toEqual(['tax', 'social_security', 'pension']);
    expect(p.requiresConfirmation).toBe(true);
  });
  it('flags totals that do not reconcile', () => {
    const p = parsePayslip(slip.replace('15,846.00', '16,500.00'));
    expect(p.checks[0]!.ok).toBe(false);
    expect(p.confidence).toBeLessThan(0.8);
  });
  it('does not invent missing fields', () => {
    const p = parsePayslip('hello world');
    expect(p.net).toBeUndefined();
    expect(p.confidence).toBe(0);
  });
});
