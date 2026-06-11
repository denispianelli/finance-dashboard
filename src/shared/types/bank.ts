/** Column order of a statement's table (1 = leftmost). null = column absent. */
export interface ColumnOrder {
  date: number;
  valeur: number | null;
  label: number;
  debit: number | null;
  credit: number | null;
  balance: number | null;
}

export interface LearnBankInput {
  readonly path: string;
  readonly bankName: string;
  readonly order: ColumnOrder;
}

export type LearnBankResponse =
  | { readonly ok: true; readonly bankId: string }
  | { readonly ok: false; readonly error: 'not_pdf' | 'no_text' | 'invalid_mapping' };

export interface PrepareMappingInput {
  readonly path: string;
}

export type PrepareMappingResponse =
  | {
      readonly ok: true;
      readonly suggested: ColumnOrder | null;
      readonly headerTokens: string[];
    }
  | { readonly ok: false; readonly error: 'not_pdf' | 'no_text' };
