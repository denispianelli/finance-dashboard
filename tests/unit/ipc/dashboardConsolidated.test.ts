import { describe, it, expect, afterEach, vi } from 'vitest';

const db = { __fake: true };
vi.mock('../../../src/main/db', () => ({ getDb: () => db }));

const cashflow = [{ period: '2026', income: 1000, expense: -400, net: 600 }];
const netWorth = {
  total: 1200,
  accounts: [{ accountId: 'perso', name: 'Perso', balance: 1200 }],
  assets: [],
  loans: [],
};
const getConsolidatedCashflow = vi.fn<(db: unknown, granularity: unknown) => typeof cashflow>(
  () => cashflow,
);
const getNetWorth = vi.fn<(db: unknown) => typeof netWorth>(() => netWorth);
vi.mock('../../../src/main/dashboard/consolidated', () => ({
  getConsolidatedCashflow: (dbArg: unknown, granularity: unknown) =>
    getConsolidatedCashflow(dbArg, granularity),
  getNetWorth: (dbArg: unknown) => getNetWorth(dbArg),
}));

import {
  handleDashboardCashflow,
  handleDashboardNetWorth,
} from '../../../src/main/ipc/handlers/dashboardConsolidated';

afterEach(() => {
  vi.clearAllMocks();
});

describe('dashboard consolidated handlers', () => {
  it('cashflow handler passes the granularity through and returns the series', () => {
    const res = handleDashboardCashflow({ granularity: 'year' });
    expect(getConsolidatedCashflow).toHaveBeenCalledWith(db, 'year');
    expect(res).toEqual({ series: cashflow });
  });

  it('net worth handler returns the consolidated total', () => {
    const res = handleDashboardNetWorth();
    expect(getNetWorth).toHaveBeenCalledWith(db);
    expect(res).toEqual(netWorth);
  });
});
