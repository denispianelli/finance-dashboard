import { readFileSync } from 'node:fs';
import type { ExtractPayload, ExtractResponse } from '@shared/types/ipc';
import { getDb } from '../../db';
import { extractStatement } from '../../import/extractStatement';
import { ImportError } from '../../import/importError';

export async function handleImportExtract(payload: ExtractPayload): Promise<ExtractResponse> {
  try {
    const content = readFileSync(payload.path);
    const extraction = await extractStatement(getDb(), payload.accountId, content);
    return { ok: true, extraction };
  } catch (e) {
    // Only parsing/file errors are reachable here; insert-phase codes
    // (arithmetic_failed, cannot_verify_unacknowledged, already_imported)
    // are surfaced as fields by extractStatement and handled in confirm.
    if (
      e instanceof ImportError &&
      (e.code === 'unknown_bank' || e.code === 'no_text' || e.code === 'not_pdf')
    ) {
      return { ok: false, error: e.code };
    }
    throw e;
  }
}
