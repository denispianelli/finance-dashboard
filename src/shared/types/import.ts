export type ImportFileType = 'pdf' | 'csv' | 'ofx';

export interface ArithmeticCheckResult {
  status: 'passed' | 'failed' | 'cannot_verify';
  openingBalance: number | null;
  closingBalance: number | null;
  computedClosing: number | null;
  /** computedClosing − statedClosing; negative means transactions sum to less than stated closing */
  delta: number | null;
}

export interface OverlappingImport {
  id: string;
  date_range_start: string;
  date_range_end: string;
  status: 'validated' | 'pending_review';
}

export interface PeriodOverlapResult {
  hasOverlap: boolean;
  overlappingImports: OverlappingImport[];
}

export interface ReviewTransaction {
  date: string;
  label: string;
  amount: number;
  tx_hash: string;
  fitid: string | null;
  isDuplicate: boolean; // already in DB for this account (Level 3)
}

export interface StatementExtraction {
  transactions: ReviewTransaction[];
  arithmetic: ArithmeticCheckResult;
  periodOverlap: PeriodOverlapResult;
  newCount: number;
  duplicateCount: number;
  fileHash: string;
  alreadyImported: boolean; // Level 1
  dateRangeStart: string;
  dateRangeEnd: string;
}

export interface NormalizedTx {
  date: string; // ISO yyyy-mm-dd
  label: string;
  amount: number; // signed; debit negative, credit positive
  fitid: string | null; // OFX bank-assigned id; null for PDF
}

export interface NormalizedStatement {
  transactions: NormalizedTx[];
  openingBalance: number | null;
  closingBalance: number | null;
  openingDate: string;
  closingDate: string;
  bankId: string;
}
