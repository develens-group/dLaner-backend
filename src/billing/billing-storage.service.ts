import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BillingPlansService } from './billing-plans.service';

@Injectable()
export class BillingStorageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: BillingPlansService,
  ) {}

  /** Bytes used by retained land revisions for non-deleted lands. */
  async usedBytes(userId: string): Promise<bigint> {
    const rows = await this.prisma.landRevision.aggregate({
      where: {
        land: { ownerId: userId, deletedAt: null },
      },
      _sum: { sizeBytes: true },
    });
    return BigInt(rows._sum.sizeBytes ?? 0);
  }

  async limitBytes(userId: string): Promise<bigint> {
    const plan = await this.plans.resolveEffectivePlan(userId);
    return BigInt(plan.storageBytesLimit);
  }

  async usage(userId: string) {
    const [usedBytes, limitBytes] = await Promise.all([
      this.usedBytes(userId),
      this.limitBytes(userId),
    ]);
    return {
      usedBytes: String(usedBytes),
      limitBytes: String(limitBytes),
      remainingBytes: String(
        limitBytes > usedBytes ? limitBytes - usedBytes : 0n,
      ),
    };
  }

  /**
   * Ensure adding `additionalBytes` (and optionally replacing `replacingBytes`
   * of an obsolete revision set) stays within the plan quota.
   */
  async assertCanStore(
    userId: string,
    additionalBytes: number,
    replacingBytes = 0,
  ) {
    if (additionalBytes < 0)
      throw new ForbiddenException({
        code: 'STORAGE_INVALID',
        message: 'Invalid storage delta',
      });
    const used = await this.usedBytes(userId);
    const limit = await this.limitBytes(userId);
    const next = used - BigInt(Math.max(0, replacingBytes)) + BigInt(additionalBytes);
    if (next > limit) {
      throw new ForbiddenException({
        code: 'STORAGE_QUOTA_EXCEEDED',
        message: `Storage quota exceeded (${next} > ${limit} bytes). Upgrade your plan or delete Lands.`,
        usedBytes: String(used),
        limitBytes: String(limit),
      });
    }
  }

  async requireUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }
}
