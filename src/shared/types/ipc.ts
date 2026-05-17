import type { StatementExtraction } from './import';

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

export interface ExtractPayload {
  path: string;
  accountId: string;
}
export type ExtractResponse =
  | { ok: true; extraction: StatementExtraction }
  | { ok: false; error: 'unknown_bank' | 'no_text' | 'not_pdf' };

export interface ConfirmPayload {
  path: string;
  accountId: string;
  acknowledgedCannotVerify?: boolean;
}
export type ConfirmResponse =
  | { ok: true; importId: string; insertedCount: number; skippedCount: number }
  | {
      ok: false;
      error:
        | 'arithmetic_failed'
        | 'cannot_verify_unacknowledged'
        | 'already_imported'
        | 'unknown_bank'
        | 'no_text'
        | 'not_pdf';
    };

export interface IpcContract {
  'app:ping': { payload: PingPayload; response: PingResponse };
  'import:pickFile': { payload: PickFilePayload; response: PickFileResponse };
  'import:extract': { payload: ExtractPayload; response: ExtractResponse };
  'import:confirm': { payload: ConfirmPayload; response: ConfirmResponse };
}

export type IpcChannel = keyof IpcContract;
export type IpcPayload<C extends IpcChannel> = IpcContract[C]['payload'];
export type IpcResponse<C extends IpcChannel> = IpcContract[C]['response'];

export interface ElectronAPI {
  invoke: <C extends IpcChannel>(channel: C, payload: IpcPayload<C>) => Promise<IpcResponse<C>>;
}
