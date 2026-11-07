import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac } from 'node:crypto';
import { isEmail } from 'class-validator';

export const SOCIAL_PROVIDERS = ['google', 'github', 'facebook'] as const;
export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number];
export type SocialErrorCode =
  | 'access_denied'
  | 'invalid_state'
  | 'provider_unavailable'
  | 'provider_error'
  | 'email_unavailable'
  | 'email_not_verified'
  | 'account_exists'
  | 'account_unavailable'
  | 'identity_in_use'
  | 'email_verification_required'
  | 'invalid_request';
export class SocialAuthError extends Error {
  constructor(public readonly code: SocialErrorCode) {
    super(code);
  }
}
export type SocialProfile = {
  subject: string;
  email: string | null;
  emailTrusted: boolean;
  displayName: string | null;
};
export const socialHash = (input: string) =>
  createHash('sha256').update(input).digest('base64url');
export const asProvider = (input: string): SocialProvider => {
  if (!(SOCIAL_PROVIDERS as readonly string[]).includes(input)) {
    throw new SocialAuthError('provider_unavailable');
  }
  return input as SocialProvider;
};

@Injectable()
export class SocialAuthProviders {
  constructor(private readonly config: ConfigService) {}

  list(): SocialProvider[] {
    return SOCIAL_PROVIDERS.filter((provider) => this.configured(provider));
  }
  configured(provider: SocialProvider) {
    return !!(
      this.config.get<string>('OAUTH_CALLBACK_BASE_URL')?.trim() &&
      this.config.get<string>(`${provider.toUpperCase()}_CLIENT_ID`)?.trim() &&
      this.config
        .get<string>(`${provider.toUpperCase()}_CLIENT_SECRET`)
        ?.trim() &&
      (provider !== 'facebook' ||
        this.config.get<string>('FACEBOOK_GRAPH_API_VERSION')?.trim())
    );
  }
  callbackUri(provider: SocialProvider) {
    return new URL(
      `/api/v1/auth/social/${provider}/callback`,
      this.config.getOrThrow<string>('OAUTH_CALLBACK_BASE_URL'),
    ).toString();
  }
  private credentials(provider: SocialProvider) {
    if (!this.configured(provider)) {
      throw new SocialAuthError('provider_unavailable');
    }
    return {
      clientId: this.config
        .getOrThrow<string>(`${provider.toUpperCase()}_CLIENT_ID`)
        .trim(),
      clientSecret: this.config
        .getOrThrow<string>(`${provider.toUpperCase()}_CLIENT_SECRET`)
        .trim(),
    };
  }
  authorizationUrl(provider: SocialProvider, state: string, verifier: string) {
    const { clientId } = this.credentials(provider);
    const endpoints = {
      google: 'https://accounts.google.com/o/oauth2/v2/auth',
      github: 'https://github.com/login/oauth/authorize',
      facebook: `https://www.facebook.com/${this.facebookVersion()}/dialog/oauth`,
    };
    const url = new URL(endpoints[provider]);
    url.search = new URLSearchParams({
      client_id: clientId,
      redirect_uri: this.callbackUri(provider),
      state,
      response_type: 'code',
      scope:
        provider === 'google'
          ? 'openid email profile'
          : provider === 'github'
            ? 'read:user user:email'
            : 'email,public_profile',
    }).toString();
    if (provider !== 'facebook') {
      url.searchParams.set('code_challenge', socialHash(verifier));
      url.searchParams.set('code_challenge_method', 'S256');
    }
    if (provider === 'google') {
      url.searchParams.set('prompt', 'select_account');
    }
    return url.toString();
  }
  private facebookVersion() {
    const value = this.config.get<string>('FACEBOOK_GRAPH_API_VERSION', '');
    if (value && !/^v\d+\.\d+$/.test(value)) {
      throw new SocialAuthError('provider_unavailable');
    }
    return value;
  }
  private async json(url: string, init: RequestInit = {}): Promise<unknown> {
    try {
      const response = await fetch(url, {
        ...init,
        redirect: 'error',
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        throw new SocialAuthError('provider_error');
      }
      const text = await response.text();
      if (text.length > 1_000_000) {
        throw new SocialAuthError('provider_error');
      }
      return JSON.parse(text) as unknown;
    } catch {
      throw new SocialAuthError('provider_error');
    }
  }
  private record(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new SocialAuthError('provider_error');
    }
    return value as Record<string, unknown>;
  }
  private profile(
    value: Record<string, unknown>,
    subject: unknown,
    trusted: boolean,
  ): SocialProfile {
    const id =
      typeof subject === 'string'
        ? subject
        : typeof subject === 'number' && Number.isSafeInteger(subject)
          ? String(subject)
          : '';
    if (!id || id.length > 255) {
      throw new SocialAuthError('provider_error');
    }
    const email =
      typeof value.email === 'string' ? value.email.trim().toLowerCase() : null;
    if (email && (!isEmail(email) || email.length > 320)) {
      throw new SocialAuthError('email_unavailable');
    }
    return {
      subject: id,
      email,
      emailTrusted: trusted,
      displayName:
        typeof value.name === 'string'
          ? value.name.trim().slice(0, 100) || null
          : null,
    };
  }
  async profileForCode(
    provider: SocialProvider,
    code: string,
    verifier: string,
  ): Promise<SocialProfile> {
    const { clientId, clientSecret } = this.credentials(provider);
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: this.callbackUri(provider),
      grant_type: 'authorization_code',
    });
    if (provider !== 'facebook') {
      body.set('code_verifier', verifier);
    }
    const tokenEndpoint =
      provider === 'google'
        ? 'https://oauth2.googleapis.com/token'
        : provider === 'github'
          ? 'https://github.com/login/oauth/access_token'
          : `https://graph.facebook.com/${this.facebookVersion()}/oauth/access_token`;
    const tokenResult = this.record(
      await this.json(tokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: body.toString(),
      }),
    );
    const token = tokenResult.access_token;
    if (
      typeof token !== 'string' ||
      !token ||
      token.length > 16_384 ||
      tokenResult.error
    ) {
      throw new SocialAuthError('provider_error');
    }
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'User-Agent': 'dLander-Social-Login',
    };
    if (provider === 'google') {
      const profile = this.record(
        await this.json('https://openidconnect.googleapis.com/v1/userinfo', {
          headers,
        }),
      );
      if (profile.email_verified !== true) {
        throw new SocialAuthError('email_not_verified');
      }
      const email =
        typeof profile.email === 'string'
          ? profile.email.trim().toLowerCase()
          : '';
      // Google is only authoritative for Gmail and Google-hosted domains.
      const authoritative =
        email.endsWith('@gmail.com') ||
        (typeof profile.hd === 'string' &&
          email.split('@')[1] === profile.hd.toLowerCase());
      return this.profile(profile, profile.sub, authoritative);
    }
    if (provider === 'github') {
      const profile = this.record(
        await this.json('https://api.github.com/user', { headers }),
      );
      const emails = await this.json('https://api.github.com/user/emails', {
        headers,
      });
      if (!Array.isArray(emails)) {
        throw new SocialAuthError('provider_error');
      }
      const primary = emails
        .map((entry) => this.record(entry))
        .find(
          (entry) =>
            entry.primary === true &&
            entry.verified === true &&
            typeof entry.email === 'string',
        );
      if (!primary) {
        throw new SocialAuthError('email_not_verified');
      }
      return this.profile(
        { ...profile, email: primary.email },
        profile.id,
        true,
      );
    }
    const profileUrl = new URL(
      `https://graph.facebook.com/${this.facebookVersion()}/me`,
    );
    profileUrl.search = new URLSearchParams({
      fields: 'id,name,email',
      appsecret_proof: createHmac('sha256', clientSecret)
        .update(token)
        .digest('hex'),
    }).toString();
    const profile = this.record(
      await this.json(profileUrl.toString(), { headers }),
    );
    // Graph email is not proof of current mailbox ownership; app OTP is mandatory for signup.
    return this.profile(profile, profile.id, false);
  }
}
