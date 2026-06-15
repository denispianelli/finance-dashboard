export type WrapperType = 'pea' | 'av' | 'cto' | 'other';

export interface WrapperDTO {
  id: string;
  name: string;
  type: WrapperType;
  sortOrder: number;
}

export interface SupportDTO {
  id: string;
  wrapperId: string;
  name: string;
  isin: string | null;
  classId: string | null;
  currency: string;
  sortOrder: number;
  currentValue: number; // latest valuation, 0 if none yet
}

export interface DatedValue {
  date: string; // ISO yyyy-mm-dd
  value: number;
}
export interface DatedFlow {
  date: string; // ISO yyyy-mm-dd
  amount: number; // + contribution, − withdrawal
}

/** Performance of a support or an aggregate. All return figures are fractions (0.064 = 6.4%). */
export interface Performance {
  startDate: string | null;
  endDate: string | null;
  currentValue: number;
  netInvested: number; // opening value + Σ flows
  absoluteGain: number; // currentValue − netInvested
  ttworrCumulative: number | null; // since inception
  ttworrAnnual: number | null; // null when < 1 year of history
  triAnnual: number | null; // IRR; null when < 1 year or unsolvable
  hasFullYear: boolean;
}

export interface CreateWrapperInput {
  name: string;
  type: WrapperType;
}
export interface CreateSupportInput {
  wrapperId: string;
  name: string;
  isin: string | null;
  classId: string | null;
}
/** One monthly update: a valuation, and optionally the net flow since last time. */
export interface SupportUpdateInput {
  supportId: string;
  asOf: string; // ISO
  value: number;
  flow: number; // 0 if none
}

export interface SupportWithPerf extends SupportDTO {
  perf: Performance;
}
export interface WrapperWithSupports extends WrapperDTO {
  supports: SupportWithPerf[];
  perf: Performance; // aggregated
}
export interface SupportHistory {
  valuations: DatedValue[];
  flows: DatedFlow[];
}

export type OperationKind = 'buy' | 'sell';

/** One parsed CSV operation (before persistence). */
export interface ParsedOp {
  opDate: string; // ISO yyyy-mm-dd
  kind: OperationKind;
  quantity: number; // > 0
  unitPrice: number | null;
  gross: number | null;
  fees: number | null;
  net: number; // signed: buy < 0, sell > 0
  currency: string;
  rawLabel: string;
}

export interface SkippedRow {
  line: number;
  raw: string;
  reason: string;
}

export interface ParseBourseResult {
  ops: ParsedOp[];
  skipped: SkippedRow[];
}

/** A persisted operation (for the support detail audit table). */
export interface OperationDTO extends ParsedOp {
  id: string;
  supportId: string;
}

export interface ImportBourseResult {
  operationsImported: number;
  alreadyPresent: number;
  skippedRows: number;
  createdSupports: SupportDTO[];
  supportsTouched: number;
}
