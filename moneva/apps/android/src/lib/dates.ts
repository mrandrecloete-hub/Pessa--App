export const pad = (n: number) => String(n).padStart(2, '0');
export function todayISO(d = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function monthRange(d = new Date()): { from: string; to: string; daysInMonth: number; daysElapsed: number } {
  const y = d.getFullYear(),
    m = d.getMonth();
  const dim = new Date(y, m + 1, 0).getDate();
  return { from: `${y}-${pad(m + 1)}-01`, to: `${y}-${pad(m + 1)}-${pad(dim)}`, daysInMonth: dim, daysElapsed: d.getDate() };
}
