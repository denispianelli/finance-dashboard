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

const MANY: DashboardTransaction[] = Array.from({ length: 30 }, (_, i) =>
  tx({ id: `m${String(i)}`, labelClean: `Op ${String(i).padStart(2, '0')}`, amount: -(i + 1) }),
);

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

  it('paginates: renders only the first 25 rows and shows the page indicator', async () => {
    stubIpc(MANY);
    renderPage();
    expect(await screen.findByText('Op 00')).toBeInTheDocument();
    expect(screen.getByText('Op 24')).toBeInTheDocument();
    expect(screen.queryByText('Op 25')).not.toBeInTheDocument();
    expect(screen.getByText('Page 1 / 2')).toBeInTheDocument();
  });

  it('navigates to the next page with Suivant', async () => {
    stubIpc(MANY);
    renderPage();
    await screen.findByText('Op 00');
    fireEvent.click(screen.getByRole('button', { name: /Suivant/ }));
    expect(screen.getByText('Op 25')).toBeInTheDocument();
    expect(screen.getByText('Op 29')).toBeInTheDocument();
    expect(screen.queryByText('Op 00')).not.toBeInTheDocument();
    expect(screen.getByText('Page 2 / 2')).toBeInTheDocument();
  });

  it('disables Précédent on the first page and Suivant on the last page', async () => {
    stubIpc(MANY);
    renderPage();
    await screen.findByText('Op 00');
    expect(screen.getByRole('button', { name: /Précédent/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /Suivant/ }));
    expect(screen.getByRole('button', { name: /Suivant/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Précédent/ })).not.toBeDisabled();
  });

  it('resets to page 1 when a filter changes', async () => {
    stubIpc(MANY);
    renderPage();
    await screen.findByText('Op 00');
    fireEvent.click(screen.getByRole('button', { name: /Suivant/ }));
    expect(screen.getByText('Page 2 / 2')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Rechercher'), { target: { value: 'Op' } });
    expect(screen.getByText('Page 1 / 2')).toBeInTheDocument();
    expect(screen.getByText('Op 00')).toBeInTheDocument();
  });

  it('renders no pagination controls when results fit on one page', async () => {
    renderPage();
    await screen.findByText('Carrefour');
    expect(screen.queryByRole('button', { name: /Suivant/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Page \d+ \//)).not.toBeInTheDocument();
  });
});
