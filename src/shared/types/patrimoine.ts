/** One parsed amortization row (before persistence). */
export interface ParsedInstallment {
  seq: number; // running 1-based index over parsed rows (document order)
  dueDate: string; // ISO yyyy-mm-dd
  capital: number;
  interest: number;
  insurance: number;
  fees: number;
  payment: number;
  balanceAfter: number;
}

/** Result of parsing one LCL amortization PDF. */
export interface ParsedLoanTable {
  name: string;
  /** Bank loan number (N° DU PRET) — stable across reissues; the dedup key. Null if absent. */
  loanNumber: string | null;
  principal: number;
  nominalRate: number; // annual percent, e.g. 1.7 or 0
  termMonths: number;
  startDate: string; // ISO
  installments: ParsedInstallment[];
  totals: { capital: number; interest: number; insurance: number };
}

export interface LoanInput {
  parsed: ParsedLoanTable;
  name: string; // editable override of parsed.name
  share: number; // 0..1
  /** When set, replace this existing loan (same bank loan number) instead of adding. */
  replaceId?: string;
}

/** An existing loan matched by bank loan number, for replace-on-reimport. */
export interface ExistingLoanMatch {
  id: string;
  name: string;
  share: number;
}

export interface LoanInstallmentDTO extends ParsedInstallment {
  id: string;
}

/** A loan plus the figures shown on its card. */
export interface LoanWithStats {
  id: string;
  name: string;
  lender: string | null;
  principal: number;
  nominalRate: number;
  startDate: string;
  termMonths: number;
  share: number;
  crd: number; // capital restant dû today (100%)
  endDate: string; // due_date of the last installment
  nextInstallment: LoanInstallmentDTO | null; // first installment with due_date >= today
  interestThisYear: number; // Σ interest of installments in the current calendar year
  insuranceThisYear: number; // Σ insurance of installments in the current calendar year
  remainingCost: number; // Σ interest of installments with due_date >= today
  remainingInsurance: number; // Σ insurance of installments with due_date >= today
  match: { matched: number; due: number };
}

export interface AssetDTO {
  id: string;
  name: string;
  kind: string; // display label: 'property' | 'av' | 'pea' | 'autre' | …
  declaredValue: number;
  share: number;
  valuedAt: string;
  notes: string | null;
  classId: string | null;
}

export interface UpsertAssetInput {
  id?: string;
  name: string;
  kind: string;
  declaredValue: number;
  share: number;
  valuedAt: string;
  classId?: string | null;
}

export interface AssetClass {
  id: string;
  name: string;
  color: string;
  targetPct: number | null;
  sortOrder: number;
}

export interface UpsertAssetClassInput {
  id?: string;
  name: string;
  color: string;
  targetPct: number | null;
}

export interface AllocationSlice {
  classId: string | null; // null = « Non classé » bucket
  name: string;
  color: string;
  value: number; // euros, net of CRD for the class
  pct: number; // value / total (can be < 0)
  targetPct: number | null; // 0..1 or null
  gap: number | null; // pct − targetPct, null when no target
}

export interface Allocation {
  total: number; // reconciles with getNetWorth().total
  slices: AllocationSlice[]; // sorted by sortOrder, « Non classé » last
}

export interface ClassifiableHolding {
  id: string;
  kind: 'account' | 'asset' | 'loan' | 'support';
  name: string;
  signedValue: number; // contribution to net worth (loans negative)
  classId: string | null;
}

export type ParseLoanResponse =
  | { ok: true; parsed: ParsedLoanTable }
  | { ok: false; error: 'not_pdf' | 'no_text' | 'unrecognized_format' };
