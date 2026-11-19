import { BadRequestException, Body, ConflictException, Controller, Get, Injectable, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { IsBoolean, IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PLAN_SECTIONS, planCompletion } from '@nexus/business-logic';
import { PrismaService } from '../common/prisma.service';
import { AccessService } from '../common/access.service';
import { AuditService } from '../common/audit.service';
import { AuthUser, CurrentUser } from '../common/auth';

export class CreatePlanDto { @IsOptional() @IsString() @MinLength(2) @MaxLength(150) title?: string }
export class SectionDto {
  @IsString() @MaxLength(20000) text: string;
  /** The version the editor last saw. A mismatch returns 409 so a newer edit is never overwritten silently. */
  @IsInt() baseVersion: number;
  @IsOptional() @IsBoolean() snapshot?: boolean;
}
const shape = (p: any) => { const sections = (p.content as any)?.sections ?? {};
  return { id: p.id, businessId: p.businessId, title: p.title, version: p.version, updatedAt: p.updatedAt, createdAt: p.createdAt, sections,
    sectionList: PLAN_SECTIONS.map((s, i) => ({ ...s, text: sections[s.key]?.text ?? '', state: planCompletion(sections).states[i] })), completion: planCompletion(sections) }; };

@Injectable()
export class PlansService {
  constructor(private prisma: PrismaService, private access: AccessService, private audit: AuditService) {}
  async create(u: AuthUser, businessId: string, d: CreatePlanDto) {
    const biz = await this.access.business(u.id, businessId);
    const plan = await this.prisma.businessPlan.create({ data: { businessId, title: d.title?.trim() || `${biz.name} business plan`, content: { sections: {} }, createdById: u.id,
      versions: { create: { version: 1, content: { sections: {} }, note: 'Created', createdById: u.id } } } });
    await this.audit.log(u.id, 'plan.create', 'plan', plan.id);
    return shape(plan);
  }
  async list(u: AuthUser, businessId: string) {
    await this.access.business(u.id, businessId);
    return (await this.prisma.businessPlan.findMany({ where: { businessId, deletedAt: null }, orderBy: { createdAt: 'desc' } })).map(shape);
  }
  async get(u: AuthUser, id: string) { return shape(await this.access.plan(u.id, id)); }
  async saveSection(u: AuthUser, id: string, key: string, d: SectionDto) {
    if (!PLAN_SECTIONS.some(s => s.key === key)) throw new BadRequestException('Unknown section.');
    await this.access.plan(u.id, id);
    // Atomic compare and set on the version number.
    const cur = await this.prisma.businessPlan.findUniqueOrThrow({ where: { id } });
    const sections = { ...((cur.content as any)?.sections ?? {}), [key]: { text: d.text, updatedAt: new Date().toISOString(), updatedBy: u.id } };
    const res = await this.prisma.businessPlan.updateMany({ where: { id, version: d.baseVersion }, data: { content: { sections } as any, version: { increment: 1 } } });
    if (res.count === 0) throw new ConflictException('This plan changed since you opened it. Reload to see the newer version before saving.');
    const next = await this.prisma.businessPlan.findUniqueOrThrow({ where: { id } });
    if (d.snapshot) await this.prisma.businessPlanVersion.create({ data: { planId: id, version: next.version, content: next.content as any, note: 'Saved version', createdById: u.id } });
    return shape(next);
  }
  async versions(u: AuthUser, id: string) {
    await this.access.plan(u.id, id);
    return (await this.prisma.businessPlanVersion.findMany({ where: { planId: id }, orderBy: { version: 'desc' }, select: { version: true, note: true, createdAt: true } }));
  }
}
@Controller()
export class PlansController {
  constructor(private s: PlansService) {}
  @Post('businesses/:id/plans') create(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() d: CreatePlanDto) { return this.s.create(u, id, d); }
  @Get('businesses/:id/plans') list(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.s.list(u, id); }
  @Get('plans/:id') get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.s.get(u, id); }
  @Patch('plans/:id/sections/:key') save(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('key') key: string, @Body() d: SectionDto) { return this.s.saveSection(u, id, key, d); }
  @Get('plans/:id/versions') versions(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.s.versions(u, id); }
}
