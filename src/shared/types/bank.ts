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
}

export type LearnBankResponse =
  | { readonly ok: true; readonly bankId: string }
  | {
      readonly ok: false;
      readonly error: 'model_unavailable' | 'not_pdf' | 'no_text' | 'inference_failed';
    };
