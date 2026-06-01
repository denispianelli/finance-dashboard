import type { DashboardTransaction, GetTransactionsQuery } from '@shared/types/dashboard';
import { getDb } from '../../db';
import { getTransactions } from '../../dashboard/queries';

export function handleDashboardGetTransactions(payload: GetTransactionsQuery): {
  transactions: DashboardTransaction[];
} {
  return { transactions: getTransactions(getDb(), payload) };
}
