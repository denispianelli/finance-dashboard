import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import type {
  AccountSummary,
  DashboardMetrics,
  DashboardTransaction,
} from '@shared/types/dashboard';
import type { CategoryDTO, CreateCategoryInput } from '@shared/types/category';
import { ipc } from '@renderer/ipc/client';

const EMPTY_METRICS: DashboardMetrics = { balance: 0, series: [] };

function errMessage(e: unknown): string {
  return e instanceof Error ? e.message.replace(/^[a-zA-Z]+:\s*/, '') : 'Erreur inattendue';
}

export interface UseDashboard {
  accounts: AccountSummary[];
  transactions: DashboardTransaction[];
  metrics: DashboardMetrics;
  categories: CategoryDTO[];
  selectedAccountId: string | null;
  selectAccount: (id: string) => void;
  /** Reassign a transaction to a category and refresh the view. */
  reassign: (transactionId: string, categoryId: string) => Promise<void>;
  /** Create a category on the fly; returns it so callers can assign it. */
  createCategory: (input: CreateCategoryInput) => Promise<CategoryDTO>;
}

/**
 * Loads accounts, categories, and the selected account's transactions + metrics
 * over IPC. Refetches on `refreshToken` (import) or the internal tick (after a
 * reassignment / category creation).
 */
export function useDashboard(refreshToken: number): UseDashboard {
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [transactions, setTransactions] = useState<DashboardTransaction[]>([]);
  const [metrics, setMetrics] = useState<DashboardMetrics>(EMPTY_METRICS);
  const [categories, setCategories] = useState<CategoryDTO[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  // Accounts + categories: load on mount, on refresh, and on each internal tick.
  useEffect(() => {
    let active = true;
    void Promise.all([
      ipc.invoke('dashboard:getAccounts', {}),
      ipc.invoke('categories:list', {}),
    ]).then(([acc, cats]) => {
      if (!active) return;
      setAccounts(acc.accounts);
      setCategories(cats.categories);
      const first = acc.accounts[0];
      if (first === undefined) {
        setSelectedAccountId(null);
        setTransactions([]);
        setMetrics(EMPTY_METRICS);
        return;
      }
      setSelectedAccountId((prev) =>
        prev !== null && acc.accounts.some((a) => a.id === prev) ? prev : first.id,
      );
    });
    return () => {
      active = false;
    };
  }, [refreshToken, tick]);

  // Transactions + metrics for the selected account.
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
  }, [selectedAccountId, refreshToken, tick]);

  const selectAccount = useCallback((id: string) => {
    setSelectedAccountId(id);
  }, []);

  const reassign = useCallback(async (transactionId: string, categoryId: string) => {
    try {
      await ipc.invoke('transactions:setCategory', { transactionId, categoryId });
      setTick((t) => t + 1);
      toast.success('Transaction reclassée');
    } catch (e) {
      toast.error(`Reclassement impossible : ${errMessage(e)}`);
    }
  }, []);

  const createCategory = useCallback(async (input: CreateCategoryInput) => {
    try {
      const { category } = await ipc.invoke('categories:create', input);
      setTick((t) => t + 1);
      toast.success(`Catégorie « ${category.name} » créée`);
      return category;
    } catch (e) {
      toast.error(`Catégorie non créée : ${errMessage(e)}`);
      throw e instanceof Error ? e : new Error('create failed');
    }
  }, []);

  return {
    accounts,
    transactions,
    metrics,
    categories,
    selectedAccountId,
    selectAccount,
    reassign,
    createCategory,
  };
}
