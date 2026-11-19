/**
 * NEXUS preparation assessment. These weights are NEXUS preparation weights,
 * not official criteria of any funding institution. Programme-specific verified
 * checklists may override them later. Deterministic: no AI is involved.
 */
export type Answer = 'YES' | 'PARTIAL' | 'NO';
export interface ReadinessItem { id: string; label: string; suggestion: string }
export interface ReadinessCategoryDef { key: string; label: string; weight: number; items: ReadinessItem[] }

export const READINESS_MODEL_VERSION = 'nexus-prep-1';
export const READINESS_CATEGORIES: ReadinessCategoryDef[] = [
  { key: 'BUSINESS_PLAN', label: 'Business plan completeness', weight: 20, items: [
    { id: 'bp_exec', label: 'Executive summary written', suggestion: 'Write a one page executive summary in Business Studio.' },
    { id: 'bp_desc', label: 'Business description and activity explained', suggestion: 'Describe what the business does, for whom and where.' },
    { id: 'bp_prod', label: 'Products or services and pricing described', suggestion: 'List each product or service with its price.' },
    { id: 'bp_mgmt', label: 'Ownership and management structure described', suggestion: 'Describe who owns and runs the business and their experience.' },
    { id: 'bp_risk', label: 'Main risks identified with ways to reduce them', suggestion: 'List the main risks and what you will do about each.' } ] },
  { key: 'FINANCIAL', label: 'Financial projections', weight: 20, items: [
    { id: 'fin_forecast', label: '12 month revenue and expense forecast completed', suggestion: 'Complete a 12 month forecast in the Financial Simulator.' },
    { id: 'fin_assump', label: 'Forecast assumptions written down', suggestion: 'Write down where each sales and cost figure comes from.' },
    { id: 'fin_use', label: 'Funding request broken down by use', suggestion: 'Show exactly what each dollar of funding will buy.' },
    { id: 'fin_breakeven', label: 'Break-even point calculated', suggestion: 'Calculate the monthly sales needed to cover all costs.' },
    { id: 'fin_cash', label: 'Monthly cash flow forecast prepared', suggestion: 'Prepare a month by month cash in and cash out forecast.' } ] },
  { key: 'MARKET', label: 'Market research', weight: 15, items: [
    { id: 'mk_customers', label: 'Target customers clearly defined', suggestion: 'Describe who your customers are, how many and where.' },
    { id: 'mk_competitors', label: 'Competitors identified and compared', suggestion: 'Name your main competitors and say how you differ.' },
    { id: 'mk_evidence', label: 'Evidence of demand collected', suggestion: 'Collect surveys, orders, letters of intent or sales records.' },
    { id: 'mk_pricing', label: 'Pricing compared with the market', suggestion: 'Compare your prices with what customers pay now.' } ] },
  { key: 'DOCUMENTS', label: 'Supporting documents', weight: 15, items: [
    { id: 'doc_reg', label: 'Business registration documents available', suggestion: 'Upload your registration documents to the Document Vault.' },
    { id: 'doc_id', label: 'Identification documents available', suggestion: 'Upload identification for owners as the programme requires.' },
    { id: 'doc_bank', label: 'Recent bank statements available', suggestion: 'Upload recent bank statements if the programme asks for them.' },
    { id: 'doc_tax', label: 'Tax related documents available', suggestion: 'Collect the tax documents the programme asks for (to be confirmed with the institution).' },
    { id: 'doc_quotes', label: 'Supplier quotations for planned purchases available', suggestion: 'Get written quotations for equipment or stock you plan to buy.' } ] },
  { key: 'VIABILITY', label: 'Business viability evidence', weight: 20, items: [
    { id: 'via_trading', label: 'Trading history or a tested pilot exists', suggestion: 'Record sales so far, or run a small pilot and record the results.' },
    { id: 'via_customers', label: 'Real customers or buyers can be shown', suggestion: 'Keep a list of customers, orders or signed intentions.' },
    { id: 'via_skills', label: 'Owner has relevant skills or experience', suggestion: 'Write down your experience, training and certificates.' },
    { id: 'via_premises', label: 'Premises or place of operation secured', suggestion: 'Show a lease, permission letter or other proof of where you operate.' },
    { id: 'via_contribution', label: 'Own contribution or capital available', suggestion: 'State what you can put in yourself, in cash or assets.' } ] },
  { key: 'IMPACT', label: 'Employment and community impact', weight: 10, items: [
    { id: 'imp_jobs', label: 'Jobs to be created or kept are estimated', suggestion: 'Estimate how many jobs and describe how you calculated it.' },
    { id: 'imp_community', label: 'Community benefit described', suggestion: 'Explain who in the community benefits and how.' },
    { id: 'imp_sustain', label: 'Environmental and long term sustainability considered', suggestion: 'Describe how the business keeps going and its effect on the environment.' } ] },
];
const VALUE: Record<Answer, number> = { YES: 1, PARTIAL: 0.5, NO: 0 };

export interface CategoryResult { key: string; label: string; weight: number; score: number; answered: number; total: number; weak: boolean;
  missing: { id: string; label: string; suggestion: string; answer: Answer | 'UNANSWERED' }[] }
export interface ReadinessResult { modelVersion: string; overall: number; completion: number; categories: CategoryResult[]; weakCategories: string[];
  nextActions: string[]; notice: string }

export function validateAnswers(answers: Record<string, unknown>): string[] {
  const ids = new Set(READINESS_CATEGORIES.flatMap(c => c.items.map(i => i.id)));
  const errors: string[] = [];
  for (const [k, v] of Object.entries(answers)) {
    if (!ids.has(k)) errors.push(`Unknown item: ${k}`);
    else if (v !== 'YES' && v !== 'PARTIAL' && v !== 'NO') errors.push(`Invalid answer for ${k}`);
  }
  return errors;
}

export function scoreReadiness(answers: Record<string, Answer | undefined>): ReadinessResult {
  let answeredAll = 0, totalAll = 0, overall = 0;
  const categories: CategoryResult[] = READINESS_CATEGORIES.map(c => {
    let sum = 0, answered = 0; const missing: CategoryResult['missing'] = [];
    for (const it of c.items) {
      const a = answers[it.id];
      if (a) { answered++; sum += VALUE[a]; }
      if (a !== 'YES') missing.push({ id: it.id, label: it.label, suggestion: it.suggestion, answer: a ?? 'UNANSWERED' });
    }
    const score = Math.round((sum / c.items.length) * 100);
    answeredAll += answered; totalAll += c.items.length; overall += (c.weight * sum) / c.items.length;
    return { key: c.key, label: c.label, weight: c.weight, score, answered, total: c.items.length, weak: score < 50, missing };
  });
  const weak = categories.filter(c => c.weak).sort((a, b) => b.weight - a.weight);
  const nextActions = weak.flatMap(c => c.missing.slice(0, 2).map(m => m.suggestion)).slice(0, 5);
  return { modelVersion: READINESS_MODEL_VERSION, overall: Math.round(overall), completion: Math.round((answeredAll / totalAll) * 100),
    categories, weakCategories: weak.map(c => c.key), nextActions,
    notice: 'This is a NEXUS preparation score. It is not an official institutional assessment and does not predict whether any application will be approved.' };
}
