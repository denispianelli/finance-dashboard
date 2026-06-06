import type { AccountSummary, SetDeclaredBalanceInput } from '@shared/types/dashboard';
import { getDb } from '../../db';
import { setDeclaredBalance } from '../../accounts/manage';

export function handleAccountsSetDeclaredBalance(payload: SetDeclaredBalanceInput): {
  account: AccountSummary;
} {
  return { account: setDeclaredBalance(getDb(), payload) };
}
