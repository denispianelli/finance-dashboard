import type {
  CategorizePendingResponse,
  CategorizeBatchPayload,
  CategorizeBatchResponse,
} from '@shared/types/ipc';
import { getDb } from '../../db';
import { findBestPresentModel, getModel } from '../../llm/llm';
import { modelsDir } from '../../llm/modelsDir';
import { categorizeBatch, type LlmCategory } from '../../categorize/llm';
import {
  listPendingGroups,
  applyCategoryToKey,
  countPendingForKey,
} from '../../categorize/pending';
import { listAttemptedKeys, recordAttempt } from '../../categorize/attempts';

/**
 * Distinct pending labels (drives the background loop — one call per label),
 * minus the keys the active model already failed on. With no model installed
 * nothing is filtered: the install banner needs the full residual count.
 */
export function handleCategorizePending(): CategorizePendingResponse {
  const db = getDb();
  const spec = findBestPresentModel(modelsDir());
  const attempted = spec === null ? new Set<string>() : listAttemptedKeys(db, spec.id);
  return { groups: listPendingGroups(db, attempted) };
}

/**
 * Classify ONE distinct label (no batch anchoring) and apply the result to every
 * transaction sharing its key. A valid "AUCUNE" records an attempt for the active
 * model (never re-asked) and reports the rows left over as `residual`; the
 * renderer sums those into the end-of-pass toast. `inference_failed` records
 * nothing — transient, retried on the next pass.
 */
export async function handleCategorizeBatch(
  payload: CategorizeBatchPayload,
): Promise<CategorizeBatchResponse> {
  const dir = modelsDir();
  const spec = findBestPresentModel(dir);
  if (spec === null) return { ok: false, error: 'model_unavailable' };

  const db = getDb();
  const categories = db
    .prepare('SELECT id, name FROM categories WHERE deprecated_at IS NULL ORDER BY position')
    .all() as unknown as LlmCategory[];

  let categoryId: string | null;
  try {
    const model = await getModel(dir);
    const results = await categorizeBatch(model, categories, [
      { id: payload.key, label: payload.label },
    ]);
    categoryId = results[0]?.categoryId ?? null;
  } catch {
    return { ok: false, error: 'inference_failed' };
  }

  if (categoryId === null) {
    recordAttempt(db, payload.key, spec.id);
    return { ok: true, applied: 0, residual: countPendingForKey(db, payload.key) };
  }
  return { ok: true, applied: applyCategoryToKey(db, payload.key, categoryId), residual: 0 };
}
