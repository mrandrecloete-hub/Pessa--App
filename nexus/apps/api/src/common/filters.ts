import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
/** Centralised error handling: no stack traces or internals reach the client. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private log = new Logger('Errors');
  catch(e: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse(); const req = host.switchToHttp().getRequest();
    const requestId = randomUUID();
    if (e instanceof HttpException) {
      const body = e.getResponse() as any; const status = e.getStatus();
      const message = typeof body === 'string' ? body : Array.isArray(body.message) ? body.message.join('; ') : body.message;
      const extra = typeof body === 'object' && body && (body as any).revision !== undefined ? { revision: (body as any).revision, updatedAt: (body as any).updatedAt } : {};
      return res.status(status).json({ statusCode: status, message, requestId, ...extra });
    }
    this.log.error(`${requestId} ${req.method} ${req.url}: ${(e as Error)?.stack || e}`);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ statusCode: 500, message: 'Something went wrong. Quote this reference if you contact support.', requestId });
  }
}
