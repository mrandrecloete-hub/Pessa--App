import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/common/password';
const prisma = new PrismaClient();

/**
 * Seed rules (from the product brief):
 *  - Real institutions are created as DRAFT, UNVERIFIED shells with NO invented amounts, dates or rules.
 *    An administrator enters details from the official source and verifies them before publication.
 *  - Demonstration programmes are fictional, clearly labelled, and use verificationStatus DEMONSTRATION.
 */
const SHELLS = [
  { inst: 'NYDF', name: 'NYDF programme record (details to be entered and verified)', note: 'Full institution name to be confirmed from the official source.' },
  { inst: 'Development Bank of Namibia (DBN)', name: 'DBN programme record (details to be entered and verified)' },
  { inst: 'Agricultural Bank of Namibia (Agribank)', name: 'Agribank programme record (details to be entered and verified)' },
  { inst: 'Environmental Investment Fund of Namibia (EIF)', name: 'EIF programme record (details to be entered and verified)' },
  { inst: 'SME Fund Namibia', name: 'SME Fund programme record (details to be entered and verified)' },
];
const DEMO_NOTE = 'DEMONSTRATION RECORD. Fictional programme used to show how matching works. It is not a real funding opportunity.';
const inDays = (d: number) => new Date(Date.now() + d * 864e5);

async function main() {
  const dup = await prisma.fundingProgramme.count({ where: { name: { startsWith: 'DEMO:' } } });
  if (dup === 0) {
    for (const s of SHELLS) await prisma.fundingProgramme.create({ data: { name: s.name, institutionName: s.inst, category: 'To be set', description: 'No programme details have been verified yet. This record is hidden from applicants until an administrator enters details from the official source and verifies them.', sourceNote: s.note, status: 'DRAFT', verificationStatus: 'UNVERIFIED' } });
    const demos = [
      { name: 'DEMO: Youth Start-up Equipment Fund', cat: 'Youth enterprise funding', desc: 'Demonstration programme for young entrepreneurs buying equipment.', min: 20000, max: 250000, close: 60,
        criteria: [{ kind: 'APPLICANT_TYPE', values: ['YOUTH'], mandatory: true }, { kind: 'STAGE', values: ['IDEA', 'START_UP', 'EARLY_TRADING'], mandatory: true }, { kind: 'FUNDING_PURPOSE', values: ['EQUIPMENT', 'START_UP_CAPITAL'], mandatory: false }, { kind: 'MAX_AMOUNT', numberValue: 250000, mandatory: true }, { kind: 'REGION', values: ['ALL'], mandatory: false }],
        docs: [['IDENTIFICATION', 'Identification of the applicant'], ['BUSINESS_PLAN', 'Business plan'], ['SUPPLIER_QUOTATIONS', 'Supplier quotations']] },
      { name: 'DEMO: Agriculture Growth Scheme', cat: 'Agricultural financing', desc: 'Demonstration programme for registered farming and food businesses.', min: 100000, max: 2000000, close: 30,
        criteria: [{ kind: 'SECTOR', values: ['AGRICULTURE', 'FOOD_PRODUCTION'], mandatory: true }, { kind: 'REGISTRATION', values: ['REGISTERED'], mandatory: true }, { kind: 'MIN_YEARS', numberValue: 1, mandatory: false }, { kind: 'MIN_AMOUNT', numberValue: 100000, mandatory: true }, { kind: 'MAX_AMOUNT', numberValue: 2000000, mandatory: true }],
        docs: [['BUSINESS_REGISTRATION', 'Business registration'], ['FINANCIAL_STATEMENTS', 'Financial statements'], ['BANK_STATEMENTS', 'Bank statements']] },
      { name: 'DEMO: Green Business Innovation Grant', cat: 'Green business financing', desc: 'Demonstration programme for renewable energy and waste management ideas.', min: 50000, max: 500000, close: 90,
        criteria: [{ kind: 'SECTOR', values: ['RENEWABLE_ENERGY', 'GREEN_BUSINESS', 'WASTE_MANAGEMENT'], mandatory: true }, { kind: 'REGION', values: ['Khomas', 'Erongo', 'Oshana'], mandatory: false }, { kind: 'MAX_EMPLOYEES', numberValue: 50, mandatory: false }],
        docs: [['BUSINESS_PLAN', 'Business plan'], ['PROJECT_PROPOSAL', 'Project proposal']] },
    ];
    for (const d of demos) await prisma.fundingProgramme.create({ data: { name: d.name, institutionName: 'Demonstration Institution (fictional)', category: d.cat, description: d.desc, amountMinNad: d.min, amountMaxNad: d.max, opensAt: inDays(-10), closesAt: inDays(d.close),
      applicationMethod: 'Demonstration only: there is nothing to apply for.', sourceNote: DEMO_NOTE, status: 'OPEN', verificationStatus: 'DEMONSTRATION',
      criteria: { create: d.criteria.map((c: any) => ({ kind: c.kind, values: c.values ?? [], numberValue: c.numberValue, mandatory: c.mandatory })) },
      documents: { create: d.docs.map(([category, label]) => ({ category, label })) } } });
    console.log('Seeded 5 draft institution records and 3 demonstration programmes.');
  } else console.log('Programmes already seeded.');
  const email = process.env.SEED_ADMIN_EMAIL?.toLowerCase(), pw = process.env.SEED_ADMIN_PASSWORD;
  if (email && pw) {
    if (pw.length < 12) throw new Error('SEED_ADMIN_PASSWORD must be at least 12 characters');
    const u = await prisma.user.upsert({ where: { email }, update: {}, create: { email, passwordHash: await hashPassword(pw), firstName: 'National', lastName: 'Administrator', profile: { create: {} } } });
    if (!(await prisma.userRole.findFirst({ where: { userId: u.id, role: 'NATIONAL_ADMIN', revokedAt: null } }))) await prisma.userRole.create({ data: { userId: u.id, role: 'NATIONAL_ADMIN' } });
    console.log('National administrator ready:', email);
  }
}
main().finally(() => prisma.$disconnect());
