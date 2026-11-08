/** cyrb53 string hash. Deterministic, dependency free. Not for security, only for duplicate detection. */
function hash(s: string): string {
  let h1 = 0xdeadbeef,
    h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

export function normaliseDescription(d: string): string {
  return d
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\b\d{4,}\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Idempotency key for an imported row. Identical rows inside ONE file (two coffees on the same day)
 * get an occurrence suffix so they are kept, while re-importing the same file produces the same keys
 * and is rejected.
 */
export function fingerprints(
  accountId: string,
  rows: Array<{ date: string; amount: string; direction: string; description: string }>,
): string[] {
  const seen = new Map<string, number>();
  return rows.map((r) => {
    const base = hash(`${accountId}|${r.date}|${r.amount}|${r.direction}|${normaliseDescription(r.description)}`);
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return `${base}#${n}`;
  });
}
