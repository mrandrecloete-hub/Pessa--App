import Decimal from 'decimal.js';
import { parseAmount } from './amount';
import { DATE_AT_START, parseDate } from './date';
import type { RawStatementRow } from './types';

/**
 * Strict money token: digit groups and a mandatory 2 digit decimal part, so two columns can never merge.
 * A CR or DR marker may follow, with or without a space ("245.60 Cr", "15,254.40Cr").
 */
const AMOUNT_TOKEN = /(?<![\d.,])(?:N\$|R)?\s?[-(]?(?:\d{1,3}(?:[ ,.]\d{3})+|\d+)[.,]\d{2}\)?-?(?:\s?(?:CR|DR)(?![A-Za-z]))?/gi;
/** A date anywhere in the line, for layouts where the date is not the first column. */
const DATE_ANYWHERE = /(?<![\d/.-])(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|\d{1,2}\s(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*(?:\s\d{4})?)(?![\d/.-])/gi;
/** Lines that carry the balance before the first transaction. */
const OPENING = /(opening\s+balance|balance\s+brought\s+forward|brought\s+forward|balance\s+b\/?f|previous\s+balance|balance\s+forward)/i;
/** Summary and header lines that contain dates or amounts but are not transactions. */
const NOT_A_TRANSACTION = /(closing\s+balance|statement\s+(date|period)|available\s+balance|total\s+(debits?|credits?|fees|charges)|page\s+\d|account\s+(number|no\.?)|balance\s+carried\s+forward|carried\s+forward|interest\s+rate|overdraft\s+limit)/i;

const signedBalance = (b: { value: string; sign: -1 | 0 | 1 }) => new Decimal(b.sign === -1 ? '-' + b.value : b.value);

/**
 * Parse text produced by OCR or PDF text extraction of a statement. One transaction per line:
 *   "05/03/2026 SHOPRITE WINDHOEK  -245.60  10 230.10"
 *   "05 Nov POS Purchase Shoprite  245.60  15,254.40Cr"         (FNB style)
 *   "SHOPRITE WINDHOEK  245.60  05/11/2026  15 254.40"           (date not first)
 * When two amounts are present the last is treated as the running balance. When a line has
 * no sign or CR/DR marker, direction comes from the balance change (seeded by an opening balance
 * line when there is one), otherwise it stays 'unknown' and the user must confirm it.
 */
export function parseStatementText(text: string, defaultYear?: number): { rows: RawStatementRow[]; unreadLines: number[] } {
  const rows: RawStatementRow[] = [];
  const unreadLines: number[] = [];
  let prevBalance: Decimal | null = null;
  text.split(/\r?\n/).forEach((lineRaw, i) => {
    const line = lineRaw.trim();
    if (!line) return;

    if (OPENING.test(line)) {
      const toks = [...line.matchAll(AMOUNT_TOKEN)].map((m) => parseAmount(m[0])).filter((p) => p !== null);
      const last = toks[toks.length - 1];
      if (last) prevBalance = signedBalance(last);
      return;
    }
    if (NOT_A_TRANSACTION.test(line)) return;

    let date: string | null = null;
    let rest: string;
    const atStart = DATE_AT_START.exec(line);
    if (atStart) {
      date = parseDate(atStart[1]!, defaultYear);
      if (!date) return void unreadLines.push(i + 1);
      rest = line.slice(atStart[0].length);
    } else {
      const found = [...line.matchAll(DATE_ANYWHERE)].map((m) => ({ m, d: parseDate(m[1]!, defaultYear) })).find((x) => x.d);
      if (!found) return;
      date = found.d;
      rest = `${line.slice(0, found.m.index!)} ${line.slice(found.m.index! + found.m[0].length)}`;
    }

    const toks = [...rest.matchAll(AMOUNT_TOKEN)].map((m) => ({ raw: m[0].trim(), index: m.index! }));
    const amts = toks.map((t) => ({ ...t, p: parseAmount(t.raw) })).filter((t) => t.p);
    if (amts.length === 0) {
      if (atStart) unreadLines.push(i + 1);
      return;
    }
    const hasBalance = amts.length >= 2;
    const amtTok = hasBalance ? amts[amts.length - 2]! : amts[0]!;
    const balTok = hasBalance ? amts[amts.length - 1]! : null;
    const a = amtTok.p!;
    if (a.value === '0') return;
    const description = rest.slice(0, amts[0]!.index).replace(/\s+/g, ' ').trim();
    let direction: RawStatementRow['direction'] = a.sign === -1 ? 'out' : a.sign === 1 ? 'in' : 'unknown';
    let balance: string | undefined;
    if (balTok) {
      const bv = signedBalance(balTok.p!);
      balance = bv.toString();
      if (prevBalance) {
        const delta = bv.minus(prevBalance);
        // The balance change is the most reliable signal; it also overrides a marker that disagrees with it.
        if (delta.abs().eq(a.value)) direction = delta.isPositive() ? 'in' : 'out';
      }
      prevBalance = bv;
    }
    rows.push({ date: date!, description, amount: a.value, direction, balance, line: i + 1 });
  });
  return { rows, unreadLines };
}
