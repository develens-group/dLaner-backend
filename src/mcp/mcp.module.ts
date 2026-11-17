import { LandsModule } from '../lands/lands.module';
import { WordPressModule } from '../wordpress/wordpress.module';
import { McpOAuthService } from './mcp-oauth.service';
import { McpOAuthController } from './mcp-oauth.controller';
import { McpAccountController } from './mcp-account.controller';
import { Module } from '@nestjs/common';
import { McpService } from './mcp.service';

@Module({
  imports: [LandsModule, WordPressModule],
  controllers: [McpOAuthController, McpAccountController],
  providers: [McpService, McpOAuthService],
  exports: [McpService, McpOAuthService],
})
export class McpModule {}
