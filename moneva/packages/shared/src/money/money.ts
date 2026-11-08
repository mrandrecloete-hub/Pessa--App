import Decimal from 'decimal.js';
import { getCurrency } from './currency';

/**
 * All monetary arithmetic goes through decimal.js. Never use JS numbers for money.
 * Amounts travel as decimal strings (matches Postgres numeric) and are only
 * rounded to the currency's minor unit when stored or displayed.
 */
const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export type Amount = string;

export function dec(v: Decimal.Value): Decimal {
  return new D(v);
}

export function add(a: Amount, b: Amount): Amount {
  return dec(a).plus(b).toString();
}
export function sub(a: Amount, b: Amount): Amount {
  return dec(a).minus(b).toString();
}
export function mul(a: Amount, b: Amount): Amount {
  return dec(a).times(b).toString();
}
export function div(a: Amount, b: Amount): Amount {
  if (dec(b).isZero()) throw new Error('Division by zero');
  return dec(a).div(b).toString();
}
export function sum(values: Amount[]): Amount {
  return values.reduce((acc, v) => dec(acc).plus(v), dec(0)).toString();
}
export function cmp(a: Amount, b: Amount): -1 | 0 | 1 {
  return dec(a).cmp(b) as -1 | 0 | 1;
}
export function isNegative(a: Amount): boolean {
  return dec(a).isNegative() && !dec(a).isZero();
}
export function abs(a: Amount): Amount {
  return dec(a).abs().toString();
}
export function neg(a: Amount): Amount {
  return dec(a).neg().toString();
}

/** Round to the currency minor unit (half up) and return a fixed string. */
export function round(a: Amount, currency: string): Amount {
  return dec(a).toDecimalPlaces(getCurrency(currency).decimals, Decimal.ROUND_HALF_UP).toFixed(getCurrency(currency).decimals);
}

/** Percentage of an amount, e.g. pct('15000','20') = '3000'. */
export function pct(a: Amount, percent: Amount): Amount {
  return dec(a).times(percent).div(100).toString();
}

/** Ratio as a percentage number string with 2 dp (spent/allocated). 0 when denominator is 0. */
export function ratioPct(part: Amount, whole: Amount): string {
  if (dec(whole).isZero()) return '0.00';
  return dec(part).div(whole).times(100).toFixed(2);
}

/**
 * Split `total` across weights so the parts sum EXACTLY to total in the
 * currency's minor unit (largest-remainder method). No money is created or lost.
 */
export function allocate(total: Amount, weights: Amount[], currency: string): Amount[] {
  const dp = getCurrency(currency).decimals;
  const unit = dec(10).pow(-dp);
  const t = dec(total).toDecimalPlaces(dp, Decimal.ROUND_HALF_UP);
  const wsum = weights.reduce((a, w) => a.plus(w), dec(0));
  if (wsum.isZero()) throw new Error('Weights must not all be zero');
  const raw = weights.map((w) => t.times(w).div(wsum));
  const floors = raw.map((r) => r.toDecimalPlaces(dp, Decimal.ROUND_DOWN));
  let remainder = t.minus(floors.reduce((a, f) => a.plus(f), dec(0)));
  const order = raw.map((r, i) => ({ i, frac: r.minus(floors[i]!) })).sort((x, y) => y.frac.cmp(x.frac) || x.i - y.i);
  const out = floors.slice();
  for (const { i } of order) {
    if (remainder.lte(0)) break;
    out[i] = out[i]!.plus(unit);
    remainder = remainder.minus(unit);
  }
  return out.map((v) => v.toFixed(dp));
}

export interface Conversion {
  originalAmount: Amount;
  originalCurrency: string;
  baseCurrency: string;
  rate: Amount;
  baseAmount: Amount;
  rateSource: string;
  convertedAt: string;
}

/** Convert with an explicit rate (base units per 1 original unit). The rate is stored with the result. */
export function convert(amount: Amount, from: string, to: string, rate: Amount, source: string, at: string): Conversion {
  if (dec(rate).lte(0)) throw new Error('Exchange rate must be positive');
  if (from === to && !dec(rate).eq(1)) throw new Error('Same-currency rate must be 1');
  return {
    originalAmount: amount,
    originalCurrency: from,
    baseCurrency: to,
    rate,
    baseAmount: round(dec(amount).times(rate).toString(), to),
    rateSource: source,
    convertedAt: at,
  };
}

/** Format for display only (never feed back into arithmetic). */
export function format(a: Amount, currency: string): string {
  const c = getCurrency(currency);
  const v = dec(a);
  const fixed = v.abs().toFixed(c.decimals);
  const [int = '0', frac] = fixed.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const body = frac ? `${grouped}.${frac}` : grouped;
  return `${v.isNegative() && !v.isZero() ? '-' : ''}${c.symbol}${body}`;
}
