import { useEffect, useState } from 'react';
import { ipc } from '@renderer/ipc/client';

export interface NetWorthSummary {
  /** Sum of every account's balance, in euros. */
  netWorth: number;
  /** Current calendar month's net flow (income − expenses, internal transfers excluded). */
  monthDelta: number;
}

/** Local `yyyy-mm` for the current month, matching how the cashflow series buckets dates. */
function currentMonthKey(): string {
  const now = new Date();
  return `${String(now.getFullYear())}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Net worth + the current month's delta, derived from the existing dashboard IPC —
 * no new network path (privacy invariant intact). Re-fetches whenever `refreshToken`
 * changes (a new import / edit bumps it) so the sidebar anchor stays current.
 */
export function useNetWorthSummary(refreshToken: number): NetWorthSummary {
  const [netWorth, setNetWorth] = useState(0);
  const [monthDelta, setMonthDelta] = useState(0);

  useEffect(() => {
    let active = true;
    void ipc.invoke('dashboard:netWorth', {}).then((nw) => {
      if (active) setNetWorth(nw.total);
    });
    void ipc.invoke('dashboard:cashflow', { granularity: 'month' }).then(({ series }) => {
      if (!active) return;
      const current = series.find((p) => p.period === currentMonthKey());
      setMonthDelta(current?.net ?? 0);
    });
    return () => {
      active = false;
    };
  }, [refreshToken]);

  return { netWorth, monthDelta };
}
