// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach, beforeAll } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import * as ipcMod from '@renderer/ipc/client';
import { ReportsPage } from '@renderer/pages/ReportsPage';

// The area chart uses Recharts' ResponsiveContainer, which needs ResizeObserver.
beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe(): void {
      return undefined;
    }
    unobserve(): void {
      return undefined;
    }
    disconnect(): void {
      return undefined;
    }
  };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const cashflow = [{ period: '2026-04', income: 2000, expense: -500, net: 1500 }];
const netWorth = { total: 9200, accounts: [{ accountId: 'a', name: 'Compte A', balance: 9200 }] };
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
const transactions = [
  {
    id: 't1',
    accountId: 'a',
    date: '2026-04-10',
    amount: -200,
    labelRaw: 'SUPER U',
    labelClean: 'SUPER U',
    categoryId: 'c1',
    categoryName: 'Courses',
    categoryColor: null,
    categoryIcon: null,
    originalDate: null,
    originalAmount: null,
    editedAt: null,
    isInternalTransfer: false,
    userModified: false,
  },
];

beforeEach(() => {
  vi.spyOn(ipcMod.ipc, 'invoke').mockImplementation(((channel: string) => {
    switch (channel) {
      case 'dashboard:cashflow':
        return Promise.resolve({ series: cashflow });
      case 'dashboard:netWorth':
        return Promise.resolve(netWorth);
      case 'recurring:list':
        return Promise.resolve(recurring);
      case 'dashboard:getTransactions':
        return Promise.resolve({ transactions });
      default:
        return Promise.resolve({});
    }
  }) as typeof ipcMod.ipc.invoke);
});

describe('ReportsPage', () => {
  it('renders the cash-flow card from the channel data', async () => {
    render(<ReportsPage />);
    await waitFor(() => {
      expect(screen.getByText(/gains et pertes/i)).toBeTruthy();
    });
    // "avril 2026" appears in both the cash-flow rows and the biggest-movements list.
    expect(screen.getAllByText(/avril 2026/i).length).toBeGreaterThan(0);
  });

  it('renders the net worth, top categories, recurring and biggest-movements sections', async () => {
    render(<ReportsPage />);
    await waitFor(() => {
      expect(screen.getByText(/patrimoine · tous comptes/i)).toBeTruthy();
    });
    expect(screen.getByText('Compte A')).toBeTruthy();
    expect(screen.getByText('Courses')).toBeTruthy();
    expect(screen.getByText('NETFLIX')).toBeTruthy();
    expect(screen.getByText(/plus gros mouvements/i)).toBeTruthy();
    expect(screen.getByText('SUPER U')).toBeTruthy();
  });
});
