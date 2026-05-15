import { contextBridge, ipcRenderer } from 'electron';
import type { ElectronAPI, IpcChannel, IpcPayload, IpcResponse } from '@shared/types/ipc';

const api: ElectronAPI = {
  invoke: <C extends IpcChannel>(channel: C, payload: IpcPayload<C>): Promise<IpcResponse<C>> =>
    ipcRenderer.invoke(channel, payload),
};

contextBridge.exposeInMainWorld('electronAPI', api);
