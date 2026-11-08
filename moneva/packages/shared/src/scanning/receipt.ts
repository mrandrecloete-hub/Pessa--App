import Decimal from 'decimal.js';
import { parseAmount } from './amount';
import { parseDate } from './date';

export interface ReceiptText {
  merchant: string;
  date: string | null;
  total: string | null;
  /** 0..1 */
  confidence: number;
  warnings: string[];
}

const TOTAL = /\b(grand\s*total|total\s*(due|payable|amount|incl\.?\s*vat)?|amount\s*(due|paid|payable)|balance\s*due|to\s*pay|totaal|te\s*betaal)\b/i;
const NOT_TOTAL = /\b(sub\s*-?\s*total|total\s*(vat|tax|savings?|discount|items?|qty|quantity)|vat|tax\s*amount|savings?|discount|change|tendered|cash\s*back|rounding|points|items?\s*sold)\b/i;
const NOT_MERCHANT = /\b(tax\s*invoice|invoice|receipt|vat\s*(no|reg|number)|reg(istration)?\s*no|tel|phone|fax|www\.|\.com|\.na\b|cashier|till|slip|date|time)\b/i;
const DATE_IN_LINE = /(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4})/g;
const AMOUNT_IN_LINE = /(?:N\$|R|NAD)?\s?\d[\d ,]*[.,]\d{2}\b/g;

/**
 * Reads merchant, date and total from receipt text (on-device OCR). Only a line labelled as the total is used;
 * the largest number on the slip is never assumed to be the total. Missing values stay null.
 */
export function parseReceiptText(text: string, defaultYear?: number): ReceiptText {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const warnings: string[] = [];

  const merchant = lines.slice(0, 6).find((l) => /[A-Za-z]{3,}/.test(l) && !NOT_MERCHANT.test(l) && !/^\d/.test(l) && l.replace(/[^A-Za-z]/g, '').length >= l.length * 0.4) ?? '';

  let date: string | null = null;
  for (const l of lines) {
    for (const m of l.matchAll(DATE_IN_LINE)) {
      date = parseDate(m[1]!, defaultYear);
      if (date) break;
    }
    if (date) break;
  }

  const totals: Decimal[] = [];
  for (const l of lines) {
    if (!TOTAL.test(l) || NOT_TOTAL.test(l)) continue;
    const toks = l.match(AMOUNT_IN_LINE);
    const a = toks ? parseAmount(toks[toks.length - 1]!) : null;
    if (a && Number(a.value) > 0) totals.push(new Decimal(a.value));
  }
  const distinct = [...new Set(totals.map((t) => t.toString()))];
  const total = distinct.length ? Decimal.max(...distinct).toString() : null;

  if (!merchant) warnings.push('Shop name could not be read. Please type it in.');
  if (!date) warnings.push('Date could not be read. Please check it.');
  if (!total) warnings.push('No line labelled Total was found. Please type the total in.');
  if (distinct.length > 1) warnings.push('More than one total was found. The largest was used; please check it.');

  let confidence = (merchant ? 0.2 : 0) + (date ? 0.25 : 0) + (total ? 0.55 : 0);
  if (distinct.length > 1) confidence -= 0.2;
  return { merchant, date, total, confidence: Math.max(0, Number(confidence.toFixed(2))), warnings };
}
