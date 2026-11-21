import { WordPressContentService } from '../wordpress/wordpress-content.service';
import { SocialAuthService } from '../auth/social-auth.service';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { McpOAuthService } from '../mcp/mcp-oauth.service';
import { McpService } from '../mcp/mcp.service';
import { AuditService } from '../audit/audit.service';
import { AiService } from '../ai/ai.service';
import { RequestPersistenceService } from '../request-tracking/request-persistence.service';
import { CreditService } from '../credits/credit.service';

async function cleanup() {
  const app = await NestFactory.createApplicationContext(AppModule);
  try {
    await app.get(WordPressContentService).cleanup();
    const social = await app.get(SocialAuthService).cleanup();
    const mcp = await app.get(McpService).cleanup();
    await app.get(McpOAuthService).cleanup();
    const api = await app.get(RequestPersistenceService).cleanup();
    const ai = await app.get(AiService).cleanup();
    const reservations = await app.get(CreditService).expireReservations();
    app
      .get(AuditService)
      .record('retention.cleanup', undefined, undefined, 'Retention', {
        socialAttemptsDeleted: social.attempts,
        socialGrantsDeleted: social.grants,
        mcpDesignsDeleted: mcp.count,
        apiRequestsDeleted: api.count,
        aiRequestsDeleted: ai.count,
        reservationsExpired: reservations.count,
      });
  } finally {
    await app.close();
  }
}
void cleanup();
