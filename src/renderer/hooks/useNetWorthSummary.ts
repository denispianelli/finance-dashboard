import { useEffect, useState } from 'react';
import { ipc } from '@renderer/ipc/client';

export interface NetWorthSummary {
  /** Consolidated net worth (accounts + declared assets − loan CRD, at the maintainer's share), in euros. */
  netWorth: number;
  /** Current calendar month's net flow (income − expenses, internal transfers excluded). */
  monthDelta: number;
  /** Sum of the positive net-worth contributions (accounts, declared assets, supports). */
  actifs: number;
  /** Sum of the negative contributions (loans, overdrawn accounts). Negative or 0. */
  passif: number;
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
  const [actifs, setActifs] = useState(0);
  const [passif, setPassif] = useState(0);

  useEffect(() => {
    let active = true;
    void ipc.invoke('dashboard:netWorth', {}).then((nw) => {
      if (!active) return;
      setNetWorth(nw.total);
      // Split the listed contributions into positive (actifs) / negative (passif);
      // each line item is shown on the page, so the split stays verifiable.
      let pos = 0;
      let neg = 0;
      const add = (c: number): void => {
        if (c >= 0) pos += c;
        else neg += c;
      };
      for (const a of nw.accounts) add(a.balance ?? 0);
      for (const a of nw.assets) add(a.contribution);
      for (const s of nw.supports) add(s.value);
      for (const l of nw.loans) add(l.contribution);
      setActifs(pos);
      setPassif(neg);
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

  return { netWorth, monthDelta, actifs, passif };
}
