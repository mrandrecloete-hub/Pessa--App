import { ConflictException, Injectable, UnauthorizedException, BadRequestException, ForbiddenException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { accessSecret } from '../common/auth';
import { hashPassword, verifyPassword, passwordProblem, sha256, newToken } from '../common/password';
const ACCESS_MIN = 15, REFRESH_DAYS = 30, MAX_FAILS = 5, LOCK_MIN = 15;
// Compared against when the account does not exist so timing does not reveal registered emails.
let dummyHash: Promise<string> | null = null;
@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}
  private publicUser(u: any) { return { id: u.id, email: u.email, firstName: u.firstName, lastName: u.lastName, roles: (u.roles || []).filter((r: any) => !r.revokedAt).map((r: any) => r.role) }; }
  private async issue(userId: string, email: string, meta: { ua?: string; ip?: string }) {
    const refresh = newToken();
    const session = await this.prisma.session.create({ data: { userId, refreshTokenHash: sha256(refresh), userAgent: meta.ua?.slice(0, 200), ip: meta.ip, expiresAt: new Date(Date.now() + REFRESH_DAYS * 864e5) } });
    const access = jwt.sign({ sub: userId, sid: session.id }, accessSecret(), { algorithm: 'HS256', expiresIn: ACCESS_MIN * 60 });
    return { access, refresh, accessMaxAgeMs: ACCESS_MIN * 60e3, refreshMaxAgeMs: REFRESH_DAYS * 864e5 };
  }
  async register(d: { email: string; password: string; firstName: string; lastName: string }, meta: any) {
    const email = d.email.trim().toLowerCase();
    const problem = passwordProblem(d.password, email); if (problem) throw new BadRequestException(problem);
    if (await this.prisma.user.findUnique({ where: { email } })) throw new ConflictException('An account with this email already exists.');
    const user = await this.prisma.user.create({ data: { email, passwordHash: await hashPassword(d.password), firstName: d.firstName.trim(), lastName: d.lastName.trim(),
      roles: { create: { role: 'CITIZEN' } }, profile: { create: {} } }, include: { roles: true } });
    await this.prisma.subscription.create({ data: { userId: user.id, plan: 'CITIZEN_FREE' } });
    await this.audit.log(user.id, 'auth.register', 'user', user.id, undefined, meta.ip);
    return { user: this.publicUser(user), tokens: await this.issue(user.id, email, meta) };
  }
  async login(d: { email: string; password: string }, meta: any) {
    const email = d.email.trim().toLowerCase();
    const user = await this.prisma.user.findFirst({ where: { email, deletedAt: null }, include: { roles: true } });
    if (!user) { dummyHash ??= hashPassword('dummy-password-for-timing'); await verifyPassword(d.password, await dummyHash); throw new UnauthorizedException('Email or password is not correct.'); }
    if (user.lockedUntil && user.lockedUntil > new Date()) throw new ForbiddenException('Too many failed attempts. Try again in a few minutes.');
    if (user.status !== 'ACTIVE') throw new ForbiddenException('This account is suspended.');
    if (!(await verifyPassword(d.password, user.passwordHash))) {
      const fails = user.failedLogins + 1;
      await this.prisma.user.update({ where: { id: user.id }, data: { failedLogins: fails, lockedUntil: fails >= MAX_FAILS ? new Date(Date.now() + LOCK_MIN * 60e3) : null } });
      await this.audit.log(user.id, 'auth.login_failed', 'user', user.id, { fails }, meta.ip);
      throw new UnauthorizedException('Email or password is not correct.');
    }
    await this.prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } });
    await this.audit.log(user.id, 'auth.login', 'user', user.id, undefined, meta.ip);
    return { user: this.publicUser(user), tokens: await this.issue(user.id, email, meta) };
  }
  /** Refresh token rotation. Presenting an already used token revokes every session of that user. */
  async refresh(token: string | undefined, meta: any) {
    if (!token) throw new UnauthorizedException('Sign in required.');
    const s = await this.prisma.session.findUnique({ where: { refreshTokenHash: sha256(token) }, include: { user: { include: { roles: true } } } });
    if (!s) throw new UnauthorizedException('Sign in required.');
    if (s.revokedAt) { await this.prisma.session.updateMany({ where: { userId: s.userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.audit.log(s.userId, 'auth.refresh_reuse_detected', 'session', s.id, undefined, meta.ip); throw new UnauthorizedException('Session ended. Sign in again.'); }
    if (s.expiresAt < new Date() || s.user.status !== 'ACTIVE' || s.user.deletedAt) throw new UnauthorizedException('Session ended. Sign in again.');
    await this.prisma.session.update({ where: { id: s.id }, data: { revokedAt: new Date() } });
    return { user: this.publicUser(s.user), tokens: await this.issue(s.userId, s.user.email, meta) };
  }
  async logout(sessionId: string, userId: string, ip?: string) {
    await this.prisma.session.updateMany({ where: { id: sessionId, userId }, data: { revokedAt: new Date() } });
    await this.audit.log(userId, 'auth.logout', 'session', sessionId, undefined, ip);
  }
  async me(userId: string) { return this.publicUser(await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { roles: true } })); }
}
