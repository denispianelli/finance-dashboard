import type { CashflowGranularity, CashflowPoint, NetWorth } from '@shared/types/dashboard';
import { getDb } from '../../db';
import { getConsolidatedCashflow, getNetWorth } from '../../dashboard/consolidated';

export function handleDashboardCashflow(payload: { granularity: CashflowGranularity }): {
  series: CashflowPoint[];
} {
  return { series: getConsolidatedCashflow(getDb(), payload.granularity) };
}

export function handleDashboardNetWorth(): NetWorth {
  return getNetWorth(getDb());
}
