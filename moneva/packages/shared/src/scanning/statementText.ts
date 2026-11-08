import Decimal from 'decimal.js';
import { parseAmount } from './amount';
import { DATE_AT_START, parseDate } from './date';
import type { RawStatementRow } from './types';

/** Strict money token: digit groups and a mandatory 2 digit decimal part, so two columns can never merge. */
const AMOUNT_TOKEN = /(?<![\d.,])(?:N\$|R)?\s?[-(]?(?:\d{1,3}(?:[ ,.]\d{3})+|\d+)[.,]\d{2}\)?-?(?:\s?(?:CR|DR)\b)?/gi;

/**
 * Parse text produced by OCR or PDF text extraction of a statement. One transaction per line:
 *   "05/03/2026 SHOPRITE WINDHOEK  -245.60  10 230.10"
 * When two amounts are present the last is treated as the running balance. When a line has
 * no sign or CR/DR marker, direction comes from the balance change, otherwise it stays
 * 'unknown' and the user must confirm it. Continuation lines are not guessed.
 */
export function parseStatementText(text: string, defaultYear?: number): { rows: RawStatementRow[]; unreadLines: number[] } {
  const rows: RawStatementRow[] = [];
  const unreadLines: number[] = [];
  let prevBalance: Decimal | null = null;
  text.split(/\r?\n/).forEach((lineRaw, i) => {
    const line = lineRaw.trim();
    if (!line) return;
    const dm = DATE_AT_START.exec(line);
    if (!dm) return;
    const date = parseDate(dm[1]!, defaultYear);
    if (!date) return void unreadLines.push(i + 1);
    const rest = line.slice(dm[0].length);
    const toks = [...rest.matchAll(AMOUNT_TOKEN)].map((m) => ({ raw: m[0].trim(), index: m.index! }));
    const amts = toks.map((t) => ({ ...t, p: parseAmount(t.raw) })).filter((t) => t.p);
    if (amts.length === 0) return void unreadLines.push(i + 1);
    const hasBalance = amts.length >= 2;
    const amtTok = hasBalance ? amts[amts.length - 2]! : amts[0]!;
    const balTok = hasBalance ? amts[amts.length - 1]! : null;
    const a = amtTok.p!;
    const description = rest.slice(0, amts[0]!.index).replace(/\s+/g, ' ').trim();
    let direction: RawStatementRow['direction'] = a.sign === -1 ? 'out' : a.sign === 1 && /CR/i.test(amtTok.raw) ? 'in' : 'unknown';
    let balance: string | undefined;
    if (balTok) {
      const b = balTok.p!;
      const bv = new Decimal(b.sign === -1 ? '-' + b.value : b.value);
      balance = bv.toString();
      if (direction === 'unknown' && prevBalance) {
        const delta = bv.minus(prevBalance);
        if (delta.abs().eq(a.value)) direction = delta.isPositive() ? 'in' : 'out';
      }
      prevBalance = bv;
    }
    rows.push({ date, description, amount: a.value, direction, balance, line: i + 1 });
  });
  return { rows, unreadLines };
}
