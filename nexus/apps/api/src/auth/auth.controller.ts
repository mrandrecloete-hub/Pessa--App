import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto, RegisterDto } from './auth.dto';
import { AuthUser, CurrentUser, Public } from '../common/auth';
const prod = () => process.env.NODE_ENV === 'production';
const LIM = (n: number) => (process.env.NODE_ENV === 'test' ? 100000 : n);
function setCookies(res: Response, t: { access: string; refresh: string; accessMaxAgeMs: number; refreshMaxAgeMs: number }) {
  const base = { httpOnly: true, secure: prod(), sameSite: 'strict' as const };
  res.cookie('nexus_at', t.access, { ...base, path: '/', maxAge: t.accessMaxAgeMs });
  res.cookie('nexus_rt', t.refresh, { ...base, path: '/api/v1/auth', maxAge: t.refreshMaxAgeMs });
}
const meta = (req: Request) => ({ ua: req.headers['user-agent'], ip: req.ip });
/** Mobile clients send X-Nexus-Client: mobile and receive tokens in the body to keep in secure storage. */
const out = (req: Request, r: any) => ({ user: r.user, ...(req.headers['x-nexus-client'] === 'mobile' ? { accessToken: r.tokens.access, refreshToken: r.tokens.refresh } : {}) });
@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}
  @Public() @Throttle({ default: { limit: LIM(10), ttl: 60_000 } }) @Post('register')
  async register(@Body() d: RegisterDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const r = await this.auth.register(d, meta(req)); setCookies(res, r.tokens); return out(req, r);
  }
  @Public() @Throttle({ default: { limit: LIM(10), ttl: 60_000 } }) @HttpCode(200) @Post('login')
  async login(@Body() d: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const r = await this.auth.login(d, meta(req)); setCookies(res, r.tokens); return out(req, r);
  }
  @Public() @Throttle({ default: { limit: LIM(30), ttl: 60_000 } }) @HttpCode(200) @Post('refresh')
  async refresh(@Body() b: { refreshToken?: string }, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const r = await this.auth.refresh(req.cookies?.nexus_rt || b?.refreshToken, meta(req)); setCookies(res, r.tokens); return out(req, r);
  }
  @HttpCode(200) @Post('logout')
  async logout(@CurrentUser() u: AuthUser, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(u.sessionId, u.id, req.ip); res.clearCookie('nexus_at', { path: '/' }); res.clearCookie('nexus_rt', { path: '/api/v1/auth' }); return { ok: true };
  }
  @Get('me') me(@CurrentUser() u: AuthUser) { return this.auth.me(u.id); }
}
