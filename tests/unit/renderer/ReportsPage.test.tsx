// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach, beforeAll } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route, Outlet } from 'react-router-dom';
import * as ipcMod from '@renderer/ipc/client';
import { ReportsPage } from '@renderer/pages/ReportsPage';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/reports']}>
      <Routes>
        <Route element={<Outlet context={{ refreshToken: 0, openImport: () => undefined }} />}>
          <Route path="/reports" element={<ReportsPage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

// Recharts' ResponsiveContainer (bars + donut) needs ResizeObserver.
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
  it('leads with the verdict pastilles and the month-by-month chart', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Résultat')).toBeTruthy();
    });
    expect(screen.getAllByText('Entrées').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Sorties').length).toBeGreaterThan(0);
    expect(screen.getByText('Entrées et sorties · par mois')).toBeTruthy();
  });

  it('renders the net worth donut, top categories, recurring and biggest movements', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Patrimoine/)).toBeTruthy();
    });
    expect(screen.getByText('Compte A')).toBeTruthy();
    expect(screen.getByText('Courses')).toBeTruthy();
    expect(screen.getByText('NETFLIX')).toBeTruthy();
    expect(screen.getByText(/plus gros mouvements/i)).toBeTruthy();
    expect(screen.getByText('SUPER U')).toBeTruthy();
  });

  it('shows an import call-to-action, not a perpetual spinner, when there is no data', async () => {
    vi.spyOn(ipcMod.ipc, 'invoke').mockImplementation(((channel: string) => {
      if (channel === 'dashboard:cashflow') return Promise.resolve({ series: [] });
      if (channel === 'dashboard:netWorth') return Promise.resolve({ total: 0, accounts: [] });
      if (channel === 'recurring:list')
        return Promise.resolve({ subscriptions: [], monthlyTotal: 0 });
      if (channel === 'dashboard:getTransactions') return Promise.resolve({ transactions: [] });
      return Promise.resolve({});
    }) as typeof ipcMod.ipc.invoke);

    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/importez un relevé/i)).toBeTruthy();
    });
    expect(screen.queryByText(/Chargement des rapports/)).toBeNull();
  });
});
