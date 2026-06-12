import { describe, it, expect, afterEach, vi } from 'vitest';

const db = { __fake: true };
vi.mock('../../../src/main/db', () => ({ getDb: () => db }));

const points = [{ period: '2026-05', balance: 1200 }];
const getBalanceSeries = vi.fn<(db: unknown, accountId: unknown, range: unknown) => typeof points>(
  () => points,
);
vi.mock('../../../src/main/dashboard/balanceSeries', () => ({
  getBalanceSeries: (dbArg: unknown, accountId: unknown, range: unknown) =>
    getBalanceSeries(dbArg, accountId, range),
}));

import { handleDashboardBalanceSeries } from '../../../src/main/ipc/handlers/dashboardBalanceSeries';

afterEach(() => {
  vi.clearAllMocks();
});

describe('dashboard balance series handler', () => {
  it('passes account and range through and returns the points', () => {
    const res = handleDashboardBalanceSeries({ accountId: 'a1', range: '3m' });
    expect(getBalanceSeries).toHaveBeenCalledWith(db, 'a1', '3m');
    expect(res).toEqual({ points });
  });
});
