import { validateSocialEnvironment } from './configuration';

describe('Social provider deployment configuration', () => {
  it('is optional when no provider is enabled', () => {
    expect(() => validateSocialEnvironment({})).not.toThrow();
  });
  it('requires paired credentials and a fixed callback origin', () => {
    expect(() =>
      validateSocialEnvironment({ GOOGLE_CLIENT_ID: 'client' }),
    ).toThrow('GOOGLE_CLIENT_SECRET');
    expect(() =>
      validateSocialEnvironment({
        GOOGLE_CLIENT_ID: 'client',
        GOOGLE_CLIENT_SECRET: 'test-secret',
        OAUTH_CALLBACK_BASE_URL: 'https://gateway.example.com/path',
        FRONTEND_URL: 'https://example.com',
      }),
    ).toThrow('origin');
  });
  it('allows local development but rejects public HTTP and arbitrary Facebook versions', () => {
    const base = {
      GITHUB_CLIENT_ID: 'client',
      GITHUB_CLIENT_SECRET: 'test-secret',
      OAUTH_CALLBACK_BASE_URL: 'http://localhost:3000',
      FRONTEND_URL: 'http://localhost:5173',
    };
    expect(() => validateSocialEnvironment(base)).not.toThrow();
    expect(() =>
      validateSocialEnvironment({
        ...base,
        OAUTH_CALLBACK_BASE_URL: 'http://gateway.example.com',
      }),
    ).toThrow('HTTPS');
    expect(() =>
      validateSocialEnvironment({ FACEBOOK_GRAPH_API_VERSION: '../../bad' }),
    ).toThrow('FACEBOOK_GRAPH_API_VERSION');
  });
});
