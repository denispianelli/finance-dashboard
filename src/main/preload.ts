import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type {
  ElectronAPI,
  IpcChannel,
  IpcPayload,
  IpcResponse,
  ModelStatusResponse,
} from '@shared/types/ipc';

const api: ElectronAPI = {
  invoke: <C extends IpcChannel>(channel: C, payload: IpcPayload<C>): Promise<IpcResponse<C>> =>
    ipcRenderer.invoke(channel, payload),
  getDroppedPaths: (files: File[]): string[] => files.map((f) => webUtils.getPathForFile(f)),
  // Implemented in Task 6 — push channel via ipcRenderer.on('model:progress', …)
  onModelProgress: (cb: (status: ModelStatusResponse) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: ModelStatusResponse): void => {
      cb(status);
    };
    ipcRenderer.on('model:progress', handler);
    return () => ipcRenderer.removeListener('model:progress', handler);
  },
};

contextBridge.exposeInMainWorld('electronAPI', api);
