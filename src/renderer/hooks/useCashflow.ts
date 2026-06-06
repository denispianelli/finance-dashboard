import { useEffect, useState } from 'react';
import type { CashflowGranularity, CashflowPoint } from '@shared/types/dashboard';
import { ipc } from '@renderer/ipc/client';

export interface UseCashflow {
  series: CashflowPoint[];
  granularity: CashflowGranularity;
  setGranularity: (g: CashflowGranularity) => void;
}

/** Consolidated gained/lost per period (F1's `dashboard:cashflow`), toggling
 *  between calendar month and year. Refetches whenever the granularity changes. */
export function useCashflow(): UseCashflow {
  const [granularity, setGranularity] = useState<CashflowGranularity>('month');
  const [series, setSeries] = useState<CashflowPoint[]>([]);

  useEffect(() => {
    let active = true;
    void ipc.invoke('dashboard:cashflow', { granularity }).then(({ series: next }) => {
      if (active) setSeries(next);
    });
    return () => {
      active = false;
    };
  }, [granularity]);

  return { series, granularity, setGranularity };
}
