import { useCallback, useEffect, useState } from 'react';
import { ipc } from '../ipc/client';
import type {
  LoanWithStats,
  AssetDTO,
  UpsertAssetInput,
  Allocation,
  AssetClass,
  ClassifiableHolding,
  UpsertAssetClassInput,
} from '@shared/types/patrimoine';

export function usePatrimoine(refreshToken: number) {
  const [loans, setLoans] = useState<LoanWithStats[]>([]);
  const [assets, setAssets] = useState<AssetDTO[]>([]);
  const [allocation, setAllocation] = useState<Allocation | null>(null);
  const [classes, setClasses] = useState<AssetClass[]>([]);
  const [holdings, setHoldings] = useState<ClassifiableHolding[]>([]);
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => {
    setTick((t) => t + 1);
  }, []);

  useEffect(() => {
    let alive = true;
    void Promise.all([
      ipc.invoke('patrimoine:listLoans', {}),
      ipc.invoke('patrimoine:listAssets', {}),
      ipc.invoke('patrimoine:getAllocation', {}),
      ipc.invoke('patrimoine:listClasses', {}),
      ipc.invoke('patrimoine:listHoldings', {}),
    ]).then(([l, a, alloc, cls, hold]) => {
      if (!alive) return;
      setLoans(l.loans);
      setAssets(a.assets);
      setAllocation(alloc.allocation);
      setClasses(cls.classes);
      setHoldings(hold.holdings);
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

  const upsertClass = useCallback(
    async (input: UpsertAssetClassInput) => {
      await ipc.invoke('patrimoine:upsertClass', input);
      reload();
    },
    [reload],
  );

  const deleteClass = useCallback(
    async (id: string) => {
      await ipc.invoke('patrimoine:deleteClass', { id });
      reload();
    },
    [reload],
  );

  const assignClass = useCallback(
    async (kind: 'account' | 'asset' | 'loan', id: string, classId: string | null) => {
      await ipc.invoke('patrimoine:assignClass', { kind, id, classId });
      reload();
    },
    [reload],
  );

  return {
    loans,
    assets,
    allocation,
    classes,
    holdings,
    reload,
    deleteLoan,
    upsertAsset,
    deleteAsset,
    detectPayments,
    upsertClass,
    deleteClass,
    assignClass,
  };
}
