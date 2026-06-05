import { readFileSync } from 'node:fs';
import type { ConfirmPayload, ConfirmResponse } from '@shared/types/ipc';
import { getDb } from '../../db';
import { insertStatement } from '../../import/insertStatement';
import { ImportError } from '../../import/importError';
import { readIdentifier } from '../../import/accountIdentifier';
import { learnAccountRoute } from '../../import/accountRoutes';

export async function handleImportConfirm(payload: ConfirmPayload): Promise<ConfirmResponse> {
  try {
    const content = readFileSync(payload.path);
    const result = await insertStatement(getDb(), payload.accountId, content, {
      acknowledgedCannotVerify: payload.acknowledgedCannotVerify,
      selectedHashes: payload.selectedHashes,
    });
    // Route learning is best-effort: a failure here must never fail an import
    // whose rows were already written.
    try {
      const { identifier } = await readIdentifier(content, payload.path);
      if (identifier !== null) {
        learnAccountRoute(getDb(), identifier, payload.accountId);
      }
    } catch {
      // ignore — the import succeeded; routing just won't be remembered this time
    }
    return { ok: true, ...result };
  } catch (e) {
    if (e instanceof ImportError) {
      return { ok: false, error: e.code };
    }
    throw e;
  }
}
