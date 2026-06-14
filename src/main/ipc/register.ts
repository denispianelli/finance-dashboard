import { ipcMain } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import type { IpcChannel, IpcPayload, IpcResponse } from '@shared/types/ipc';
import { CHANNELS } from './channels';
import { handlePing } from './handlers/ping';
import { handlePickFile } from './handlers/importPickFile';
import { handleImportExtract } from './handlers/importExtract';
import { handleImportConfirm } from './handlers/importConfirm';
import { handleDashboardGetAccounts } from './handlers/dashboardGetAccounts';
import { handleDashboardGetTransactions } from './handlers/dashboardGetTransactions';
import { handleDashboardMetrics } from './handlers/dashboardMetrics';
import { handleDashboardBalanceSeries } from './handlers/dashboardBalanceSeries';
import { handleDashboardCashflow, handleDashboardNetWorth } from './handlers/dashboardConsolidated';
import {
  handleAccountsCreate,
  handleAccountsUpdate,
  handleAccountsDelete,
} from './handlers/accounts';
import { handleAccountsSetDeclaredBalance } from './handlers/accountsDeclaredBalance';
import {
  handleCategoriesList,
  handleCategoriesRename,
  handleCategoriesCreate,
  handleCategoriesDelete,
  handleTransactionsSetCategory,
} from './handlers/categories';
import { handleBanksLearn, handleBanksPrepareMapping } from './handlers/learnBank';
import { handleRecurringList } from './handlers/recurringList';
import { handleImportResolveAccount } from './handlers/importResolveAccount';
import {
  handleTransactionsUpdate,
  handleTransactionsDelete,
  handleTransactionsRestore,
} from './handlers/transactions';
import { handleTransactionsSetTransfer } from './handlers/transactionsSetTransfer';
import {
  handleSyncGetStatus,
  handleSyncPickFolder,
  handleSyncEnable,
  handleSyncDisable,
  handleSyncNow,
  handleSyncLaunchCheck,
  handleSyncRestore,
  handleSyncKeepLocal,
} from './handlers/sync';
import { syncController } from '../sync/controller';
import {
  handleBackupGetStatus,
  handleBackupPickFolder,
  handleBackupSetFolder,
  handleBackupCreate,
  handleBackupRestore,
  handleBackupRestoreFromFile,
  handleBackupExportJson,
} from './handlers/backup';
import {
  handleRulesList,
  handleRulesCreate,
  handleRulesUpdate,
  handleRulesDelete,
} from './handlers/rules';
import {
  handlePatrimoineListLoans,
  handlePatrimoineListInstallments,
  handlePatrimoinePickLoanFile,
  handlePatrimoineParseLoanFile,
  handlePatrimoineFindLoanByNumber,
  handlePatrimoineCreateLoan,
  handlePatrimoineDeleteLoan,
  handlePatrimoineListAssets,
  handlePatrimoineUpsertAsset,
  handlePatrimoineDeleteAsset,
} from './handlers/patrimoine';

type Handler<C extends IpcChannel> = (
  payload: IpcPayload<C>,
) => IpcResponse<C> | Promise<IpcResponse<C>>;

function isValidSender(event: IpcMainInvokeEvent): boolean {
  const url = event.senderFrame?.url ?? '';
  if (process.env.ELECTRON_RENDERER_URL) {
    return url.startsWith(process.env.ELECTRON_RENDERER_URL);
  }
  return url.startsWith('file://');
}

/** Mutating handlers signal no-op failures with `{ ok: false }` envelopes. */
function isDomainFailure(result: unknown): boolean {
  return (
    typeof result === 'object' &&
    result !== null &&
    'ok' in result &&
    (result as { ok?: unknown }).ok === false
  );
}

// Channels whose successful completion changes user data — each one marks the
// DB dirty so the sync controller schedules a debounced snapshot.
// Sync channels themselves are intentionally excluded — they write sync
// metadata, not user financial data.
const MUTATING_CHANNELS: ReadonlySet<IpcChannel> = new Set<IpcChannel>([
  'import:confirm',
  'accounts:create',
  'accounts:update',
  'accounts:delete',
  'accounts:setDeclaredBalance',
  'categories:rename',
  'categories:create',
  'categories:delete',
  'transactions:setCategory',
  'transactions:update',
  'transactions:delete',
  'transactions:restore',
  'transactions:setTransfer',
  'banks:learn',
  // Rules mutations re-categorize existing transactions (retroactive apply).
  'rules:create',
  'rules:update',
  'rules:delete',
  // A backup restore replaces the whole DB: the sync folder must be told.
  'backup:restore',
  'backup:restoreFromFile',
  'patrimoine:createLoan',
  'patrimoine:deleteLoan',
  'patrimoine:upsertAsset',
  'patrimoine:deleteAsset',
]);

function register<C extends IpcChannel>(channel: C, handler: Handler<C>): void {
  ipcMain.handle(channel, async (event, payload: IpcPayload<C>) => {
    if (!isValidSender(event)) {
      throw new Error(`IPC: unauthorized sender for channel "${channel}"`);
    }
    const result = await handler(payload);
    if (MUTATING_CHANNELS.has(channel) && !isDomainFailure(result)) syncController.markDirty();
    return result;
  });
}

export function registerAllHandlers(): void {
  register(CHANNELS.appPing, handlePing);
  register(CHANNELS.importPickFile, () => handlePickFile());
  register(CHANNELS.importExtract, handleImportExtract);
  register(CHANNELS.importConfirm, handleImportConfirm);
  register(CHANNELS.dashboardGetAccounts, () => handleDashboardGetAccounts());
  register(CHANNELS.dashboardGetTransactions, handleDashboardGetTransactions);
  register(CHANNELS.dashboardMetrics, handleDashboardMetrics);
  register(CHANNELS.dashboardBalanceSeries, handleDashboardBalanceSeries);
  register(CHANNELS.dashboardCashflow, handleDashboardCashflow);
  register(CHANNELS.dashboardNetWorth, () => handleDashboardNetWorth());
  register(CHANNELS.accountsCreate, handleAccountsCreate);
  register(CHANNELS.accountsUpdate, handleAccountsUpdate);
  register(CHANNELS.accountsDelete, handleAccountsDelete);
  register(CHANNELS.accountsSetDeclaredBalance, handleAccountsSetDeclaredBalance);
  register(CHANNELS.categoriesList, () => handleCategoriesList());
  register(CHANNELS.categoriesRename, handleCategoriesRename);
  register(CHANNELS.categoriesCreate, handleCategoriesCreate);
  register(CHANNELS.categoriesDelete, handleCategoriesDelete);
  register(CHANNELS.transactionsSetCategory, handleTransactionsSetCategory);
  register(CHANNELS.transactionsUpdate, handleTransactionsUpdate);
  register(CHANNELS.transactionsDelete, handleTransactionsDelete);
  register(CHANNELS.transactionsRestore, handleTransactionsRestore);
  register(CHANNELS.transactionsSetTransfer, handleTransactionsSetTransfer);
  register(CHANNELS.banksLearn, handleBanksLearn);
  register(CHANNELS.banksPrepareMapping, handleBanksPrepareMapping);
  register(CHANNELS.recurringList, () => handleRecurringList());
  register(CHANNELS.importResolveAccount, handleImportResolveAccount);
  register(CHANNELS.syncGetStatus, () => handleSyncGetStatus());
  register(CHANNELS.syncPickFolder, () => handleSyncPickFolder());
  register(CHANNELS.syncEnable, handleSyncEnable);
  register(CHANNELS.syncDisable, () => handleSyncDisable());
  register(CHANNELS.syncNow, () => handleSyncNow());
  register(CHANNELS.syncLaunchCheck, () => handleSyncLaunchCheck());
  register(CHANNELS.syncRestore, () => handleSyncRestore());
  register(CHANNELS.syncKeepLocal, () => handleSyncKeepLocal());
  register(CHANNELS.backupGetStatus, () => handleBackupGetStatus());
  register(CHANNELS.backupPickFolder, () => handleBackupPickFolder());
  register(CHANNELS.backupSetFolder, handleBackupSetFolder);
  register(CHANNELS.backupCreate, () => handleBackupCreate());
  register(CHANNELS.backupRestore, handleBackupRestore);
  register(CHANNELS.backupRestoreFromFile, () => handleBackupRestoreFromFile());
  register(CHANNELS.backupExportJson, () => handleBackupExportJson());
  register(CHANNELS.rulesList, () => handleRulesList());
  register(CHANNELS.rulesCreate, handleRulesCreate);
  register(CHANNELS.rulesUpdate, handleRulesUpdate);
  register(CHANNELS.rulesDelete, handleRulesDelete);
  register(CHANNELS.patrimoineListLoans, () => handlePatrimoineListLoans());
  register(CHANNELS.patrimoineListInstallments, handlePatrimoineListInstallments);
  register(CHANNELS.patrimoinePickLoanFile, () => handlePatrimoinePickLoanFile());
  register(CHANNELS.patrimoineParseLoanFile, handlePatrimoineParseLoanFile);
  register(CHANNELS.patrimoineFindLoanByNumber, handlePatrimoineFindLoanByNumber);
  register(CHANNELS.patrimoineCreateLoan, handlePatrimoineCreateLoan);
  register(CHANNELS.patrimoineDeleteLoan, handlePatrimoineDeleteLoan);
  register(CHANNELS.patrimoineListAssets, () => handlePatrimoineListAssets());
  register(CHANNELS.patrimoineUpsertAsset, handlePatrimoineUpsertAsset);
  register(CHANNELS.patrimoineDeleteAsset, handlePatrimoineDeleteAsset);
}
