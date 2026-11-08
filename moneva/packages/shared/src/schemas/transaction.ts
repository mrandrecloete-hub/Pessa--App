import { z } from 'zod';
import { isSupportedCurrency } from '../money/currency';

const amount = z
  .string()
  .regex(/^\d+(\.\d+)?$/, 'Enter a positive amount')
  .refine((v) => Number(v) > 0, 'Amount must be above zero');
const currency = z.string().refine(isSupportedCurrency, 'Unsupported currency');

export const transactionInputSchema = z.object({
  type: z.enum(['income', 'expense']),
  amount,
  currency,
  accountId: z.string().min(1),
  categoryId: z.string().min(1).nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
  description: z.string().max(200).optional(),
  merchant: z.string().max(120).optional(),
  notes: z.string().max(1000).optional(),
});
export type TransactionInput = z.infer<typeof transactionInputSchema>;

export const signUpSchema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z
    .string()
    .min(10, 'Use at least 10 characters')
    .regex(/\d/, 'Include a number')
    .regex(/[A-Za-z]/, 'Include a letter'),
});
