import Decimal from 'decimal.js';

export interface ParsedAmount {
  /** Absolute value as a decimal string. */
  value: string;
  /** -1 debit/negative, 1 credit/positive, 0 no sign information. */
  sign: -1 | 0 | 1;
}

/**
 * Parse a money token from a statement or payslip: "1,234.50", "1.234,50", "1 234,50",
 * "N$ 1,234.50", "-500.00", "500.00-", "(500.00)", "500.00 DR", "500.00 CR".
 * Returns null when the token is not a clean amount. Never guesses.
 */
export function parseAmount(raw: string): ParsedAmount | null {
  let s = raw.trim();
  if (!s) return null;
  let sign: -1 | 0 | 1 = 0;
  if (/\bDR\b|\bDEBIT\b/i.test(s)) sign = -1;
  if (/\bCR\b|\bCREDIT\b/i.test(s)) sign = 1;
  s = s.replace(/\b(DR|CR|DEBIT|CREDIT)\b/gi, '').trim();
  if (/^\(.*\)$/.test(s)) {
    sign = -1;
    s = s.slice(1, -1);
  }
  if (/-\s*$/.test(s)) {
    sign = -1;
    s = s.replace(/-\s*$/, '');
  }
  if (/^[-−–]/.test(s)) {
    sign = -1;
    s = s.replace(/^[-−–]\s*/, '');
  } else if (/^\+/.test(s)) {
    sign = 1;
    s = s.slice(1);
  }
  s = s
    .replace(/^(N\$|NAD|ZAR|USD|EUR|GBP|BWP|R|\$|€|£)\s*/i, '')
    .replace(/\s+/g, (m, off, str) => (/\d/.test(str[off - 1] ?? '') && /\d/.test(str[off + m.length] ?? '') ? ' ' : ''));
  if (!/^[\d .,]+$/.test(s) || !/\d/.test(s)) return null;

  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  let normalised: string;
  if (lastDot >= 0 && lastComma >= 0) {
    const decimalSep = lastDot > lastComma ? '.' : ',';
    const thousandSep = decimalSep === '.' ? ',' : '.';
    normalised = s.split(thousandSep).join('').replace(/ /g, '').replace(decimalSep, '.');
  } else if (lastComma >= 0 || lastDot >= 0) {
    const sep = lastComma >= 0 ? ',' : '.';
    const parts = s.replace(/ /g, '').split(sep);
    const last = parts[parts.length - 1] ?? '';
    const isDecimal = parts.length === 2 && last.length <= 2;
    normalised = isDecimal ? parts.join('.') : parts.join('');
  } else {
    normalised = s.replace(/ /g, '');
  }
  if (!/^\d+(\.\d+)?$/.test(normalised)) return null;
  return { value: new Decimal(normalised).toString(), sign };
}
