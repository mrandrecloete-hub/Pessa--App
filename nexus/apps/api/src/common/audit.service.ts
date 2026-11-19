import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}
  /** Audit records never hold passwords, tokens or document contents. */
  async log(actorId: string | null, action: string, entityType?: string, entityId?: string, detail?: object, ip?: string) {
    await this.prisma.auditLog.create({ data: { actorId, action, entityType, entityId, detail: detail as any, ip } });
  }
}
