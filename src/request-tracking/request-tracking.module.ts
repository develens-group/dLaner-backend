import { Global, Module } from '@nestjs/common';
import { ApiRequestsController } from './api-requests.controller';
import { ApiRequestsService } from './api-requests.service';
import { RequestPersistenceService } from './request-persistence.service';
import { RequestTrackingMiddleware } from './request-tracking.middleware';

@Global()
@Module({
  controllers: [ApiRequestsController],
  providers: [
    RequestPersistenceService,
    RequestTrackingMiddleware,
    ApiRequestsService,
  ],
  exports: [RequestPersistenceService, RequestTrackingMiddleware],
})
export class RequestTrackingModule {}
