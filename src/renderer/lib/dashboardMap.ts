import type { AccountSummary, DashboardTransaction } from '@shared/types/dashboard';
import type { Account } from '@renderer/components/dashboard/AccountTabs';
import type { TxRow } from '@renderer/components/dashboard/TxTable';
import type { MoneyKind } from '@renderer/components/ui/money';
import { isTransferTx } from './filterTransactions';

/** Neutral dot color for uncategorized transactions. */
const NEUTRAL_CAT_COLOR = '#6E6E78';

/** Amount with French grouping and 2 decimals, no currency symbol (the UI adds €). */
export function formatBalance(amount: number): string {
  return amount.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Parse a French-formatted amount ("-90,5" / "-90.5") to a number, or null. */
export function parseAmount(input: string): number | null {
  const normalized = input.trim().replace(/\s/g, '').replace(',', '.');
  if (normalized === '' || normalized === '-') return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/** ISO `yyyy-mm-dd` → `dd/mm`; passes the input through unchanged if it isn't ISO. */
export function formatTxDate(iso: string): string {
  const [, month, day] = iso.split('-');
  if (month === undefined || day === undefined) return iso;
  return `${day}/${month}`;
}

/** Income / expense / transfer, derived from sign and transfer-ness (flag or
 *  the « Transferts internes » category). */
export function txKind(tx: DashboardTransaction): MoneyKind {
  if (isTransferTx(tx)) return 'transfer';
  return tx.amount >= 0 ? 'income' : 'expense';
}

export function toAccount(summary: AccountSummary): Account {
  return {
    id: summary.id,
    name: summary.name,
    bank: summary.bankId ?? '—',
    // null = no statement anchors a real balance yet → "—" (ADR-014).
    balance: summary.balance === null ? '—' : formatBalance(summary.balance),
  };
}

/** "extrait : -84,30 · 14/05" from the snapshotted figures, or null if none. */
function originalHint(tx: DashboardTransaction): string | null {
  if (tx.editedAt === null) return null;
  const parts: string[] = [];
  if (tx.originalAmount !== null) parts.push(formatBalance(tx.originalAmount));
  if (tx.originalDate !== null) parts.push(formatTxDate(tx.originalDate));
  return parts.length > 0 ? `extrait : ${parts.join(' · ')}` : 'Modifié manuellement';
}

export function toTxRow(tx: DashboardTransaction): TxRow {
  return {
    id: tx.id,
    date: formatTxDate(tx.date),
    icon: tx.categoryIcon ?? 'wallet',
    main: tx.labelClean,
    sub: tx.labelRaw,
    catColor: tx.categoryColor ?? NEUTRAL_CAT_COLOR,
    catName: tx.categoryName ?? 'Non catégorisé',
    amount: tx.amount,
    amountKind: txKind(tx),
    edited: tx.editedAt !== null,
    originalHint: originalHint(tx),
    editDate: tx.date,
    editAmount: tx.amount,
    editLabel: tx.labelClean,
  };
}
