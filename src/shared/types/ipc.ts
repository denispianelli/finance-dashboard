import type { StatementExtraction, ImportFileType } from './import';
import type {
  AccountSummary,
  DashboardTransaction,
  GetTransactionsQuery,
  AggregateQuery,
  DashboardMetrics,
} from './dashboard';
import type { AggregationBucket } from './taxonomy';

export interface PingPayload {
  now: number;
}

export interface PingResponse {
  pong: true;
  receivedAt: number;
  serverNow: number;
}

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
  | {
      ok: false;
      error: 'unknown_bank' | 'no_text' | 'not_pdf' | 'unsupported_format' | 'malformed_ofx';
    };

export interface ConfirmPayload {
  path: string;
  accountId: string;
  selectedHashes?: string[];
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
        | 'not_pdf'
        | 'unsupported_format'
        | 'malformed_ofx';
    };

export interface IpcContract {
  'app:ping': { payload: PingPayload; response: PingResponse };
  'import:pickFile': { payload: PickFilePayload; response: PickFileResponse };
  'import:extract': { payload: ExtractPayload; response: ExtractResponse };
  'import:confirm': { payload: ConfirmPayload; response: ConfirmResponse };
  'dashboard:getAccounts': {
    payload: Record<string, never>;
    response: { accounts: AccountSummary[] };
  };
  'dashboard:getTransactions': {
    payload: GetTransactionsQuery;
    response: { transactions: DashboardTransaction[] };
  };
  'dashboard:aggregate': { payload: AggregateQuery; response: { buckets: AggregationBucket[] } };
  'dashboard:metrics': { payload: { accountId: string }; response: DashboardMetrics };
}

export type IpcChannel = keyof IpcContract;
export type IpcPayload<C extends IpcChannel> = IpcContract[C]['payload'];
export type IpcResponse<C extends IpcChannel> = IpcContract[C]['response'];

export interface ElectronAPI {
  invoke: <C extends IpcChannel>(channel: C, payload: IpcPayload<C>) => Promise<IpcResponse<C>>;
}
