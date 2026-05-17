/// <reference types="vite/client" />

import type { ElectronAPI } from '@shared/types/ipc';

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
