import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import type {
  AccountSummary,
  CreateAccountInput,
  UpdateAccountInput,
} from '@shared/types/dashboard';
import { ipc } from '@renderer/ipc/client';

export interface UseAccounts {
  accounts: AccountSummary[];
  createAccount: (input: CreateAccountInput) => Promise<void>;
  updateAccount: (input: UpdateAccountInput) => Promise<void>;
  deleteAccount: (id: string) => Promise<void>;
}

function message(e: unknown): string {
  return e instanceof Error ? e.message.replace(/^[a-zA-Z]+:\s*/, '') : 'Erreur inattendue';
}

async function fetchAccounts(): Promise<AccountSummary[]> {
  const { accounts } = await ipc.invoke('dashboard:getAccounts', {});
  return accounts;
}

/** Loads accounts and exposes create / update / delete for the Settings page.
 *  `onMutated` fires after every successful mutation so the caller can refresh
 *  data living outside this hook (e.g. the sidebar net-worth anchor). */
export function useAccounts(onMutated?: () => void): UseAccounts {
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);

  const reload = useCallback(async () => {
    setAccounts(await fetchAccounts());
  }, []);

  useEffect(() => {
    let active = true;
    void fetchAccounts().then((next) => {
      if (active) setAccounts(next);
    });
    return () => {
      active = false;
    };
  }, []);

  const createAccount = useCallback(
    async (input: CreateAccountInput) => {
      try {
        const { account } = await ipc.invoke('accounts:create', input);
        await reload();
        onMutated?.();
        toast.success(`Compte « ${account.name} » créé`);
      } catch (e) {
        toast.error(`Compte non créé : ${message(e)}`);
      }
    },
    [reload, onMutated],
  );

  const updateAccount = useCallback(
    async (input: UpdateAccountInput) => {
      try {
        const { account } = await ipc.invoke('accounts:update', input);
        await reload();
        onMutated?.();
        toast.success(`Compte « ${account.name} » mis à jour`);
      } catch (e) {
        toast.error(`Mise à jour impossible : ${message(e)}`);
      }
    },
    [reload, onMutated],
  );

  const deleteAccount = useCallback(
    async (id: string) => {
      try {
        const { deletedTransactions } = await ipc.invoke('accounts:delete', { id });
        await reload();
        onMutated?.();
        toast.success(
          deletedTransactions > 0
            ? `Compte supprimé — ${String(deletedTransactions)} transaction(s) effacée(s)`
            : 'Compte supprimé',
        );
      } catch (e) {
        toast.error(`Suppression impossible : ${message(e)}`);
      }
    },
    [reload, onMutated],
  );

  return { accounts, createAccount, updateAccount, deleteAccount };
}
