/**
 * On-device backend. When the app is built with NEXT_PUBLIC_LOCAL=1 every call the screens make to /api/v1
 * is answered here from localStorage, using the same matching, readiness and plan logic as the server.
 * Nothing leaves the phone. Data is lost if the app is uninstalled or site data is cleared: use Backup.
 */
import { matchProgramme, scoreReadiness, validateAnswers, READINESS_CATEGORIES, PLAN_SECTIONS, planCompletion, MatchProfile, MatchProgramme } from '@nexus/business-logic';
import { ApiError } from './errors';

export const LOCAL = process.env.NEXT_PUBLIC_LOCAL === '1';
const KEY = 'nexus.local.v1';
const uid = () => (typeof globalThis.crypto?.randomUUID === 'function' ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36));
const iso = (d: Date) => d.toISOString();
const inDays = (n: number) => iso(new Date(Date.now() + n * 864e5));
const DEMO_NOTE = 'DEMONSTRATION RECORD. Fictional programme used to show how matching works. It is not a real funding opportunity.';

interface Store { business: any | null; readiness: any[]; plans: any[]; planVersions: any[]; saved: string[]; programmes: any[] }
function seedProgrammes() {
  const mk = (id: string, name: string, category: string, description: string, min: number, max: number, close: number, criteria: any[], docs: [string, string][]) => ({
    id, name, institutionName: 'Demonstration Institution (fictional)', category, description, purpose: null, amountMinNad: min, amountMaxNad: max, opensAt: inDays(-10), closesAt: inDays(close),
    applicationMethod: 'Demonstration only: there is nothing to apply for.', websiteUrl: null, contactDetails: null, sourceNote: DEMO_NOTE, status: 'OPEN', verificationStatus: 'DEMONSTRATION', lastVerifiedAt: null, version: 1,
    criteria: criteria.map((c, i) => ({ id: id + '-c' + i, values: [], numberValue: null, ...c })), documents: docs.map(([category, label], i) => ({ id: id + '-d' + i, category, label, mandatory: true })) });
  return [
    mk('demo-youth', 'DEMO: Youth Start-up Equipment Fund', 'Youth enterprise funding', 'Demonstration programme for young entrepreneurs buying equipment.', 20000, 250000, 60,
      [{ kind: 'APPLICANT_TYPE', values: ['YOUTH'], mandatory: true }, { kind: 'STAGE', values: ['IDEA', 'START_UP', 'EARLY_TRADING'], mandatory: true }, { kind: 'FUNDING_PURPOSE', values: ['EQUIPMENT', 'START_UP_CAPITAL'], mandatory: false }, { kind: 'MAX_AMOUNT', numberValue: 250000, mandatory: true }, { kind: 'REGION', values: ['ALL'], mandatory: false }],
      [['IDENTIFICATION', 'Identification of the applicant'], ['BUSINESS_PLAN', 'Business plan'], ['SUPPLIER_QUOTATIONS', 'Supplier quotations']]),
    mk('demo-agri', 'DEMO: Agriculture Growth Scheme', 'Agricultural financing', 'Demonstration programme for registered farming and food businesses.', 100000, 2000000, 30,
      [{ kind: 'SECTOR', values: ['AGRICULTURE', 'FOOD_PRODUCTION'], mandatory: true }, { kind: 'REGISTRATION', values: ['REGISTERED'], mandatory: true }, { kind: 'MIN_YEARS', numberValue: 1, mandatory: false }, { kind: 'MIN_AMOUNT', numberValue: 100000, mandatory: true }, { kind: 'MAX_AMOUNT', numberValue: 2000000, mandatory: true }],
      [['BUSINESS_REGISTRATION', 'Business registration'], ['FINANCIAL_STATEMENTS', 'Financial statements'], ['BANK_STATEMENTS', 'Bank statements']]),
    mk('demo-green', 'DEMO: Green Business Innovation Grant', 'Green business financing', 'Demonstration programme for renewable energy and waste management ideas.', 50000, 500000, 90,
      [{ kind: 'SECTOR', values: ['RENEWABLE_ENERGY', 'GREEN_BUSINESS', 'WASTE_MANAGEMENT'], mandatory: true }, { kind: 'REGION', values: ['Khomas', 'Erongo', 'Oshana'], mandatory: false }, { kind: 'MAX_EMPLOYEES', numberValue: 50, mandatory: false }],
      [['BUSINESS_PLAN', 'Business plan'], ['PROJECT_PROPOSAL', 'Project proposal']]),
  ];
}
function load(): Store {
  try { const raw = localStorage.getItem(KEY); if (raw) return JSON.parse(raw); } catch { /* fall through to a fresh store */ }
  const s: Store = { business: null, readiness: [], plans: [], planVersions: [], saved: [], programmes: seedProgrammes() }; save(s, true); return s;
}
const DIRTY = 'nexus.local.dirty';
let changeHook: (() => void) | null = null;
export const setChangeHook = (fn: (() => void) | null) => { changeHook = fn; };
export const isDirty = () => { try { return localStorage.getItem(DIRTY) === '1'; } catch { return false; } };
export const markClean = () => { try { localStorage.removeItem(DIRTY); } catch { /* ignore */ } };
function save(s: Store, quiet = false) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); if (!quiet) localStorage.setItem(DIRTY, '1'); } catch { throw new ApiError(507, 'This device could not save your data (storage is full or blocked).'); }
  if (!quiet) changeHook?.();
}
function shapeOk(o: any) { return o?.app === 'nexus-namibia-local' && o.data && Array.isArray(o.data.programmes) && Array.isArray(o.data.plans); }
/** Replace this device's data with a copy from the cloud. Not counted as an unsynced change. */
export function applyCloud(o: any) { if (!shapeOk(o)) throw new ApiError(400, 'The cloud copy is not a NEXUS backup.'); save(o.data as Store, true); markClean(); }
export const exportObject = () => ({ app: 'nexus-namibia-local', version: 1, exportedAt: iso(new Date()), data: load() });
export const exportBackup = () => JSON.stringify({ app: 'nexus-namibia-local', version: 1, exportedAt: iso(new Date()), data: load() });
export function importBackup(text: string) {
  let o: any; try { o = JSON.parse(text); } catch { throw new ApiError(400, 'That is not a NEXUS backup.'); }
  if (o?.app !== 'nexus-namibia-local' || !o.data || !Array.isArray(o.data.programmes) || !Array.isArray(o.data.plans)) throw new ApiError(400, 'That is not a NEXUS backup.');
  save(o.data as Store);
}
export function wipeLocal() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }

const FIELDS = ['sector', 'stage', 'region', 'registrationStatus', 'yearsInOperation', 'employees', 'activity', 'fundingPurpose', 'fundingRequiredNad', 'intendedImpact'];
const completion = (p: any) => !p ? 0 : Math.round(((FIELDS.filter(f => p[f] !== null && p[f] !== undefined && p[f] !== '').length + (p.applicantTypes?.length ? 1 : 0)) / (FIELDS.length + 1)) * 100);
const shapeBiz = (b: any) => b && ({ id: b.id, name: b.name, createdAt: b.createdAt, profile: b.profile, profileCompletion: completion(b.profile) });
const requireBiz = (s: Store, id: string) => { if (!s.business || s.business.id !== id) throw new ApiError(404, 'Business not found.'); return s.business; };
const clean = (o: any) => Object.fromEntries(Object.entries(o ?? {}).filter(([, v]) => v !== undefined && v !== ''));
const fullProfile = (p: any) => ({ sector: null, stage: null, region: null, town: null, registrationStatus: null, yearsInOperation: null, employees: null, activity: null, fundingPurpose: null, fundingRequiredNad: null, availableCapitalNad: null, intendedImpact: null, applicantTypes: [], ...clean(p) });

const listShape = (p: any, saved: Set<string>) => ({ ...p, criteria: undefined, documents: undefined, saved: saved.has(p.id) });
const toMatch = (p: any): MatchProgramme => ({ id: p.id, name: p.name, verificationStatus: p.verificationStatus, closingDate: p.closesAt ?? null, criteria: p.criteria, requiredDocuments: p.documents.filter((d: any) => d.mandatory).map((d: any) => ({ category: d.category, label: d.label })) });
const profileFor = (b: any): MatchProfile => ({ sector: b.profile?.sector, stage: b.profile?.stage, region: b.profile?.region, registrationStatus: b.profile?.registrationStatus, applicantTypes: b.profile?.applicantTypes ?? [],
  fundingPurpose: b.profile?.fundingPurpose, yearsInOperation: b.profile?.yearsInOperation, employees: b.profile?.employees, fundingRequiredNad: b.profile?.fundingRequiredNad, availableDocumentCategories: [] });
const matchOf = (p: any, b: any) => ({ ...matchProgramme(toMatch(p), profileFor(b)), institutionName: p.institutionName, verificationStatus: p.verificationStatus, lastVerifiedAt: p.lastVerifiedAt, closesAt: p.closesAt, sourceNote: p.sourceNote, websiteUrl: p.websiteUrl });
const shapePlan = (p: any) => { const c = planCompletion(p.sections); return { id: p.id, businessId: p.businessId, title: p.title, version: p.version, updatedAt: p.updatedAt, createdAt: p.createdAt, sections: p.sections,
  sectionList: PLAN_SECTIONS.map((s, i) => ({ ...s, text: p.sections[s.key]?.text ?? '', state: c.states[i] })), completion: c }; };
const visible = (s: Store) => s.programmes.filter(p => p.status !== 'DRAFT');

export async function localApi(method: string, rawPath: string, body: any): Promise<any> {
  const [path, qs] = rawPath.split('?'); const q = new URLSearchParams(qs ?? ''); const s = load(); let m: RegExpMatchArray | null;
  const R = (re: RegExp) => (m = path.match(re));
  if (path === '/auth/me') return { id: 'local', email: '', firstName: 'Entrepreneur', lastName: '', roles: ['CITIZEN'] };
  if (path.startsWith('/auth/')) return { ok: true };
  if (path === '/businesses' && method === 'GET') return s.business ? [shapeBiz(s.business)] : [];
  if (path === '/businesses' && method === 'POST') {
    if (s.business) throw new ApiError(409, 'This device already has a business profile.');
    if (!body?.name || String(body.name).trim().length < 2) throw new ApiError(400, 'Enter the business name.');
    s.business = { id: uid(), name: String(body.name).trim(), createdAt: iso(new Date()), profile: fullProfile(body.profile) }; save(s); return shapeBiz(s.business);
  }
  if (R(/^\/businesses\/([^/]+)$/) && method === 'PUT') { const b = requireBiz(s, m![1]); if (body?.name) b.name = String(body.name).trim(); if (body?.profile) b.profile = { ...b.profile, ...fullProfile(body.profile), applicantTypes: body.profile.applicantTypes ?? b.profile.applicantTypes }; save(s); return shapeBiz(b); }
  if (R(/^\/businesses\/([^/]+)$/)) return shapeBiz(requireBiz(s, m![1]));
  if (path === '/programmes' && method === 'GET') {
    const saved = new Set(s.saved); const needle = (q.get('q') ?? '').toLowerCase(); const sector = q.get('sector'), region = q.get('region'), ver = q.get('verification'), st = q.get('status'), sort = q.get('sort');
    const hit = (p: any, kind: string, v: string) => p.criteria.some((c: any) => c.kind === kind && (c.values.includes(v) || c.values.includes('ALL')));
    let items = visible(s).filter(p => (!needle || [p.name, p.institutionName, p.description ?? ''].some(x => x.toLowerCase().includes(needle))) && (!sector || hit(p, 'SECTOR', sector)) && (!region || hit(p, 'REGION', region)) && (!ver || p.verificationStatus === ver) && (!st || p.status === st));
    items = [...items].sort(sort === 'name' ? (a, b) => a.name.localeCompare(b.name) : sort === 'newest' ? (a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '') : (a, b) => (a.closesAt ?? '9').localeCompare(b.closesAt ?? '9'));
    return { total: items.length, page: 1, pageSize: items.length, items: items.map(p => listShape(p, saved)) };
  }
  if (path === '/programmes' && method === 'POST') {
    // On this device the owner maintains the directory. Verified only with an official website AND a source note.
    const b = body ?? {}; if (!b.name || !b.institutionName) throw new ApiError(400, 'Enter the programme name and the institution.');
    const checked = !!b.verifiedByMe; if (checked && (!b.websiteUrl || !b.sourceNote)) throw new ApiError(400, 'To mark this as verified, enter the official website and a source note.');
    const p = { id: uid(), name: String(b.name).trim(), institutionName: String(b.institutionName).trim(), category: b.category || 'Other', description: b.description || null, purpose: null, amountMinNad: b.amountMinNad ?? null, amountMaxNad: b.amountMaxNad ?? null,
      opensAt: null, closesAt: b.closesAt || null, applicationMethod: b.applicationMethod || null, websiteUrl: b.websiteUrl || null, contactDetails: null, sourceNote: b.sourceNote ? (checked ? 'Checked by you on this device: ' : '') + b.sourceNote : null,
      status: 'OPEN', verificationStatus: checked ? 'VERIFIED' : 'UNVERIFIED', lastVerifiedAt: checked ? iso(new Date()) : null, version: 1, createdAt: iso(new Date()),
      criteria: (b.criteria ?? []).map((c: any) => ({ id: uid(), values: [], numberValue: null, mandatory: true, ...c })), documents: (b.documents ?? []).map((d: any) => ({ id: uid(), mandatory: true, ...d })) };
    s.programmes.push(p); save(s); return p;
  }
  if (R(/^\/programmes\/([^/]+)\/save$/)) { const id = m![1]; if (!s.programmes.some(p => p.id === id)) throw new ApiError(404, 'Funding opportunity not found.');
    s.saved = method === 'DELETE' ? s.saved.filter(x => x !== id) : Array.from(new Set([...s.saved, id])); save(s); return { saved: method !== 'DELETE' }; }
  if (R(/^\/programmes\/([^/]+)$/) && method === 'DELETE') { const id = m![1]; const p = s.programmes.find(x => x.id === id); if (!p || p.verificationStatus === 'DEMONSTRATION') throw new ApiError(400, 'Demonstration records cannot be removed.'); s.programmes = s.programmes.filter(x => x.id !== id); s.saved = s.saved.filter(x => x !== id); save(s); return { ok: true }; }
  if (R(/^\/programmes\/([^/]+)$/)) { const p = visible(s).find(x => x.id === m![1]); if (!p) throw new ApiError(404, 'Funding opportunity not found.'); return { ...p, saved: s.saved.includes(p.id) }; }
  if (path === '/me/saved-programmes') return visible(s).filter(p => s.saved.includes(p.id)).map(p => listShape(p, new Set(s.saved)));
  if (path === '/readiness/model') return READINESS_CATEGORIES;
  if (R(/^\/businesses\/([^/]+)\/readiness$/) && method === 'POST') {
    requireBiz(s, m![1]); const errs = validateAnswers(body?.answers ?? {}); if (errs.length) throw new ApiError(400, errs.join('; '));
    const result = scoreReadiness(body.answers); const row = { id: uid(), createdAt: iso(new Date()), answers: body.answers, ...result }; s.readiness.push(row); save(s); return row;
  }
  if (R(/^\/businesses\/([^/]+)\/readiness\/latest$/)) { requireBiz(s, m![1]); return s.readiness[s.readiness.length - 1] ?? null; }
  if (R(/^\/businesses\/([^/]+)\/matches\/([^/]+)$/)) { const b = requireBiz(s, m![1]); const p = visible(s).find(x => x.id === m![2]); if (!p) throw new ApiError(404, 'Funding opportunity not found.'); return matchOf(p, b); }
  if (R(/^\/businesses\/([^/]+)\/matches$/)) { const b = requireBiz(s, m![1]); return visible(s).map(p => matchOf(p, b)).sort((a, c) => (c.score ?? -1) - (a.score ?? -1)); }
  if (R(/^\/businesses\/([^/]+)\/plans$/) && method === 'POST') {
    const b = requireBiz(s, m![1]); const now = iso(new Date());
    const plan = { id: uid(), businessId: b.id, title: body?.title?.trim() || `${b.name} business plan`, version: 1, sections: {}, createdAt: now, updatedAt: now };
    s.plans.push(plan); s.planVersions.push({ planId: plan.id, version: 1, note: 'Created', createdAt: now }); save(s); return shapePlan(plan);
  }
  if (R(/^\/businesses\/([^/]+)\/plans$/)) { requireBiz(s, m![1]); return s.plans.map(shapePlan).reverse(); }
  if (R(/^\/plans\/([^/]+)\/sections\/([^/]+)$/) && method === 'PATCH') {
    const plan = s.plans.find(p => p.id === m![1]); if (!plan) throw new ApiError(404, 'Business plan not found.');
    if (!PLAN_SECTIONS.some(x => x.key === m![2])) throw new ApiError(400, 'Unknown section.');
    if (body.baseVersion !== plan.version) throw new ApiError(409, 'This plan changed since you opened it. Reload to see the newer version before saving.');
    plan.sections[m![2]] = { text: String(body.text ?? '').slice(0, 20000), updatedAt: iso(new Date()) }; plan.version += 1; plan.updatedAt = iso(new Date());
    if (body.snapshot) s.planVersions.push({ planId: plan.id, version: plan.version, note: 'Saved version', createdAt: plan.updatedAt }); save(s); return shapePlan(plan);
  }
  if (R(/^\/plans\/([^/]+)\/versions$/)) return s.planVersions.filter(v => v.planId === m![1]).reverse();
  if (R(/^\/plans\/([^/]+)$/)) { const plan = s.plans.find(p => p.id === m![1]); if (!plan) throw new ApiError(404, 'Business plan not found.'); return shapePlan(plan); }
  if (path === '/dashboard') {
    const activeVerified = s.programmes.filter(p => p.status === 'OPEN' && p.verificationStatus === 'VERIFIED').length, activeDemo = s.programmes.filter(p => p.status === 'OPEN' && p.verificationStatus === 'DEMONSTRATION').length;
    const base = { firstName: 'Entrepreneur', activeVerified, activeDemo, savedCount: s.saved.length };
    const b = s.business; if (!b) return { ...base, business: null, onboarding: ['Create your business profile to see matching funding opportunities.'] };
    const matching = visible(s).filter(p => p.status === 'OPEN').map(p => matchOf(p, b)).filter(r => r.status === 'MEETS_PUBLISHED_CRITERIA' || r.status === 'PARTIAL').length;
    const rd = s.readiness[s.readiness.length - 1]; const plan = [...s.plans].sort((a, c) => c.updatedAt.localeCompare(a.updatedAt))[0]; const comp = completion(b.profile);
    const onboarding: string[] = []; if (comp < 100) onboarding.push('Complete your business profile so matching can check more criteria.'); if (!rd) onboarding.push('Take the readiness assessment to see what to prepare.');
    if (!plan) onboarding.push('Start a business plan in Business Studio.'); if (s.saved.length === 0) onboarding.push('Browse the Funding Directory and save opportunities you want to follow.');
    const now = Date.now();
    return { ...base, business: { id: b.id, name: b.name, profileCompletion: comp }, matchingCount: matching, applicationsPreparing: 0, applicationsSubmitted: 0,
      outstandingTasks: rd ? rd.categories.reduce((n: number, c: any) => n + c.missing.length, 0) : null,
      readiness: rd ? { overall: rd.overall, completion: rd.completion, takenAt: rd.createdAt, weakCategories: rd.weakCategories } : null,
      plan: plan ? { id: plan.id, title: plan.title, percent: planCompletion(plan.sections).percent } : null,
      upcomingDeadlines: visible(s).filter(p => s.saved.includes(p.id) && p.closesAt && new Date(p.closesAt).getTime() >= now).sort((a, c) => a.closesAt.localeCompare(c.closesAt)).slice(0, 5).map(p => ({ programmeId: p.id, name: p.name, closesAt: p.closesAt, verificationStatus: p.verificationStatus })), onboarding };
  }
  throw new ApiError(404, 'Not available on this device.');
}
