import { Body, Controller, Get, Injectable, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { REGIONS, SECTORS, STAGES, REGISTRATION_STATUSES, APPLICANT_TYPES, FUNDING_PURPOSES } from '@nexus/business-logic';
import { PrismaService } from '../common/prisma.service';
import { AccessService } from '../common/access.service';
import { AuditService } from '../common/audit.service';
import { AuthUser, CurrentUser } from '../common/auth';

export class ProfileDto {
  @IsOptional() @IsIn([...SECTORS]) sector?: string;
  @IsOptional() @IsIn([...STAGES]) stage?: string;
  @IsOptional() @IsIn([...REGIONS]) region?: string;
  @IsOptional() @IsString() @MaxLength(100) town?: string;
  @IsOptional() @IsIn([...REGISTRATION_STATUSES]) registrationStatus?: string;
  @IsOptional() @IsInt() @Min(0) @Max(100) yearsInOperation?: number;
  @IsOptional() @IsInt() @Min(0) @Max(100000) employees?: number;
  @IsOptional() @IsString() @MaxLength(2000) activity?: string;
  @IsOptional() @IsIn([...FUNDING_PURPOSES]) fundingPurpose?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(1e10) fundingRequiredNad?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(1e10) availableCapitalNad?: number;
  @IsOptional() @IsString() @MaxLength(2000) intendedImpact?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsIn([...APPLICANT_TYPES], { each: true }) applicantTypes?: string[];
}
export class CreateBusinessDto {
  @IsString() @MinLength(2) @MaxLength(120) name: string;
  @IsOptional() @ValidateNested() @Type(() => ProfileDto) profile?: ProfileDto;
}
export class UpdateBusinessDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @IsOptional() @ValidateNested() @Type(() => ProfileDto) profile?: ProfileDto;
}
const FIELDS = ['sector','stage','region','registrationStatus','yearsInOperation','employees','activity','fundingPurpose','fundingRequiredNad','intendedImpact'] as const;
export function profileCompletion(p: any): number {
  if (!p) return 0;
  const filled = FIELDS.filter(f => p[f] !== null && p[f] !== undefined && p[f] !== '').length + (p.applicantTypes?.length ? 1 : 0);
  return Math.round((filled / (FIELDS.length + 1)) * 100);
}
export const shapeBusiness = (b: any) => ({ id: b.id, name: b.name, createdAt: b.createdAt,
  profile: b.profile ? { ...b.profile, fundingRequiredNad: b.profile.fundingRequiredNad == null ? null : Number(b.profile.fundingRequiredNad),
    availableCapitalNad: b.profile.availableCapitalNad == null ? null : Number(b.profile.availableCapitalNad) } : null,
  profileCompletion: profileCompletion(b.profile) });

@Injectable()
export class BusinessesService {
  constructor(private prisma: PrismaService, private access: AccessService, private audit: AuditService) {}
  async create(u: AuthUser, d: CreateBusinessDto) {
    const b = await this.prisma.$transaction(async tx => {
      const biz = await tx.business.create({ data: { name: d.name.trim(), owners: { create: { userId: u.id, ownershipPercent: 100 } }, profile: { create: { ...(d.profile ?? {}), applicantTypes: d.profile?.applicantTypes ?? [] } } }, include: { profile: true } });
      return biz;
    });
    await this.audit.log(u.id, 'business.create', 'business', b.id);
    return shapeBusiness(b);
  }
  async list(u: AuthUser) { return (await this.prisma.business.findMany({ where: { deletedAt: null, owners: { some: { userId: u.id } } }, include: { profile: true }, orderBy: { createdAt: 'asc' } })).map(shapeBusiness); }
  async get(u: AuthUser, id: string) { return shapeBusiness(await this.access.business(u.id, id)); }
  async update(u: AuthUser, id: string, d: UpdateBusinessDto) {
    await this.access.business(u.id, id);
    const b = await this.prisma.business.update({ where: { id }, data: { ...(d.name ? { name: d.name.trim() } : {}), ...(d.profile ? { profile: { upsert: { create: { ...d.profile, applicantTypes: d.profile.applicantTypes ?? [] }, update: d.profile } } } : {}) }, include: { profile: true } });
    await this.audit.log(u.id, 'business.update', 'business', id, { fields: Object.keys(d.profile ?? {}) });
    return shapeBusiness(b);
  }
}
@Controller('businesses')
export class BusinessesController {
  constructor(private s: BusinessesService) {}
  @Post() create(@CurrentUser() u: AuthUser, @Body() d: CreateBusinessDto) { return this.s.create(u, d); }
  @Get() list(@CurrentUser() u: AuthUser) { return this.s.list(u); }
  @Get(':id') get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.s.get(u, id); }
  @Put(':id') update(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() d: UpdateBusinessDto) { return this.s.update(u, id, d); }
}
