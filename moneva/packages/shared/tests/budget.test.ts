import { describe, expect, it } from 'vitest';
import { budgetStatus, forecastMonth, suggestBudget, sum } from '../src';

describe('budget', () => {
  it('50/30/20 of N$15,000', () => {
    const b = suggestBudget('15000', 'NAD', '50/30/20');
    expect(b.map((x) => x.amount)).toEqual(['7500.00', '4500.00', '3000.00']);
  });
  it('allocation always sums to income', () => {
    const b = suggestBudget('12345.67', 'NAD', 'custom', ['33.3', '33.3', '33.4']);
    expect(sum(b.map((x) => x.amount))).toBe('12345.67');
  });
  it('custom must total 100', () => {
    expect(() => suggestBudget('100', 'NAD', 'custom', ['50', '30', '30'])).toThrow();
  });
  it('alert thresholds', () => {
    expect(budgetStatus('1000', '400').alert).toBe('none');
    expect(budgetStatus('1000', '500').alert).toBe('progress');
    expect(budgetStatus('1000', '760').alert).toBe('warning');
    expect(budgetStatus('1000', '900').alert).toBe('strong');
    expect(budgetStatus('1000', '1000').alert).toBe('exceeded');
    expect(budgetStatus('1000', '1200').remaining).toBe('-200');
  });
  it('forecast uses run rate and refuses to guess early', () => {
    expect(forecastMonth('3000', '1000', 10, 30)).toMatchObject({ projectedSpend: '3000', willExceed: false, basis: 'actual-run-rate' });
    expect(forecastMonth('3000', '1200', 10, 30).willExceed).toBe(true);
    expect(forecastMonth('3000', '500', 1, 30).basis).toBe('insufficient-data');
  });
});
