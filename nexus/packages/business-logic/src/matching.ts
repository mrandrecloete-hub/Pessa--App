/**
 * Funding match engine. Compares a business profile with the PUBLISHED criteria
 * of a programme. A percentage is only produced when the programme is verified
 * (or clearly marked demonstration) AND has criteria. The percentage means
 * "share of published criteria met" and is NOT a probability of approval.
 * Unknown information counts as not met (conservative) and is listed separately.
 */
import { label } from './taxonomy';
export type CriterionKind = 'SECTOR'|'STAGE'|'REGION'|'REGISTRATION'|'APPLICANT_TYPE'|'FUNDING_PURPOSE'|'MIN_YEARS'|'MAX_YEARS'|'MIN_EMPLOYEES'|'MAX_EMPLOYEES'|'MIN_AMOUNT'|'MAX_AMOUNT';
export interface Criterion { id: string; kind: CriterionKind; values?: string[]; numberValue?: number | null; mandatory: boolean; description?: string | null }
export interface MatchProfile { sector?: string | null; stage?: string | null; region?: string | null; registrationStatus?: string | null;
  applicantTypes?: string[]; fundingPurpose?: string | null; yearsInOperation?: number | null; employees?: number | null;
  fundingRequiredNad?: number | null; availableDocumentCategories: string[] }
export interface MatchProgramme { id: string; name: string; verificationStatus: 'VERIFIED' | 'UNVERIFIED' | 'DEMONSTRATION';
  closingDate?: string | null; criteria: Criterion[]; requiredDocuments: { category: string; label: string }[] }
export type CriterionStatus = 'MET' | 'UNMET' | 'UNKNOWN';
export interface CriterionResult { criterionId: string; kind: CriterionKind; mandatory: boolean; status: CriterionStatus; title: string; explanation: string }
export type MatchStatus = 'MEETS_PUBLISHED_CRITERIA' | 'PARTIAL' | 'MANDATORY_NOT_MET' | 'INSUFFICIENT_INFORMATION' | 'UNVERIFIED';
export interface MatchResult { programmeId: string; programmeName: string; score: number | null; status: MatchStatus; basis: string;
  availability: 'OPEN' | 'CLOSED' | 'UNKNOWN'; met: CriterionResult[]; unmet: CriterionResult[]; unknown: CriterionResult[];
  missingDocuments: { category: string; label: string }[]; nextActions: string[]; disclaimer: string }
export const MATCH_DISCLAIMER = 'This is not a probability of approval. It only shows how your profile compares with the criteria published for this programme. Only the funding institution decides applications.';

const TITLES: Record<CriterionKind, string> = { SECTOR: 'Sector', STAGE: 'Business stage', REGION: 'Region', REGISTRATION: 'Registration', APPLICANT_TYPE: 'Applicant type',
  FUNDING_PURPOSE: 'Funding purpose', MIN_YEARS: 'Minimum years in operation', MAX_YEARS: 'Maximum years in operation', MIN_EMPLOYEES: 'Minimum employees',
  MAX_EMPLOYEES: 'Maximum employees', MIN_AMOUNT: 'Minimum funding amount', MAX_AMOUNT: 'Maximum funding amount' };
const nad = (n: number) => 'N$' + n.toLocaleString('en-ZA', { maximumFractionDigits: 0 });
const list = (v: string[]) => v.map(label).join(', ');
const isBlank = (v: unknown) => v === null || v === undefined || v === '';

export function evaluateCriterion(c: Criterion, p: MatchProfile): CriterionResult {
  const base = { criterionId: c.id, kind: c.kind, mandatory: c.mandatory, title: TITLES[c.kind] };
  const unknown = (what: string): CriterionResult => ({ ...base, status: 'UNKNOWN', explanation: `${what} is not in your profile yet, so this cannot be checked.` });
  const res = (ok: boolean, yes: string, no: string): CriterionResult => ({ ...base, status: ok ? 'MET' : 'UNMET', explanation: ok ? yes : no });
  const vals = c.values ?? [];
  const num = c.numberValue;
  switch (c.kind) {
    case 'SECTOR': case 'STAGE': case 'REGION': case 'REGISTRATION': case 'FUNDING_PURPOSE': {
      const field = { SECTOR: p.sector, STAGE: p.stage, REGION: p.region, REGISTRATION: p.registrationStatus, FUNDING_PURPOSE: p.fundingPurpose }[c.kind];
      const name = TITLES[c.kind].toLowerCase();
      if (vals.length === 0 || vals.includes('ALL')) return res(true, `Open to all (${name}).`, '');
      if (isBlank(field)) return unknown(`Your ${name}`);
      const ok = vals.includes(field as string);
      return res(ok, `Your ${name} (${label(field as string)}) is in the published list: ${list(vals)}.`,
        `Your ${name} (${label(field as string)}) is not in the published list: ${list(vals)}.`);
    }
    case 'APPLICANT_TYPE': {
      if (!p.applicantTypes || p.applicantTypes.length === 0) return unknown('Your applicant type');
      const ok = vals.some(v => p.applicantTypes!.includes(v));
      return res(ok, `You declared an applicant type the programme accepts (${list(vals)}).`, `The programme is for: ${list(vals)}. None of these is declared in your profile.`);
    }
    case 'MIN_YEARS': case 'MAX_YEARS': {
      if (num == null) return unknown('The published limit');
      if (isBlank(p.yearsInOperation)) return unknown('Years in operation');
      const y = p.yearsInOperation as number;
      const ok = c.kind === 'MIN_YEARS' ? y >= num : y <= num;
      return res(ok, `${y} years in operation fits the published limit (${c.kind === 'MIN_YEARS' ? 'at least' : 'at most'} ${num}).`,
        `${y} years in operation is outside the published limit (${c.kind === 'MIN_YEARS' ? 'at least' : 'at most'} ${num}).`);
    }
    case 'MIN_EMPLOYEES': case 'MAX_EMPLOYEES': {
      if (num == null) return unknown('The published limit');
      if (isBlank(p.employees)) return unknown('Number of employees');
      const e = p.employees as number;
      const ok = c.kind === 'MIN_EMPLOYEES' ? e >= num : e <= num;
      return res(ok, `${e} employees fits the published limit (${c.kind === 'MIN_EMPLOYEES' ? 'at least' : 'at most'} ${num}).`,
        `${e} employees is outside the published limit (${c.kind === 'MIN_EMPLOYEES' ? 'at least' : 'at most'} ${num}).`);
    }
    case 'MIN_AMOUNT': case 'MAX_AMOUNT': {
      if (num == null) return unknown('The published amount');
      if (isBlank(p.fundingRequiredNad)) return unknown('Your funding requirement');
      const a = p.fundingRequiredNad as number;
      const ok = c.kind === 'MIN_AMOUNT' ? a >= num : a <= num;
      return res(ok, `Your request of ${nad(a)} fits the published ${c.kind === 'MIN_AMOUNT' ? 'minimum' : 'maximum'} of ${nad(num)}.`,
        `Your request of ${nad(a)} is ${c.kind === 'MIN_AMOUNT' ? 'below the published minimum' : 'above the published maximum'} of ${nad(num)}.`);
    }
  }
}

export function matchProgramme(programme: MatchProgramme, profile: MatchProfile, now: Date = new Date()): MatchResult {
  const availability: MatchResult['availability'] = !programme.closingDate ? 'UNKNOWN' : new Date(programme.closingDate) < now ? 'CLOSED' : 'OPEN';
  const have = new Set(profile.availableDocumentCategories);
  const missingDocuments = programme.requiredDocuments.filter(d => !have.has(d.category));
  const empty = { met: [], unmet: [], unknown: [] as CriterionResult[] };
  const common = { programmeId: programme.id, programmeName: programme.name, availability, missingDocuments, disclaimer: MATCH_DISCLAIMER };
  if (programme.verificationStatus === 'UNVERIFIED') {
    return { ...common, ...empty, score: null, status: 'UNVERIFIED', basis: 'The criteria for this programme have not been verified against an official source, so no match is shown. Check the institution directly.',
      nextActions: ['Contact the funding institution or open its official website to confirm the current criteria.'] };
  }
  if (programme.criteria.length === 0) {
    return { ...common, ...empty, score: null, status: 'INSUFFICIENT_INFORMATION', basis: 'No published criteria are recorded for this programme yet.', nextActions: ['Check the official programme source for eligibility rules.'] };
  }
  const results = programme.criteria.map(c => evaluateCriterion(c, profile));
  const met = results.filter(r => r.status === 'MET'), unmet = results.filter(r => r.status === 'UNMET'), unknown = results.filter(r => r.status === 'UNKNOWN');
  const w = (r: CriterionResult) => (r.mandatory ? 2 : 1);
  const total = results.reduce((s, r) => s + w(r), 0);
  const metW = met.reduce((s, r) => s + w(r), 0);
  const score = met.length + unmet.length === 0 ? null : Math.round((metW / total) * 100);
  let status: MatchStatus;
  if (met.length + unmet.length === 0) status = 'INSUFFICIENT_INFORMATION';
  else if (unmet.some(r => r.mandatory)) status = 'MANDATORY_NOT_MET';
  else if (unmet.length || unknown.length) status = 'PARTIAL';
  else status = 'MEETS_PUBLISHED_CRITERIA';
  const nextActions: string[] = [];
  for (const r of unmet.filter(r => r.mandatory)) nextActions.push(`Mandatory criterion not met: ${r.title}. ${r.explanation}`);
  for (const r of unknown) nextActions.push(`Complete your profile: ${r.title}.`);
  for (const d of missingDocuments) nextActions.push(`Add a document: ${d.label}.`);
  if (availability === 'CLOSED') nextActions.push('The published closing date has passed. Check the official source for the next intake.');
  if (programme.verificationStatus === 'DEMONSTRATION') nextActions.push('This is a demonstration programme used to show how matching works. It is not a real funding opportunity.');
  return { ...common, score, status, met, unmet, unknown, nextActions,
    basis: `${met.length} of ${results.length} published criteria met (mandatory criteria count double; unknown information counts as not met).` };
}
