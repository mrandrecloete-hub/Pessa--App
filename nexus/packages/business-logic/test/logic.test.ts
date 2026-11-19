import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreReadiness, validateAnswers, READINESS_CATEGORIES, matchProgramme, evaluateCriterion, MatchProgramme, MatchProfile, REGIONS } from '../src';

const allItems = READINESS_CATEGORIES.flatMap(c => c.items.map(i => i.id));

test('14 regions of Namibia', () => assert.equal(REGIONS.length, 14));
test('readiness weights add to 100', () => assert.equal(READINESS_CATEGORIES.reduce((s, c) => s + c.weight, 0), 100));
test('readiness: nothing answered is 0 overall and 0 completion', () => {
  const r = scoreReadiness({}); assert.equal(r.overall, 0); assert.equal(r.completion, 0); assert.equal(r.weakCategories.length, 6);
});
test('readiness: everything YES is 100', () => {
  const a: any = {}; allItems.forEach(i => (a[i] = 'YES')); const r = scoreReadiness(a);
  assert.equal(r.overall, 100); assert.equal(r.completion, 100); assert.equal(r.nextActions.length, 0);
});
test('readiness: PARTIAL counts half and weights apply', () => {
  const a: any = {}; allItems.forEach(i => (a[i] = 'PARTIAL')); assert.equal(scoreReadiness(a).overall, 50);
  const only: any = {}; READINESS_CATEGORIES[0].items.forEach(i => (only[i.id] = 'YES'));
  assert.equal(scoreReadiness(only).overall, 20);
});
test('readiness: validation rejects unknown items and bad answers', () => {
  assert.deepEqual(validateAnswers({ bp_exec: 'YES' }), []);
  assert.equal(validateAnswers({ nope: 'YES', bp_desc: 'MAYBE' }).length, 2);
});

const profile: MatchProfile = { sector: 'AGRICULTURE', stage: 'START_UP', region: 'Khomas', registrationStatus: 'REGISTERED', applicantTypes: ['YOUTH'],
  fundingPurpose: 'EQUIPMENT', yearsInOperation: 1, employees: 3, fundingRequiredNad: 300000, availableDocumentCategories: ['BUSINESS_REGISTRATION'] };
const prog = (over: Partial<MatchProgramme> = {}): MatchProgramme => ({ id: 'p1', name: 'Demo', verificationStatus: 'DEMONSTRATION', requiredDocuments: [], criteria: [
  { id: 'c1', kind: 'SECTOR', values: ['AGRICULTURE', 'FOOD_PRODUCTION'], mandatory: true },
  { id: 'c2', kind: 'REGION', values: ['ALL'], mandatory: false },
  { id: 'c3', kind: 'MAX_AMOUNT', numberValue: 500000, mandatory: true } ], ...over });

test('match: all criteria met', () => {
  const m = matchProgramme(prog(), profile); assert.equal(m.score, 100); assert.equal(m.status, 'MEETS_PUBLISHED_CRITERIA'); assert.equal(m.met.length, 3);
});
test('match: unmet mandatory criterion is flagged and lowers score', () => {
  const m = matchProgramme(prog(), { ...profile, sector: 'TOURISM' });
  assert.equal(m.status, 'MANDATORY_NOT_MET'); assert.equal(m.unmet[0].kind, 'SECTOR'); assert.equal(m.score, 60); // (1+2)/(2+1+2)
});
test('match: unknown information counts as not met and is listed separately', () => {
  const m = matchProgramme(prog(), { ...profile, fundingRequiredNad: null });
  assert.equal(m.unknown.length, 1); assert.equal(m.status, 'PARTIAL'); assert.equal(m.score, 60);
  assert.ok(m.nextActions.some(a => a.includes('Maximum funding amount')));
});
test('match: all unknown gives no percentage', () => {
  const m = matchProgramme(prog(), { availableDocumentCategories: [] }); assert.equal(m.met.length, 1); // ALL region is met
  const only = matchProgramme(prog({ criteria: [{ id: 'x', kind: 'SECTOR', values: ['AGRICULTURE'], mandatory: true }] }), { availableDocumentCategories: [] });
  assert.equal(only.score, null); assert.equal(only.status, 'INSUFFICIENT_INFORMATION');
});
test('match: unverified programme never gets a percentage', () => {
  const m = matchProgramme(prog({ verificationStatus: 'UNVERIFIED' }), profile); assert.equal(m.score, null); assert.equal(m.status, 'UNVERIFIED');
});
test('match: programme with no criteria gets no percentage', () => {
  const m = matchProgramme(prog({ criteria: [], verificationStatus: 'VERIFIED' }), profile); assert.equal(m.score, null);
});
test('match: missing documents and closing date', () => {
  const m = matchProgramme(prog({ requiredDocuments: [{ category: 'BUSINESS_REGISTRATION', label: 'Registration' }, { category: 'BANK_STATEMENTS', label: 'Bank statements' }], closingDate: '2020-01-01' }), profile, new Date('2026-01-01'));
  assert.deepEqual(m.missingDocuments.map(d => d.category), ['BANK_STATEMENTS']); assert.equal(m.availability, 'CLOSED');
});
test('criterion limits are inclusive and the disclaimer is present', () => {
  assert.equal(evaluateCriterion({ id: 'a', kind: 'MAX_AMOUNT', numberValue: 300000, mandatory: true }, profile).status, 'MET');
  assert.equal(evaluateCriterion({ id: 'a', kind: 'MIN_YEARS', numberValue: 2, mandatory: true }, profile).status, 'UNMET');
  assert.match(matchProgramme(prog(), profile).disclaimer, /not a probability of approval/);
});
