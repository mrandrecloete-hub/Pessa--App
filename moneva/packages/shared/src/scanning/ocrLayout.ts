/**
 * On-device text recognition (ML Kit) returns text lines with their position on the page, not rows.
 * A statement row such as "05/11  SHOPRITE  245.60  15 254.40" comes back as separate pieces.
 * These helpers rebuild rows from the positions so the existing parsers can read them.
 */
export interface OcrRect { left: number; top: number; right: number; bottom: number }
export interface OcrLine { text: string; frame: OcrRect }

const AMOUNT_ONLY = /^[-(]?\s*(?:N\$|R|NAD)?\s*\d[\d ,.]*[.,]\d{2}\)?\s*(?:-|CR|DR)?$/i;

/** Groups lines whose vertical centres line up into rows, top to bottom; each row's pieces are left to right. */
export function rowsFromLines(lines: OcrLine[]): string[][] {
  const items = lines
    .filter((l) => l.text.trim())
    .map((l) => ({ text: l.text.trim(), left: l.frame.left, cy: (l.frame.top + l.frame.bottom) / 2, h: Math.max(1, l.frame.bottom - l.frame.top) }))
    .sort((a, b) => a.cy - b.cy || a.left - b.left);
  if (items.length === 0) return [];
  const heights = items.map((i) => i.h).sort((a, b) => a - b);
  const tol = heights[Math.floor(heights.length / 2)]! * 0.5;
  const rows: Array<{ cy: number; items: typeof items }> = [];
  for (const it of items) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(it.cy - row.cy) <= tol) {
      row.items.push(it);
      row.cy = row.items.reduce((s, x) => s + x.cy, 0) / row.items.length;
    } else rows.push({ cy: it.cy, items: [it] });
  }
  return rows.map((r) => r.items.sort((a, b) => a.left - b.left).map((x) => x.text));
}

/** One text line per row, pieces separated by two spaces (for bank statements). */
export function rowsToText(rows: string[][]): string {
  return rows.map((r) => r.join('  ')).join('\n');
}

/**
 * One "label amount" line per pair (for payslips and receipts, which often have two columns side by side:
 * "Basic salary 20 000.00   PAYE 3 100.00" becomes two lines).
 */
export function rowsToPairs(rows: string[][]): string {
  const out: string[] = [];
  for (const r of rows) {
    let label: string | null = null;
    for (const piece of r) {
      if (AMOUNT_ONLY.test(piece)) {
        out.push(label ? `${label}  ${piece}` : piece);
        label = null;
      } else {
        if (label) out.push(label);
        label = piece;
      }
    }
    if (label) out.push(label);
  }
  return out.join('\n');
}
