import type { AccountSummary } from '@shared/types/dashboard';
import { getDb } from '../../db';
import { getAccountSummaries } from '../../dashboard/queries';

export function handleDashboardGetAccounts(): { accounts: AccountSummary[] } {
  return { accounts: getAccountSummaries(getDb()) };
}
