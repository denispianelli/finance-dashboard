export type ImportErrorCode =
  | 'unknown_bank'
  | 'no_text'
  | 'not_pdf'
  | 'arithmetic_failed_unacknowledged'
  | 'cannot_verify_unacknowledged'
  | 'unsupported_format'
  | 'malformed_ofx';

export class ImportError extends Error {
  constructor(public readonly code: ImportErrorCode) {
    super(code);
    this.name = 'ImportError';
  }
}
