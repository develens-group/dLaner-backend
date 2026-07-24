import { ApiRequestSource, Prisma } from '@prisma/client';

export interface RequestRecordInput {
  requestId: string;
  userId?: string;
  sessionId?: string;
  method: string;
  route: string;
  path: string;
  queryJson?: Prisma.InputJsonValue;
  requestBodyJson?: Prisma.InputJsonValue;
  responseSummaryJson?: Prisma.InputJsonValue;
  bodyCaptured: boolean;
  bodyTruncated: boolean;
  bodyRedacted: boolean;
  statusCode: number;
  durationMs: number;
  ipAddress?: string;
  userAgent?: string;
  contentLength?: number;
  responseLength?: number;
  errorCode?: string;
  errorMessage?: string;
  source: ApiRequestSource;
}
