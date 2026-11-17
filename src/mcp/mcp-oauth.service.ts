import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from 'node:crypto';
import type { Response } from 'express';
import { Prisma, McpOAuthGrant } from '@prisma/client';
import type {
  OAuthServerProvider,
  AuthorizationParams,
} from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import type {
  OAuthClientInformationFull,
  OAuthTokens,
  OAuthTokenRevocationRequest,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import {
  InvalidClientMetadataError,
  InvalidRequestError,
  InvalidGrantError,
  InvalidScopeError,
  InvalidTargetError,
  InvalidTokenError,
} from '@modelcontextprotocol/sdk/server/auth/errors.js';
import { PrismaService } from '../prisma/prisma.service';
import { createOpaqueToken, hashOpaqueToken } from '../common/security';

export const MCP_ACCOUNT_SCOPES = [
  'lands:read',
  'lands:write',
  'wordpress:read',
  'wordpress:write',
];
type Pending = {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  scopes: string[];
  state?: string;
  grantId?: string;
};
const json = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

@Injectable()
export class McpOAuthService implements OAuthServerProvider {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  assertEnabled() {
    if (this.config.get('MCP_ACCOUNT_ENABLED') !== 'true')
      throw new NotFoundException('Account MCP is disabled');
  }

  get issuer() {
    return new URL(this.config.getOrThrow<string>('MCP_OAUTH_ISSUER_URL'));
  }
  get resource() {
    return new URL('/mcp', this.issuer);
  }

  private encrypt(value: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey(), iv);
    return Buffer.concat([
      iv,
      cipher.update(value, 'utf8'),
      cipher.final(),
      cipher.getAuthTag(),
    ]).toString('base64');
  }

  private decrypt(value: string) {
    const buffer = Buffer.from(value, 'base64');
    const cipher = createDecipheriv(
      'aes-256-gcm',
      this.encryptionKey(),
      buffer.subarray(0, 12),
    );
    cipher.setAuthTag(buffer.subarray(-16));
    return Buffer.concat([
      cipher.update(buffer.subarray(12, -16)),
      cipher.final(),
    ]).toString('utf8');
  }

  private encryptionKey() {
    return createHash('sha256')
      .update(this.config.getOrThrow<string>('MCP_OAUTH_SECRET_ENCRYPTION_KEY'))
      .digest();
  }

  get clientsStore(): OAuthRegisteredClientsStore {
    return {
      getClient: async (id) => {
        const row = await this.prisma.mcpOAuthClient.findUnique({
          where: { id },
        });
        if (!row) return undefined;
        return {
          ...(row.metadata as unknown as OAuthClientInformationFull),
          ...(row.encryptedSecret
            ? { client_secret: this.decrypt(row.encryptedSecret) }
            : {}),
        };
      },
      registerClient: async (metadata) => {
        this.assertEnabled();
        const client = {
          ...metadata,
          client_id: randomUUID(),
          client_id_issued_at: Math.floor(Date.now() / 1000),
        };
        if (
          !['none', 'client_secret_post'].includes(
            client.token_endpoint_auth_method || 'client_secret_post',
          )
        )
          throw new InvalidClientMetadataError(
            'Use none or client_secret_post',
          );
        if (!client.redirect_uris.length || client.redirect_uris.length > 10)
          throw new InvalidClientMetadataError('Register 1–10 redirect URIs');
        for (const uri of client.redirect_uris) {
          const url = new URL(uri);
          if (
            url.hash ||
            url.username ||
            url.password ||
            (url.protocol !== 'https:' &&
              !(
                url.protocol === 'http:' &&
                ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
              ))
          )
            throw new InvalidClientMetadataError(
              'Redirect URI must use HTTPS (HTTP loopback is allowed)',
            );
        }
        const { client_secret, ...safe } = client;
        await this.prisma.mcpOAuthClient.create({
          data: {
            id: client.client_id,
            metadata: json(safe),
            encryptedSecret: client_secret ? this.encrypt(client_secret) : null,
          },
        });
        return client;
      },
    };
  }

  private target(resource?: URL) {
    if (resource && resource.href !== this.resource.href)
      throw new InvalidTargetError(
        'Token resource must be the account MCP endpoint',
      );
  }

  private scopes(scopes: string[]) {
    if (
      !scopes.length ||
      scopes.some((scope) => !MCP_ACCOUNT_SCOPES.includes(scope))
    )
      throw new InvalidScopeError('Unsupported scope');
    if (scopes.includes('lands:write') && !scopes.includes('lands:read'))
      throw new InvalidScopeError('Editing lands also requires lands:read');
    if (
      scopes.includes('wordpress:write') &&
      !scopes.includes('wordpress:read')
    )
      throw new InvalidScopeError(
        'Editing WordPress sessions also requires wordpress:read',
      );
    return [...new Set(scopes)];
  }

  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response,
  ) {
    this.assertEnabled();
    this.target(params.resource);
    if (!client.redirect_uris.includes(params.redirectUri))
      throw new InvalidRequestError('Unregistered redirect URI');
    if (!/^[A-Za-z0-9_-]{43}$/.test(params.codeChallenge))
      throw new InvalidRequestError('PKCE S256 challenge required');
    const scopes = this.scopes(
      params.scopes?.length ? params.scopes : ['lands:read'],
    );
    const token = createOpaqueToken();
    const payload: Pending = {
      clientId: client.client_id,
      redirectUri: params.redirectUri,
      codeChallenge: params.codeChallenge,
      scopes,
      state: params.state,
    };
    await this.prisma.mcpOAuthRequest.create({
      data: {
        tokenHash: hashOpaqueToken(token),
        kind: 'consent',
        payload: json(payload),
        expiresAt: new Date(Date.now() + 10 * 60_000),
      },
    });
    const url = new URL(
      '/connect/ai/authorize',
      this.config.getOrThrow<string>('FRONTEND_URL'),
    );
    url.searchParams.set('request', token);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.redirect(url.href);
  }

  private async request(token: string, kind: string) {
    this.assertEnabled();
    if (token.length > 256) throw new InvalidGrantError('Invalid request');
    const row = await this.prisma.mcpOAuthRequest.findUnique({
      where: { tokenHash: hashOpaqueToken(token) },
    });
    if (!row || row.kind !== kind || row.usedAt || row.expiresAt <= new Date())
      throw new InvalidGrantError(
        'Request expired or already used; reconnect your assistant',
      );
    return { row, payload: row.payload as unknown as Pending };
  }

  async consentInfo(token: string, userId: string) {
    const { payload } = await this.request(token, 'consent');
    const client = await this.clientsStore.getClient(payload.clientId);
    if (!client) throw new InvalidGrantError('Client no longer exists');
    const sites = await this.prisma.wordPressSite.findMany({
      where: { userId, enabled: true },
      select: { id: true, name: true, domain: true },
    });
    return {
      clientName: client.client_name || 'AI assistant',
      redirectUri: payload.redirectUri,
      scopes: payload.scopes,
      sites,
    };
  }

  async decide(
    token: string,
    userId: string,
    approved: boolean,
    selected: string[],
    siteIds: string[],
  ) {
    const { row, payload } = await this.request(token, 'consent');
    const url = new URL(payload.redirectUri);
    if (payload.state !== undefined)
      url.searchParams.set('state', payload.state);
    const scopes = approved ? this.scopes(selected) : [];
    if (scopes.some((scope) => !payload.scopes.includes(scope)))
      throw new InvalidScopeError(
        'Cannot add permissions the client did not request',
      );
    const sites = scopes.some((scope) => scope.startsWith('wordpress:'))
      ? [...new Set(siteIds)]
      : [];
    if (scopes.some((scope) => scope.startsWith('wordpress:')) && !sites.length)
      throw new InvalidScopeError('Select at least one WordPress site');
    if (sites.length) {
      const count = await this.prisma.wordPressSite.count({
        where: { id: { in: sites }, userId, enabled: true },
      });
      if (count !== sites.length)
        throw new ForbiddenException('A selected site is unavailable');
    }
    const code = createOpaqueToken();
    await this.prisma.$transaction(async (tx) => {
      const consumed = await tx.mcpOAuthRequest.updateMany({
        where: {
          tokenHash: row.tokenHash,
          usedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { usedAt: new Date() },
      });
      if (consumed.count !== 1)
        throw new InvalidGrantError('Request already used');
      if (!approved) return;
      const grant = await tx.mcpOAuthGrant.create({
        data: {
          userId,
          clientId: payload.clientId,
          resource: this.resource.href,
          scopes,
          siteIds: sites,
          expiresAt: new Date(Date.now() + 30 * 86400_000),
        },
      });
      await tx.mcpOAuthRequest.create({
        data: {
          tokenHash: hashOpaqueToken(code),
          kind: 'code',
          payload: json({ ...payload, scopes, grantId: grant.id }),
          expiresAt: new Date(Date.now() + 120_000),
        },
      });
    });
    url.searchParams.set(
      approved ? 'code' : 'error',
      approved ? code : 'access_denied',
    );
    return { redirectUrl: url.href };
  }

  async challengeForAuthorizationCode(
    client: OAuthClientInformationFull,
    code: string,
  ) {
    const { payload } = await this.request(code, 'code');
    if (payload.clientId !== client.client_id)
      throw new InvalidGrantError('Code belongs to another client');
    return payload.codeChallenge;
  }

  private async grant(id: string) {
    const grant = await this.prisma.mcpOAuthGrant.findUnique({ where: { id } });
    const user =
      grant &&
      (await this.prisma.user.findUnique({
        where: { id: grant.userId },
        select: { status: true },
      }));
    if (
      !grant ||
      grant.revokedAt ||
      grant.resource !== this.resource.href ||
      grant.expiresAt <= new Date() ||
      user?.status !== 'ACTIVE'
    )
      throw new InvalidTokenError('Connection expired or revoked');
    return grant;
  }

  private async issue(
    tx: Prisma.TransactionClient,
    grant: McpOAuthGrant,
    scopes = grant.scopes,
  ): Promise<OAuthTokens> {
    const access = createOpaqueToken();
    const refresh = createOpaqueToken();
    await tx.mcpOAuthToken.createMany({
      data: [
        {
          tokenHash: hashOpaqueToken(access),
          grantId: grant.id,
          kind: 'access',
          expiresAt: new Date(
            Math.min(Date.now() + 3600_000, grant.expiresAt.getTime()),
          ),
        },
        {
          tokenHash: hashOpaqueToken(refresh),
          grantId: grant.id,
          kind: 'refresh',
          expiresAt: grant.expiresAt,
        },
      ],
    });
    return {
      access_token: access,
      refresh_token: refresh,
      token_type: 'Bearer',
      expires_in: Math.max(
        0,
        Math.min(
          3600,
          Math.floor((grant.expiresAt.getTime() - Date.now()) / 1000),
        ),
      ),
      scope: scopes.join(' '),
    };
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    code: string,
    _verifier?: string,
    redirectUri?: string,
    resource?: URL,
  ) {
    this.target(resource);
    const { row, payload } = await this.request(code, 'code');
    if (
      payload.clientId !== client.client_id ||
      redirectUri !== payload.redirectUri ||
      !payload.grantId
    )
      throw new InvalidGrantError(
        'Code, client, or redirect URI does not match',
      );
    const grant = await this.grant(payload.grantId);
    return this.prisma.$transaction(async (tx) => {
      const used = await tx.mcpOAuthRequest.updateMany({
        where: {
          tokenHash: row.tokenHash,
          usedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { usedAt: new Date() },
      });
      if (used.count !== 1) throw new InvalidGrantError('Code already used');
      return this.issue(tx, grant);
    });
  }

  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    token: string,
    scopes?: string[],
    resource?: URL,
  ) {
    this.assertEnabled();
    this.target(resource);
    const record = await this.prisma.mcpOAuthToken.findUnique({
      where: { tokenHash: hashOpaqueToken(token) },
    });
    if (!record || record.kind !== 'refresh' || record.expiresAt <= new Date())
      throw new InvalidGrantError('Refresh token expired');
    const grant = await this.grant(record.grantId);
    if (grant.clientId !== client.client_id)
      throw new InvalidGrantError('Wrong client');
    if (record.usedAt) {
      await this.prisma.mcpOAuthGrant.update({
        where: { id: grant.id },
        data: { revokedAt: new Date() },
      });
      throw new InvalidGrantError('Refresh token reuse detected; reconnect');
    }
    // Never silently expand or change the consented grant during refresh.
    if (
      scopes &&
      (scopes.length !== grant.scopes.length ||
        scopes.some((scope) => !grant.scopes.includes(scope)))
    )
      throw new InvalidScopeError('Reconnect to change permissions');
    return this.prisma.$transaction(async (tx) => {
      const used = await tx.mcpOAuthToken.updateMany({
        where: { tokenHash: record.tokenHash, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (used.count !== 1)
        throw new InvalidGrantError('Refresh token already rotated');
      return this.issue(tx, grant);
    });
  }

  async verifyAccessToken(token: string) {
    this.assertEnabled();
    const record = await this.prisma.mcpOAuthToken.findUnique({
      where: { tokenHash: hashOpaqueToken(token) },
    });
    if (!record || record.kind !== 'access' || record.expiresAt <= new Date())
      throw new InvalidTokenError('Invalid access token');
    const grant = await this.grant(record.grantId);
    return {
      token,
      clientId: grant.clientId,
      scopes: grant.scopes,
      expiresAt: Math.floor(record.expiresAt.getTime() / 1000),
      resource: this.resource,
      extra: {
        userId: grant.userId,
        grantId: grant.id,
        siteIds: grant.siteIds,
      },
    };
  }

  async revokeToken(
    client: OAuthClientInformationFull,
    request: OAuthTokenRevocationRequest,
  ) {
    const record = await this.prisma.mcpOAuthToken.findUnique({
      where: { tokenHash: hashOpaqueToken(request.token) },
      include: { grant: true },
    });
    if (record?.grant.clientId === client.client_id)
      await this.prisma.mcpOAuthGrant.update({
        where: { id: record.grantId },
        data: { revokedAt: new Date() },
      });
  }

  async connections(userId: string) {
    this.assertEnabled();
    const grants = await this.prisma.mcpOAuthGrant.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(
      grants.map(async (grant) => {
        const client = await this.prisma.mcpOAuthClient.findUnique({
          where: { id: grant.clientId },
        });
        return {
          id: grant.id,
          clientName:
            (client?.metadata as { client_name?: string } | undefined)
              ?.client_name || 'AI assistant',
          scopes: grant.scopes,
          siteIds: grant.siteIds,
          createdAt: grant.createdAt,
          expiresAt: grant.expiresAt,
        };
      }),
    );
  }

  async revokeConnection(userId: string, id: string) {
    this.assertEnabled();
    const result = await this.prisma.mcpOAuthGrant.updateMany({
      where: { id, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (!result.count) throw new NotFoundException('Connection not found');
    return { revoked: true };
  }

  async cleanup() {
    const now = new Date();
    await this.prisma.mcpOAuthRequest.deleteMany({
      where: { expiresAt: { lt: now } },
    });
    await this.prisma.mcpOAuthGrant.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: now } },
          { revokedAt: { lt: new Date(Date.now() - 86400_000) } },
        ],
      },
    });
    await this.prisma.mcpOAuthToken.deleteMany({
      where: { kind: 'access', expiresAt: { lt: now } },
    });
  }
}
