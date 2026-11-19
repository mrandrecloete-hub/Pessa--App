import { BadRequestException, Body, Controller, Get, Injectable, NotFoundException, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { IsObject } from 'class-validator';
import { matchProgramme, scoreReadiness, validateAnswers, READINESS_CATEGORIES, MatchProfile, MatchProgramme, MatchResult } from '@nexus/business-logic';
import { PrismaService } from '../common/prisma.service';
import { AccessService } from '../common/access.service';
import { AuditService } from '../common/audit.service';
import { AuthUser, CurrentUser } from '../common/auth';

export class ReadinessDto { @IsObject() answers: Record<string, string> }
const n = (d: any) => (d == null ? null : Number(d));

@Injectable()
export class AssessmentsService {
  constructor(private prisma: PrismaService, private access: AccessService, private audit: AuditService) {}
  model() { return READINESS_CATEGORIES; }
  async saveReadiness(u: AuthUser, businessId: string, d: ReadinessDto) {
    await this.access.business(u.id, businessId);
    const errors = validateAnswers(d.answers); if (errors.length) throw new BadRequestException(errors.join('; '));
    const result = scoreReadiness(d.answers as any);
    const row = await this.prisma.readinessAssessment.create({ data: { businessId, modelVersion: result.modelVersion, answers: d.answers as any, overall: result.overall, result: result as any, createdById: u.id } });
    await this.audit.log(u.id, 'readiness.save', 'business', businessId, { overall: result.overall });
    return { id: row.id, createdAt: row.createdAt, answers: d.answers, ...result };
  }
  async latestReadiness(u: AuthUser, businessId: string) {
    await this.access.business(u.id, businessId);
    const row = await this.prisma.readinessAssessment.findFirst({ where: { businessId }, orderBy: { createdAt: 'desc' } });
    return row ? { id: row.id, createdAt: row.createdAt, answers: row.answers, ...(row.result as object) } : null;
  }
  private async profileFor(businessId: string, profile: any): Promise<MatchProfile> {
    const docs = await this.prisma.document.findMany({ where: { businessId, deletedAt: null }, select: { category: true } });
    return { sector: profile?.sector, stage: profile?.stage, region: profile?.region, registrationStatus: profile?.registrationStatus, applicantTypes: profile?.applicantTypes ?? [],
      fundingPurpose: profile?.fundingPurpose, yearsInOperation: profile?.yearsInOperation, employees: profile?.employees, fundingRequiredNad: n(profile?.fundingRequiredNad),
      availableDocumentCategories: docs.map(d => d.category) };
  }
  private toProgramme(p: any): MatchProgramme {
    return { id: p.id, name: p.name, verificationStatus: p.verificationStatus, closingDate: p.closesAt?.toISOString() ?? null,
      criteria: p.criteria.map((c: any) => ({ id: c.id, kind: c.kind, values: c.values, numberValue: n(c.numberValue), mandatory: c.mandatory, description: c.description })),
      requiredDocuments: p.documents.filter((d: any) => d.mandatory).map((d: any) => ({ category: d.category, label: d.label })) };
  }
  private async persist(businessId: string, p: any, r: MatchResult) {
    await this.prisma.eligibilityAssessment.upsert({ where: { businessId_programmeId: { businessId, programmeId: p.id } },
      create: { businessId, programmeId: p.id, programmeVersion: p.version, score: r.score, status: r.status, result: r as any },
      update: { programmeVersion: p.version, score: r.score, status: r.status, result: r as any, computedAt: new Date() } });
  }
  /** Matches are computed from the business profile as it is now and stored as a snapshot for the dashboard. */
  async matches(u: AuthUser, businessId: string) {
    const biz = await this.access.business(u.id, businessId);
    const [profile, programmes] = [await this.profileFor(businessId, biz.profile), await this.prisma.fundingProgramme.findMany({ where: { status: { not: 'DRAFT' } }, include: { criteria: true, documents: true } })];
    const results: any[] = [];
    for (const p of programmes) { const r = matchProgramme(this.toProgramme(p), profile); await this.persist(businessId, p, r);
      results.push({ ...r, institutionName: p.institutionName, verificationStatus: p.verificationStatus, lastVerifiedAt: p.lastVerifiedAt, closesAt: p.closesAt, sourceNote: p.sourceNote, websiteUrl: p.websiteUrl }); }
    results.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
    return results;
  }
  async matchOne(u: AuthUser, businessId: string, programmeId: string) {
    const biz = await this.access.business(u.id, businessId);
    const p = await this.prisma.fundingProgramme.findFirst({ where: { id: programmeId, status: { not: 'DRAFT' } }, include: { criteria: true, documents: true } });
    if (!p) throw new NotFoundException('Funding opportunity not found.');
    const r = matchProgramme(this.toProgramme(p), await this.profileFor(businessId, biz.profile)); await this.persist(businessId, p, r);
    return { ...r, institutionName: p.institutionName, verificationStatus: p.verificationStatus, lastVerifiedAt: p.lastVerifiedAt, closesAt: p.closesAt, sourceNote: p.sourceNote, websiteUrl: p.websiteUrl };
  }
}
@Controller()
export class AssessmentsController {
  constructor(private s: AssessmentsService) {}
  @Get('readiness/model') model() { return this.s.model(); }
  @Post('businesses/:id/readiness') save(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() d: ReadinessDto) { return this.s.saveReadiness(u, id, d); }
  @Get('businesses/:id/readiness/latest') latest(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.s.latestReadiness(u, id); }
  @Get('businesses/:id/matches') matches(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.s.matches(u, id); }
  @Get('businesses/:id/matches/:programmeId') one(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('programmeId', ParseUUIDPipe) pid: string) { return this.s.matchOne(u, id, pid); }
}
