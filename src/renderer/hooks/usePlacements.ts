import { useCallback, useEffect, useState } from 'react';
import { ipc } from '../ipc/client';
import type {
  WrapperDTO,
  WrapperWithSupports,
  CreateWrapperInput,
  CreateSupportInput,
  SupportUpdateInput,
  SupportHistory,
} from '@shared/types/investment';

export function usePlacements(refreshToken: number) {
  const [wrappers, setWrappers] = useState<WrapperWithSupports[]>([]);
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => {
    setTick((t) => t + 1);
  }, []);

  useEffect(() => {
    let alive = true;
    void ipc.invoke('investment:listWrappers', {}).then((r) => {
      if (!alive) return;
      setWrappers(r.wrappers);
    });
    return () => {
      alive = false;
    };
  }, [refreshToken, tick]);

  const createWrapper = useCallback(
    async (input: CreateWrapperInput): Promise<WrapperDTO> => {
      const r = await ipc.invoke('investment:createWrapper', input);
      reload();
      return r.wrapper;
    },
    [reload],
  );

  const deleteWrapper = useCallback(
    async (id: string) => {
      await ipc.invoke('investment:deleteWrapper', { id });
      reload();
    },
    [reload],
  );

  const createSupport = useCallback(
    async (input: CreateSupportInput) => {
      await ipc.invoke('investment:createSupport', input);
      reload();
    },
    [reload],
  );

  const deleteSupport = useCallback(
    async (id: string) => {
      await ipc.invoke('investment:deleteSupport', { id });
      reload();
    },
    [reload],
  );

  const updateSupport = useCallback(
    async (input: SupportUpdateInput) => {
      await ipc.invoke('investment:updateSupport', input);
      reload();
    },
    [reload],
  );

  const getSupportHistory = useCallback(
    (supportId: string): Promise<SupportHistory> =>
      ipc.invoke('investment:getSupportHistory', { supportId }).then((r) => r.history),
    [],
  );

  return {
    wrappers,
    reload,
    createWrapper,
    deleteWrapper,
    createSupport,
    deleteSupport,
    updateSupport,
    getSupportHistory,
  };
}
