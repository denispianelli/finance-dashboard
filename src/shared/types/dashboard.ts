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

/** Set (or clear, with `balance: null`) an account's user-declared balance. */
export interface SetDeclaredBalanceInput {
  readonly id: string;
  readonly balance: number | null;
}

/** Where an account's balance comes from. `null` when no balance is known. */
export type BalanceSource = 'statement' | 'declared' | null;

/** One account row plus derived totals for the account picker / KPI surfaces. */
export interface AccountSummary {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly bankId: string | null;
  readonly currency: string;
  /**
   * Real account balance (ADR-014): the most recent statement's closing balance
   * plus transactions dated after it. `null` when no imported statement carries
   * a closing balance to anchor on — the UI renders "—" rather than a sum of
   * movements.
   */
  readonly balance: number | null;
  /** Whether `balance` came from a statement anchor (ADR-014), a user-declared
   *  value (F2), or is unknown (`null`). */
  readonly balanceSource: BalanceSource;
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
  readonly originalDate: string | null;
  readonly originalAmount: number | null;
  readonly editedAt: string | null;
  readonly isInternalTransfer: boolean;
  readonly userModified: boolean;
  /** When this transaction is matched to a loan installment, the split of its
   *  amount: interest and insurance (together the true expense) and capital
   *  (neutralized). Null when unmatched. */
  readonly loanSplit: {
    readonly interest: number;
    readonly insurance: number;
    readonly capital: number;
  } | null;
}

/** Filters for `dashboard:getTransactions`. All optional; dates are ISO `yyyy-mm-dd`. */
export interface GetTransactionsQuery {
  readonly accountId?: string;
  readonly from?: string;
  readonly to?: string;
  readonly limit?: number;
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

/** Time window for the dashboard balance chart. `3m` is daily, the rest monthly. */
export type ChartRange = '3m' | '6m' | '1y' | 'max';

/** One point of the balance chart series. */
export interface BalancePoint {
  /** `yyyy-mm-dd` for the daily `3m` range, `yyyy-mm` for monthly ranges. */
  readonly period: string;
  /** Cumulative balance at the end of the period (all amounts, transfers included). */
  readonly balance: number;
}

/** Month (`yyyy-mm`) or calendar-year (`yyyy`) bucketing for consolidated cash flow. */
export type CashflowGranularity = 'month' | 'year';

/** One period of consolidated cash flow across all accounts (transfers excluded). */
export interface CashflowPoint {
  /** `yyyy-mm` for month granularity, `yyyy` for year. */
  readonly period: string;
  /** Sum of positive amounts (income) in the period. */
  readonly income: number;
  /** Sum of negative amounts (expenses) in the period — negative or zero. */
  readonly expense: number;
  /** `income + expense` — the period's net gain/loss. */
  readonly net: number;
}

/** One account's contribution to net worth. `balance` is null when unanchored. */
export interface NetWorthAccount {
  readonly accountId: string;
  readonly name: string;
  readonly balance: number | null;
}

export interface NetWorthLoan {
  readonly loanId: string;
  readonly name: string;
  readonly crd: number; // 100% capital restant dû today
  readonly share: number;
  readonly contribution: number; // negative: -crd * share
}

export interface NetWorthAsset {
  readonly assetId: string;
  readonly name: string;
  readonly value: number; // 100% declared value
  readonly share: number;
  readonly contribution: number; // value * share
}

/** Consolidated net worth: accounts + declared assets − loan CRD, all at the maintainer's share. */
export interface NetWorth {
  readonly total: number;
  readonly accounts: NetWorthAccount[];
  readonly assets: NetWorthAsset[];
  readonly loans: NetWorthLoan[];
}
