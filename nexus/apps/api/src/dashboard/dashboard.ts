import { Controller, Get, Injectable } from '@nestjs/common';
import { planCompletion } from '@nexus/business-logic';
import { PrismaService } from '../common/prisma.service';
import { AuthUser, CurrentUser } from '../common/auth';
import { profileCompletion } from '../businesses/businesses';

/** Every figure here is a live database query. Nothing is hardcoded. */
@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}
  async get(u: AuthUser) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    const biz = await this.prisma.business.findFirst({ where: { deletedAt: null, owners: { some: { userId: u.id } } }, include: { profile: true }, orderBy: { createdAt: 'asc' } });
    const now = new Date();
    const open = { status: 'OPEN' as const };
    const [activeVerified, activeDemo, savedCount] = await Promise.all([
      this.prisma.fundingProgramme.count({ where: { ...open, verificationStatus: 'VERIFIED' } }),
      this.prisma.fundingProgramme.count({ where: { ...open, verificationStatus: 'DEMONSTRATION' } }),
      this.prisma.savedProgramme.count({ where: { userId: u.id } })]);
    const base = { firstName: user.firstName, activeVerified, activeDemo, savedCount };
    if (!biz) return { ...base, business: null, onboarding: ['Create your business profile to see matching funding opportunities.'] };
    const [matching, apps, readiness, plan, deadlines] = await Promise.all([
      this.prisma.eligibilityAssessment.count({ where: { businessId: biz.id, status: { in: ['MEETS_PUBLISHED_CRITERIA', 'PARTIAL'] }, programme: { status: 'OPEN' } } }),
      this.prisma.application.groupBy({ by: ['status'], where: { businessId: biz.id }, _count: true }),
      this.prisma.readinessAssessment.findFirst({ where: { businessId: biz.id }, orderBy: { createdAt: 'desc' } }),
      this.prisma.businessPlan.findFirst({ where: { businessId: biz.id, deletedAt: null }, orderBy: { updatedAt: 'desc' } }),
      this.prisma.savedProgramme.findMany({ where: { userId: u.id, programme: { closesAt: { gte: now }, status: { not: 'DRAFT' } } }, include: { programme: true }, orderBy: { programme: { closesAt: 'asc' } }, take: 5 })]);
    const count = (s: string) => apps.find(a => a.status === s)?._count ?? 0;
    const planPct = plan ? planCompletion((plan.content as any)?.sections ?? {}).percent : 0;
    const rr: any = readiness?.result;
    const completion = profileCompletion(biz.profile);
    const onboarding: string[] = [];
    if (completion < 100) onboarding.push('Complete your business profile so matching can check more criteria.');
    if (!readiness) onboarding.push('Take the readiness assessment to see what to prepare.');
    if (!plan) onboarding.push('Start a business plan in Business Studio.');
    if (savedCount === 0) onboarding.push('Browse the Funding Directory and save opportunities you want to follow.');
    return { ...base, business: { id: biz.id, name: biz.name, profileCompletion: completion },
      matchingCount: matching, applicationsPreparing: count('PREPARING'), applicationsSubmitted: count('SUBMITTED') + count('UNDER_REVIEW') + count('INFO_REQUESTED'),
      outstandingTasks: rr ? rr.categories.reduce((s: number, c: any) => s + c.missing.length, 0) : null,
      readiness: readiness ? { overall: readiness.overall, completion: rr.completion, takenAt: readiness.createdAt, weakCategories: rr.weakCategories } : null,
      plan: plan ? { id: plan.id, title: plan.title, percent: planPct } : null,
      upcomingDeadlines: deadlines.map(d => ({ programmeId: d.programmeId, name: d.programme.name, closesAt: d.programme.closesAt, verificationStatus: d.programme.verificationStatus })),
      onboarding };
  }
}
@Controller('dashboard')
export class DashboardController {
  constructor(private s: DashboardService) {}
  @Get() get(@CurrentUser() u: AuthUser) { return this.s.get(u); }
}
