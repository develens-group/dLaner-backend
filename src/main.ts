import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableCors({
    origin: config
      .get<string>('CORS_ORIGINS', config.getOrThrow<string>('FRONTEND_URL'))
      .split(',')
      .map((x: string) => x.trim()),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  });
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Dlander API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup(
    'api/docs',
    app,
    SwaggerModule.createDocument(app, swaggerConfig),
  );
  await app.listen(config.get<number>('PORT', 3000));
}
void bootstrap();
