import { ConfigService } from '@nestjs/config';
import { UserStatus } from '@prisma/client';
import { AuthService } from './auth.service';

const config = new ConfigService({
  EMAIL_VERIFICATION_REQUIRED: 'false',
  EMAIL_VERIFICATION_EXPIRES_IN: '24h',
});
describe('Social email verification independent of password signup settings', () => {
  const user = {
    id: 'user-1',
    email: 'user@example.com',
    status: UserStatus.PENDING_VERIFICATION,
    emailVerifiedAt: null,
    deletedAt: null,
  };
  const record = {
    id: 'otp-1',
    userId: user.id,
    usedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
  };
  let prisma: {
    user: { findUnique: jest.Mock; update: jest.Mock };
    emailVerificationToken: {
      findUnique: jest.Mock;
      updateMany: jest.Mock;
      create: jest.Mock;
      findFirst: jest.Mock;
    };
    socialIdentity: { count: jest.Mock };
    $transaction: jest.Mock;
  };
  let mail: { sendVerification: jest.Mock };
  let auth: AuthService;
  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(user),
        update: jest.fn(),
      },
      emailVerificationToken: {
        findUnique: jest.fn().mockResolvedValue(record),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn(),
        findFirst: jest.fn(),
      },
      socialIdentity: { count: jest.fn().mockResolvedValue(1) },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation((operation: unknown) =>
      typeof operation === 'function'
        ? (operation as (tx: unknown) => unknown)(prisma)
        : Promise.all(operation as Promise<unknown>[]),
    );
    mail = { sendVerification: jest.fn() };
    auth = new AuthService(prisma as never, {} as never, config, mail as never);
  });
  it('verifies an issued social OTP even when global password-signup verification is off', async () => {
    await expect(auth.verifyEmail('123456')).resolves.toEqual({
      message: 'Email verified successfully',
    });
    const update = (
      prisma.user.update.mock.calls[0] as [
        { data: { status: UserStatus; emailVerifiedAt: Date } },
      ]
    )[0];
    expect(update.data.status).toBe(UserStatus.ACTIVE);
    expect(update.data.emailVerifiedAt).toBeInstanceOf(Date);
  });
  it('never reactivates a blocked or deleted account using an old OTP', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...user,
      status: UserStatus.BLOCKED,
    });
    await expect(auth.verifyEmail('123456')).rejects.toThrow(
      'Account is unavailable',
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.emailVerificationToken.updateMany).not.toHaveBeenCalled();
  });
  it('can issue local proof for an active account before linking a different-email provider', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...user,
      status: UserStatus.ACTIVE,
    });
    await auth.sendSocialVerification(user.id);
    expect(mail.sendVerification).toHaveBeenCalledWith(
      user.email,
      expect.stringMatching(/^\d{6}$/),
    );
  });
  it('allows resending pending social verification without disclosing account existence', async () => {
    await expect(auth.resendVerification(user.email)).resolves.toEqual({
      message: 'If the account is eligible, a verification code has been sent.',
    });
    expect(mail.sendVerification).toHaveBeenCalled();
  });
});
