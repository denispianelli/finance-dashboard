import type { IpcChannel, IpcPayload, IpcResponse } from '@shared/types/ipc';

export const ipc = {
  invoke: <C extends IpcChannel>(channel: C, payload: IpcPayload<C>): Promise<IpcResponse<C>> =>
    window.electronAPI.invoke(channel, payload),
};
