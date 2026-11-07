import { ConfigService } from '@nestjs/config';
import { SocialAuthProviders, socialHash } from './social-auth.providers';

const configuration = {
  OAUTH_CALLBACK_BASE_URL: 'https://gateway.example.com',
  GOOGLE_CLIENT_ID: 'google-client',
  GOOGLE_CLIENT_SECRET: 'test-google-secret',
  GITHUB_CLIENT_ID: 'github-client',
  GITHUB_CLIENT_SECRET: 'test-github-secret',
  FACEBOOK_CLIENT_ID: 'facebook-client',
  FACEBOOK_CLIENT_SECRET: 'test-facebook-secret',
  FACEBOOK_GRAPH_API_VERSION: 'v23.0',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

describe('Social provider adapters', () => {
  const originalFetch = global.fetch;
  let fetcher: jest.Mock;
  let providers: SocialAuthProviders;
  beforeEach(() => {
    fetcher = jest.fn();
    global.fetch = fetcher;
    providers = new SocialAuthProviders(new ConfigService(configuration));
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('does not advertise providers without credentials', () => {
    expect(new SocialAuthProviders(new ConfigService({})).list()).toEqual([]);
    expect(providers.list()).toEqual(['google', 'github', 'facebook']);
  });
  it('binds the authorization URL to the provider callback, state, and server PKCE', () => {
    const url = new URL(
      providers.authorizationUrl('github', 'state', 'provider-verifier'),
    );
    expect(url.origin).toBe('https://github.com');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://gateway.example.com/api/v1/auth/social/github/callback',
    );
    expect(url.searchParams.get('state')).toBe('state');
    expect(url.searchParams.get('code_challenge')).toBe(
      socialHash('provider-verifier'),
    );
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(
      new URL(
        providers.authorizationUrl('facebook', 'state', 'unused'),
      ).searchParams.get('scope'),
    ).toBe('email,public_profile');
  });
  it('accepts Google identity only through server token exchange and strict verified-email claim', async () => {
    fetcher
      .mockResolvedValueOnce(json({ access_token: 'provider-token' }))
      .mockResolvedValueOnce(
        json({
          sub: 'google-subject',
          email: 'user@gmail.com',
          email_verified: true,
          name: 'Designer',
        }),
      );
    await expect(
      providers.profileForCode('google', 'code', 'verifier'),
    ).resolves.toMatchObject({ subject: 'google-subject', emailTrusted: true });
    expect((fetcher.mock.calls[0] as [string, RequestInit])[1]).toMatchObject({
      redirect: 'error',
      method: 'POST',
    });
    expect(
      new URLSearchParams(
        (fetcher.mock.calls[0] as [string, RequestInit])[1].body as string,
      ).get('code_verifier'),
    ).toBe('verifier');
    fetcher
      .mockResolvedValueOnce(json({ access_token: 'provider-token' }))
      .mockResolvedValueOnce(
        json({ sub: 'subject', email: 'u@gmail.com', email_verified: 'true' }),
      );
    await expect(
      providers.profileForCode('google', 'code', 'verifier'),
    ).rejects.toMatchObject({ code: 'email_not_verified' });
  });
  it('requires local mailbox verification for external non-hosted Google email', async () => {
    fetcher
      .mockResolvedValueOnce(json({ access_token: 'provider-token' }))
      .mockResolvedValueOnce(
        json({
          sub: 'google-subject',
          email: 'user@example.com',
          email_verified: true,
        }),
      );
    await expect(
      providers.profileForCode('google', 'code', 'verifier'),
    ).resolves.toMatchObject({ emailTrusted: false });
  });
  it('uses GitHub verified primary email even when the public profile email is private', async () => {
    fetcher
      .mockResolvedValueOnce(json({ access_token: 'provider-token' }))
      .mockResolvedValueOnce(json({ id: 123, email: null }))
      .mockResolvedValueOnce(
        json([
          { email: 'public@example.com', primary: false, verified: true },
          { email: 'private@example.com', primary: true, verified: true },
        ]),
      );
    await expect(
      providers.profileForCode('github', 'code', 'verifier'),
    ).resolves.toMatchObject({
      subject: '123',
      email: 'private@example.com',
      emailTrusted: true,
    });
  });
  it('rejects GitHub primary email when it is not verified', async () => {
    fetcher
      .mockResolvedValueOnce(json({ access_token: 'provider-token' }))
      .mockResolvedValueOnce(json({ id: 123 }))
      .mockResolvedValueOnce(
        json([{ email: 'u@example.com', primary: true, verified: false }]),
      );
    await expect(
      providers.profileForCode('github', 'code', 'verifier'),
    ).rejects.toMatchObject({ code: 'email_not_verified' });
  });
  it('never trusts Facebook email and does not put the access token in a URL', async () => {
    fetcher
      .mockResolvedValueOnce(json({ access_token: 'facebook-token' }))
      .mockResolvedValueOnce(
        json({
          id: 'facebook-user',
          email: 'user@example.com',
          verified: true,
        }),
      );
    await expect(
      providers.profileForCode('facebook', 'code', 'verifier'),
    ).resolves.toMatchObject({ emailTrusted: false });
    const url = new URL((fetcher.mock.calls[1] as [string, RequestInit])[0]);
    expect(url.searchParams.has('appsecret_proof')).toBe(true);
    expect(url.toString()).not.toContain('facebook-token');
    expect(
      (
        (fetcher.mock.calls[1] as [string, RequestInit])[1].headers as Record<
          string,
          string
        >
      ).Authorization,
    ).toBe('Bearer facebook-token');
  });
  it('normalizes provider failures without leaking their raw response', async () => {
    fetcher.mockResolvedValueOnce(
      json({ error: 'secret response detail' }, 400),
    );
    await expect(
      providers.profileForCode('google', 'code', 'verifier'),
    ).rejects.toMatchObject({
      message: 'provider_error',
      code: 'provider_error',
    });
  });
});
