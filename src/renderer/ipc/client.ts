import type { ElectronAPI, IpcChannel, IpcPayload, IpcResponse } from '@shared/types/ipc';

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export const ipc = {
  invoke: <C extends IpcChannel>(channel: C, payload: IpcPayload<C>): Promise<IpcResponse<C>> =>
    window.electronAPI.invoke(channel, payload),
};
