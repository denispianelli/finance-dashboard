import type {
  AccountSummary,
  CreateAccountInput,
  UpdateAccountInput,
} from '@shared/types/dashboard';
import { getDb } from '../../db';
import { createAccount, updateAccount, deleteAccount } from '../../accounts/manage';

export function handleAccountsCreate(payload: CreateAccountInput): { account: AccountSummary } {
  return { account: createAccount(getDb(), payload) };
}

export function handleAccountsUpdate(payload: UpdateAccountInput): { account: AccountSummary } {
  return { account: updateAccount(getDb(), payload) };
}

export function handleAccountsDelete(payload: { id: string }): { deletedTransactions: number } {
  return deleteAccount(getDb(), payload.id);
}
