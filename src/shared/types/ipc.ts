import type { StatementExtraction, ImportFileType } from './import';
import type {
  AccountSummary,
  CreateAccountInput,
  UpdateAccountInput,
  DashboardTransaction,
  GetTransactionsQuery,
  AggregateQuery,
  DashboardMetrics,
} from './dashboard';
import type { AggregationBucket } from './taxonomy';
import type {
  CategoryDTO,
  RenameCategoryInput,
  CreateCategoryInput,
  SetTransactionCategoryInput,
} from './category';
import type { LearnBankInput, LearnBankResponse } from './bank';

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

export interface ResolveAccountPayload {
  path: string;
}

export type ResolveAccountResponse =
  | {
      ok: true;
      identifier: string | null;
      matchedAccountId: string | null;
      sourceType: 'ofx' | 'pdf';
      detectedBank: string | null;
    }
  | { ok: false; error: 'unsupported_format' };

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
  'import:resolveAccount': { payload: ResolveAccountPayload; response: ResolveAccountResponse };
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
  'accounts:create': { payload: CreateAccountInput; response: { account: AccountSummary } };
  'accounts:update': { payload: UpdateAccountInput; response: { account: AccountSummary } };
  'accounts:delete': { payload: { id: string }; response: { deletedTransactions: number } };
  'categories:list': { payload: Record<string, never>; response: { categories: CategoryDTO[] } };
  'categories:rename': { payload: RenameCategoryInput; response: { categories: CategoryDTO[] } };
  'categories:create': { payload: CreateCategoryInput; response: { category: CategoryDTO } };
  'categories:delete': { payload: { id: string }; response: { uncategorizedCount: number } };
  'transactions:setCategory': { payload: SetTransactionCategoryInput; response: { ok: true } };
  'banks:learn': { payload: LearnBankInput; response: LearnBankResponse };
}

export type IpcChannel = keyof IpcContract;
export type IpcPayload<C extends IpcChannel> = IpcContract[C]['payload'];
export type IpcResponse<C extends IpcChannel> = IpcContract[C]['response'];

export interface ElectronAPI {
  invoke: <C extends IpcChannel>(channel: C, payload: IpcPayload<C>) => Promise<IpcResponse<C>>;
}
