import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { validateEnvironment } from './config/configuration';
import { PrismaModule } from './prisma/prisma.module';
import { MailModule } from './mail/mail.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { AdminModule } from './admin/admin.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RolesGuard } from './common/roles.guard';
import { RequestTrackingModule } from './request-tracking/request-tracking.module';
import { RequestTrackingMiddleware } from './request-tracking/request-tracking.middleware';
import { AiModule } from './ai/ai.module';
import { CreditsModule } from './credits/credits.module';
import { HealthController } from './health.controller';
import { TemplatesModule } from './templates/templates.module';
import { WordPressModule } from './wordpress/wordpress.module';
import { LandsModule } from './lands/lands.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    PrismaModule,
    MailModule,
    AuditModule,
    AuthModule,
    UsersModule,
    AdminModule,
    RequestTrackingModule,
    CreditsModule,
    AiModule,
    TemplatesModule,
    WordPressModule,
    LandsModule,
  ],
  controllers: [AppController, HealthController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useExisting: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestTrackingMiddleware).forRoutes('*');
  }
}
