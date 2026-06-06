// @vitest-environment jsdom
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { TransactionReviewTable } from '@renderer/components/TransactionReviewTable';
import type { ReviewTransaction } from '@shared/types/import';

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
  };
}

const newTx = makeTx('h1');
const dupTx = makeTx('h2', true);

describe('TransactionReviewTable', () => {
  it('renders all transactions', () => {
    render(
      <TransactionReviewTable
        transactions={[newTx, dupTx]}
        selected={new Set(['h1'])}
        onToggleTx={vi.fn()}
        onToggleAll={vi.fn()}
      />,
    );
    expect(screen.getByText('Libellé h1')).toBeInTheDocument();
    expect(screen.getByText('Libellé h2')).toBeInTheDocument();
  });

  it('new transaction row is checked', () => {
    render(
      <TransactionReviewTable
        transactions={[newTx]}
        selected={new Set(['h1'])}
        onToggleTx={vi.fn()}
        onToggleAll={vi.fn()}
      />,
    );
    const checkbox = screen.getByRole('checkbox', { name: /h1/i });
    expect(checkbox).toBeChecked();
  });

  it('duplicate transaction row is unchecked and disabled', () => {
    render(
      <TransactionReviewTable
        transactions={[dupTx]}
        selected={new Set()}
        onToggleTx={vi.fn()}
        onToggleAll={vi.fn()}
      />,
    );
    const checkbox = screen.getByRole('checkbox', { name: /h2/i });
    expect(checkbox).not.toBeChecked();
    expect(checkbox).toBeDisabled();
  });

  it('duplicate row has muted style', () => {
    render(
      <TransactionReviewTable
        transactions={[dupTx]}
        selected={new Set()}
        onToggleTx={vi.fn()}
        onToggleAll={vi.fn()}
      />,
    );
    const row = screen.getByRole('row', { name: /h2/i });
    expect(row).toHaveClass('opacity-40');
  });

  it('clicking a non-duplicate row checkbox calls onToggleTx', async () => {
    const onToggleTx = vi.fn();
    render(
      <TransactionReviewTable
        transactions={[newTx]}
        selected={new Set(['h1'])}
        onToggleTx={onToggleTx}
        onToggleAll={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('checkbox', { name: /h1/i }));
    expect(onToggleTx).toHaveBeenCalledWith('h1');
  });

  it('select-all header checkbox calls onToggleAll', async () => {
    const onToggleAll = vi.fn();
    render(
      <TransactionReviewTable
        transactions={[newTx]}
        selected={new Set(['h1'])}
        onToggleTx={vi.fn()}
        onToggleAll={onToggleAll}
      />,
    );
    await userEvent.click(screen.getByRole('checkbox', { name: /tout sélectionner/i }));
    expect(onToggleAll).toHaveBeenCalled();
  });

  it('select-all is checked when all non-duplicate rows are selected', () => {
    render(
      <TransactionReviewTable
        transactions={[newTx, dupTx]}
        selected={new Set(['h1'])}
        onToggleTx={vi.fn()}
        onToggleAll={vi.fn()}
      />,
    );
    const selectAll = screen.getByRole('checkbox', { name: /tout sélectionner/i });
    expect(selectAll).toBeChecked();
  });

  it('select-all is unchecked when no non-duplicate rows are selected', () => {
    render(
      <TransactionReviewTable
        transactions={[newTx]}
        selected={new Set()}
        onToggleTx={vi.fn()}
        onToggleAll={vi.fn()}
      />,
    );
    const selectAll = screen.getByRole('checkbox', { name: /tout sélectionner/i });
    expect(selectAll).not.toBeChecked();
  });

  it('displays formatted amount', () => {
    render(
      <TransactionReviewTable
        transactions={[newTx]}
        selected={new Set(['h1'])}
        onToggleTx={vi.fn()}
        onToggleAll={vi.fn()}
      />,
    );
    // True minus U+2212 (never a hyphen), with French decimals.
    expect(screen.getByText((t) => t.includes('−') && /42[,.]50/.test(t))).toBeInTheDocument();
  });
});
