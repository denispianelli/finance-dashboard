import { detectType } from './detectType';
import { ImportError } from './importError';
import { parseOfx } from './ofx/parseOfx';
import { extractPdfText } from './pdf/extract';

export interface ReadIdentifierResult {
  identifier: string | null;
  sourceType: 'ofx' | 'pdf';
  detectedBank: string | null;
}

/** French IBAN: FR + 2 check digits + 23 alphanumerics, spaces optional. */
const IBAN_RE = /FR\d{2}(?:\s?[0-9A-Z]){23}/;

/** Extract and normalize a French IBAN from free text, or null. */
export function extractIbanFromText(text: string): string | null {
  const match = IBAN_RE.exec(text.toUpperCase());
  if (match === null) return null;
  return match[0].replace(/\s/g, '');
}

/**
 * Read the account identifier from a statement file without running full
 * extraction. OFX → `ofx:<bankid>:<acctid>`; PDF → `iban:<digits>` from the
 * page-1 header. Throws ImportError('unsupported_format') for non-PDF/OFX input.
 */
export async function readIdentifier(content: Buffer, path: string): Promise<ReadIdentifierResult> {
  const type = detectType(content, path);
  if (type !== 'ofx' && type !== 'pdf') throw new ImportError('unsupported_format');

  if (type === 'ofx') {
    const parsed = parseOfx(content);
    const identifier =
      parsed.bankId !== null && parsed.acctId !== null
        ? `ofx:${parsed.bankId}:${parsed.acctId}`.toLowerCase()
        : null;
    return { identifier, sourceType: 'ofx', detectedBank: parsed.org };
  }

  const { pages } = await extractPdfText(content);
  const page1 = pages[0]?.items.map((item) => item.str).join(' ') ?? '';
  const iban = extractIbanFromText(page1);
  return {
    identifier: iban !== null ? `iban:${iban}` : null,
    sourceType: 'pdf',
    detectedBank: null,
  };
}
