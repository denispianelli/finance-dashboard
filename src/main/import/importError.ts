export type ImportErrorCode =
  | 'unknown_bank'
  | 'no_text'
  | 'not_pdf'
  | 'arithmetic_failed'
  | 'cannot_verify_unacknowledged'
  | 'already_imported';

export class ImportError extends Error {
  constructor(public readonly code: ImportErrorCode) {
    super(code);
    this.name = 'ImportError';
  }
}
