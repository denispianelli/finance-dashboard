import { useCallback, useEffect, useState } from 'react';
import type {
  AccountSummary,
  DashboardMetrics,
  DashboardTransaction,
} from '@shared/types/dashboard';
import { ipc } from '@renderer/ipc/client';

const EMPTY_METRICS: DashboardMetrics = { balance: 0, series: [] };

export interface UseDashboard {
  accounts: AccountSummary[];
  transactions: DashboardTransaction[];
  metrics: DashboardMetrics;
  selectedAccountId: string | null;
  selectAccount: (id: string) => void;
}

/**
 * Loads accounts (and the selected account's transactions) over IPC. Refetches
 * whenever `refreshToken` changes — AppShell bumps it after a successful import.
 */
export function useDashboard(refreshToken: number): UseDashboard {
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [transactions, setTransactions] = useState<DashboardTransaction[]>([]);
  const [metrics, setMetrics] = useState<DashboardMetrics>(EMPTY_METRICS);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

  // Accounts: load on mount and on every refresh. Keep the current selection if
  // it still exists, otherwise fall back to the first account (or none).
  useEffect(() => {
    let active = true;
    void ipc.invoke('dashboard:getAccounts', {}).then(({ accounts: next }) => {
      if (!active) return;
      setAccounts(next);
      const first = next[0];
      if (first === undefined) {
        setSelectedAccountId(null);
        setTransactions([]);
        setMetrics(EMPTY_METRICS);
        return;
      }
      setSelectedAccountId((prev) =>
        prev !== null && next.some((a) => a.id === prev) ? prev : first.id,
      );
    });
    return () => {
      active = false;
    };
  }, [refreshToken]);

  // Transactions + metrics: reload whenever the selected account or the refresh
  // token changes. The no-account case is handled above (state cleared there).
  useEffect(() => {
    if (selectedAccountId === null) return;
    let active = true;
    void ipc
      .invoke('dashboard:getTransactions', { accountId: selectedAccountId })
      .then(({ transactions: next }) => {
        if (active) setTransactions(next);
      });
    void ipc.invoke('dashboard:metrics', { accountId: selectedAccountId }).then((next) => {
      if (active) setMetrics(next);
    });
    return () => {
      active = false;
    };
  }, [selectedAccountId, refreshToken]);

  const selectAccount = useCallback((id: string) => {
    setSelectedAccountId(id);
  }, []);

  return { accounts, transactions, metrics, selectedAccountId, selectAccount };
}
