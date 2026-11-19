import { BadRequestException, Body, ConflictException, Controller, Get, Injectable, Put, PayloadTooLargeException } from '@nestjs/common';
import { IsInt, IsObject, Min } from 'class-validator';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { AuthUser, CurrentUser } from '../common/auth';

export const MAX_SNAPSHOT_BYTES = 1_500_000;
export class PushDto { @IsInt() @Min(0) baseRevision: number; @IsObject() data: Record<string, any> }

/** Accepts only a NEXUS on-device backup, so the endpoint cannot be used as general file storage. */
function validShape(d: any): boolean {
  return d?.app === 'nexus-namibia-local' && d.version === 1 && d.data && typeof d.data === 'object' && Array.isArray(d.data.programmes) && Array.isArray(d.data.plans) && Array.isArray(d.data.readiness) && Array.isArray(d.data.saved);
}
@Injectable()
export class SyncService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}
  async get(u: AuthUser) {
    const s = await this.prisma.syncSnapshot.findUnique({ where: { userId: u.id } });
    return s ? { revision: s.revision, updatedAt: s.updatedAt, data: s.data } : { revision: 0, updatedAt: null, data: null };
  }
  /** Compare and set: the push only succeeds if the client saw the latest revision. A newer cloud copy is never overwritten silently. */
  async put(u: AuthUser, d: PushDto, ip?: string) {
    if (!validShape(d.data)) throw new BadRequestException('That is not a NEXUS backup.');
    const size = Buffer.byteLength(JSON.stringify(d.data)); if (size > MAX_SNAPSHOT_BYTES) throw new PayloadTooLargeException('This backup is too large to sync.');
    const cur = await this.prisma.syncSnapshot.findUnique({ where: { userId: u.id } });
    if (!cur) {
      if (d.baseRevision !== 0) throw new ConflictException({ message: 'The cloud copy changed. Reload it before saving.', revision: 0 });
      try { const c = await this.prisma.syncSnapshot.create({ data: { userId: u.id, revision: 1, data: d.data as any, sizeBytes: size } }); await this.audit.log(u.id, 'sync.push', 'sync', c.id, { revision: 1, size }, ip); return { revision: 1, updatedAt: c.updatedAt }; }
      catch { throw new ConflictException({ message: 'The cloud copy changed. Reload it before saving.', revision: 1 }); }
    }
    const res = await this.prisma.syncSnapshot.updateMany({ where: { userId: u.id, revision: d.baseRevision }, data: { revision: { increment: 1 }, data: d.data as any, sizeBytes: size } });
    if (res.count === 0) throw new ConflictException({ message: 'The cloud copy changed. Reload it before saving.', revision: cur.revision, updatedAt: cur.updatedAt });
    const n = await this.prisma.syncSnapshot.findUniqueOrThrow({ where: { userId: u.id } });
    await this.audit.log(u.id, 'sync.push', 'sync', n.id, { revision: n.revision, size }, ip);
    return { revision: n.revision, updatedAt: n.updatedAt };
  }
}
@Controller('sync')
export class SyncController {
  constructor(private s: SyncService) {}
  @Get() get(@CurrentUser() u: AuthUser) { return this.s.get(u); }
  @Put() put(@CurrentUser() u: AuthUser, @Body() d: PushDto) { return this.s.put(u, d); }
}
