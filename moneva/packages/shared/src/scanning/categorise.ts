import type { CategoryGuess } from './types';

interface Rule {
  match: RegExp;
  category: string;
  confidence: number;
  direction?: 'in' | 'out';
}

/** Namibia / Southern Africa oriented. Known merchants score higher than generic keywords. */
const RULES: Rule[] = [
  {
    match: /shoprite|checkers|pick ?n ?pay|\bspar\b|woermann|food lover|openwebs|choppies|game stores?|\bokay\b/i,
    category: 'groceries',
    confidence: 0.92,
    direction: 'out',
  },
  { match: /engen|\bshell\b|puma energy|\btotal\b|sasol|\bbp\b|fuel|petrol|diesel/i, category: 'fuel', confidence: 0.9, direction: 'out' },
  {
    match: /nampower|erongo red|nored|cenored|prepaid electric|electricity|eskom/i,
    category: 'electricity',
    confidence: 0.9,
    direction: 'out',
  },
  { match: /city of windhoek|namwater|municipal|water bill|\bwater\b/i, category: 'water', confidence: 0.8, direction: 'out' },
  {
    match: /\bmtc\b|tn mobile|telecom namibia|airtime|vodacom|\bcell ?c\b|data bundle/i,
    category: 'mobile',
    confidence: 0.9,
    direction: 'out',
  },
  { match: /mweb|\bafrihost\b|fibre|internet|wifi|\bdstv\b|multichoice/i, category: 'internet', confidence: 0.8, direction: 'out' },
  {
    match: /netflix|spotify|showmax|apple\.com\/bill|google (play|one)|youtube premium|subscription/i,
    category: 'subscriptions',
    confidence: 0.88,
    direction: 'out',
  },
  {
    match: /pharmacy|clinic|hospital|medi ?clinic|doctor|dr\.? |dental|optometr|dis-?chem|clicks|medical aid|pharmacies/i,
    category: 'healthcare',
    confidence: 0.82,
    direction: 'out',
  },
  {
    match: /school|university|unam|nust|college|tuition|fees? - ?edu|stationery/i,
    category: 'education',
    confidence: 0.82,
    direction: 'out',
  },
  {
    match: /kfc|steers|nando|wimpy|restaurant|cafe|coffee|pizza|burger|spur|\bbar\b|takeaway|mugg ?& ?bean/i,
    category: 'restaurants',
    confidence: 0.85,
    direction: 'out',
  },
  {
    match: /cinema|ster-?kinekor|nu ?metro|casino|gaming|bet(way|ting)|concert|ticket/i,
    category: 'entertainment',
    confidence: 0.8,
    direction: 'out',
  },
  {
    match: /edgars|mr price|truworths|ackermans|pep stores?|jet stores?|clothing|woolworths fashion/i,
    category: 'clothing',
    confidence: 0.85,
    direction: 'out',
  },
  { match: /hair|salon|barber|beauty|spa\b|cosmetic/i, category: 'personal_care', confidence: 0.78, direction: 'out' },
  {
    match: /insurance|santam|old mutual|sanlam|momentum|namib ?mutual|assurance|funeral cover/i,
    category: 'insurance',
    confidence: 0.85,
    direction: 'out',
  },
  {
    match: /loan|instal+ment|credit card|home ?loan|vehicle finance|wesbank|repayment/i,
    category: 'debt',
    confidence: 0.8,
    direction: 'out',
  },
  { match: /rent|lease|bond payment|body corporate|levy/i, category: 'housing', confidence: 0.78, direction: 'out' },
  { match: /taxi|uber|bolt|bus ticket|namib ?bus|car wash|toll/i, category: 'transport', confidence: 0.8, direction: 'out' },
  {
    match: /airline|air namibia|flysafair|hotel|lodge|booking\.com|airbnb|car hire|avis|europcar/i,
    category: 'travel',
    confidence: 0.85,
    direction: 'out',
  },
  { match: /salary|salaris|wages?|payroll|remuneration/i, category: 'salary', confidence: 0.92, direction: 'in' },
  { match: /bonus|13th cheque/i, category: 'bonus', confidence: 0.85, direction: 'in' },
  { match: /dividend|interest (received|earned|paid in)|investment/i, category: 'investment', confidence: 0.8, direction: 'in' },
  { match: /rental income|tenant/i, category: 'rental', confidence: 0.8, direction: 'in' },
  { match: /invoice|consulting|freelance|commission/i, category: 'freelance', confidence: 0.6, direction: 'in' },
  { match: /shop|store|market|mall|retail|mart|superette/i, category: 'shopping', confidence: 0.55, direction: 'out' },
];

/** Below this a person must confirm the category. Nothing is ever auto-marked verified. */
export const REVIEW_THRESHOLD = 0.75;

export interface UserRule {
  merchantContains: string;
  categoryId: string;
}

export function categorise(description: string, direction: 'in' | 'out' | 'unknown', userRules: UserRule[] = []): CategoryGuess {
  const d = description.toLowerCase();
  for (const r of userRules) {
    if (r.merchantContains && d.includes(r.merchantContains.toLowerCase())) {
      return { categoryId: r.categoryId, confidence: 0.97, reason: 'Matches a rule you created' };
    }
  }
  for (const r of RULES) {
    if (!r.match.test(description)) continue;
    if (direction !== 'unknown' && r.direction && r.direction !== direction) continue;
    const conf = direction === 'unknown' ? Math.min(r.confidence, 0.7) : r.confidence;
    return { categoryId: r.category, confidence: conf, reason: `Matched keyword for ${r.category}` };
  }
  return { categoryId: direction === 'in' ? 'other_income' : 'other', confidence: 0.2, reason: 'No rule matched' };
}
