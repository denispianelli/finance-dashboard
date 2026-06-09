import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { CashflowPoint, DashboardTransaction, NetWorth } from '@shared/types/dashboard';
import type { RecurringReport } from '@shared/types/recurring';
import { ipc } from '@renderer/ipc/client';

/** How many transactions to pull for the report aggregates (top categories,
 *  biggest movements). High enough to cover a personal multi-year history. */
const REPORT_TX_LIMIT = 5000;

export interface UseReports {
  netWorth: NetWorth | null;
  recurring: RecurringReport | null;
  transactions: DashboardTransaction[];
  yearSeries: CashflowPoint[];
}

/**
 * Loads everything the Reports page needs beyond the cash-flow card: consolidated
 * net worth (F1/F2), recurring subscriptions (D1), the transaction history (for
 * top categories + biggest movements), and the per-year cash flow (for YoY).
 */
export function useReports(refreshToken = 0): UseReports {
  const [netWorth, setNetWorth] = useState<NetWorth | null>(null);
  const [recurring, setRecurring] = useState<RecurringReport | null>(null);
  const [transactions, setTransactions] = useState<DashboardTransaction[]>([]);
  const [yearSeries, setYearSeries] = useState<CashflowPoint[]>([]);

  useEffect(() => {
    let active = true;
    // A read failure must be visible, not silently rendered as "no data".
    const onError = (): void => {
      if (active) toast.error('Chargement des rapports impossible. Réessayez.');
    };
    void ipc
      .invoke('dashboard:netWorth', {})
      .then((nw) => {
        if (active) setNetWorth(nw);
      })
      .catch(onError);
    void ipc
      .invoke('recurring:list', {})
      .then((r) => {
        if (active) setRecurring(r);
      })
      .catch(onError);
    void ipc
      .invoke('dashboard:getTransactions', { limit: REPORT_TX_LIMIT })
      .then(({ transactions: t }) => {
        if (active) setTransactions(t);
      })
      .catch(onError);
    void ipc
      .invoke('dashboard:cashflow', { granularity: 'year' })
      .then(({ series }) => {
        if (active) setYearSeries(series);
      })
      .catch(onError);
    return () => {
      active = false;
    };
  }, [refreshToken]);

  return { netWorth, recurring, transactions, yearSeries };
}
