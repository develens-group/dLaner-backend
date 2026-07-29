import { LogLevel } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { setupApplication } from './setup-app';

async function bootstrap() {
  const logger = (process.env.LOG_LEVELS ?? 'log,error,warn')
    .split(',')
    .filter(Boolean) as LogLevel[];
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger,
    rawBody: true,
  });
  const config = app.get(ConfigService);
  setupApplication(app);
  app.enableShutdownHooks();
  await app.listen(config.get<number>('PORT', 3000), '0.0.0.0');
}
void bootstrap();
