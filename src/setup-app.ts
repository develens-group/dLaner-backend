import { ValidationPipe } from '@nestjs/common';
import type { CorsOptionsCallback } from '@nestjs/common/interfaces/external/cors-options.interface';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { HttpExceptionFilter } from './common/http-exception.filter';

export function setupApplication(app: NestExpressApplication) {
  const config = app.get(ConfigService);
  app.set('trust proxy', config.get<number>('TRUST_PROXY', 1));
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          scriptSrc: ["'self'", 'https://cdn.jsdelivr.net'],
          // Allow the browser PDF viewer for /docs/*.pdf
          objectSrc: ["'self'"],
        },
      },
    }),
  );
  app.useBodyParser('json', { limit: '2mb' });
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  const corsOrigins = (
    config.get<string>('CORS_ORIGINS') ??
    config.getOrThrow<string>('FRONTEND_URL')
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const corsMethods = ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE', 'OPTIONS'];
  const corsAllowedHeaders = [
    'Content-Type',
    'Authorization',
    'Idempotency-Key',
    'Accept',
    'Origin',
    'X-Requested-With',
    'MCP-Protocol-Version',
    'Mcp-Session-Id',
    'Last-Event-ID',
  ];
  const corsDelegate = (
    req: { url?: string },
    callback: CorsOptionsCallback,
  ) => {
    const path = (req.url ?? '').split('?')[0];
    // Public, credential-free endpoints are called directly from web clients
    // (ChatGPT's connector setup, OAuth metadata discovery), so they must not
    // be pinned to the app's own origins.
    const isPublic = path === '/mcp' || path.startsWith('/.well-known/');
    if (isPublic) {
      return callback(null, {
        origin: '*',
        credentials: false,
        methods: corsMethods,
        allowedHeaders: corsAllowedHeaders,
      });
    }
    return callback(null, {
      origin: corsOrigins,
      credentials: true,
      methods: corsMethods,
      allowedHeaders: corsAllowedHeaders,
    });
  };
  app.enableCors(corsDelegate);
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Dlander API')
    .setDescription('Local development and integration API')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Paste the JWT access token only',
      },
      'bearer',
    )
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  documentResponseDetails(document);
  SwaggerModule.setup('api/docs', app, document, {
    ui: false,
    raw: ['json'],
    swaggerOptions: {
      persistAuthorization:
        config.get('NODE_ENV', 'development') === 'development',
    },
  });
}

const successDescriptions: Record<string, string> = {
  '200': 'Request completed successfully',
  '201': 'Resource created successfully',
  '202': 'Request accepted for processing',
  '204': 'Request completed successfully with no response body',
};

type DocumentResponse = {
  $ref?: string;
  description: string;
  content?: Record<string, unknown>;
};

type DocumentOperation = {
  responses: Record<string, DocumentResponse>;
  security?: unknown[];
};

const errorResponses: Record<string, DocumentResponse> = {
  '400': errorResponse(400, 'Request validation failed'),
  '401': errorResponse(
    401,
    'Authentication is required or the token is invalid',
  ),
  '403': errorResponse(403, 'Access to this resource is forbidden'),
  '404': errorResponse(404, 'Requested resource was not found'),
  '409': errorResponse(
    409,
    'Request conflicts with the current resource state',
  ),
  '422': errorResponse(422, 'Request could not be processed'),
  '500': errorResponse(500, 'Internal server error'),
};

export function documentResponseDetails(document: OpenAPIObject) {
  for (const [path, pathItem] of Object.entries(document.paths)) {
    if (!pathItem) continue;
    for (const method of ['get', 'post', 'put', 'patch', 'delete'] as const) {
      const operation = pathItem[method] as DocumentOperation | undefined;
      if (!operation) continue;

      for (const [status, response] of Object.entries(operation.responses)) {
        if ('$ref' in response) continue;
        response.description =
          successDescriptions[status] ||
          response.description ||
          'Request completed';
        if (status.startsWith('2') && status !== '204' && !response.content) {
          response.content = {
            'application/json': {
              schema: {
                type: 'object',
                required: ['data', 'meta'],
                properties: {
                  data: { description: 'Endpoint response data' },
                  meta: {
                    type: 'object',
                    nullable: true,
                    additionalProperties: true,
                  },
                },
              },
            },
          };
        }
      }

      addResponse(operation, '400');
      addResponse(operation, '500');
      if (operation.security?.length) {
        addResponse(operation, '401');
        addResponse(operation, '403');
      }
      if (path.includes('{')) addResponse(operation, '404');
      if (method !== 'get') addResponse(operation, '409');
      if (path.includes('/credits') || path.includes('/payments')) {
        addResponse(operation, '422');
      }
    }
  }
}

function addResponse(operation: DocumentOperation, status: string) {
  operation.responses[status] ??= errorResponses[status];
}

function errorResponse(statusCode: number, message: string): DocumentResponse {
  return {
    description: message,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          required: ['error', 'meta'],
          properties: {
            error: {
              type: 'object',
              required: ['statusCode', 'message'],
              properties: {
                statusCode: { type: 'integer', example: statusCode },
                message: {
                  oneOf: [
                    { type: 'string', example: message },
                    {
                      type: 'array',
                      items: { type: 'string' },
                      example: [message],
                    },
                  ],
                },
              },
            },
            meta: { type: 'object', nullable: true, example: null },
          },
        },
        example: {
          error: { statusCode, message },
          meta: null,
        },
      },
    },
  };
}
