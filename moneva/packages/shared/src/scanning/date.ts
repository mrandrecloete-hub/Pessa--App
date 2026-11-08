const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

function valid(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1) return null;
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (d > dim) return null;
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
const fullYear = (y: number) => (y < 100 ? 2000 + y : y);

/** Day-first dates (Namibia/SA). Returns YYYY-MM-DD or null. `defaultYear` is used for "05 Mar". */
export function parseDate(raw: string, defaultYear?: number): string | null {
  const s = raw.trim();
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s);
  if (m) return valid(+m[1]!, +m[2]!, +m[3]!);
  m = /^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{2}|\d{4})$/.exec(s);
  if (m) return valid(fullYear(+m[3]!), +m[2]!, +m[1]!);
  m = /^(\d{1,2})[-/. ]([A-Za-z]{3,9})[-/. ,]*(\d{2}|\d{4})?$/.exec(s);
  if (m) {
    const mon = MONTHS[m[2]!.toLowerCase()];
    const y = m[3] ? fullYear(+m[3]) : defaultYear;
    if (!mon || y === undefined) return null;
    return valid(y, mon, +m[1]!);
  }
  return null;
}

export const DATE_AT_START =
  /^(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/. ]\d{1,2}[-/. ]\d{2,4}|\d{1,2}[-/. ][A-Za-z]{3,9}(?:[-/. ,]+\d{2,4})?)/;

export function monthFromName(name: string): number | null {
  return MONTHS[name.toLowerCase()] ?? null;
}
