import { describe, expect, it } from 'vitest';
import { buildCandidates, dailyBalanceSeries, parseExtractionJson, summariseCandidates, type Transaction } from '../src';

describe('extraction (untrusted model output)', () => {
  it('reads a receipt, re-parsing amount and date ourselves', () => {
    const e = parseExtractionJson(
      '```json\n{"documentType":"receipt","confidence":0.9,"currency":"nad","receipt":{"merchant":"Shoprite Windhoek","date":"05/11/2026","total":"N$ 1,245.60"}}\n```',
    );
    expect(e.receipt).toEqual({ merchant: 'Shoprite Windhoek', date: '2026-11-05', total: '1245.6', currency: 'NAD' });
    expect(e.warnings).toEqual([]);
  });
  it('flags missing fields instead of inventing them', () => {
    const e = parseExtractionJson('{"documentType":"receipt","confidence":0.4,"receipt":{"merchant":"X","total":"abc"}}');
    expect(e.receipt?.total).toBeNull();
    expect(e.receipt?.date).toBeNull();
    expect(e.warnings.length).toBe(2);
  });
  it('garbage and non JSON are rejected safely', () => {
    expect(parseExtractionJson('sorry I cannot').documentType).toBe('unknown');
    expect(parseExtractionJson('{"documentType":"hack","confidence":7}').documentType).toBe('unknown');
  });
  it('payslip totals are re-checked and mismatches lower confidence', () => {
    const ok = parseExtractionJson(
      '{"documentType":"payslip","confidence":0.9,"payslip":{"gross":20000,"net":15846,"period":"2026-10","deductions":[{"label":"PAYE","kind":"tax","amount":"3,100.00"},{"label":"Pension","kind":"pension","amount":1000},{"label":"SSC","kind":"social_security","amount":54}]}}',
    );
    expect(ok.payslip?.checks[0]?.ok).toBe(true);
    expect(ok.payslip?.net).toBe('15846');
    const bad = parseExtractionJson(
      '{"documentType":"payslip","confidence":0.9,"payslip":{"gross":20000,"net":19000,"deductions":[{"label":"PAYE","amount":3100}]}}',
    );
    expect(bad.payslip?.checks[0]?.ok).toBe(false);
    expect(bad.payslip?.confidence).toBeLessThanOrEqual(0.5);
  });
  it('statement rows flow into the same dedupe and review pipeline', () => {
    const e = parseExtractionJson(
      '{"documentType":"bank_statement","confidence":0.8,"transactions":[{"date":"01/11/2026","description":"SALARY ACME","amount":"15000.00","direction":"in"},{"date":"02/11/2026","description":"SHOPRITE","amount":"245.60","direction":"out"},{"date":"xx","description":"bad","amount":"1","direction":"out"},{"date":"03/11/2026","description":"MYSTERY","amount":"50.00","direction":"unknown"}]}',
    );
    expect(e.rows).toHaveLength(3);
    expect(e.warnings).toHaveLength(1);
    const c = buildCandidates('a', e.rows, new Set());
    expect(summariseCandidates(c)).toMatchObject({ income: '15000', expenses: '245.6', excludedUnknownDirection: 1 });
  });
});

describe('dailyBalanceSeries', () => {
  const t = (o: Partial<Transaction>): Transaction => ({
    id: Math.random().toString(),
    accountId: 'a',
    type: 'expense',
    amount: '0',
    currency: 'NAD',
    baseCurrency: 'NAD',
    exchangeRate: '1',
    baseAmount: o.amount ?? '0',
    categoryId: null,
    date: '2026-11-01',
    status: 'settled',
    source: 'manual',
    ...o,
  });
  it('tracks running balance and ignores pending', () => {
    const s = dailyBalanceSeries(
      '100',
      [
        t({ type: 'income', amount: '1000', date: '2026-11-02' }),
        t({ amount: '250', date: '2026-11-03' }),
        t({ amount: '999', date: '2026-11-03', status: 'pending' }),
        t({ amount: '50', date: '2026-10-30' }),
      ],
      '2026-11-01',
      '2026-11-04',
    );
    expect(s.map((x) => x.balance)).toEqual(['50', '1050', '800', '800']);
  });
});
