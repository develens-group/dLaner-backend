import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { setupApplication } from '../src/setup-app';

describe('Application (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const nestApp = moduleRef.createNestApplication<NestExpressApplication>({
      rawBody: true,
    });
    setupApplication(nestApp);
    await nestApp.init();
    app = nestApp;
  });

  it('serves the public root and returns a request ID', async () => {
    const response = await request(app.getHttpServer())
      .get('/')
      .set('X-Request-Id', 'e2e-request-root')
      .expect(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.text).toContain('Dlander API');
    expect(response.text).toContain('href="/api/docs"');
    expect(response.headers['x-request-id']).toBe('e2e-request-root');
  });

  it('replaces a malformed request ID', async () => {
    const response = await request(app.getHttpServer())
      .get('/')
      .set('X-Request-Id', 'bad id')
      .expect(200);
    expect(response.headers['x-request-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('rejects protected financial endpoints without a JWT', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/credits/balance')
      .expect(401);
    expect(response.text).toContain('"statusCode":401');
    expect(response.headers['x-request-id']).toBeDefined();
  });

  it('serves Swagger UI and its OpenAPI document', async () => {
    const page = await request(app.getHttpServer())
      .get('/api/docs')
      .expect(200);
    expect(page.text).toContain('swagger-ui-dist@5.32.8');
    await request(app.getHttpServer())
      .get('/api/docs/dlander-swagger-init.js')
      .expect('Content-Type', /application\/javascript/)
      .expect(200);
    const document = await request(app.getHttpServer())
      .get('/api/docs-json')
      .expect(200);
    expect(document.text).toContain('"bearer"');
    expect(document.text).toContain('"scheme":"bearer"');
  });

  afterAll(async () => {
    await app.close();
  });
});
