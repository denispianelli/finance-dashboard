import { useCallback, useEffect, useState } from 'react';
import type { AccountSummary, DashboardTransaction } from '@shared/types/dashboard';
import { ipc } from '@renderer/ipc/client';

export interface UseDashboard {
  accounts: AccountSummary[];
  transactions: DashboardTransaction[];
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

  // Transactions: reload whenever the selected account or the refresh token
  // changes. The no-account case is handled above (transactions cleared there).
  useEffect(() => {
    if (selectedAccountId === null) return;
    let active = true;
    void ipc
      .invoke('dashboard:getTransactions', { accountId: selectedAccountId })
      .then(({ transactions: next }) => {
        if (active) setTransactions(next);
      });
    return () => {
      active = false;
    };
  }, [selectedAccountId, refreshToken]);

  const selectAccount = useCallback((id: string) => {
    setSelectedAccountId(id);
  }, []);

  return { accounts, transactions, selectedAccountId, selectAccount };
}
