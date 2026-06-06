import type { DashboardTransaction } from '@shared/types/dashboard';

export type TxPeriod = 'all' | '30d' | '3m' | 'year';
export type TxType = 'all' | 'income' | 'expense' | 'transfer' | 'refund';

/** A transaction is a transfer when flagged internal or tagged the transfers category. */
export function isTransferTx(t: DashboardTransaction): boolean {
  return t.isInternalTransfer || t.categoryId === 'cat-transferts';
}
/** A transaction is a refund when tagged the refunds category. */
export function isRefundTx(t: DashboardTransaction): boolean {
  return t.categoryId === 'cat-remboursement';
}
/** Sentinel `'all'`, uncategorized (`null`), or a specific category id. */
export type TxCategoryFilter = 'all' | null | (string & Record<never, never>);

export interface TxFilters {
  /** Inclusive lower bound, ISO `yyyy-mm-dd`. `null` = unbounded. */
  readonly from: string | null;
  /** Inclusive upper bound, ISO `yyyy-mm-dd`. `null` = unbounded. */
  readonly to: string | null;
  /** Category to match: 'all' = any, null = uncategorized, otherwise a category id. */
  readonly categoryId: TxCategoryFilter;
  /** Free-text match on the cleaned label; case- and accent-insensitive. Empty = no filter. */
  readonly query: string;
  /** Income (amount > 0), expense (amount < 0), or all. Zero-amount only appears under 'all'. */
  readonly type: TxType;
}

/** Strip diacritics + lowercase, for accent-insensitive search. */
function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/** Format a Date as a LOCAL-time ISO `yyyy-mm-dd` (no UTC shift). */
export function toLocalISODate(d: Date): string {
  const y = String(d.getFullYear());
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Inclusive lower-bound ISO date for a period, or null for 'all'. */
export function periodStart(period: TxPeriod, today: string): string | null {
  if (period === 'all') return null;
  if (period === 'year') return `${today.slice(0, 4)}-01-01`;
  const d = new Date(`${today}T00:00:00`);
  if (period === '30d') d.setDate(d.getDate() - 30);
  else d.setMonth(d.getMonth() - 3); // '3m'
  return toLocalISODate(d);
}

/**
 * Filter transactions by date bounds / category / label / type. All criteria are AND-ed.
 * ISO `yyyy-mm-dd` dates compare lexicographically.
 */
export function filterTransactions(
  txns: readonly DashboardTransaction[],
  filters: TxFilters,
): DashboardTransaction[] {
  const q = normalize(filters.query.trim());

  return txns.filter((t) => {
    if (filters.from !== null && t.date < filters.from) return false;
    if (filters.to !== null && t.date > filters.to) return false;
    if (filters.categoryId !== 'all' && t.categoryId !== filters.categoryId) return false;
    // 'income' / 'expense' mean *real* flows — transfers and refunds are their own
    // buckets and are excluded from both.
    const transfer = isTransferTx(t);
    const refund = isRefundTx(t);
    if (filters.type === 'income' && (t.amount <= 0 || transfer || refund)) return false;
    if (filters.type === 'expense' && (t.amount >= 0 || transfer || refund)) return false;
    if (filters.type === 'transfer' && !transfer) return false;
    if (filters.type === 'refund' && !refund) return false;
    if (q.length > 0 && !normalize(t.labelClean).includes(q)) return false;
    return true;
  });
}
