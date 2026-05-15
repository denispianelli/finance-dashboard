export type PingPayload = { now: number };
export type PingResponse = { pong: true; receivedAt: number; serverNow: number };

export interface IpcContract {
  'app:ping': { payload: PingPayload; response: PingResponse };
}

export type IpcChannel = keyof IpcContract;
export type IpcPayload<C extends IpcChannel> = IpcContract[C]['payload'];
export type IpcResponse<C extends IpcChannel> = IpcContract[C]['response'];
