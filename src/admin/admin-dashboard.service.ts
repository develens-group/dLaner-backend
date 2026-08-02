import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async get(days: number) {
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    since.setUTCDate(since.getUTCDate() - days + 1);
    const [
      usersTotal,
      usersNew,
      usersByStatus,
      usersByRole,
      requestsTotal,
      requestsErrors,
      requestsPeriod,
      aiTotal,
      aiPeriod,
      aiByStatus,
      templatesTotal,
      templatesPeriod,
      templatesByReview,
      templatesByVisibility,
      templateMetrics,
      ordersTotal,
      ordersPeriod,
      ordersByStatus,
      paid,
      creditAccounts,
      ledger,
      activeSessions,
      auditPeriod,
      recentUsers,
      recentTemplates,
      recentOrders,
      activityUsers,
      activityTemplates,
      activityOrders,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { createdAt: { gte: since } } }),
      this.prisma.user.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.user.groupBy({ by: ['role'], _count: { _all: true } }),
      this.prisma.apiRequestRecord.count(),
      this.prisma.apiRequestRecord.count({
        where: { createdAt: { gte: since }, statusCode: { gte: 400 } },
      }),
      this.prisma.apiRequestRecord.count({
        where: { createdAt: { gte: since } },
      }),
      this.prisma.aiRequest.count(),
      this.prisma.aiRequest.count({ where: { createdAt: { gte: since } } }),
      this.prisma.aiRequest.groupBy({
        by: ['status'],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
      }),
      this.prisma.template.count({ where: { deletedAt: null } }),
      this.prisma.template.count({
        where: { deletedAt: null, createdAt: { gte: since } },
      }),
      this.prisma.template.groupBy({
        by: ['reviewStatus'],
        where: { deletedAt: null },
        _count: { _all: true },
      }),
      this.prisma.template.groupBy({
        by: ['visibility'],
        where: { deletedAt: null },
        _count: { _all: true },
      }),
      this.prisma.templateMetric.groupBy({
        by: ['type'],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
      }),
      this.prisma.creditPurchaseOrder.count(),
      this.prisma.creditPurchaseOrder.count({
        where: { createdAt: { gte: since } },
      }),
      this.prisma.creditPurchaseOrder.groupBy({
        by: ['status'],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
      }),
      this.prisma.creditPurchaseOrder.aggregate({
        where: { status: 'PAID', paidAt: { gte: since } },
        _sum: { priceMinor: true, totalCreditAmount: true },
        _count: { _all: true },
      }),
      this.prisma.creditAccount.aggregate({
        _sum: {
          availableBalance: true,
          reservedBalance: true,
          lifetimePurchased: true,
          lifetimeConsumed: true,
        },
        _count: { _all: true },
      }),
      this.prisma.creditLedgerEntry.count({
        where: { createdAt: { gte: since } },
      }),
      this.prisma.session.count({
        where: { revokedAt: null, expiresAt: { gt: new Date() } },
      }),
      this.prisma.auditLog.count({ where: { createdAt: { gte: since } } }),
      this.prisma.user.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          displayName: true,
          role: true,
          status: true,
          createdAt: true,
        },
      }),
      this.prisma.template.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          slug: true,
          title: true,
          reviewStatus: true,
          visibility: true,
          createdAt: true,
          owner: { select: { id: true, displayName: true, email: true } },
        },
      }),
      this.prisma.creditPurchaseOrder.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          status: true,
          priceMinor: true,
          currency: true,
          totalCreditAmount: true,
          createdAt: true,
          user: { select: { id: true, email: true } },
        },
      }),
      this.prisma.user.findMany({
        where: { createdAt: { gte: since } },
        select: { createdAt: true },
      }),
      this.prisma.template.findMany({
        where: { createdAt: { gte: since } },
        select: { createdAt: true },
      }),
      this.prisma.creditPurchaseOrder.findMany({
        where: { createdAt: { gte: since } },
        select: { createdAt: true, status: true, priceMinor: true },
      }),
    ]);
    const trend = this.timeline(
      since,
      days,
      activityUsers,
      activityTemplates,
      activityOrders,
    );
    return {
      range: { days, since, generatedAt: new Date() },
      users: {
        total: usersTotal,
        new: usersNew,
        activeSessions,
        byStatus: this.countMap(usersByStatus, 'status'),
        byRole: this.countMap(usersByRole, 'role'),
      },
      requests: {
        total: requestsTotal,
        period: requestsPeriod,
        errors: requestsErrors,
        errorRate: requestsPeriod
          ? Number(((requestsErrors / requestsPeriod) * 100).toFixed(2))
          : 0,
      },
      ai: {
        total: aiTotal,
        period: aiPeriod,
        byStatus: this.countMap(aiByStatus, 'status'),
      },
      templates: {
        total: templatesTotal,
        new: templatesPeriod,
        byReviewStatus: this.countMap(templatesByReview, 'reviewStatus'),
        byVisibility: this.countMap(templatesByVisibility, 'visibility'),
        events: this.countMap(templateMetrics, 'type'),
      },
      commerce: {
        ordersTotal,
        ordersPeriod,
        ordersByStatus: this.countMap(ordersByStatus, 'status'),
        paidOrders: paid._count._all,
        revenueMinor: paid._sum.priceMinor ?? 0,
        creditsSold: paid._sum.totalCreditAmount ?? 0,
      },
      credits: {
        accounts: creditAccounts._count._all,
        available: creditAccounts._sum.availableBalance ?? 0,
        reserved: creditAccounts._sum.reservedBalance ?? 0,
        lifetimePurchased: creditAccounts._sum.lifetimePurchased ?? 0,
        lifetimeConsumed: creditAccounts._sum.lifetimeConsumed ?? 0,
        ledgerEntries: ledger,
      },
      operations: { auditEvents: auditPeriod },
      trend,
      recent: {
        users: recentUsers,
        templates: recentTemplates,
        orders: recentOrders,
      },
    };
  }

  private countMap<T extends Record<string, unknown>>(
    rows: (T & { _count: { _all: number } })[],
    key: keyof T,
  ) {
    return Object.fromEntries(
      rows.map((row) => [String(row[key]), row._count._all]),
    );
  }
  private timeline(
    since: Date,
    days: number,
    users: { createdAt: Date }[],
    templates: { createdAt: Date }[],
    orders: { createdAt: Date; status: string; priceMinor: number }[],
  ) {
    const map = new Map<
      string,
      {
        date: string;
        users: number;
        templates: number;
        orders: number;
        paidRevenueMinor: number;
      }
    >();
    for (let i = 0; i < days; i++) {
      const d = new Date(since);
      d.setUTCDate(d.getUTCDate() + i);
      const date = d.toISOString().slice(0, 10);
      map.set(date, {
        date,
        users: 0,
        templates: 0,
        orders: 0,
        paidRevenueMinor: 0,
      });
    }
    for (const x of users)
      map.get(x.createdAt.toISOString().slice(0, 10))!.users++;
    for (const x of templates)
      map.get(x.createdAt.toISOString().slice(0, 10))!.templates++;
    for (const x of orders) {
      const point = map.get(x.createdAt.toISOString().slice(0, 10))!;
      point.orders++;
      if (x.status === 'PAID') point.paidRevenueMinor += x.priceMinor;
    }
    return [...map.values()];
  }
}
