export interface Category {
  id: string;
  name: string;
  kind: 'expense' | 'income';
  group?: 'needs' | 'wants' | 'savings';
}

export const CATEGORIES: Category[] = [
  { id: 'housing', name: 'Housing and rent', kind: 'expense', group: 'needs' },
  { id: 'groceries', name: 'Groceries', kind: 'expense', group: 'needs' },
  { id: 'transport', name: 'Transport', kind: 'expense', group: 'needs' },
  { id: 'fuel', name: 'Fuel', kind: 'expense', group: 'needs' },
  { id: 'electricity', name: 'Electricity', kind: 'expense', group: 'needs' },
  { id: 'water', name: 'Water', kind: 'expense', group: 'needs' },
  { id: 'internet', name: 'Internet', kind: 'expense', group: 'needs' },
  { id: 'mobile', name: 'Mobile communication', kind: 'expense', group: 'needs' },
  { id: 'healthcare', name: 'Healthcare', kind: 'expense', group: 'needs' },
  { id: 'education', name: 'Education', kind: 'expense', group: 'needs' },
  { id: 'restaurants', name: 'Restaurants', kind: 'expense', group: 'wants' },
  { id: 'entertainment', name: 'Entertainment', kind: 'expense', group: 'wants' },
  { id: 'shopping', name: 'Shopping', kind: 'expense', group: 'wants' },
  { id: 'clothing', name: 'Clothing', kind: 'expense', group: 'wants' },
  { id: 'personal_care', name: 'Personal care', kind: 'expense', group: 'wants' },
  { id: 'insurance', name: 'Insurance', kind: 'expense', group: 'needs' },
  { id: 'debt', name: 'Debt repayments', kind: 'expense', group: 'savings' },
  { id: 'subscriptions', name: 'Subscriptions', kind: 'expense', group: 'wants' },
  { id: 'travel', name: 'Travel', kind: 'expense', group: 'wants' },
  { id: 'other', name: 'Other', kind: 'expense' },
  { id: 'salary', name: 'Salary', kind: 'income' },
  { id: 'business', name: 'Business income', kind: 'income' },
  { id: 'freelance', name: 'Freelance income', kind: 'income' },
  { id: 'rental', name: 'Rental income', kind: 'income' },
  { id: 'investment', name: 'Investment income', kind: 'income' },
  { id: 'bonus', name: 'Bonus', kind: 'income' },
  { id: 'gift', name: 'Gift', kind: 'income' },
  { id: 'other_income', name: 'Other income', kind: 'income' },
];
export const categoryName = (id: string | null) => CATEGORIES.find((c) => c.id === id)?.name ?? 'Uncategorised';
