import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import type {
  AccountSummary,
  DashboardMetrics,
  DashboardTransaction,
} from '@shared/types/dashboard';
import type { CategoryDTO, CreateCategoryInput } from '@shared/types/category';
import type { UpdateTransactionInput } from '@shared/types/transaction';
import { ipc } from '@renderer/ipc/client';
import type { RuleProposal } from '@renderer/components/categories/RuleDialog';

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
  /** Reassign a transaction to a category and refresh the view. When `labelClean`
   *  is provided (and the page handles proposals), the success toast offers to
   *  turn the correction into a rule. */
  reassign: (transactionId: string, categoryId: string, labelClean?: string) => Promise<void>;
  /** Force a refetch (e.g. after a rule creation retroactively categorized rows). */
  refresh: () => void;
  /** Create a category on the fly; returns it so callers can assign it. */
  createCategory: (input: CreateCategoryInput) => Promise<CategoryDTO>;
  /** Edit a transaction's date / label / amount and refresh. */
  updateTransaction: (input: UpdateTransactionInput) => Promise<void>;
  /** Delete a transaction; offers an undo toast that restores it. */
  deleteTransaction: (transactionId: string) => Promise<void>;
}

export interface UseDashboardOptions {
  /**
   * Max transactions to fetch for the selected account. Omitted on the dashboard
   * (backend default of 100, enough for the preview + the monthly insight). The full
   * Transactions page passes a high value to load the whole history for client-side
   * filtering.
   */
  readonly transactionLimit?: number;
  /** When set, the reassign toast offers a "Créer une règle" action. */
  readonly onProposeRule?: (proposal: RuleProposal) => void;
}

/**
 * Loads accounts, categories, and the selected account's transactions + metrics
 * over IPC. Refetches on `refreshToken` (import) or the internal tick (after a
 * reassignment / category creation).
 */
export function useDashboard(
  refreshToken: number,
  options: UseDashboardOptions = {},
): UseDashboard {
  const { transactionLimit, onProposeRule } = options;
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [transactions, setTransactions] = useState<DashboardTransaction[]>([]);
  const [metrics, setMetrics] = useState<DashboardMetrics>(EMPTY_METRICS);
  const [categories, setCategories] = useState<CategoryDTO[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  // Accounts: the core dashboard data. Loaded independently so that a failure
  // elsewhere (e.g. categories) can never blank out accounts/transactions.
  useEffect(() => {
    let active = true;
    void ipc
      .invoke('dashboard:getAccounts', {})
      .then(({ accounts: next }) => {
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
      })
      .catch((e: unknown) => {
        // Surface the failure instead of rendering the empty state, which would
        // wrongly tell the user they have no accounts/data.
        if (active) toast.error(`Chargement impossible : ${errMessage(e)}`);
      });
    return () => {
      active = false;
    };
  }, [refreshToken, tick]);

  // Categories: only needed for the reassign picker — its failure must not
  // affect the rest of the dashboard, so it loads in its own effect.
  useEffect(() => {
    let active = true;
    void ipc
      .invoke('categories:list', {})
      .then(({ categories: next }) => {
        if (active) setCategories(next);
      })
      .catch(() => {
        // Categories are optional here (only the reassign picker needs them).
        // On failure the picker simply shows no choices; the dashboard stays up.
      });
    return () => {
      active = false;
    };
  }, [refreshToken, tick]);

  // Transactions + metrics for the selected account.
  useEffect(() => {
    if (selectedAccountId === null) return;
    let active = true;
    const onError = (e: unknown): void => {
      if (active) toast.error(`Chargement impossible : ${errMessage(e)}`);
    };
    void ipc
      .invoke('dashboard:getTransactions', {
        accountId: selectedAccountId,
        ...(transactionLimit !== undefined && { limit: transactionLimit }),
      })
      .then(({ transactions: next }) => {
        if (active) setTransactions(next);
      })
      .catch(onError);
    void ipc
      .invoke('dashboard:metrics', { accountId: selectedAccountId })
      .then((next) => {
        if (active) setMetrics(next);
      })
      .catch(onError);
    return () => {
      active = false;
    };
  }, [selectedAccountId, refreshToken, tick, transactionLimit]);

  const selectAccount = useCallback((id: string) => {
    setSelectedAccountId(id);
  }, []);

  const reassign = useCallback(
    async (transactionId: string, categoryId: string, labelClean?: string) => {
      try {
        await ipc.invoke('transactions:setCategory', { transactionId, categoryId });
        setTick((t) => t + 1);
        if (labelClean !== undefined && onProposeRule !== undefined) {
          toast.success('Transaction reclassée', {
            action: {
              label: 'Créer une règle',
              onClick: () => {
                onProposeRule({ labelClean, categoryId });
              },
            },
          });
        } else {
          toast.success('Transaction reclassée');
        }
      } catch (e) {
        toast.error(`Reclassement impossible : ${errMessage(e)}`);
      }
    },
    [onProposeRule],
  );

  const refresh = useCallback(() => {
    setTick((t) => t + 1);
  }, []);

  const updateTransaction = useCallback(async (input: UpdateTransactionInput) => {
    try {
      await ipc.invoke('transactions:update', input);
      setTick((t) => t + 1);
      toast.success('Transaction modifiée');
    } catch (e) {
      toast.error(`Modification impossible : ${errMessage(e)}`);
    }
  }, []);

  const deleteTransaction = useCallback(async (transactionId: string) => {
    try {
      const { snapshot } = await ipc.invoke('transactions:delete', { transactionId });
      setTick((t) => t + 1);
      toast.success('Transaction supprimée', {
        action: {
          label: 'Annuler',
          onClick: () => {
            void ipc.invoke('transactions:restore', { transaction: snapshot }).then(() => {
              setTick((t) => t + 1);
            });
          },
        },
      });
    } catch (e) {
      toast.error(`Suppression impossible : ${errMessage(e)}`);
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
    refresh,
    createCategory,
    updateTransaction,
    deleteTransaction,
  };
}
