// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { renderHook, waitFor, cleanup } from '@testing-library/react';
import * as ipcMod from '@renderer/ipc/client';
import { useReports } from '@renderer/hooks/useReports';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const netWorth = { total: 9200, accounts: [{ accountId: 'a', name: 'A', balance: 9200 }] };
const recurring = {
  subscriptions: [
    {
      label: 'NETFLIX',
      amount: 13.49,
      cadence: 'monthly',
      monthlyEquivalent: 13.49,
      occurrences: 4,
      lastDate: '2026-04-15',
      nextDueDate: '2026-05-15',
    },
  ],
  monthlyTotal: 13.49,
};
const transactions = [{ id: 't1', amount: -42 }];
const yearSeries = [{ period: '2026', income: 9000, expense: -4000, net: 5000 }];

beforeEach(() => {
  vi.spyOn(ipcMod.ipc, 'invoke').mockImplementation(((channel: string) => {
    switch (channel) {
      case 'dashboard:netWorth':
        return Promise.resolve(netWorth);
      case 'recurring:list':
        return Promise.resolve(recurring);
      case 'dashboard:getTransactions':
        return Promise.resolve({ transactions });
      case 'dashboard:cashflow':
        return Promise.resolve({ series: yearSeries });
      default:
        return Promise.resolve({});
    }
  }) as typeof ipcMod.ipc.invoke);
});

describe('useReports', () => {
  it('loads net worth, recurring, transactions and the year series', async () => {
    const { result } = renderHook(() => useReports());
    await waitFor(() => {
      expect(result.current.netWorth).toEqual(netWorth);
    });
    expect(result.current.recurring).toEqual(recurring);
    expect(result.current.transactions).toEqual(transactions);
    expect(result.current.yearSeries).toEqual(yearSeries);
  });
});
