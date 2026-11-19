import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaService } from './common/prisma.service';
import { AuditService } from './common/audit.service';
import { AccessService } from './common/access.service';
import { AuthGuard } from './common/auth';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { BusinessesController, BusinessesService } from './businesses/businesses';
import { ProgrammesController, ProgrammesService } from './programmes/programmes';
import { AssessmentsController, AssessmentsService } from './assessments/assessments';
import { PlansController, PlansService } from './plans/plans';
import { DashboardController, DashboardService } from './dashboard/dashboard';
import { HealthController } from './health';

@Global()
@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: process.env.NODE_ENV === 'test' ? 10_000 : 300 }])],
  controllers: [HealthController, AuthController, BusinessesController, ProgrammesController, AssessmentsController, PlansController, DashboardController],
  providers: [PrismaService, AuditService, AccessService, AuthService, BusinessesService, ProgrammesService, AssessmentsService, PlansService, DashboardService,
    { provide: APP_GUARD, useClass: ThrottlerGuard }, { provide: APP_GUARD, useClass: AuthGuard }],
})
export class AppModule {}
