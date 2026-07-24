import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { AuditService } from '../audit/audit.service';
import { AiService } from '../ai/ai.service';
import { RequestPersistenceService } from '../request-tracking/request-persistence.service';
import { CreditService } from '../credits/credit.service';

async function cleanup() {
  const app = await NestFactory.createApplicationContext(AppModule);
  try {
    const api = await app.get(RequestPersistenceService).cleanup();
    const ai = await app.get(AiService).cleanup();
    const reservations = await app.get(CreditService).expireReservations();
    app
      .get(AuditService)
      .record('retention.cleanup', undefined, undefined, 'Retention', {
        apiRequestsDeleted: api.count,
        aiRequestsDeleted: ai.count,
        reservationsExpired: reservations.count,
      });
  } finally {
    await app.close();
  }
}
void cleanup();
