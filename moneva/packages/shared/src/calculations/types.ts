export type TransactionType = 'income' | 'expense' | 'transfer_in' | 'transfer_out' | 'refund';
export type TransactionStatus = 'pending' | 'settled' | 'cancelled';
export type TransactionSource = 'manual' | 'bank' | 'import' | 'scan' | 'recurring';

export interface Transaction {
  id: string;
  accountId: string;
  type: TransactionType;
  /** Original amount, always positive, in `currency`. */
  amount: string;
  currency: string;
  baseCurrency: string;
  exchangeRate: string;
  /** Amount converted to the base currency at the time of the transaction. */
  baseAmount: string;
  categoryId: string | null;
  merchant?: string | null;
  /** YYYY-MM-DD */
  date: string;
  status: TransactionStatus;
  source: TransactionSource;
  externalId?: string | null;
  /** Link a refund to the expense it reverses. */
  refundOf?: string | null;
  /** Internal savings allocation: bookkeeping only, not external cash. */
  isSavingsAllocation?: boolean;
  description?: string;
}
