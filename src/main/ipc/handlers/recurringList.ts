import type { RecurringInput, RecurringReport } from '@shared/types/recurring';
import { getDb } from '../../db';
import { NOT_TRANSFER, NOT_REFUND } from '../../dashboard/transferFilter';
import { detectRecurring } from '../../recurring/detect';

export function handleRecurringList(): RecurringReport {
  const rows = getDb()
    .prepare(
      `SELECT date, amount, label_clean AS label FROM transactions WHERE ${NOT_TRANSFER} AND ${NOT_REFUND}`,
    )
    .all() as unknown as RecurringInput[];
  const subscriptions = detectRecurring(rows);
  const monthlyTotal = subscriptions.reduce((sum, s) => sum + s.monthlyEquivalent, 0);
  return { subscriptions, monthlyTotal };
}
