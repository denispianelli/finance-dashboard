import type { RecurringInput, RecurringReport } from '@shared/types/recurring';
import { getDb } from '../../db';
import { COUNTABLE } from '../../dashboard/transferFilter';
import { detectRecurring } from '../../recurring/detect';

export function handleRecurringList(): RecurringReport {
  const rows = getDb()
    .prepare(`SELECT date, amount, label_clean AS label FROM transactions WHERE ${COUNTABLE}`)
    .all() as unknown as RecurringInput[];
  const subscriptions = detectRecurring(rows);
  const monthlyTotal = subscriptions.reduce((sum, s) => sum + s.monthlyEquivalent, 0);
  return { subscriptions, monthlyTotal };
}
