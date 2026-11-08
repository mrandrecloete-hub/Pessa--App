import { dec } from '@moneva/shared';

/** Percent change from previous to current as a signed string like "+8.2", or null when there is nothing to compare. */
export function pctChange(current: string, previous: string): string | null {
  if (!dec(previous).gt(0)) return null;
  const v = dec(current).minus(previous).div(previous).times(100).toDecimalPlaces(1);
  return `${v.gte(0) ? '+' : ''}${v.toFixed(1)}`;
}

export function previousMonth(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth() - 1, 15);
}
