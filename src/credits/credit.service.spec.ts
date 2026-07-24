/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return */
import { ConfigService } from '@nestjs/config';
import { CreditLedgerType } from '@prisma/client';
import { UnprocessableEntityException } from '@nestjs/common';
import { CreditService } from './credit.service';

describe('CreditService', () => {
  const account = {
    id: 'account',
    userId: 'user',
    availableBalance: 100,
    reservedBalance: 0,
    lifetimePurchased: 0,
    lifetimeConsumed: 0,
    version: 2,
  };
  function setup(overrides: Record<string, unknown> = {}) {
    const tx = {
      creditAccount: {
        upsert: jest.fn().mockResolvedValue(account),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      creditLedgerEntry: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ id: 'ledger', ...data }),
          ),
      },
      creditReservation: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ id: 'reservation', status: 'ACTIVE', ...data }),
          ),
      },
      ...overrides,
    };
    const prisma = { $transaction: jest.fn((fn) => fn(tx)), ...tx };
    const service = new CreditService(
      prisma as never,
      new ConfigService({
        CREDIT_MAX_TRANSACTION_AMOUNT: 1_000_000,
        CREDIT_RESERVATION_TTL_SECONDS: 900,
      }),
    );
    return { service, tx };
  }
  it('creates an empty account lazily and reports total balance', async () => {
    const { service, tx } = setup();
    tx.creditAccount.upsert.mockResolvedValue({
      ...account,
      availableBalance: 0,
    });
    await expect(service.getBalance('user')).resolves.toEqual(
      expect.objectContaining({
        available: 0,
        reserved: 0,
        total: 0,
      }),
    );
    expect(tx.creditAccount.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user' },
        create: { userId: 'user' },
      }),
    );
  });
  it('atomically grants credits and writes the immutable ledger result', async () => {
    const { service, tx } = setup();
    const entry = await service.grantCredits('user', 25, 'grant-key', 'TEST');
    expect(tx.creditAccount.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'account', version: 2 },
        data: expect.objectContaining({ availableBalance: { increment: 25 } }),
      }),
    );
    expect(entry).toEqual(
      expect.objectContaining({
        type: CreditLedgerType.ADMIN_GRANT,
        availableBalanceAfter: 125,
      }),
    );
  });
  it('prevents spending beyond available credits', async () => {
    const { service } = setup();
    await expect(
      service.consumeCredits('user', 101, 'consume-key', 'TEST'),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });
  it('reserves available credits with a conditional versioned update', async () => {
    const { service, tx } = setup();
    const result = await service.reserveCredits(
      'user',
      40,
      'reserve-key',
      'AI_REQUEST',
      'ai',
    );
    expect(result).toEqual(
      expect.objectContaining({ id: 'reservation', amount: 40 }),
    );
    expect(tx.creditAccount.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          version: 2,
          availableBalance: { gte: 40 },
        }),
      }),
    );
    expect(tx.creditLedgerEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          availableDelta: -40,
          reservedDelta: 40,
        }),
      }),
    );
  });
  it('rejects a reservation when the conditional debit loses', async () => {
    const { service, tx } = setup();
    tx.creditAccount.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.reserveCredits('user', 40, 'reserve-key', 'AI_REQUEST', 'ai'),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });
});
