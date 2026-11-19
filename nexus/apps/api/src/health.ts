import { Controller, Get } from '@nestjs/common';
import { Public } from './common/auth';
import { PrismaService } from './common/prisma.service';
@Controller('health')
export class HealthController {
  constructor(private prisma: PrismaService) {}
  @Public() @Get() async health() { await this.prisma.$queryRaw`SELECT 1`; return { status: 'ok', service: 'nexus-api' }; }
}
