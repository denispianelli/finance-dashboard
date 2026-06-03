import { readFileSync } from 'node:fs';
import type { ResolveAccountPayload, ResolveAccountResponse } from '@shared/types/ipc';
import { getDb } from '../../db';
import { readIdentifier } from '../../import/accountIdentifier';
import { findAccountByIdentifier } from '../../import/accountRoutes';
import { ImportError } from '../../import/importError';

export async function handleImportResolveAccount(
  payload: ResolveAccountPayload,
): Promise<ResolveAccountResponse> {
  const content = readFileSync(payload.path);
  try {
    const { identifier, sourceType, detectedBank } = await readIdentifier(content, payload.path);
    const matchedAccountId =
      identifier !== null ? findAccountByIdentifier(getDb(), identifier) : null;
    return { ok: true, identifier, matchedAccountId, sourceType, detectedBank };
  } catch (e) {
    if (e instanceof ImportError && e.code === 'unsupported_format') {
      return { ok: false, error: 'unsupported_format' };
    }
    throw e;
  }
}
