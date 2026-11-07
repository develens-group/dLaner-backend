import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { SocialAuthController } from './social-auth.controller';
import { SocialAuthService } from './social-auth.service';
import { SocialAuthProviders } from './social-auth.providers';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController, SocialAuthController],
  providers: [
    AuthService,
    JwtAuthGuard,
    SocialAuthService,
    SocialAuthProviders,
  ],
  exports: [AuthService, JwtAuthGuard, JwtModule, SocialAuthService],
})
export class AuthModule {}
