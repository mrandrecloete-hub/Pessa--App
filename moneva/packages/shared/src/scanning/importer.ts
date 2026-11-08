import Decimal from 'decimal.js';
import { categorise, REVIEW_THRESHOLD, type UserRule } from './categorise';
import { fingerprints } from './dedupe';
import type { RawStatementRow } from './types';

export interface ImportCandidate {
  fingerprint: string;
  date: string;
  description: string;
  amount: string;
  direction: 'in' | 'out' | 'unknown';
  categoryId: string;
  confidence: number;
  /** True when the category or direction is uncertain. Such rows are never saved as verified. */
  needsReview: boolean;
  duplicate: boolean;
  line: number;
}

/** Turn parsed rows into reviewable candidates: categorised, fingerprinted and checked for duplicates. */
export function buildCandidates(
  accountId: string,
  rows: RawStatementRow[],
  existingFingerprints: Set<string>,
  userRules: UserRule[] = [],
): ImportCandidate[] {
  const fps = fingerprints(accountId, rows);
  return rows.map((r, i) => {
    const g = categorise(r.description, r.direction, userRules);
    return {
      fingerprint: fps[i]!,
      date: r.date,
      description: r.description,
      amount: r.amount,
      direction: r.direction,
      categoryId: g.categoryId,
      confidence: g.confidence,
      needsReview: r.direction === 'unknown' || g.confidence < REVIEW_THRESHOLD,
      duplicate: existingFingerprints.has(fps[i]!),
      line: r.line,
    };
  });
}

export interface ImportSummary {
  income: string;
  expenses: string;
  net: string;
  byCategory: Record<string, string>;
  counted: number;
  duplicatesSkipped: number;
  needsReview: number;
  /** Rows with unknown direction are excluded from totals until confirmed. */
  excludedUnknownDirection: number;
}

/** Totals for what WOULD be imported. Duplicates and unknown-direction rows are excluded. */
export function summariseCandidates(c: ImportCandidate[]): ImportSummary {
  let income = new Decimal(0),
    expenses = new Decimal(0);
  const byCategory: Record<string, Decimal> = {};
  let counted = 0,
    dup = 0,
    review = 0,
    unknown = 0;
  for (const x of c) {
    if (x.duplicate) {
      dup++;
      continue;
    }
    if (x.needsReview) review++;
    if (x.direction === 'unknown') {
      unknown++;
      continue;
    }
    counted++;
    if (x.direction === 'in') income = income.plus(x.amount);
    else {
      expenses = expenses.plus(x.amount);
      byCategory[x.categoryId] = (byCategory[x.categoryId] ?? new Decimal(0)).plus(x.amount);
    }
  }
  return {
    income: income.toString(),
    expenses: expenses.toString(),
    net: income.minus(expenses).toString(),
    byCategory: Object.fromEntries(Object.entries(byCategory).map(([k, v]) => [k, v.toString()])),
    counted,
    duplicatesSkipped: dup,
    needsReview: review,
    excludedUnknownDirection: unknown,
  };
}
