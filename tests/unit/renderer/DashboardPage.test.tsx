// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { MemoryRouter, Routes, Route, Outlet } from 'react-router-dom';

vi.mock('@renderer/ipc/client', () => ({ ipc: { invoke: vi.fn() } }));

import { ipc } from '@renderer/ipc/client';
import { DashboardPage } from '@renderer/pages/DashboardPage';
import type { AccountSummary, DashboardTransaction } from '@shared/types/dashboard';

const mockInvoke = vi.mocked(ipc.invoke);

const ACCOUNTS: AccountSummary[] = [
  {
    id: 'acc-lcl-default',
    name: 'Compte courant',
    type: 'checking',
    bankId: 'lcl',
    currency: 'EUR',
    balance: 1487.32,
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
    confidence: null,
    isInternalTransfer: false,
    userModified: false,
  },
];

function stubIpc(transactions: DashboardTransaction[]): void {
  mockInvoke.mockImplementation(((channel: string) => {
    if (channel === 'dashboard:getAccounts') return Promise.resolve({ accounts: ACCOUNTS });
    if (channel === 'dashboard:getTransactions') return Promise.resolve({ transactions });
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
        <Route element={<Outlet context={{ refreshToken: 0 }} />}>
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
    stubIpc([]);
    renderPage();
    expect(await screen.findByText(/importez un relevé/i)).toBeInTheDocument();
  });

  it('does not render ImportModal', () => {
    renderPage();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
