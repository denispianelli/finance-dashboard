import type { BalancePoint, ChartRange } from '@shared/types/dashboard';
import { getDb } from '../../db';
import { getBalanceSeries } from '../../dashboard/balanceSeries';

export function handleDashboardBalanceSeries(payload: { accountId: string; range: ChartRange }): {
  points: BalancePoint[];
} {
  return { points: getBalanceSeries(getDb(), payload.accountId, payload.range) };
}
