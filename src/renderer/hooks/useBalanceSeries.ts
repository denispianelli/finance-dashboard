import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { BalancePoint, ChartRange } from '@shared/types/dashboard';
import { ipc } from '@renderer/ipc/client';

/**
 * Balance-over-time points for the dashboard chart, for the selected account
 * and time window. Refetches on account, range or `refreshToken` change.
 */
export function useBalanceSeries(
  accountId: string | null,
  range: ChartRange,
  refreshToken = 0,
): { points: BalancePoint[] } {
  const [points, setPoints] = useState<BalancePoint[]>([]);

  useEffect(() => {
    if (accountId === null) return;
    let active = true;
    void ipc
      .invoke('dashboard:balanceSeries', { accountId, range })
      .then(({ points: next }) => {
        if (active) setPoints(next);
      })
      .catch(() => {
        // Surface the failure instead of rendering an indistinguishable empty
        // chart that asserts the user has no data.
        if (active) toast.error('Chargement du solde impossible. Réessayez.');
      });
    return () => {
      active = false;
    };
  }, [accountId, range, refreshToken]);

  // No account selected → nothing to chart (derived, not reset in the effect).
  return { points: accountId === null ? [] : points };
}
