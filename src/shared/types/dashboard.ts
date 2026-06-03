import type { AggregationMode } from './taxonomy';

/** Input to create a new account. `type` defaults to checking; bank is a
 *  free-text label for display (e.g. "LCL", "Boursorama"). */
export interface CreateAccountInput {
  readonly name: string;
  readonly bankId: string | null;
}

/** Input to update an existing account's name and bank label. */
export interface UpdateAccountInput {
  readonly id: string;
  readonly name: string;
  readonly bankId: string | null;
}

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

/** One calendar month of activity for an account, with the running end-of-month balance. */
export interface MonthPoint {
  /** `yyyy-mm`. */
  readonly month: string;
  /** Sum of positive amounts (income) in the month. */
  readonly income: number;
  /** Sum of negative amounts (expenses) in the month — negative or zero. */
  readonly expense: number;
  /** `income + expense` — the month's net flow. */
  readonly net: number;
  /** Cumulative balance at the end of the month (sum of all amounts up to and including it). */
  readonly balance: number;
}

/** Account-level totals + a monthly series, for the KPI tiles and the 12-month chart. */
export interface DashboardMetrics {
  /** Net of all transaction amounts for the account. */
  readonly balance: number;
  /** Up to the last 12 months that have activity, chronological. Empty when no transactions. */
  readonly series: MonthPoint[];
}
