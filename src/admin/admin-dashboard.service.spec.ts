import { AdminDashboardService } from './admin-dashboard.service';

describe('AdminDashboardService', () => {
  it('creates a gap-free UTC trend and counts paid revenue', () => {
    const service = new AdminDashboardService({} as never);
    const since = new Date('2026-08-01T00:00:00.000Z');
    const trend = (
      service as unknown as {
        timeline(
          start: Date,
          days: number,
          users: { createdAt: Date }[],
          templates: { createdAt: Date }[],
          orders: { createdAt: Date; status: string; priceMinor: number }[],
        ): {
          date: string;
          users: number;
          templates: number;
          orders: number;
          paidRevenueMinor: number;
        }[];
      }
    ).timeline(
      since,
      3,
      [{ createdAt: new Date('2026-08-01T10:00:00Z') }],
      [{ createdAt: new Date('2026-08-03T10:00:00Z') }],
      [
        {
          createdAt: new Date('2026-08-01T11:00:00Z'),
          status: 'PAID',
          priceMinor: 2500,
        },
      ],
    );
    expect(trend).toEqual([
      {
        date: '2026-08-01',
        users: 1,
        templates: 0,
        orders: 1,
        paidRevenueMinor: 2500,
      },
      {
        date: '2026-08-02',
        users: 0,
        templates: 0,
        orders: 0,
        paidRevenueMinor: 0,
      },
      {
        date: '2026-08-03',
        users: 0,
        templates: 1,
        orders: 0,
        paidRevenueMinor: 0,
      },
    ]);
  });
});
