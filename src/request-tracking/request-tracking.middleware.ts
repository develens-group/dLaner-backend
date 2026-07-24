import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiRequestSource, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { AccessPrincipal } from '../common/auth.types';
import { sanitizeHttpBody, sanitizePayload } from './sanitizer';
import { RequestPersistenceService } from './request-persistence.service';

type TrackedRequest = Request & { user?: AccessPrincipal; requestId?: string };
type TrackedResponse = Response & {
  locals: { errorCode?: string; errorMessage?: string };
};
const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

@Injectable()
export class RequestTrackingMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HttpAccess');
  constructor(
    private readonly persistence: RequestPersistenceService,
    private readonly config: ConfigService,
  ) {}
  use(req: TrackedRequest, res: TrackedResponse, next: NextFunction) {
    const requestId = resolveRequestId(req.get('x-request-id'));
    req.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);
    const started = process.hrtime.bigint();
    res.once('finish', () => {
      const durationMs = Math.max(
        0,
        Math.round(Number(process.hrtime.bigint() - started) / 1_000_000),
      );
      const route = normalizeRoute(req);
      const query = sanitizePayload(
        req.query,
        this.config.get<number>('API_REQUEST_MAX_QUERY_BYTES', 4096),
      );
      const body = sanitizeHttpBody(
        route,
        req.body,
        this.config.get('API_REQUEST_BODY_CAPTURE_ENABLED', 'false') === 'true',
        this.config.get<number>('API_REQUEST_MAX_BODY_BYTES', 8192),
      );
      const contentLength = numberHeader(req.get('content-length'));
      const responseLength = numberHeader(res.getHeader('content-length'));
      const source = parseSource(req.get('x-client-source'));
      const log = {
        requestId,
        timestamp: new Date().toISOString(),
        method: req.method,
        route,
        path: req.originalUrl.split('?')[0],
        statusCode: res.statusCode,
        durationMs,
        userId: req.user?.userId,
        sessionId: req.user?.sessionId,
        ipAddress:
          this.config.get('API_REQUEST_CAPTURE_IP', 'true') === 'true'
            ? req.ip
            : undefined,
        userAgent: req.get('user-agent')?.slice(0, 512),
        contentLength,
        responseLength,
        errorCode: res.locals.errorCode,
      };
      this.logger.log(JSON.stringify(log));
      if (!excluded(req))
        this.persistence.enqueue({
          ...log,
          path: log.path.slice(0, 2048),
          queryJson: query.value as Prisma.InputJsonValue,
          requestBodyJson: body.value === null ? undefined : body.value,
          bodyCaptured: body.captured,
          bodyTruncated: body.truncated,
          bodyRedacted: body.redacted || query.redacted,
          source,
          errorMessage: res.locals.errorMessage?.slice(0, 500),
        });
    });
    next();
  }
}

export function resolveRequestId(incoming?: string) {
  return incoming && REQUEST_ID.test(incoming) ? incoming : randomUUID();
}

function normalizeRoute(req: Request) {
  const routePath = (req.route as { path?: unknown } | undefined)?.path;
  if (typeof routePath === 'string') return `${req.baseUrl}${routePath}`;
  return req.path
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':id')
    .replace(/\/\d+(?=\/|$)/g, '/:id');
}
function excluded(req: Request) {
  return (
    req.method === 'OPTIONS' ||
    req.path === '/' ||
    req.path.startsWith('/api/docs') ||
    req.path === '/health/live' ||
    req.path === '/health/ready' ||
    /\.[a-z0-9]{2,8}$/i.test(req.path)
  );
}
function numberHeader(value: string | number | string[] | undefined) {
  const parsed =
    typeof value === 'number'
      ? value
      : Number(Array.isArray(value) ? value[0] : value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined;
}
function parseSource(value?: string): ApiRequestSource {
  const normalized = value?.toUpperCase();
  return Object.values(ApiRequestSource).includes(
    normalized as ApiRequestSource,
  )
    ? (normalized as ApiRequestSource)
    : ApiRequestSource.UNKNOWN;
}
