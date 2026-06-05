import { ipcMain } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import type { IpcChannel, IpcPayload, IpcResponse } from '@shared/types/ipc';
import { CHANNELS } from './channels';
import { handlePing } from './handlers/ping';
import { handlePickFile } from './handlers/importPickFile';
import { handleImportExtract } from './handlers/importExtract';
import { handleImportConfirm } from './handlers/importConfirm';
import { handleImportCategorize } from './handlers/importCategorize';
import { handleDashboardGetAccounts } from './handlers/dashboardGetAccounts';
import { handleDashboardGetTransactions } from './handlers/dashboardGetTransactions';
import { handleDashboardAggregate } from './handlers/dashboardAggregate';
import { handleDashboardMetrics } from './handlers/dashboardMetrics';
import {
  handleAccountsCreate,
  handleAccountsUpdate,
  handleAccountsDelete,
} from './handlers/accounts';
import {
  handleCategoriesList,
  handleCategoriesRename,
  handleCategoriesCreate,
  handleCategoriesDelete,
  handleTransactionsSetCategory,
} from './handlers/categories';
import { handleBanksLearn } from './handlers/learnBank';
import {
  handleTransactionsUpdate,
  handleTransactionsDelete,
  handleTransactionsRestore,
} from './handlers/transactions';

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

function register<C extends IpcChannel>(channel: C, handler: Handler<C>): void {
  ipcMain.handle(channel, (event, payload: IpcPayload<C>) => {
    if (!isValidSender(event)) {
      throw new Error(`IPC: unauthorized sender for channel "${channel}"`);
    }
    return handler(payload);
  });
}

export function registerAllHandlers(): void {
  register(CHANNELS.appPing, handlePing);
  register(CHANNELS.importPickFile, () => handlePickFile());
  register(CHANNELS.importExtract, handleImportExtract);
  register(CHANNELS.importConfirm, handleImportConfirm);
  register(CHANNELS.importCategorize, handleImportCategorize);
  register(CHANNELS.dashboardGetAccounts, () => handleDashboardGetAccounts());
  register(CHANNELS.dashboardGetTransactions, handleDashboardGetTransactions);
  register(CHANNELS.dashboardAggregate, handleDashboardAggregate);
  register(CHANNELS.dashboardMetrics, handleDashboardMetrics);
  register(CHANNELS.accountsCreate, handleAccountsCreate);
  register(CHANNELS.accountsUpdate, handleAccountsUpdate);
  register(CHANNELS.accountsDelete, handleAccountsDelete);
  register(CHANNELS.categoriesList, () => handleCategoriesList());
  register(CHANNELS.categoriesRename, handleCategoriesRename);
  register(CHANNELS.categoriesCreate, handleCategoriesCreate);
  register(CHANNELS.categoriesDelete, handleCategoriesDelete);
  register(CHANNELS.transactionsSetCategory, handleTransactionsSetCategory);
  register(CHANNELS.transactionsUpdate, handleTransactionsUpdate);
  register(CHANNELS.transactionsDelete, handleTransactionsDelete);
  register(CHANNELS.transactionsRestore, handleTransactionsRestore);
  register(CHANNELS.banksLearn, handleBanksLearn);
}
