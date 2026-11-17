/* Test-only dynamic Prisma emulator and raw supertest JSON responses.
 * Production provider/controller files remain fully type-checked by ESLint. */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/require-await */
import express from 'express';
import request from 'supertest';
import { createHash } from 'node:crypto';
import { mcpAuthRouter } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { McpOAuthService, MCP_ACCOUNT_SCOPES } from './mcp-oauth.service';
import { McpAccountController } from './mcp-account.controller';

function fixture() {
  const tables: Record<string, Map<string, Record<string, any>>> = {};
  const prisma: Record<string, any> = {};
  for (const table of [
    'mcpOAuthClient',
    'mcpOAuthRequest',
    'mcpOAuthGrant',
    'mcpOAuthToken',
  ]) {
    const rows = (tables[table] = new Map());
    let next = 0;
    const matches = (row: Record<string, any>, where: Record<string, any>) =>
      Object.entries(where).every(([key, value]) => {
        if (value && typeof value === 'object' && 'gt' in value)
          return row[key] > value.gt;
        return row[key] === value;
      });
    prisma[table] = {
      create: jest.fn(async ({ data }) => {
        const key = data.tokenHash || data.id || `${table}-${++next}`;
        const row = {
          id: key,
          createdAt: new Date(),
          usedAt: null,
          revokedAt: null,
          ...data,
        };
        rows.set(key, row);
        return row;
      }),
      createMany: jest.fn(async ({ data }) => {
        for (const row of data)
          rows.set(row.tokenHash, { usedAt: null, ...row });
        return { count: data.length };
      }),
      findUnique: jest.fn(async ({ where, include }) => {
        const row = rows.get(where.id || where.tokenHash);
        return row && include?.grant
          ? { ...row, grant: tables.mcpOAuthGrant.get(row.grantId) }
          : row || null;
      }),
      findMany: jest.fn(async ({ where }) =>
        [...rows.values()].filter((row) => matches(row, where)),
      ),
      updateMany: jest.fn(async ({ where, data }) => {
        const selected = [...rows.values()].filter((row) =>
          matches(row, where),
        );
        selected.forEach((row) => Object.assign(row, data));
        return { count: selected.length };
      }),
      update: jest.fn(async ({ where, data }) => {
        const row = rows.get(where.id)!;
        Object.assign(row, data);
        return row;
      }),
    };
  }
  prisma.$transaction = async (fn: (tx: unknown) => unknown) => fn(prisma);
  prisma.user = { findUnique: jest.fn(async () => ({ status: 'ACTIVE' })) };
  prisma.wordPressSite = {
    findMany: jest.fn(async () => [
      { id: 'my-site', name: 'My site', domain: 'example.com' },
    ]),
    count: jest.fn(async ({ where }) =>
      where.id.in.every((id: string) => id === 'my-site')
        ? where.id.in.length
        : 0,
    ),
  };
  const values: Record<string, string> = {
    MCP_ACCOUNT_ENABLED: 'true',
    MCP_OAUTH_ISSUER_URL: 'https://mcp.dlander.test',
    MCP_OAUTH_SECRET_ENCRYPTION_KEY:
      'test-only-secret-with-at-least-32-characters',
    FRONTEND_URL: 'https://dlander.test',
  };
  const config = {
    get: (key: string) => values[key],
    getOrThrow: (key: string) => values[key],
  };
  const oauth = new McpOAuthService(prisma as never, config as never);
  const app = express();
  app.use(express.json());
  app.use(
    mcpAuthRouter({
      provider: oauth,
      issuerUrl: oauth.issuer,
      resourceServerUrl: oauth.resource,
      scopesSupported: MCP_ACCOUNT_SCOPES,
    }),
  );
  const lands = {
    list: jest.fn(async () => ({ items: [], pagination: {} })),
    get: jest.fn(),
    save: jest.fn(),
  };
  const edits = { getForWeb: jest.fn(), complete: jest.fn() };
  const account = new McpAccountController(
    oauth,
    lands as never,
    prisma as never,
    edits as never,
    { assertEnabled: () => {}, guide: async () => 'guide' } as never,
    config as never,
  );
  app.all('/mcp', (req, res, next) => {
    void account.handle(req, res).catch(next);
  });
  return { oauth, app, prisma, tables, lands, edits, values };
}

async function authorize(
  f: ReturnType<typeof fixture>,
  scopes = 'lands:read lands:write',
) {
  const client = await request(f.app)
    .post('/register')
    .send({
      client_name: 'Test assistant',
      redirect_uris: ['https://assistant.test/callback'],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    })
    .expect(201);
  const verifier = 'a'.repeat(43);
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const redirect = await request(f.app)
    .get('/authorize')
    .query({
      response_type: 'code',
      client_id: client.body.client_id,
      redirect_uri: 'https://assistant.test/callback',
      scope: scopes,
      state: 'preserved-state',
      code_challenge: challenge,
      code_challenge_method: 'S256',
      resource: f.oauth.resource.href,
    })
    .expect(302);
  const pending = new URL(redirect.headers.location).searchParams.get(
    'request',
  )!;
  const decision = await f.oauth.decide(
    pending,
    'owner',
    true,
    scopes.split(' '),
    scopes.includes('wordpress:') ? ['my-site'] : [],
  );
  const callback = new URL(decision.redirectUrl);
  expect(callback.searchParams.get('state')).toBe('preserved-state');
  const data = {
    grant_type: 'authorization_code',
    client_id: client.body.client_id,
    redirect_uri: 'https://assistant.test/callback',
    code: callback.searchParams.get('code'),
    code_verifier: verifier,
    resource: f.oauth.resource.href,
  };
  return { client: client.body, data, pending };
}

describe('account MCP OAuth (real SDK HTTP handlers, isolated persistence)', () => {
  it('advertises the account resource and challenges anonymous callers', async () => {
    const f = fixture();
    await request(f.app).post('/mcp/account').send({}).expect(404);
    const metadata = await request(f.app)
      .get('/.well-known/oauth-protected-resource/mcp')
      .expect(200);
    expect(metadata.body.resource).toBe(f.oauth.resource.href);
    const denied = await request(f.app).post('/mcp').send({}).expect(401);
    expect(denied.headers['www-authenticate']).toContain(
      'oauth-protected-resource/mcp',
    );
    await request(f.app)
      .post('/mcp')
      .set('Authorization', 'Bearer ordinary-web-jwt')
      .send({})
      .expect(401);
  });

  it('rejects unsafe redirect schemes, PKCE mismatch and wrong audience without consuming a valid code', async () => {
    const f = fixture();
    await request(f.app).post('/mcp/account').send({}).expect(404);
    await request(f.app)
      .post('/register')
      .send({
        redirect_uris: ['javascript:alert(1)'],
        token_endpoint_auth_method: 'none',
      })
      .expect(400);
    const { data } = await authorize(f);
    await request(f.app)
      .post('/token')
      .type('form')
      .send({ ...data, code_verifier: 'b'.repeat(43) })
      .expect(400);
    await request(f.app)
      .post('/token')
      .type('form')
      .send({ ...data, resource: 'https://another.test/mcp' })
      .expect(400);
    await request(f.app)
      .post('/token')
      .type('form')
      .send({ ...data, redirect_uri: 'https://assistant.test/other' })
      .expect(400);
    await request(f.app).post('/token').type('form').send(data).expect(200);
    await request(f.app).post('/token').type('form').send(data).expect(400);
  });

  it('supports tokens across service instances, rotates refresh tokens and revokes the grant on replay', async () => {
    const f = fixture();
    await request(f.app).post('/mcp/account').send({}).expect(404);
    const { data, client } = await authorize(f);
    const issued = await request(f.app)
      .post('/token')
      .type('form')
      .send(data)
      .expect(200);
    expect([...f.tables.mcpOAuthToken.keys()]).not.toContain(
      issued.body.access_token,
    );
    const otherInstance = new McpOAuthService(
      f.prisma as never,
      {
        get: (key: string) => f.values[key],
        getOrThrow: (key: string) => f.values[key],
      } as never,
    );
    expect(
      (await otherInstance.verifyAccessToken(issued.body.access_token)).extra
        ?.userId,
    ).toBe('owner');
    const refresh = {
      grant_type: 'refresh_token',
      client_id: client.client_id,
      refresh_token: issued.body.refresh_token,
      resource: f.oauth.resource.href,
    };
    const rotated = await request(f.app)
      .post('/token')
      .type('form')
      .send(refresh)
      .expect(200);
    await request(f.app).post('/token').type('form').send(refresh).expect(400);
    await expect(
      f.oauth.verifyAccessToken(rotated.body.access_token),
    ).rejects.toThrow();
  });

  it('reads only the token owner and refuses unconsented write tools', async () => {
    const f = fixture();
    await request(f.app).post('/mcp/account').send({}).expect(404);
    const { data } = await authorize(f, 'lands:read');
    const issued = await request(f.app)
      .post('/token')
      .type('form')
      .send(data)
      .expect(200);
    const call = (name: string, args: object) =>
      request(f.app)
        .post('/mcp')
        .set('Authorization', `Bearer ${issued.body.access_token}`)
        .set('Accept', 'application/json, text/event-stream')
        .send({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name, arguments: args },
        });
    const read = await call('list_lands', {}).expect(200);
    expect(read.body.result.isError).not.toBe(true);
    expect(f.lands.list).toHaveBeenCalledWith('owner', { page: 1, limit: 20 });
    const denied = await call('save_land', {
      landId: '271d1231-c756-443c-8395-d3cef17ed912',
      expectedRevision: 1,
      canvas: {},
    }).expect(200);
    expect(denied.body.result.isError).toBe(true);
    expect(f.lands.save).not.toHaveBeenCalled();
  });

  it('denies another owner’s WordPress site and limits calls to explicitly selected sites', async () => {
    const f = fixture();
    await request(f.app).post('/mcp/account').send({}).expect(404);
    const { data } = await authorize(f, 'wordpress:read wordpress:write');
    const issued = await request(f.app)
      .post('/token')
      .type('form')
      .send(data)
      .expect(200);
    f.prisma.wordPressEditSession = {
      findFirst: jest.fn(async () => ({ wordpressSiteId: 'other-site' })),
    };
    const denied = await request(f.app)
      .post('/mcp')
      .set('Authorization', `Bearer ${issued.body.access_token}`)
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'get_wordpress_edit',
          arguments: { sessionId: '271d1231-c756-443c-8395-d3cef17ed912' },
        },
      })
      .expect(200);
    expect(denied.body.result.isError).toBe(true);
    expect(f.edits.getForWeb).not.toHaveBeenCalled();
    const { pending } = await authorize(f, 'wordpress:read');
    // The used request cannot be approved a second time, even by another account.
    await expect(
      f.oauth.decide(
        pending,
        'other-user',
        true,
        ['wordpress:read'],
        ['my-site'],
      ),
    ).rejects.toThrow();
  });

  it('denies disabled accounts and supports user-owned revocation', async () => {
    const f = fixture();
    await request(f.app).post('/mcp/account').send({}).expect(404);
    const { data } = await authorize(f);
    const issued = await request(f.app)
      .post('/token')
      .type('form')
      .send(data)
      .expect(200);
    const auth = await f.oauth.verifyAccessToken(issued.body.access_token);
    await expect(
      f.oauth.revokeConnection('other-owner', String(auth.extra?.grantId)),
    ).rejects.toThrow();
    f.prisma.user.findUnique.mockResolvedValueOnce({ status: 'SUSPENDED' });
    await expect(
      f.oauth.verifyAccessToken(issued.body.access_token),
    ).rejects.toThrow();
    await f.oauth.revokeConnection('owner', String(auth.extra?.grantId));
    await expect(
      f.oauth.verifyAccessToken(issued.body.access_token),
    ).rejects.toThrow();
  });

  it('encrypts confidential client secrets at rest', async () => {
    const f = fixture();
    await request(f.app).post('/mcp/account').send({}).expect(404);
    const client = await request(f.app)
      .post('/register')
      .send({
        redirect_uris: ['https://assistant.test/callback'],
        token_endpoint_auth_method: 'client_secret_post',
      })
      .expect(201);
    const stored = f.tables.mcpOAuthClient.get(client.body.client_id)!;
    expect(JSON.stringify(stored)).not.toContain(client.body.client_secret);
    expect(
      (await f.oauth.clientsStore.getClient(client.body.client_id))
        ?.client_secret,
    ).toBe(client.body.client_secret);
  });
});

describe('OAuth consent boundaries', () => {
  async function pending(f: ReturnType<typeof fixture>, scopes: string) {
    const client = await request(f.app)
      .post('/register')
      .send({
        redirect_uris: ['https://assistant.test/callback'],
        token_endpoint_auth_method: 'none',
      })
      .expect(201);
    const redirect = await request(f.app)
      .get('/authorize')
      .query({
        client_id: client.body.client_id,
        response_type: 'code',
        redirect_uri: 'https://assistant.test/callback',
        code_challenge_method: 'S256',
        code_challenge: 'a'.repeat(43),
        scope: scopes,
        state: 'original-state',
      })
      .expect(302);
    return new URL(redirect.headers.location).searchParams.get('request')!;
  }

  it('refuses scope escalation, denies an authorization request and never creates a grant for denial', async () => {
    const f = fixture();
    await request(f.app).post('/mcp/account').send({}).expect(404);
    const token = await pending(f, 'lands:read');
    await expect(
      f.oauth.decide(token, 'owner', true, ['lands:read', 'lands:write'], []),
    ).rejects.toThrow();
    const decision = await f.oauth.decide(token, 'owner', false, [], []);
    const url = new URL(decision.redirectUrl);
    expect(url.searchParams.get('error')).toBe('access_denied');
    expect(url.searchParams.get('state')).toBe('original-state');
    expect(url.searchParams.has('code')).toBe(false);
    expect(f.tables.mcpOAuthGrant.size).toBe(0);
    await expect(
      f.oauth.decide(token, 'owner', true, ['lands:read'], []),
    ).rejects.toThrow();
  });

  it('rejects a foreign or disconnected WordPress site before consuming consent', async () => {
    const f = fixture();
    await request(f.app).post('/mcp/account').send({}).expect(404);
    const token = await pending(f, 'wordpress:read');
    await expect(
      f.oauth.decide(
        token,
        'owner',
        true,
        ['wordpress:read'],
        ['foreign-site'],
      ),
    ).rejects.toThrow();
    expect(f.tables.mcpOAuthGrant.size).toBe(0);
    await f.oauth.decide(token, 'owner', true, ['wordpress:read'], ['my-site']);
    expect([...f.tables.mcpOAuthGrant.values()][0].siteIds).toEqual([
      'my-site',
    ]);
  });

  it('binds authorization codes to their client and tokens to the original resource', async () => {
    const f = fixture();
    await request(f.app).post('/mcp/account').send({}).expect(404);
    const { data } = await authorize(f);
    const other = await request(f.app)
      .post('/register')
      .send({
        redirect_uris: ['https://assistant.test/callback'],
        token_endpoint_auth_method: 'none',
      })
      .expect(201);
    await request(f.app)
      .post('/token')
      .type('form')
      .send({ ...data, client_id: other.body.client_id })
      .expect(400);
    const issued = await request(f.app)
      .post('/token')
      .type('form')
      .send(data)
      .expect(200);
    f.values.MCP_OAUTH_ISSUER_URL = 'https://different-resource.test';
    await expect(
      f.oauth.verifyAccessToken(issued.body.access_token),
    ).rejects.toThrow();
  });
});
