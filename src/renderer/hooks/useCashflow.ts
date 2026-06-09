import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { CashflowGranularity, CashflowPoint } from '@shared/types/dashboard';
import { ipc } from '@renderer/ipc/client';

export interface UseCashflow {
  series: CashflowPoint[];
  granularity: CashflowGranularity;
  setGranularity: (g: CashflowGranularity) => void;
  /** True until the first fetch settles — lets callers tell "loading" from
   *  "loaded but empty" instead of showing a perpetual spinner. */
  loading: boolean;
}

/** Consolidated gained/lost per period (F1's `dashboard:cashflow`), toggling
 *  between calendar month and year. Refetches on granularity or `refreshToken`
 *  (import / background categorization). */
export function useCashflow(refreshToken = 0): UseCashflow {
  const [granularity, setGranularity] = useState<CashflowGranularity>('month');
  const [series, setSeries] = useState<CashflowPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    // `loading` starts true and only ever flips false (in finally) — it exists to
    // tell the first render from "loaded but empty"; refetches keep the data shown.
    void ipc
      .invoke('dashboard:cashflow', { granularity })
      .then(({ series: next }) => {
        if (active) setSeries(next);
      })
      .catch(() => {
        // Surface the failure instead of rendering an indistinguishable empty
        // state that asserts the user has no data.
        if (active) toast.error('Chargement des flux impossible. Réessayez.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [granularity, refreshToken]);

  return { series, granularity, setGranularity, loading };
}
