import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateProfileDto } from './users.dto';

const selectUser = {
  id: true,
  email: true,
  displayName: true,
  role: true,
  plan: true,
  status: true,
  emailVerifiedAt: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}
  getMe(id: string) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id },
      select: selectUser,
    });
  }
  updateMe(id: string, dto: UpdateProfileDto) {
    return this.prisma.user.update({
      where: { id },
      data: { displayName: dto.displayName?.trim() },
      select: selectUser,
    });
  }
  async deleteMe(id: string) {
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: { status: UserStatus.DELETED, deletedAt: new Date() },
      }),
      this.prisma.session.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    return { message: 'Account deleted' };
  }
  async sessions(userId: string, currentSessionId: string) {
    const sessions = await this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      select: {
        id: true,
        userAgent: true,
        ipAddress: true,
        deviceName: true,
        expiresAt: true,
        lastUsedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return sessions.map((session) => ({
      ...session,
      current: session.id === currentSessionId,
    }));
  }
  async revokeSession(userId: string, sessionId: string) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });
    if (!session) throw new NotFoundException('Session not found');
    if (session.userId !== userId)
      throw new ForbiddenException('Session does not belong to current user');
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { message: 'Session revoked' };
  }
}
