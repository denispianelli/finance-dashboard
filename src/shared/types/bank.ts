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
