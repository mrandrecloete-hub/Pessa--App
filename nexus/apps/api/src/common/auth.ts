import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata, UnauthorizedException, createParamDecorator } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RoleName } from '@prisma/client';
import * as jwt from 'jsonwebtoken';
import { PrismaService } from './prisma.service';

export interface AuthUser { id: string; email: string; roles: RoleName[]; sessionId: string }
export const IS_PUBLIC = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC, true);
export const ROLES_KEY = 'roles';
/** Backend role check. Never rely only on hiding buttons in the interface. */
export const Roles = (...roles: RoleName[]) => SetMetadata(ROLES_KEY, roles);
export const CurrentUser = createParamDecorator((_d: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user);
export const accessSecret = () => {
  const s = process.env.JWT_ACCESS_SECRET;
  if (!s || s.length < 32) throw new Error('JWT_ACCESS_SECRET must be set to at least 32 characters');
  return s;
};
export const ADMIN_ROLES: RoleName[] = ['NATIONAL_ADMIN', 'SUPER_ADMIN'];

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private reflector: Reflector, private prisma: PrismaService) {}
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;
    const req = ctx.switchToHttp().getRequest();
    const bearer = (req.headers.authorization || '').startsWith('Bearer ') ? req.headers.authorization.slice(7) : null;
    const token = bearer || req.cookies?.nexus_at;
    if (!token) throw new UnauthorizedException('Sign in required.');
    let payload: any;
    try { payload = jwt.verify(token, accessSecret(), { algorithms: ['HS256'] }); } catch { throw new UnauthorizedException('Session expired. Sign in again.'); }
    // Roles and status are read from the database on every request so suspension and revocation take effect at once.
    const [user, session] = await Promise.all([
      this.prisma.user.findFirst({ where: { id: payload.sub, deletedAt: null }, include: { roles: { where: { revokedAt: null } } } }),
      this.prisma.session.findUnique({ where: { id: payload.sid } }),
    ]);
    if (!user || user.status !== 'ACTIVE') throw new UnauthorizedException('Account unavailable.');
    if (!session || session.revokedAt || session.expiresAt < new Date()) throw new UnauthorizedException('Session ended. Sign in again.');
    req.user = { id: user.id, email: user.email, roles: user.roles.map(r => r.role), sessionId: session.id } as AuthUser;
    const need = this.reflector.getAllAndOverride<RoleName[]>(ROLES_KEY, targets);
    if (need && !need.some(r => req.user.roles.includes(r))) throw new ForbiddenException('You do not have permission for this action.');
    return true;
  }
}
