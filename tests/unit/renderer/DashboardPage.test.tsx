// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { MemoryRouter, Routes, Route, Outlet } from 'react-router-dom';

vi.mock('@renderer/ipc/client', () => ({ ipc: { invoke: vi.fn() } }));

import { ipc } from '@renderer/ipc/client';
import { DashboardPage } from '@renderer/pages/DashboardPage';
import type {
  AccountSummary,
  DashboardMetrics,
  DashboardTransaction,
} from '@shared/types/dashboard';

const mockInvoke = vi.mocked(ipc.invoke);

const ACCOUNTS: AccountSummary[] = [
  {
    id: 'acc-lcl-default',
    name: 'Compte courant',
    type: 'checking',
    bankId: 'lcl',
    currency: 'EUR',
    balance: 1487.32,
    balanceSource: 'statement',
    txCount: 1,
  },
];

const TX: DashboardTransaction[] = [
  {
    id: 't1',
    accountId: 'acc-lcl-default',
    date: '2026-05-14',
    amount: -84.3,
    labelRaw: 'CB CARREFOUR',
    labelClean: 'Carrefour Market',
    categoryId: null,
    categoryName: null,
    categoryColor: null,
    categoryIcon: null,
    originalDate: null,
    originalAmount: null,
    editedAt: null,
    isInternalTransfer: false,
    userModified: false,
  },
];

const METRICS: DashboardMetrics = {
  balance: 1487.32,
  series: [
    { month: '2026-04', income: 3000, expense: -2500, net: 500, balance: 987.32 },
    { month: '2026-05', income: 3240, expense: -2740, net: 500, balance: 1487.32 },
  ],
};

const POINTS = [
  { period: '2026-04', balance: 987.32 },
  { period: '2026-05', balance: 1487.32 },
];

function stubIpc(transactions: DashboardTransaction[], metrics: DashboardMetrics = METRICS): void {
  mockInvoke.mockImplementation(((channel: string) => {
    if (channel === 'dashboard:getAccounts') return Promise.resolve({ accounts: ACCOUNTS });
    if (channel === 'dashboard:getTransactions') return Promise.resolve({ transactions });
    if (channel === 'dashboard:metrics') return Promise.resolve(metrics);
    if (channel === 'dashboard:balanceSeries') return Promise.resolve({ points: POINTS });
    if (channel === 'categories:list') return Promise.resolve({ categories: [] });
    return Promise.resolve(undefined);
  }) as typeof ipc.invoke);
}

beforeEach(() => {
  mockInvoke.mockReset();
  stubIpc(TX);
});

afterEach(() => {
  cleanup();
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route
          element={
            <Outlet
              context={{
                refreshToken: 0,
                openImport: () => undefined,
                openCreateAccount: () => undefined,
              }}
            />
          }
        >
          <Route path="/" element={<DashboardPage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('DashboardPage', () => {
  it('renders accounts loaded over IPC', async () => {
    renderPage();
    expect(await screen.findByText('Compte courant')).toBeInTheDocument();
  });

  it('renders transactions loaded over IPC', async () => {
    renderPage();
    expect(await screen.findByText('Carrefour Market')).toBeInTheDocument();
    // Uncategorized transactions fall back to the neutral category label.
    expect(screen.getByText('Non catégorisé')).toBeInTheDocument();
  });

  it('renders the static KPI tiles', () => {
    renderPage();
    expect(screen.getByText('Solde net')).toBeInTheDocument();
    expect(screen.getByText(/Dépenses/)).toBeInTheDocument();
  });

  it('shows an empty state when there are no transactions', async () => {
    stubIpc([], { balance: 0, series: [] });
    renderPage();
    expect(await screen.findByText(/Aucune transaction/i)).toBeInTheDocument();
  });

  it('still renders transactions when the categories fetch fails', async () => {
    // Regression: categories loaded independently, so its failure must not
    // blank out accounts/transactions (previously coupled via Promise.all).
    mockInvoke.mockImplementation(((channel: string) => {
      if (channel === 'dashboard:getAccounts') return Promise.resolve({ accounts: ACCOUNTS });
      if (channel === 'dashboard:getTransactions') return Promise.resolve({ transactions: TX });
      if (channel === 'dashboard:metrics') return Promise.resolve(METRICS);
      if (channel === 'categories:list') return Promise.reject(new Error('no handler'));
      return Promise.resolve(undefined);
    }) as typeof ipc.invoke);
    renderPage();
    expect(await screen.findByText('Carrefour Market')).toBeInTheDocument();
  });

  it('does not render ImportModal', () => {
    renderPage();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows at most the 10 latest transactions in the preview', async () => {
    const [baseTx] = TX;
    if (!baseTx) throw new Error('TX fixture is empty');
    const many: DashboardTransaction[] = Array.from({ length: 12 }, (_, i) => ({
      ...baseTx,
      id: `t${String(i)}`,
      labelClean: `Tx ${String(i).padStart(2, '0')}`,
    }));
    stubIpc(many);
    renderPage();
    expect(await screen.findByText('Tx 00')).toBeInTheDocument();
    expect(screen.getByText('Tx 09')).toBeInTheDocument();
    expect(screen.queryByText('Tx 10')).not.toBeInTheDocument();
    expect(screen.queryByText('Tx 11')).not.toBeInTheDocument();
  });

  it('fetches the balance series for the selected account with the 12-month default', async () => {
    renderPage();
    expect(await screen.findByText('Solde sur 12 mois')).toBeInTheDocument();
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('dashboard:balanceSeries', {
        accountId: 'acc-lcl-default',
        range: '1y',
      });
    });
  });

  it('refetches the balance series when a range chip is clicked', async () => {
    renderPage();
    await screen.findByText('Solde sur 12 mois');
    await userEvent.click(screen.getByRole('button', { name: '3M' }));
    expect(await screen.findByText('Solde sur 3 mois')).toBeInTheDocument();
    expect(mockInvoke).toHaveBeenCalledWith('dashboard:balanceSeries', {
      accountId: 'acc-lcl-default',
      range: '3m',
    });
  });

  it('links "Tout voir" to the transactions page', () => {
    renderPage();
    const link = screen.getByRole('link', { name: /Tout voir/ });
    expect(link).toHaveAttribute('href', '/transactions');
  });
});
