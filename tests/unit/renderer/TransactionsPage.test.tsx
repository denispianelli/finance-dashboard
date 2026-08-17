// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
    balanceSource: 'statement',
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
    originalDate: null,
    originalAmount: null,
    editedAt: null,
    isInternalTransfer: false,
    userModified: false,
    loanSplit: null,
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
  // Freeze "today" so period-preset calculations are deterministic. The page's
  // default period is now 'all', so this is harmless but kept for preset tests
  // that select date-windowed options (Ce mois-ci, 30 derniers jours, etc.).
  // Fake only Date — real timers stay live so testing-library's findByText
  // polling still works.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-05-20T12:00:00Z'));
  mockInvoke.mockReset();
  stubIpc();
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

beforeEach(() => {
  // jsdom reports zero-sized elements; give the virtualizer a viewport + row heights so it
  // renders a real (windowed) subset. Small viewport + overscan keeps tiny fixtures fully
  // visible while large ones are windowed.
  //
  // @tanstack/react-virtual reads offsetHeight for the scroll container size and
  // getBoundingClientRect for individual row measurements.
  // Viewport: 300 px (shows ~4 rows at ROW_ESTIMATE=76 px + overscan=8 → ~11 items max).
  // Row height: 76 px via getBoundingClientRect. This keeps the 3-row fixture fully visible
  // while the 30-row fixture is windowed (fewer than 30 rendered).
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width: 800,
    height: 76,
    top: 0,
    left: 0,
    right: 800,
    bottom: 76,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get() {
      return 300;
    },
  });
  Element.prototype.hasPointerCapture = () => false;
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  Element.prototype.scrollIntoView = () => {};
});

afterEach(() => {
  vi.restoreAllMocks();
  // Restore offsetHeight to its original descriptor (0 in jsdom).
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get() {
      return 0;
    },
  });
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
    fireEvent.change(screen.getByLabelText('Rechercher une transaction'), {
      target: { value: 'pharma' },
    });
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
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Carrefour');
    // Glass dropdown: open the trigger, then pick the category option.
    await user.click(screen.getByLabelText('Catégorie'));
    await user.click(screen.getByRole('option', { name: 'Alimentation' }));
    expect(screen.getByText('Carrefour')).toBeInTheDocument();
    expect(screen.queryByText('Salaire')).not.toBeInTheDocument();
  });

  it('filters by period preset via the Période dropdown', async () => {
    // Use a transaction dated well before the anchor to verify exclusion under 'month'.
    const transactions = [
      tx({ id: 'old', date: '2026-03-01', labelClean: 'OldTx', amount: -5 }),
      tx({ id: 'new', date: '2026-05-14', labelClean: 'NewTx', amount: -10 }),
    ];
    stubIpc(transactions);
    const user = userEvent.setup();
    renderPage();

    // Default period is 'all' — both rows visible.
    await screen.findByText('NewTx');
    expect(screen.getByText('OldTx')).toBeInTheDocument();

    // Switch to 'Ce mois-ci' — only 2026-05 row should appear.
    await user.click(screen.getByLabelText('Période'));
    await user.click(screen.getByRole('option', { name: 'Ce mois-ci' }));
    expect(screen.getByText('NewTx')).toBeInTheDocument();
    expect(screen.queryByText('OldTx')).not.toBeInTheDocument();

    // Switch back to 'Toute la période' — both should appear again.
    await user.click(screen.getByLabelText('Période'));
    await user.click(screen.getByRole('option', { name: 'Toute la période' }));
    expect(screen.getByText('NewTx')).toBeInTheDocument();
    expect(screen.getByText('OldTx')).toBeInTheDocument();
  });

  it('shows a filtered-empty state when nothing matches', async () => {
    renderPage();
    await screen.findByText('Carrefour');
    fireEvent.change(screen.getByLabelText('Rechercher une transaction'), {
      target: { value: 'zzzzz' },
    });
    expect(screen.getByText(/ne correspond à ces filtres/i)).toBeInTheDocument();
  });

  it('shows the import empty state when the account has no transactions', async () => {
    stubIpc([]);
    renderPage();
    expect(await screen.findByText(/importez un relevé/i)).toBeInTheDocument();
  });

  it('virtualizes the list: does not render every row at once', async () => {
    stubIpc(MANY); // 30 rows
    renderPage();
    expect(await screen.findByText('Op 00')).toBeInTheDocument();
    const rendered = screen.getAllByText(/^Op \d{2}$/);
    expect(rendered.length).toBeLessThan(30);
  });

  it('enters edit mode on the pencil and saves via the hook', async () => {
    renderPage();
    await screen.findByText('Carrefour');
    const [firstPencil] = screen.getAllByLabelText('Modifier');
    if (!firstPencil) throw new Error('no edit button rendered');
    fireEvent.click(firstPencil);
    // Pencil reveals the inline inputs.
    expect(screen.getByLabelText('Montant')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Montant'), { target: { value: '-99,99' } });
    fireEvent.click(screen.getByLabelText('Enregistrer'));
    // The first rendered row is 'a' (Carrefour), so the whole payload is known.
    expect(mockInvoke).toHaveBeenCalledWith('transactions:update', {
      transactionId: 'a',
      date: '2026-05-14',
      label: 'Carrefour',
      amount: -99.99,
    });
  });

  it('deletes a transaction via the hook on the trash button', async () => {
    renderPage();
    await screen.findByText('Carrefour');
    const [firstTrash] = screen.getAllByLabelText('Supprimer');
    if (!firstTrash) throw new Error('no delete button rendered');
    fireEvent.click(firstTrash);
    expect(mockInvoke).toHaveBeenCalledWith('transactions:delete', { transactionId: 'a' });
  });

  it('shows the Période dropdown defaulting to Toute la période', async () => {
    renderPage();
    await screen.findByText('Carrefour');
    // The period trigger should show the current label for 'all'.
    expect(screen.getByLabelText('Période')).toBeInTheDocument();
    // The trigger text should show the current selection.
    expect(screen.getByText('Toute la période')).toBeInTheDocument();
  });
});
