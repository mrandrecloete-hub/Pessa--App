import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from './prisma.service';
/** Record level authorisation. Someone else's record answers 404, never 403, so existence is not revealed. */
@Injectable()
export class AccessService {
  constructor(private prisma: PrismaService) {}
  async business(userId: string, businessId: string) {
    const b = await this.prisma.business.findFirst({ where: { id: businessId, deletedAt: null, owners: { some: { userId } } }, include: { profile: true } });
    if (!b) throw new NotFoundException('Business not found.');
    return b;
  }
  async plan(userId: string, planId: string) {
    const p = await this.prisma.businessPlan.findFirst({ where: { id: planId, deletedAt: null, business: { deletedAt: null, owners: { some: { userId } } } } });
    if (!p) throw new NotFoundException('Business plan not found.');
    return p;
  }
}
