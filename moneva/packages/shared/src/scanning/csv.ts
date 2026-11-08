import { parseAmount } from './amount';
import { parseDate } from './date';
import type { RawStatementRow } from './types';

export function parseCsv(text: string): string[][] {
  const t = text.replace(/^﻿/, '');
  const first = t.split(/\r?\n/, 1)[0] ?? '';
  const delim = [';', '\t', ','].reduce((best, d) => (first.split(d).length > first.split(best).length ? d : best), ',');
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i]!;
    if (q) {
      if (c === '"' && t[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === delim) {
      row.push(cur);
      cur = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      row.push(cur);
      cur = '';
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
    } else cur += c;
  }
  row.push(cur);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows;
}

const H = {
  date: /^(date|transaction date|trans date|posting date|value date|datum)$/i,
  desc: /(description|details|narrative|reference|particulars|merchant|beskrywing|payee)/i,
  amount: /^(amount|transaction amount|bedrag|value)$/i,
  debit: /(debit|money out|withdrawal|paid out|uit)/i,
  credit: /(credit|money in|deposit|paid in|in$)/i,
  balance: /(balance|saldo)/i,
};

export interface CsvResult {
  rows: RawStatementRow[];
  skipped: Array<{ line: number; reason: string }>;
}

/** Parse a bank statement CSV with auto-detected columns. Rows that cannot be read are reported, never invented. */
export function parseStatementCsv(text: string, defaultYear?: number): CsvResult {
  const all = parseCsv(text);
  const hi = all.findIndex(
    (r) => r.some((c) => H.date.test(c.trim())) && r.some((c) => H.desc.test(c) || H.amount.test(c.trim()) || H.debit.test(c)),
  );
  const skipped: CsvResult['skipped'] = [];
  if (hi < 0) return { rows: [], skipped: [{ line: 1, reason: 'No header row with Date and Amount/Debit columns found' }] };
  const head = all[hi]!.map((c) => c.trim());
  const idx = (re: RegExp) => head.findIndex((c) => re.test(c));
  const iDate = idx(H.date),
    iDesc = idx(H.desc),
    iAmt = idx(H.amount),
    iDeb = idx(H.debit),
    iCred = idx(H.credit),
    iBal = idx(H.balance);
  const rows: RawStatementRow[] = [];
  all.slice(hi + 1).forEach((r, k) => {
    const line = hi + k + 2;
    const date = parseDate(r[iDate] ?? '', defaultYear);
    if (!date) return void skipped.push({ line, reason: 'Unreadable date' });
    let amount: string | null = null;
    let direction: 'in' | 'out' | 'unknown' = 'unknown';
    if (iDeb >= 0 || iCred >= 0) {
      const d = iDeb >= 0 ? parseAmount(r[iDeb] ?? '') : null;
      const c = iCred >= 0 ? parseAmount(r[iCred] ?? '') : null;
      if (d && d.value !== '0') {
        amount = d.value;
        direction = 'out';
      } else if (c && c.value !== '0') {
        amount = c.value;
        direction = 'in';
      }
    } else if (iAmt >= 0) {
      const a = parseAmount(r[iAmt] ?? '');
      if (a) {
        amount = a.value;
        direction = a.sign === -1 ? 'out' : a.sign === 1 ? 'in' : 'unknown';
      }
    }
    if (amount === null) return void skipped.push({ line, reason: 'Unreadable amount' });
    const bal = iBal >= 0 ? parseAmount(r[iBal] ?? '') : null;
    rows.push({
      date,
      description: (r[iDesc] ?? '').trim(),
      amount,
      direction,
      balance: bal ? (bal.sign === -1 ? '-' + bal.value : bal.value) : undefined,
      line,
    });
  });
  return { rows, skipped };
}
