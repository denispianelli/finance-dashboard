import type { IpcChannel, IpcPayload, IpcResponse, ModelStatusResponse } from '@shared/types/ipc';

export const ipc = {
  invoke: <C extends IpcChannel>(channel: C, payload: IpcPayload<C>): Promise<IpcResponse<C>> =>
    window.electronAPI.invoke(channel, payload),
  onModelProgress: (cb: (status: ModelStatusResponse) => void): (() => void) =>
    window.electronAPI.onModelProgress(cb),
};
