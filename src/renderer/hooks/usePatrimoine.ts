import { useCallback, useEffect, useState } from 'react';
import { ipc } from '../ipc/client';
import type { LoanWithStats, AssetDTO, UpsertAssetInput } from '@shared/types/patrimoine';

export function usePatrimoine(refreshToken: number) {
  const [loans, setLoans] = useState<LoanWithStats[]>([]);
  const [assets, setAssets] = useState<AssetDTO[]>([]);
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => {
    setTick((t) => t + 1);
  }, []);

  useEffect(() => {
    let alive = true;
    void Promise.all([
      ipc.invoke('patrimoine:listLoans', {}),
      ipc.invoke('patrimoine:listAssets', {}),
    ]).then(([l, a]) => {
      if (!alive) return;
      setLoans(l.loans);
      setAssets(a.assets);
    });
    return () => {
      alive = false;
    };
  }, [refreshToken, tick]);

  const deleteLoan = useCallback(
    async (id: string) => {
      await ipc.invoke('patrimoine:deleteLoan', { id });
      reload();
    },
    [reload],
  );

  const upsertAsset = useCallback(
    async (input: UpsertAssetInput) => {
      await ipc.invoke('patrimoine:upsertAsset', input);
      reload();
    },
    [reload],
  );

  const deleteAsset = useCallback(
    async (id: string) => {
      await ipc.invoke('patrimoine:deleteAsset', { id });
      reload();
    },
    [reload],
  );

  const detectPayments = useCallback(
    async (loanId: string) => {
      const { matched } = await ipc.invoke('patrimoine:detectPayments', { loanId });
      reload();
      return matched;
    },
    [reload],
  );

  return { loans, assets, reload, deleteLoan, upsertAsset, deleteAsset, detectPayments };
}
