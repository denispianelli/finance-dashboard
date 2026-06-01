import type { AggregationMode } from './taxonomy';

/** One account row plus derived totals for the account picker / KPI surfaces. */
export interface AccountSummary {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly bankId: string | null;
  readonly currency: string;
  /**
   * Net of all stored transaction amounts for this account. No opening balance
   * is tracked yet, so this is the running sum of imported movements, not a
   * bank-statement closing balance.
   */
  readonly balance: number;
  readonly txCount: number;
}

/** A transaction joined with its (current) category, shaped for the dashboard. */
export interface DashboardTransaction {
  readonly id: string;
  readonly accountId: string;
  readonly date: string;
  readonly amount: number;
  readonly labelRaw: string;
  readonly labelClean: string;
  readonly categoryId: string | null;
  readonly categoryName: string | null;
  readonly categoryColor: string | null;
  readonly categoryIcon: string | null;
  readonly confidence: number | null;
  readonly isInternalTransfer: boolean;
  readonly userModified: boolean;
}

/** Filters for `dashboard:getTransactions`. All optional; dates are ISO `yyyy-mm-dd`. */
export interface GetTransactionsQuery {
  readonly accountId?: string;
  readonly from?: string;
  readonly to?: string;
  readonly limit?: number;
}

/** Payload for `dashboard:aggregate`. */
export interface AggregateQuery {
  readonly from: string;
  readonly to: string;
  readonly mode: AggregationMode;
}
