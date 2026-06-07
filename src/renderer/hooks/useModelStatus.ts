import { useEffect, useState } from 'react';
import type { ModelStatusResponse } from '@shared/types/ipc';
import { ipc } from '@renderer/ipc/client';

/** Live model status: seeds from `model:status`, then tracks pushed progress events. */
export function useModelStatus(): ModelStatusResponse {
  const [status, setStatus] = useState<ModelStatusResponse>({ state: 'absent' });

  useEffect(() => {
    void ipc.invoke('model:status', {}).then(setStatus);
    return ipc.onModelProgress(setStatus);
  }, []);

  return status;
}
