import type { ConfirmPayload, ConfirmResponse } from '@shared/types/ipc';
import { getDb } from '../../db';
import { insertStatement } from '../../import/insertStatement';
import { ImportError } from '../../import/importError';
import { readImportFile } from '../../import/readImportFile';
import { readIdentifier } from '../../import/accountIdentifier';
import { learnAccountRoute } from '../../import/accountRoutes';
import { detectTransfers } from '../../transfers/detect';

export async function handleImportConfirm(payload: ConfirmPayload): Promise<ConfirmResponse> {
  try {
    const content = readImportFile(payload.path);
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
    } catch (e) {
      // best-effort — the import succeeded; routing just won't be remembered.
      // Log so a persistent failure leaves a trail instead of failing silently.
      console.error('importConfirm: route learning failed', e);
    }
    // Re-run transfer-pair detection across all accounts (ADR-016): a pair can
    // span this import and a previously-imported account, so we re-pair the whole
    // set. Best-effort — a failure must not fail an import already written.
    try {
      detectTransfers(getDb());
    } catch (e) {
      // best-effort — figures will be corrected on the next import / re-run.
      console.error('importConfirm: transfer detection failed', e);
    }
    return { ok: true, ...result };
  } catch (e) {
    if (e instanceof ImportError) {
      return { ok: false, error: e.code };
    }
    throw e;
  }
}
