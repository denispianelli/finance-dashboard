import type { DashboardTransaction } from '@shared/types/dashboard';

export type TxPeriod = 'all' | '30d' | '3m' | 'year';
export type TxType = 'all' | 'income' | 'expense';
/** Sentinel `'all'`, uncategorized (`null`), or a specific category id. */
export type TxCategoryFilter = 'all' | null | (string & Record<never, never>);

export interface TxFilters {
  /** Time window relative to `today`. */
  readonly period: TxPeriod;
  /** Reference date as ISO `yyyy-mm-dd`. Injected so this stays clock-free and testable. */
  readonly today: string;
  /** Category to match: 'all' = any, null = uncategorized, otherwise a category id. */
  readonly categoryId: TxCategoryFilter;
  /** Free-text match on the cleaned label; case- and accent-insensitive. Empty = no filter. */
  readonly query: string;
  /** Income (amount > 0), expense (amount < 0), or all. Zero-amount transactions only appear under 'all'. */
  readonly type: TxType;
}

/** Strip diacritics + lowercase, for accent-insensitive search. */
function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/** Format a local Date as ISO `yyyy-mm-dd` without UTC conversion. */
function toLocalISODate(d: Date): string {
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
 * Filter transactions by period / category / label / type. All criteria are AND-ed.
 * ISO `yyyy-mm-dd` dates compare lexicographically, so no Date parsing is needed for the
 * range check.
 */
export function filterTransactions(
  txns: readonly DashboardTransaction[],
  filters: TxFilters,
): DashboardTransaction[] {
  const from = periodStart(filters.period, filters.today);
  const q = normalize(filters.query.trim());

  return txns.filter((t) => {
    if (from !== null && t.date < from) return false;
    if (filters.categoryId !== 'all' && t.categoryId !== filters.categoryId) return false;
    if (filters.type === 'income' && t.amount <= 0) return false;
    if (filters.type === 'expense' && t.amount >= 0) return false;
    if (q.length > 0 && !normalize(t.labelClean).includes(q)) return false;
    return true;
  });
}
