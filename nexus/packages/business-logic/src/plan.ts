export const PLAN_SECTIONS = [
  { key: 'EXECUTIVE_SUMMARY', label: 'Executive Summary', hint: 'A short overview of the business, the funding you need and why it will work.' },
  { key: 'BUSINESS_DESCRIPTION', label: 'Business Description', hint: 'What the business does, where it operates and who owns it.' },
  { key: 'PROBLEM_OPPORTUNITY', label: 'Problem and Opportunity', hint: 'The problem customers face and the opportunity you will serve.' },
  { key: 'PRODUCTS_SERVICES', label: 'Products and Services', hint: 'What you sell, with prices.' },
  { key: 'TARGET_MARKET', label: 'Target Market', hint: 'Who your customers are and where they are.' },
  { key: 'MARKET_RESEARCH', label: 'Market Research', hint: 'Evidence of demand. Mark what is measured and what is only your estimate.' },
  { key: 'COMPETITOR_ANALYSIS', label: 'Competitor Analysis', hint: 'Who else serves these customers and how you differ.' },
  { key: 'MARKETING_STRATEGY', label: 'Marketing Strategy', hint: 'How customers will find and choose you.' },
  { key: 'OPERATIONS_PLAN', label: 'Operations Plan', hint: 'How the work is done day to day: premises, equipment, suppliers.' },
  { key: 'MANAGEMENT_STRUCTURE', label: 'Management Structure', hint: 'Who does what, with their experience.' },
  { key: 'RISK_ANALYSIS', label: 'Risk Analysis', hint: 'The main risks and what you will do about each.' },
  { key: 'FUNDING_REQUIREMENTS', label: 'Funding Requirements', hint: 'How much you need and what each part will buy.' },
  { key: 'FINANCIAL_PROJECTIONS', label: 'Financial Projections', hint: 'Revenue, costs and cash flow forecast with assumptions.' },
  { key: 'EMPLOYMENT_CREATION', label: 'Employment Creation', hint: 'Jobs created or kept and how you estimated them.' },
  { key: 'COMMUNITY_IMPACT', label: 'Community Impact', hint: 'Who in the community benefits and how.' },
  { key: 'IMPLEMENTATION_TIMELINE', label: 'Implementation Timeline', hint: 'Key steps and dates from funding to full operation.' },
] as const;
export type PlanSectionKey = typeof PLAN_SECTIONS[number]['key'];
export type SectionState = 'EMPTY' | 'IN_PROGRESS' | 'COMPLETE';
/** Length based indicator only: it shows effort, not quality. */
export const SECTION_COMPLETE_MIN_CHARS = 150;
export function sectionState(text: string | undefined | null): SectionState {
  const n = (text ?? '').trim().length; return n === 0 ? 'EMPTY' : n < SECTION_COMPLETE_MIN_CHARS ? 'IN_PROGRESS' : 'COMPLETE';
}
export function planCompletion(sections: Record<string, { text?: string } | undefined>) {
  const states = PLAN_SECTIONS.map(s => sectionState(sections[s.key]?.text));
  const complete = states.filter(s => s === 'COMPLETE').length;
  return { complete, total: PLAN_SECTIONS.length, percent: Math.round((complete / PLAN_SECTIONS.length) * 100), states };
}
