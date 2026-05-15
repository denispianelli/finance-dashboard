export interface PingPayload {
  now: number;
}

export interface PingResponse {
  pong: true;
  receivedAt: number;
  serverNow: number;
}

export type ImportFileType = 'pdf' | 'csv' | 'ofx';

export type PickFilePayload = Record<string, never>;

export type PickFileResponse =
  | { cancelled: true }
  | {
      cancelled: false;
      path: string;
      type: ImportFileType;
      hash: string;
      size: number;
      alreadyImported: boolean;
    };

export interface IpcContract {
  'app:ping': { payload: PingPayload; response: PingResponse };
  'import:pickFile': { payload: PickFilePayload; response: PickFileResponse };
}

export type IpcChannel = keyof IpcContract;
export type IpcPayload<C extends IpcChannel> = IpcContract[C]['payload'];
export type IpcResponse<C extends IpcChannel> = IpcContract[C]['response'];

export interface ElectronAPI {
  invoke: <C extends IpcChannel>(channel: C, payload: IpcPayload<C>) => Promise<IpcResponse<C>>;
}
