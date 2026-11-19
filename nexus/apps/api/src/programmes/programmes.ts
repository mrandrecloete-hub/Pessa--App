import { BadRequestException, Body, Controller, Delete, Get, Injectable, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsNumber, IsOptional, IsString, IsUrl, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { PartialType } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { ADMIN_ROLES, AuthUser, CurrentUser, Roles } from '../common/auth';

const KINDS = ['SECTOR','STAGE','REGION','REGISTRATION','APPLICANT_TYPE','FUNDING_PURPOSE','MIN_YEARS','MAX_YEARS','MIN_EMPLOYEES','MAX_EMPLOYEES','MIN_AMOUNT','MAX_AMOUNT'];
export class CriterionDto {
  @IsIn(KINDS) kind: string;
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) values?: string[];
  @IsOptional() @IsNumber() numberValue?: number;
  @IsBoolean() mandatory: boolean;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
}
export class DocDto { @IsString() @MaxLength(60) category: string; @IsString() @MaxLength(200) label: string; @IsOptional() @IsBoolean() mandatory?: boolean }
export class ProgrammeDto {
  @IsString() @MinLength(3) @MaxLength(200) name: string;
  @IsString() @MinLength(2) @MaxLength(200) institutionName: string;
  @IsString() @MaxLength(80) category: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string;
  @IsOptional() @IsString() @MaxLength(1000) purpose?: string;
  @IsOptional() @IsNumber() @Min(0) amountMinNad?: number;
  @IsOptional() @IsNumber() @Min(0) amountMaxNad?: number;
  @IsOptional() @IsDateString() opensAt?: string;
  @IsOptional() @IsDateString() closesAt?: string;
  @IsOptional() @IsString() @MaxLength(500) applicationMethod?: string;
  @IsOptional() @IsUrl({ require_protocol: true, protocols: ['https', 'http'] }) websiteUrl?: string;
  @IsOptional() @IsString() @MaxLength(500) contactDetails?: string;
  @IsOptional() @IsString() @MaxLength(1000) sourceNote?: string;
  @IsOptional() @IsIn(['DRAFT','UPCOMING','OPEN','CLOSED','SUSPENDED']) status?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => CriterionDto) criteria?: CriterionDto[];
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => DocDto) documents?: DocDto[];
}
export class UpdateProgrammeDto extends PartialType(ProgrammeDto) {}
export class ListQuery {
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() sector?: string;
  @IsOptional() @IsString() region?: string;
  @IsOptional() @IsIn(['UPCOMING','OPEN','CLOSED','SUSPENDED','DRAFT']) status?: string;
  @IsOptional() @IsIn(['VERIFIED','UNVERIFIED','DEMONSTRATION']) verification?: string;
  @IsOptional() @IsDateString() closingBefore?: string;
  @IsOptional() @IsIn(['closing','name','newest']) sort?: string;
  @IsOptional() page?: string; @IsOptional() pageSize?: string;
}
const num = (d: any) => (d == null ? null : Number(d));
export const shapeProgramme = (p: any, saved?: Set<string>) => ({
  id: p.id, name: p.name, institutionName: p.institutionName, category: p.category, description: p.description, purpose: p.purpose,
  amountMinNad: num(p.amountMinNad), amountMaxNad: num(p.amountMaxNad), opensAt: p.opensAt, closesAt: p.closesAt, applicationMethod: p.applicationMethod,
  websiteUrl: p.websiteUrl, contactDetails: p.contactDetails, sourceNote: p.sourceNote, status: p.status, verificationStatus: p.verificationStatus,
  lastVerifiedAt: p.lastVerifiedAt, version: p.version, saved: saved ? saved.has(p.id) : undefined,
  criteria: p.criteria?.map((c: any) => ({ id: c.id, kind: c.kind, values: c.values, numberValue: num(c.numberValue), mandatory: c.mandatory, description: c.description })),
  documents: p.documents?.map((d: any) => ({ id: d.id, category: d.category, label: d.label, mandatory: d.mandatory })),
});
const isAdmin = (u: AuthUser) => u.roles.some(r => ADMIN_ROLES.includes(r));

@Injectable()
export class ProgrammesService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}
  async list(u: AuthUser, q: ListQuery) {
    const page = Math.max(1, parseInt(q.page ?? '1') || 1), size = Math.min(50, Math.max(1, parseInt(q.pageSize ?? '20') || 20));
    const where: Prisma.FundingProgrammeWhereInput = { AND: [
      isAdmin(u) ? {} : { status: { not: 'DRAFT' } },
      q.status ? { status: q.status as any } : {}, q.verification ? { verificationStatus: q.verification as any } : {}, q.category ? { category: q.category } : {},
      q.q ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { institutionName: { contains: q.q, mode: 'insensitive' } }, { description: { contains: q.q, mode: 'insensitive' } }] } : {},
      q.sector ? { criteria: { some: { kind: 'SECTOR', OR: [{ values: { has: q.sector } }, { values: { has: 'ALL' } }] } } } : {},
      q.region ? { criteria: { some: { kind: 'REGION', OR: [{ values: { has: q.region } }, { values: { has: 'ALL' } }] } } } : {},
      q.closingBefore ? { closesAt: { lte: new Date(q.closingBefore), gte: new Date() } } : {} ] };
    const orderBy: Prisma.FundingProgrammeOrderByWithRelationInput = q.sort === 'name' ? { name: 'asc' } : q.sort === 'newest' ? { createdAt: 'desc' } : { closesAt: { sort: 'asc', nulls: 'last' } };
    const [total, rows, saved] = await Promise.all([this.prisma.fundingProgramme.count({ where }),
      this.prisma.fundingProgramme.findMany({ where, orderBy, skip: (page - 1) * size, take: size }),
      this.prisma.savedProgramme.findMany({ where: { userId: u.id }, select: { programmeId: true } })]);
    const set = new Set(saved.map(s => s.programmeId));
    return { total, page, pageSize: size, items: rows.map(r => shapeProgramme(r, set)) };
  }
  async get(u: AuthUser, id: string) {
    const p = await this.prisma.fundingProgramme.findFirst({ where: { id, ...(isAdmin(u) ? {} : { status: { not: 'DRAFT' } }) }, include: { criteria: true, documents: true } });
    if (!p) throw new NotFoundException('Funding opportunity not found.');
    const s = await this.prisma.savedProgramme.findUnique({ where: { userId_programmeId: { userId: u.id, programmeId: id } } });
    return shapeProgramme(p, new Set(s ? [id] : []));
  }
  private data(d: Partial<ProgrammeDto>) {
    const { criteria, documents, opensAt, closesAt, ...rest } = d;
    return { ...rest, status: rest.status as any, opensAt: opensAt ? new Date(opensAt) : undefined, closesAt: closesAt ? new Date(closesAt) : undefined };
  }
  async create(u: AuthUser, d: ProgrammeDto) {
    const p = await this.prisma.fundingProgramme.create({ data: { ...(this.data(d) as any), status: (d.status as any) ?? 'DRAFT', verificationStatus: 'UNVERIFIED', createdById: u.id,
      criteria: { create: (d.criteria ?? []).map(c => ({ kind: c.kind as any, values: c.values ?? [], numberValue: c.numberValue, mandatory: c.mandatory, description: c.description })) },
      documents: { create: (d.documents ?? []).map(x => ({ category: x.category, label: x.label, mandatory: x.mandatory ?? true })) } }, include: { criteria: true, documents: true } });
    await this.audit.log(u.id, 'programme.create', 'programme', p.id);
    return shapeProgramme(p);
  }
  /** Editing published facts resets verification: changed information must be checked against the official source again. */
  async update(u: AuthUser, id: string, d: UpdateProgrammeDto) {
    const cur = await this.prisma.fundingProgramme.findUnique({ where: { id } }); if (!cur) throw new NotFoundException('Funding opportunity not found.');
    const p = await this.prisma.$transaction(async tx => {
      if (d.criteria) await tx.fundingCriterion.deleteMany({ where: { programmeId: id } });
      if (d.documents) await tx.programmeDocument.deleteMany({ where: { programmeId: id } });
      return tx.fundingProgramme.update({ where: { id }, data: { ...this.data(d), version: { increment: 1 }, verificationStatus: cur.verificationStatus === 'VERIFIED' ? 'UNVERIFIED' : cur.verificationStatus, lastVerifiedAt: cur.verificationStatus === 'VERIFIED' ? null : cur.lastVerifiedAt,
        ...(d.criteria ? { criteria: { create: d.criteria.map(c => ({ kind: c.kind as any, values: c.values ?? [], numberValue: c.numberValue, mandatory: c.mandatory, description: c.description })) } } : {}),
        ...(d.documents ? { documents: { create: d.documents.map(x => ({ category: x.category, label: x.label, mandatory: x.mandatory ?? true })) } } : {}) }, include: { criteria: true, documents: true } });
    });
    await this.audit.log(u.id, 'programme.update', 'programme', id, { version: p.version });
    return shapeProgramme(p);
  }
  async verify(u: AuthUser, id: string) {
    const p = await this.prisma.fundingProgramme.findUnique({ where: { id }, include: { criteria: true } }); if (!p) throw new NotFoundException('Funding opportunity not found.');
    if (p.verificationStatus === 'DEMONSTRATION') throw new BadRequestException('Demonstration records cannot be marked verified.');
    if (!p.sourceNote || !p.websiteUrl) throw new BadRequestException('Add the official website and a source note before verifying.');
    if (p.criteria.length === 0) throw new BadRequestException('Record the published criteria before verifying.');
    const v = await this.prisma.fundingProgramme.update({ where: { id }, data: { verificationStatus: 'VERIFIED', lastVerifiedAt: new Date(), verifiedById: u.id }, include: { criteria: true, documents: true } });
    await this.audit.log(u.id, 'programme.verify', 'programme', id);
    return shapeProgramme(v);
  }
  async save(u: AuthUser, id: string) {
    await this.get(u, id);
    await this.prisma.savedProgramme.upsert({ where: { userId_programmeId: { userId: u.id, programmeId: id } }, create: { userId: u.id, programmeId: id }, update: {} });
    return { saved: true };
  }
  async unsave(u: AuthUser, id: string) { await this.prisma.savedProgramme.deleteMany({ where: { userId: u.id, programmeId: id } }); return { saved: false }; }
  async saved(u: AuthUser) {
    const rows = await this.prisma.savedProgramme.findMany({ where: { userId: u.id, programme: { status: { not: 'DRAFT' } } }, include: { programme: true }, orderBy: { createdAt: 'desc' } });
    return rows.map(r => shapeProgramme(r.programme, new Set([r.programmeId])));
  }
}
@Controller()
export class ProgrammesController {
  constructor(private s: ProgrammesService) {}
  @Get('programmes') list(@CurrentUser() u: AuthUser, @Query() q: ListQuery) { return this.s.list(u, q); }
  @Get('programmes/:id') get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.s.get(u, id); }
  @Post('programmes') @Roles(...ADMIN_ROLES) create(@CurrentUser() u: AuthUser, @Body() d: ProgrammeDto) { return this.s.create(u, d); }
  @Patch('programmes/:id') @Roles(...ADMIN_ROLES) update(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() d: UpdateProgrammeDto) { return this.s.update(u, id, d); }
  @Post('programmes/:id/verify') @Roles(...ADMIN_ROLES) verify(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.s.verify(u, id); }
  @Put('programmes/:id/save') save(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.s.save(u, id); }
  @Delete('programmes/:id/save') unsave(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.s.unsave(u, id); }
  @Get('me/saved-programmes') saved(@CurrentUser() u: AuthUser) { return this.s.saved(u); }
}
