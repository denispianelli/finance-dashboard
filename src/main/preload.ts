import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { ElectronAPI, IpcChannel, IpcPayload, IpcResponse } from '@shared/types/ipc';

const api: ElectronAPI = {
  invoke: <C extends IpcChannel>(channel: C, payload: IpcPayload<C>): Promise<IpcResponse<C>> =>
    ipcRenderer.invoke(channel, payload),
  getDroppedPaths: (files: File[]): string[] => files.map((f) => webUtils.getPathForFile(f)),
};

contextBridge.exposeInMainWorld('electronAPI', api);
