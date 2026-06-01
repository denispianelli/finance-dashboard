import type { DashboardMetrics } from '@shared/types/dashboard';
import { getDb } from '../../db';
import { getDashboardMetrics } from '../../dashboard/metrics';

export function handleDashboardMetrics(payload: { accountId: string }): DashboardMetrics {
  return getDashboardMetrics(getDb(), payload.accountId);
}
