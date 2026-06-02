import type { IpcChannel } from '@shared/types/ipc';

export const CHANNELS = {
  appPing: 'app:ping',
  importPickFile: 'import:pickFile',
  importExtract: 'import:extract',
  importConfirm: 'import:confirm',
  dashboardGetAccounts: 'dashboard:getAccounts',
  dashboardGetTransactions: 'dashboard:getTransactions',
  dashboardAggregate: 'dashboard:aggregate',
  dashboardMetrics: 'dashboard:metrics',
  categoriesList: 'categories:list',
  categoriesRename: 'categories:rename',
  rulesList: 'rules:list',
  rulesCreate: 'rules:create',
  rulesDelete: 'rules:delete',
  categoriesCreate: 'categories:create',
  transactionsSetCategory: 'transactions:setCategory',
} as const satisfies Record<string, IpcChannel>;
