/** ISO 4217 currency table. Add currencies here (configuration, not code elsewhere). */
export interface CurrencyInfo {
  code: string;
  name: string;
  /** Minor unit digits (ISO 4217 exponent). */
  decimals: number;
  symbol: string;
}

const LIST: CurrencyInfo[] = [
  { code: 'NAD', name: 'Namibian Dollar', decimals: 2, symbol: 'N$' },
  { code: 'ZAR', name: 'South African Rand', decimals: 2, symbol: 'R' },
  { code: 'USD', name: 'US Dollar', decimals: 2, symbol: '$' },
  { code: 'EUR', name: 'Euro', decimals: 2, symbol: '€' },
  { code: 'GBP', name: 'Pound Sterling', decimals: 2, symbol: '£' },
  { code: 'BWP', name: 'Botswana Pula', decimals: 2, symbol: 'P' },
  { code: 'AUD', name: 'Australian Dollar', decimals: 2, symbol: 'A$' },
  { code: 'CAD', name: 'Canadian Dollar', decimals: 2, symbol: 'C$' },
  { code: 'AOA', name: 'Angolan Kwanza', decimals: 2, symbol: 'Kz' },
  { code: 'ZMW', name: 'Zambian Kwacha', decimals: 2, symbol: 'ZK' },
  { code: 'JPY', name: 'Japanese Yen', decimals: 0, symbol: '¥' },
  { code: 'KWD', name: 'Kuwaiti Dinar', decimals: 3, symbol: 'KD' },
];

export const CURRENCIES: Readonly<Record<string, CurrencyInfo>> = Object.freeze(Object.fromEntries(LIST.map((c) => [c.code, c])));

export function getCurrency(code: string): CurrencyInfo {
  const c = CURRENCIES[code];
  if (!c) throw new Error(`Unsupported currency: ${code}`);
  return c;
}

export function isSupportedCurrency(code: string): boolean {
  return code in CURRENCIES;
}
