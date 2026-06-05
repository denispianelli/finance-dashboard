// @vitest-environment jsdom
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { TransactionReviewTable } from '@renderer/components/TransactionReviewTable';
import type { ReviewTransaction } from '@shared/types/import';
import type { CategoryDTO, CreateCategoryInput } from '@shared/types/category';

afterEach(() => {
  cleanup();
});

function makeTx(hash: string, isDuplicate = false): ReviewTransaction {
  return {
    tx_hash: hash,
    date: '2026-01-15',
    label: `Libellé ${hash}`,
    amount: -42.5,
    fitid: null,
    isDuplicate,
    categoryId: null,
    tier: null,
  };
}

const newTx = makeTx('h1');
const dupTx = makeTx('h2', true);

const CATS: CategoryDTO[] = [
  {
    id: 'cat-a',
    name: 'Alimentation',
    icon: 'shop',
    color: '#7AB890',
    parentId: null,
    isDefault: true,
    position: 1,
  },
  {
    id: 'cat-b',
    name: 'Transport',
    icon: 'car',
    color: '#6E9BC4',
    parentId: null,
    isDefault: true,
    position: 2,
  },
];

interface ReviewCategory {
  categoryId: string | null;
  userModified: boolean;
}

interface RenderOverrides {
  transactions?: ReviewTransaction[];
  selected?: Set<string>;
  onToggleTx?: () => void;
  onToggleAll?: () => void;
  categories?: CategoryDTO[];
  reviewCategories?: Map<string, ReviewCategory>;
  pending?: Set<string>;
  suggested?: Set<string>;
  onPickCategory?: (txHash: string, categoryId: string | null) => void;
  onCreateCategory?: (input: CreateCategoryInput) => Promise<CategoryDTO>;
}

function renderTable(over: RenderOverrides = {}) {
  return render(
    <TransactionReviewTable
      transactions={over.transactions ?? [newTx]}
      selected={over.selected ?? new Set(['h1'])}
      onToggleTx={over.onToggleTx ?? vi.fn()}
      onToggleAll={over.onToggleAll ?? vi.fn()}
      categories={over.categories ?? CATS}
      reviewCategories={over.reviewCategories ?? new Map()}
      pending={over.pending ?? new Set()}
      suggested={over.suggested ?? new Set()}
      onPickCategory={over.onPickCategory ?? vi.fn()}
      onCreateCategory={over.onCreateCategory ?? vi.fn()}
    />,
  );
}

describe('TransactionReviewTable', () => {
  it('renders all transactions', () => {
    renderTable({ transactions: [newTx, dupTx] });
    expect(screen.getByText('Libellé h1')).toBeInTheDocument();
    expect(screen.getByText('Libellé h2')).toBeInTheDocument();
  });

  it('new transaction row is checked', () => {
    renderTable({ transactions: [newTx], selected: new Set(['h1']) });
    const checkbox = screen.getByRole('checkbox', { name: /h1/i });
    expect(checkbox).toBeChecked();
  });

  it('duplicate transaction row is unchecked and disabled', () => {
    renderTable({ transactions: [dupTx], selected: new Set() });
    const checkbox = screen.getByRole('checkbox', { name: /h2/i });
    expect(checkbox).not.toBeChecked();
    expect(checkbox).toBeDisabled();
  });

  it('duplicate row has muted style', () => {
    renderTable({ transactions: [dupTx], selected: new Set() });
    const row = screen.getByRole('row', { name: /h2/i });
    expect(row).toHaveClass('opacity-40');
  });

  it('clicking a non-duplicate row checkbox calls onToggleTx', async () => {
    const onToggleTx = vi.fn();
    renderTable({ transactions: [newTx], onToggleTx });
    await userEvent.click(screen.getByRole('checkbox', { name: /h1/i }));
    expect(onToggleTx).toHaveBeenCalledWith('h1');
  });

  it('select-all header checkbox calls onToggleAll', async () => {
    const onToggleAll = vi.fn();
    renderTable({ transactions: [newTx], onToggleAll });
    await userEvent.click(screen.getByRole('checkbox', { name: /tout sélectionner/i }));
    expect(onToggleAll).toHaveBeenCalled();
  });

  it('select-all is checked when all non-duplicate rows are selected', () => {
    renderTable({ transactions: [newTx, dupTx], selected: new Set(['h1']) });
    const selectAll = screen.getByRole('checkbox', { name: /tout sélectionner/i });
    expect(selectAll).toBeChecked();
  });

  it('select-all is unchecked when no non-duplicate rows are selected', () => {
    renderTable({ transactions: [newTx], selected: new Set() });
    const selectAll = screen.getByRole('checkbox', { name: /tout sélectionner/i });
    expect(selectAll).not.toBeChecked();
  });

  it('displays formatted amount', () => {
    renderTable({ transactions: [newTx] });
    expect(screen.getByText(/-42[,.]50/)).toBeInTheDocument();
  });

  it('shows the resolved category name in the picker for a categorized row', () => {
    renderTable({
      transactions: [newTx],
      reviewCategories: new Map([['h1', { categoryId: 'cat-a', userModified: false }]]),
    });
    expect(screen.getByRole('button', { name: /Alimentation/i })).toBeInTheDocument();
  });

  it('falls back to "Non catégorisé" for a residual row', () => {
    renderTable({
      transactions: [newTx],
      reviewCategories: new Map([['h1', { categoryId: null, userModified: false }]]),
    });
    expect(screen.getByRole('button', { name: /Non catégorisé/i })).toBeInTheDocument();
  });

  it('shows the "IA…" indicator for a pending row', () => {
    renderTable({ transactions: [newTx], pending: new Set(['h1']) });
    expect(screen.getByText('IA…')).toBeInTheDocument();
  });

  it('shows the "IA" badge for a suggested row', () => {
    renderTable({ transactions: [newTx], suggested: new Set(['h1']) });
    expect(screen.getByText('IA')).toBeInTheDocument();
    expect(screen.queryByText('IA…')).not.toBeInTheDocument();
  });

  it('shows neither badge for a plain deterministic row', () => {
    renderTable({ transactions: [newTx] });
    expect(screen.queryByText('IA')).not.toBeInTheDocument();
    expect(screen.queryByText('IA…')).not.toBeInTheDocument();
  });

  it('renders no picker for a duplicate row', () => {
    renderTable({ transactions: [dupTx], selected: new Set() });
    expect(screen.queryByRole('button', { name: /Non catégorisé/i })).not.toBeInTheDocument();
  });

  it('clicking a category option calls onPickCategory with the tx hash and id', () => {
    const onPickCategory = vi.fn();
    renderTable({
      transactions: [newTx],
      reviewCategories: new Map([['h1', { categoryId: 'cat-a', userModified: false }]]),
      onPickCategory,
    });
    fireEvent.click(screen.getByRole('button', { name: /Alimentation/i })); // open the picker
    fireEvent.click(screen.getByRole('button', { name: 'Transport' }));
    expect(onPickCategory).toHaveBeenCalledWith('h1', 'cat-b');
  });
});
