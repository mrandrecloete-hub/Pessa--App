export interface RawStatementRow {
  date: string;
  description: string;
  /** Absolute amount. */
  amount: string;
  direction: 'in' | 'out' | 'unknown';
  balance?: string;
  line: number;
}

export interface CategoryGuess {
  categoryId: string;
  /** 0..1 */
  confidence: number;
  reason: string;
}
