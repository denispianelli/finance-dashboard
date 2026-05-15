import type { IpcChannel } from '@shared/types/ipc';

export const CHANNELS = {
  appPing: 'app:ping',
  importPickFile: 'import:pickFile',
} as const satisfies Record<string, IpcChannel>;
