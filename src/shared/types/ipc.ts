import type { StatementExtraction } from './import';
import type {
  SyncStatusView,
  SyncLaunchCheck,
  SyncNowResult,
  SyncRestoreResult,
  SyncEnableResult,
} from './sync';
import type {
  AccountSummary,
  CreateAccountInput,
  UpdateAccountInput,
  SetDeclaredBalanceInput,
  DashboardTransaction,
  GetTransactionsQuery,
  DashboardMetrics,
  ChartRange,
  BalancePoint,
  CashflowGranularity,
  CashflowPoint,
  NetWorth,
} from './dashboard';
import type {
  CategoryDTO,
  RenameCategoryInput,
  CreateCategoryInput,
  SetTransactionCategoryInput,
} from './category';
import type {
  LearnBankInput,
  LearnBankResponse,
  PrepareMappingInput,
  PrepareMappingResponse,
} from './bank';
import type { RecurringReport } from './recurring';
import type { UpdateTransactionInput, DeletedTransactionSnapshot } from './transaction';
import type { RuleDTO, RuleInput } from './rules';
import type {
  BackupStatusView,
  BackupCreateResult,
  BackupRestoreResult,
  BackupExportResult,
} from './backup';
import type {
  LoanWithStats,
  LoanInput,
  LoanInstallmentDTO,
  AssetDTO,
  UpsertAssetInput,
  ParseLoanResponse,
} from './patrimoine';

export interface PingPayload {
  now: number;
}

export interface PingResponse {
  pong: true;
  receivedAt: number;
  serverNow: number;
}

export type PickFilePayload = Record<string, never>;

export type PickFileResponse = { cancelled: true } | { cancelled: false; paths: string[] };

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
  acknowledgedArithmeticFailed?: boolean;
}

export type ConfirmResponse =
  | {
      ok: true;
      importId: string;
      insertedCount: number;
      skippedCount: number;
      /** Present when the pre-import backup snapshot failed (import still done). */
      preImportBackupFailed?: true;
    }
  | {
      ok: false;
      error:
        | 'arithmetic_failed_unacknowledged'
        | 'cannot_verify_unacknowledged'
        | 'unknown_bank'
        | 'no_text'
        | 'not_pdf'
        | 'unsupported_format'
        | 'malformed_ofx';
    };

export type RulesMutationResponse =
  | { ok: true; rule: RuleDTO; applied: number }
  | { ok: false; error: 'invalid_rule' };

export interface IpcContract {
  'app:ping': { payload: PingPayload; response: PingResponse };
  'import:pickFile': { payload: PickFilePayload; response: PickFileResponse };
  'import:extract': { payload: ExtractPayload; response: ExtractResponse };
  'import:resolveAccount': { payload: ResolveAccountPayload; response: ResolveAccountResponse };
  'import:confirm': { payload: ConfirmPayload; response: ConfirmResponse };
  'rules:list': { payload: Record<string, never>; response: { rules: RuleDTO[] } };
  'rules:create': { payload: RuleInput; response: RulesMutationResponse };
  'rules:update': { payload: RuleInput & { id: string }; response: RulesMutationResponse };
  'rules:delete': { payload: { id: string }; response: { ok: true } };
  'dashboard:getAccounts': {
    payload: Record<string, never>;
    response: { accounts: AccountSummary[] };
  };
  'dashboard:getTransactions': {
    payload: GetTransactionsQuery;
    response: { transactions: DashboardTransaction[] };
  };
  'dashboard:metrics': { payload: { accountId: string }; response: DashboardMetrics };
  'dashboard:balanceSeries': {
    payload: { accountId: string; range: ChartRange };
    response: { points: BalancePoint[] };
  };
  'dashboard:cashflow': {
    payload: { granularity: CashflowGranularity };
    response: { series: CashflowPoint[] };
  };
  'dashboard:netWorth': { payload: Record<string, never>; response: NetWorth };
  'accounts:create': { payload: CreateAccountInput; response: { account: AccountSummary } };
  'accounts:update': { payload: UpdateAccountInput; response: { account: AccountSummary } };
  'accounts:delete': { payload: { id: string }; response: { deletedTransactions: number } };
  'accounts:setDeclaredBalance': {
    payload: SetDeclaredBalanceInput;
    response: { account: AccountSummary };
  };
  'categories:list': { payload: Record<string, never>; response: { categories: CategoryDTO[] } };
  'categories:rename': { payload: RenameCategoryInput; response: { categories: CategoryDTO[] } };
  'categories:create': { payload: CreateCategoryInput; response: { category: CategoryDTO } };
  'categories:delete': { payload: { id: string }; response: { uncategorizedCount: number } };
  'transactions:setCategory': { payload: SetTransactionCategoryInput; response: { ok: true } };
  'transactions:update': { payload: UpdateTransactionInput; response: { ok: true } };
  'transactions:delete': {
    payload: { transactionId: string };
    response: { ok: true; snapshot: DeletedTransactionSnapshot };
  };
  'transactions:restore': {
    payload: { transaction: DeletedTransactionSnapshot };
    response: { ok: true };
  };
  'transactions:setTransfer': {
    payload: { transactionId: string; isTransfer: boolean };
    response: { ok: true };
  };
  'banks:learn': { payload: LearnBankInput; response: LearnBankResponse };
  'banks:prepareMapping': { payload: PrepareMappingInput; response: PrepareMappingResponse };
  'recurring:list': { payload: Record<string, never>; response: RecurringReport };
  'sync:getStatus': { payload: Record<string, never>; response: SyncStatusView };
  'sync:pickFolder': {
    payload: Record<string, never>;
    response: { cancelled: true } | { cancelled: false; path: string };
  };
  'sync:enable': {
    payload: { folderPath: string; passphrase: string };
    response: SyncEnableResult;
  };
  'sync:disable': { payload: Record<string, never>; response: { ok: true } };
  'sync:now': { payload: Record<string, never>; response: SyncNowResult };
  'sync:launchCheck': { payload: Record<string, never>; response: SyncLaunchCheck };
  'sync:restore': { payload: Record<string, never>; response: SyncRestoreResult };
  'sync:keepLocal': { payload: Record<string, never>; response: SyncNowResult };
  'backup:getStatus': { payload: Record<string, never>; response: BackupStatusView };
  'backup:pickFolder': {
    payload: Record<string, never>;
    response: { cancelled: true } | { cancelled: false; path: string };
  };
  'backup:setFolder': { payload: { folderPath: string }; response: { ok: true } };
  'backup:create': { payload: Record<string, never>; response: BackupCreateResult };
  'backup:restore': { payload: { fileName: string }; response: BackupRestoreResult };
  'backup:restoreFromFile': { payload: Record<string, never>; response: BackupRestoreResult };
  'backup:exportJson': { payload: Record<string, never>; response: BackupExportResult };
  'patrimoine:listLoans': { payload: Record<string, never>; response: { loans: LoanWithStats[] } };
  'patrimoine:listInstallments': {
    payload: { loanId: string };
    response: { installments: LoanInstallmentDTO[] };
  };
  'patrimoine:pickLoanFile': {
    payload: Record<string, never>;
    response: { cancelled: true } | { cancelled: false; path: string };
  };
  'patrimoine:parseLoanFile': { payload: { path: string }; response: ParseLoanResponse };
  'patrimoine:createLoan': { payload: LoanInput; response: { ok: true; id: string } };
  'patrimoine:deleteLoan': { payload: { id: string }; response: { ok: true } };
  'patrimoine:listAssets': { payload: Record<string, never>; response: { assets: AssetDTO[] } };
  'patrimoine:upsertAsset': { payload: UpsertAssetInput; response: { asset: AssetDTO } };
  'patrimoine:deleteAsset': { payload: { id: string }; response: { ok: true } };
}

export type IpcChannel = keyof IpcContract;
export type IpcPayload<C extends IpcChannel> = IpcContract[C]['payload'];
export type IpcResponse<C extends IpcChannel> = IpcContract[C]['response'];

export interface ElectronAPI {
  invoke: <C extends IpcChannel>(channel: C, payload: IpcPayload<C>) => Promise<IpcResponse<C>>;
  getDroppedPaths: (files: File[]) => string[];
}
