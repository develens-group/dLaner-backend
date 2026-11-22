import { ForbiddenException } from '@nestjs/common';
import { BillingStorageService } from './billing-storage.service';

describe('BillingStorageService', () => {
  const prisma = {
    landImage: {
      aggregate: jest.fn(() => Promise.resolve({ _sum: { sizeBytes: 0 } })),
    },
    landRevision: {
      aggregate: jest.fn(),
    },
  };
  const plans = {
    resolveEffectivePlan: jest.fn(),
  };
  const service = new BillingStorageService(prisma as never, plans as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reports used and remaining against plan limit', async () => {
    prisma.landRevision.aggregate.mockResolvedValue({
      _sum: { sizeBytes: 150 },
    });
    plans.resolveEffectivePlan.mockResolvedValue({
      storageBytesLimit: 1000n,
    });

    await expect(service.usage('user-1')).resolves.toEqual({
      usedBytes: '150',
      limitBytes: '1000',
      remainingBytes: '850',
    });
  });

  it('blocks saves that would exceed quota', async () => {
    prisma.landRevision.aggregate.mockResolvedValue({
      _sum: { sizeBytes: 900 },
    });
    plans.resolveEffectivePlan.mockResolvedValue({
      storageBytesLimit: 1000n,
    });

    await expect(
      service.assertCanStore('user-1', 200, 0),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows saves when pruning frees enough space', async () => {
    prisma.landRevision.aggregate.mockResolvedValue({
      _sum: { sizeBytes: 900 },
    });
    plans.resolveEffectivePlan.mockResolvedValue({
      storageBytesLimit: 1000n,
    });

    await expect(
      service.assertCanStore('user-1', 200, 150),
    ).resolves.toBeUndefined();
  });
});

it('includes separately stored image bytes in usage', async () => {
  const prisma = {
    landRevision: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { sizeBytes: 100 } }),
    },
    landImage: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { sizeBytes: 900 } }),
    },
  };
  const service = new BillingStorageService(prisma as never, {} as never);
  expect(await service.usedBytes('owner')).toBe(1000n);
  expect(prisma.landImage.aggregate).toHaveBeenCalledWith({
    where: { land: { ownerId: 'owner', deletedAt: null } },
    _sum: { sizeBytes: true },
  });
});
