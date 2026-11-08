import { describe, expect, it } from 'vitest';
import { add, allocate, convert, format, mul, round, sum } from '../src';

describe('money', () => {
  it('has no floating point drift', () => {
    expect(add('0.1', '0.2')).toBe('0.3');
    expect(sum(['0.1', '0.2', '0.3'])).toBe('0.6');
    expect(mul('19.99', '3')).toBe('59.97');
  });
  it('allocates exactly with no money created or lost', () => {
    const parts = allocate('100.00', ['1', '1', '1'], 'NAD');
    expect(parts).toEqual(['33.34', '33.33', '33.33']);
    expect(sum(parts)).toBe('100');
  });
  it('rounds to currency minor units', () => {
    expect(round('2.345', 'NAD')).toBe('2.35');
    expect(round('1234.5', 'JPY')).toBe('1235');
  });
  it('stores the rate with every conversion (USD expense, NAD base)', () => {
    const c = convert('50', 'USD', 'NAD', '18.4321', 'manual', '2026-11-08T10:00:00Z');
    expect(c.baseAmount).toBe('921.61');
    expect(c.rate).toBe('18.4321');
    expect(c.rateSource).toBe('manual');
  });
  it('rejects bad rates', () => {
    expect(() => convert('1', 'USD', 'NAD', '0', 's', 't')).toThrow();
    expect(() => convert('1', 'NAD', 'NAD', '2', 's', 't')).toThrow();
  });
  it('formats', () => {
    expect(format('15000', 'NAD')).toBe('N$15,000.00');
    expect(format('-1250.5', 'NAD')).toBe('-N$1,250.50');
  });
});
