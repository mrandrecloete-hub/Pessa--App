import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters';
import { accessSecret } from './common/auth';
export async function createApp(): Promise<NestExpressApplication> {
  accessSecret(); // fail fast when the secret is missing
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: process.env.NODE_ENV === 'test' ? ['error'] : ['log', 'warn', 'error'] });
  (app as any).set('trust proxy', 1);
  app.useBodyParser('json', { limit: '2mb' });
  // Browsers on other origins (the on-device app) may call the API only if listed in CORS_ORIGINS (comma separated). Default: none.
  const origins = (process.env.CORS_ORIGINS || '').split(',').map(x => x.trim()).filter(Boolean);
  if (origins.length) app.enableCors({ origin: origins, credentials: false, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], allowedHeaders: ['authorization', 'content-type', 'x-nexus-client'], maxAge: 600 });
  app.use(helmet());
  app.use(cookieParser());
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new AllExceptionsFilter());
  return app;
}
export function mountDocs(app: INestApplication) {
  const cfg = new DocumentBuilder().setTitle('NEXUS NAMIBIA API').setVersion('1.0').addCookieAuth('nexus_at').addBearerAuth().build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, cfg));
}
