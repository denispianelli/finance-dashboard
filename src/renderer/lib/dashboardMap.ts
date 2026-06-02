import type { AccountSummary, DashboardTransaction } from '@shared/types/dashboard';
import type { Account } from '@renderer/components/dashboard/AccountTabs';
import type { TxRow } from '@renderer/components/dashboard/TxTable';
import type { MoneyKind } from '@renderer/components/ui/money';

/** Confidence below this is flagged for review in the table. */
const CONF_LOW_THRESHOLD = 0.8;
/** Neutral dot color for uncategorized transactions. */
const NEUTRAL_CAT_COLOR = '#6E6E78';

/** Amount with French grouping and 2 decimals, no currency symbol (the UI adds €). */
export function formatBalance(amount: number): string {
  return amount.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** ISO `yyyy-mm-dd` → `dd/mm`; passes the input through unchanged if it isn't ISO. */
export function formatTxDate(iso: string): string {
  const [, month, day] = iso.split('-');
  if (month === undefined || day === undefined) return iso;
  return `${day}/${month}`;
}

/** Confidence score → `0,94`, or `—` when unscored (no classifier has run). */
export function formatConfidence(confidence: number | null): string {
  if (confidence === null) return '—';
  return confidence.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Income / expense / transfer, derived from sign and the internal-transfer flag. */
export function txKind(tx: DashboardTransaction): MoneyKind {
  if (tx.isInternalTransfer) return 'transfer';
  return tx.amount >= 0 ? 'income' : 'expense';
}

export function toAccount(summary: AccountSummary): Account {
  return {
    id: summary.id,
    name: summary.name,
    bank: summary.bankId ?? '—',
    balance: formatBalance(summary.balance),
  };
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
    conf: formatConfidence(tx.confidence),
    confLow: tx.confidence !== null && tx.confidence < CONF_LOW_THRESHOLD,
  };
}
