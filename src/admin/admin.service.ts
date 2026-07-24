import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole, UserStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AccessPrincipal } from '../common/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { UserQueryDto } from './admin.dto';

const select = {
  id: true,
  email: true,
  displayName: true,
  role: true,
  status: true,
  emailVerifiedAt: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} as const;

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}
  async list(query: UserQueryDto) {
    const where = query.search
      ? {
          OR: [
            {
              email: {
                contains: query.search.toLowerCase(),
                mode: 'insensitive' as const,
              },
            },
            {
              displayName: {
                contains: query.search,
                mode: 'insensitive' as const,
              },
            },
          ],
        }
      : {};
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);
    return {
      items,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        pages: Math.ceil(total / query.limit),
      },
    };
  }
  async get(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }
  async block(actor: AccessPrincipal, id: string) {
    await this.assertCanAlter(actor, id);
    const user = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: { status: UserStatus.BLOCKED },
        select,
      });
      await tx.session.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return updated;
    });
    this.audit.record('user.blocked', actor.userId, id);
    return user;
  }
  async unblock(actor: AccessPrincipal, id: string) {
    await this.assertCanAlter(actor, id);
    const existing = await this.prisma.user.findUniqueOrThrow({
      where: { id },
    });
    if (existing.deletedAt)
      throw new ForbiddenException('Deleted accounts cannot be unblocked');
    const user = await this.prisma.user.update({
      where: { id },
      data: {
        status: existing.emailVerifiedAt
          ? UserStatus.ACTIVE
          : UserStatus.PENDING_VERIFICATION,
      },
      select,
    });
    this.audit.record('user.unblocked', actor.userId, id);
    return user;
  }
  private async assertCanAlter(actor: AccessPrincipal, id: string) {
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException('User not found');
    if (actor.userId === id)
      throw new ForbiddenException('Administrators cannot alter themselves');
    if (actor.role === UserRole.ADMIN && target.role === UserRole.SUPER_ADMIN)
      throw new ForbiddenException(
        'Administrators cannot alter a super administrator',
      );
  }
}
