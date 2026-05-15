import { ipcMain } from 'electron';
import type { IpcChannel, IpcPayload, IpcResponse } from '@shared/types/ipc';
import { CHANNELS } from './channels';
import { handlePing } from './handlers/ping';

type Handler<C extends IpcChannel> = (
  payload: IpcPayload<C>,
) => IpcResponse<C> | Promise<IpcResponse<C>>;

function register<C extends IpcChannel>(channel: C, handler: Handler<C>): void {
  ipcMain.handle(channel, async (_event, payload: IpcPayload<C>) => handler(payload));
}

export function registerAllHandlers(): void {
  register(CHANNELS.appPing, handlePing);
}
