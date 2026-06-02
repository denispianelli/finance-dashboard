import type { AccountSummary, CreateAccountInput } from '@shared/types/dashboard';
import { getDb } from '../../db';
import { createAccount } from '../../accounts/manage';

export function handleAccountsCreate(payload: CreateAccountInput): { account: AccountSummary } {
  return { account: createAccount(getDb(), payload) };
}
