import type { IpcChannel } from '@shared/types/ipc';

export const CHANNELS = {
  appPing: 'app:ping',
} as const satisfies Record<string, IpcChannel>;
