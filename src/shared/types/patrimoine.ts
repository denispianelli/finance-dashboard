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
}

export interface AssetDTO {
  id: string;
  name: string;
  kind: 'property';
  declaredValue: number;
  share: number;
  valuedAt: string;
  notes: string | null;
}

export interface UpsertAssetInput {
  id?: string;
  name: string;
  kind: 'property';
  declaredValue: number;
  share: number;
  valuedAt: string;
}

export type ParseLoanResponse =
  | { ok: true; parsed: ParsedLoanTable }
  | { ok: false; error: 'not_pdf' | 'no_text' | 'unrecognized_format' };
