import { useCallback, useEffect, useState } from 'react';
import { ipc } from '../ipc/client';
import type {
  WrapperDTO,
  WrapperWithSupports,
  CreateWrapperInput,
  CreateSupportInput,
  SupportUpdateInput,
  SupportHistory,
  ImportBourseResult,
  OperationDTO,
  RefreshResult,
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

  // On mount, if the feed is enabled, refresh quotes in the background and reload when done.
  useEffect(() => {
    let alive = true;
    void ipc.invoke('investment:getQuoteSettings', {}).then((s) => {
      if (!alive || !s.enabled) return;
      void ipc.invoke('investment:refreshQuotes', {}).then(() => {
        if (alive) reload();
      });
    });
    return () => {
      alive = false;
    };
  }, [reload]);

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

  const pickBourseCsv = useCallback(
    (): Promise<{ cancelled: true } | { cancelled: false; path: string }> =>
      ipc.invoke('investment:pickBourseCsv', {}),
    [],
  );

  const importBourseCsv = useCallback(
    async (path: string, wrapperId: string): Promise<ImportBourseResult> => {
      const r = await ipc.invoke('investment:importBourseCsv', { path, wrapperId });
      reload();
      return r.result;
    },
    [reload],
  );

  const listOperations = useCallback(
    (supportId: string): Promise<OperationDTO[]> =>
      ipc.invoke('investment:listOperations', { supportId }).then((r) => r.operations),
    [],
  );

  const getQuoteSettings = useCallback(() => ipc.invoke('investment:getQuoteSettings', {}), []);

  const setQuotesEnabled = useCallback(async (enabled: boolean) => {
    await ipc.invoke('investment:setQuotesEnabled', { enabled });
  }, []);

  const refreshQuotes = useCallback(async (): Promise<RefreshResult> => {
    const r = await ipc.invoke('investment:refreshQuotes', {});
    reload();
    return r.result;
  }, [reload]);

  return {
    wrappers,
    reload,
    createWrapper,
    deleteWrapper,
    createSupport,
    deleteSupport,
    updateSupport,
    getSupportHistory,
    pickBourseCsv,
    importBourseCsv,
    listOperations,
    getQuoteSettings,
    setQuotesEnabled,
    refreshQuotes,
  };
}
