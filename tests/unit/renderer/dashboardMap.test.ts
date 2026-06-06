import { describe, it, expect } from 'vitest';
import {
  formatBalance,
  formatTxDate,
  txKind,
  toAccount,
  toTxRow,
} from '@renderer/lib/dashboardMap';
import type { AccountSummary, DashboardTransaction } from '@shared/types/dashboard';

function makeTx(over: Partial<DashboardTransaction> = {}): DashboardTransaction {
  return {
    id: 't1',
    accountId: 'a1',
    date: '2026-05-14',
    amount: -84.3,
    labelRaw: 'CB CARREFOUR MARKET',
    labelClean: 'Carrefour Market',
    categoryId: null,
    categoryName: null,
    categoryColor: null,
    categoryIcon: null,
    originalDate: null,
    originalAmount: null,
    editedAt: null,
    isInternalTransfer: false,
    isRefund: false,
    userModified: false,
    ...over,
  };
}

describe('formatBalance', () => {
  it('formats with 2 decimals and a comma, no symbol', () => {
    expect(formatBalance(70)).toBe('70,00');
    expect(formatBalance(0)).toBe('0,00');
  });
  it('groups thousands (fr-FR)', () => {
    // The thousands separator is a (narrow) no-break space, so match loosely.
    expect(formatBalance(1487.32)).toMatch(/^1.487,32$/);
  });
});

describe('formatTxDate', () => {
  it('turns ISO yyyy-mm-dd into dd/mm', () => {
    expect(formatTxDate('2026-05-14')).toBe('14/05');
  });
  it('passes through a non-ISO input unchanged', () => {
    expect(formatTxDate('garbage')).toBe('garbage');
  });
});

describe('txKind', () => {
  it('is transfer for internal transfers regardless of sign', () => {
    expect(txKind(makeTx({ isInternalTransfer: true, amount: 500 }))).toBe('transfer');
  });
  it('is income for non-negative amounts', () => {
    expect(txKind(makeTx({ amount: 3240 }))).toBe('income');
  });
  it('is expense for negative amounts', () => {
    expect(txKind(makeTx({ amount: -10 }))).toBe('expense');
  });
});

describe('toAccount', () => {
  it('maps fields and formats the balance', () => {
    const summary: AccountSummary = {
      id: 'a1',
      name: 'Compte courant',
      type: 'checking',
      bankId: 'lcl',
      currency: 'EUR',
      balance: 70,
      balanceSource: 'statement',
      txCount: 2,
    };
    expect(toAccount(summary)).toEqual({
      id: 'a1',
      name: 'Compte courant',
      bank: 'lcl',
      balance: '70,00',
    });
  });
  it('shows an em dash for the balance when no statement anchors it (null)', () => {
    const summary: AccountSummary = {
      id: 'a1',
      name: 'X',
      type: 'checking',
      bankId: 'lcl',
      currency: 'EUR',
      balance: null,
      balanceSource: null,
      txCount: 0,
    };
    expect(toAccount(summary).balance).toBe('—');
  });
  it('shows an em dash when the bank is unknown', () => {
    const summary: AccountSummary = {
      id: 'a1',
      name: 'X',
      type: 'savings',
      bankId: null,
      currency: 'EUR',
      balance: 0,
      balanceSource: 'statement',
      txCount: 0,
    };
    expect(toAccount(summary).bank).toBe('—');
  });
});

describe('toTxRow', () => {
  it('falls back to neutral category when uncategorized', () => {
    const row = toTxRow(makeTx());
    expect(row).toMatchObject({
      date: '14/05',
      main: 'Carrefour Market',
      sub: 'CB CARREFOUR MARKET',
      catName: 'Non catégorisé',
      catColor: '#6E6E78',
      amountKind: 'expense',
    });
  });
  it('uses the category fields when present', () => {
    const row = toTxRow(
      makeTx({
        categoryName: 'Transport',
        categoryColor: '#8AA8C7',
        categoryIcon: 'car',
      }),
    );
    expect(row).toMatchObject({
      catName: 'Transport',
      catColor: '#8AA8C7',
      icon: 'car',
    });
  });

  it('marks an edited row and builds an original-values hint', () => {
    const row = toTxRow(
      makeTx({
        editedAt: '2026-06-03 10:00:00',
        originalAmount: -84.3,
        originalDate: '2026-05-14',
      }),
    );
    expect(row.edited).toBe(true);
    expect(row.originalHint).toContain('84,30');
    expect(row.originalHint).toContain('14/05');
  });

  it('is not marked edited when editedAt is null', () => {
    expect(toTxRow(makeTx()).edited).toBe(false);
    expect(toTxRow(makeTx()).originalHint).toBeNull();
  });

  it('exposes raw editable values for the inline editor', () => {
    const row = toTxRow(makeTx({ date: '2026-05-14', amount: -84.3, labelClean: 'Carrefour' }));
    expect(row.editDate).toBe('2026-05-14');
    expect(row.editAmount).toBe(-84.3);
    expect(row.editLabel).toBe('Carrefour');
  });
});
