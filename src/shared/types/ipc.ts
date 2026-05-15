export interface PingPayload {
  now: number;
}

export interface PingResponse {
  pong: true;
  receivedAt: number;
  serverNow: number;
}

export interface IpcContract {
  'app:ping': { payload: PingPayload; response: PingResponse };
}

export type IpcChannel = keyof IpcContract;
export type IpcPayload<C extends IpcChannel> = IpcContract[C]['payload'];
export type IpcResponse<C extends IpcChannel> = IpcContract[C]['response'];

export interface ElectronAPI {
  invoke: <C extends IpcChannel>(channel: C, payload: IpcPayload<C>) => Promise<IpcResponse<C>>;
}
