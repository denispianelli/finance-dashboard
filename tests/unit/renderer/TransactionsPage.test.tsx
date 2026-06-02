// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { MemoryRouter, Routes, Route, Outlet } from 'react-router-dom';

vi.mock('@renderer/ipc/client', () => ({ ipc: { invoke: vi.fn() } }));

import { ipc } from '@renderer/ipc/client';
import { TransactionsPage } from '@renderer/pages/TransactionsPage';
import type { AccountSummary, DashboardTransaction } from '@shared/types/dashboard';
import type { CategoryDTO } from '@shared/types/category';

const mockInvoke = vi.mocked(ipc.invoke);

const ACCOUNTS: AccountSummary[] = [
  {
    id: 'acc-1',
    name: 'Compte courant',
    type: 'checking',
    bankId: 'lcl',
    currency: 'EUR',
    balance: 1000,
    txCount: 3,
  },
];

const CATEGORIES: CategoryDTO[] = [
  {
    id: 'cat-food',
    name: 'Alimentation',
    icon: 'wallet',
    color: '#aaa',
    parentId: null,
    isDefault: true,
    position: 0,
  },
];

function tx(over: Partial<DashboardTransaction>): DashboardTransaction {
  return {
    id: 't',
    accountId: 'acc-1',
    date: '2026-05-14',
    amount: -10,
    labelRaw: 'RAW',
    labelClean: 'Label',
    categoryId: null,
    categoryName: null,
    categoryColor: null,
    categoryIcon: null,
    confidence: null,
    isInternalTransfer: false,
    userModified: false,
    ...over,
  };
}

const TX: DashboardTransaction[] = [
  tx({ id: 'a', labelClean: 'Carrefour', amount: -50, categoryId: 'cat-food' }),
  tx({ id: 'b', labelClean: 'Salaire', amount: 2000, categoryId: null }),
  tx({ id: 'c', labelClean: 'Pharmacie', amount: -15, categoryId: null }),
];

function stubIpc(transactions: DashboardTransaction[] = TX): void {
  mockInvoke.mockImplementation(((channel: string) => {
    if (channel === 'dashboard:getAccounts') return Promise.resolve({ accounts: ACCOUNTS });
    if (channel === 'dashboard:getTransactions') return Promise.resolve({ transactions });
    if (channel === 'dashboard:metrics') return Promise.resolve({ balance: 0, series: [] });
    if (channel === 'categories:list') return Promise.resolve({ categories: CATEGORIES });
    return Promise.resolve(undefined);
  }) as typeof ipc.invoke);
}

beforeEach(() => {
  mockInvoke.mockReset();
  stubIpc();
});

afterEach(() => {
  cleanup();
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/transactions']}>
      <Routes>
        <Route element={<Outlet context={{ refreshToken: 0 }} />}>
          <Route path="/transactions" element={<TransactionsPage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('TransactionsPage', () => {
  it('renders all transactions for the account by default', async () => {
    renderPage();
    expect(await screen.findByText('Carrefour')).toBeInTheDocument();
    expect(screen.getByText('Salaire')).toBeInTheDocument();
    expect(screen.getByText('Pharmacie')).toBeInTheDocument();
  });

  it('requests the full history (high limit) over IPC', async () => {
    renderPage();
    await screen.findByText('Carrefour');
    expect(mockInvoke).toHaveBeenCalledWith(
      'dashboard:getTransactions',
      expect.objectContaining({ accountId: 'acc-1', limit: 100000 }),
    );
  });

  it('filters by free-text search on the label', async () => {
    renderPage();
    await screen.findByText('Carrefour');
    fireEvent.change(screen.getByLabelText('Rechercher'), { target: { value: 'pharma' } });
    expect(screen.getByText('Pharmacie')).toBeInTheDocument();
    expect(screen.queryByText('Carrefour')).not.toBeInTheDocument();
    expect(screen.queryByText('Salaire')).not.toBeInTheDocument();
  });

  it('filters by type (revenus shows only positive amounts)', async () => {
    renderPage();
    await screen.findByText('Carrefour');
    fireEvent.click(screen.getByRole('button', { name: 'Revenus' }));
    expect(screen.getByText('Salaire')).toBeInTheDocument();
    expect(screen.queryByText('Carrefour')).not.toBeInTheDocument();
  });

  it('filters by category', async () => {
    renderPage();
    await screen.findByText('Carrefour');
    fireEvent.change(screen.getByLabelText('Catégorie'), { target: { value: 'cat-food' } });
    expect(screen.getByText('Carrefour')).toBeInTheDocument();
    expect(screen.queryByText('Salaire')).not.toBeInTheDocument();
  });

  it('shows a filtered-empty state when nothing matches', async () => {
    renderPage();
    await screen.findByText('Carrefour');
    fireEvent.change(screen.getByLabelText('Rechercher'), { target: { value: 'zzzzz' } });
    expect(screen.getByText(/ne correspond à ces filtres/i)).toBeInTheDocument();
  });

  it('shows the import empty state when the account has no transactions', async () => {
    stubIpc([]);
    renderPage();
    expect(await screen.findByText(/importez un relevé/i)).toBeInTheDocument();
  });
});
